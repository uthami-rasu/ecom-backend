import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toRupees, toRupeesOrNull } from '../../common/utils/money.js';
import type { AppConfig } from '../../config/configuration.js';
import { CouponsService } from '../coupons/coupons.service.js';
import {
  computeTotals,
  evaluateCoupon,
  type ShippingMethod,
  type ShippingRules,
} from '../pricing/pricing.js';
import { ProductVariant } from '../products/entities/product-variant.entity.js';
import { ProductsService } from '../products/products.service.js';
import {
  MAX_LINE_QUANTITY,
  type AddCartItemDto,
  type MergeCartDto,
} from './dto/cart.dto.js';
import { CartItem } from './entities/cart-item.entity.js';
import { Cart } from './entities/cart.entity.js';

export interface CartLineView {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantLabel: string;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  /** Highest quantity that can currently be ordered for this line. */
  maxQuantity: number;
  available: boolean;
  issue: string | null;
}

export interface CartView {
  items: CartLineView[];
  itemCount: number;
  currency: 'INR';
  subtotal: number;
  discount: number;
  shippingMethod: ShippingMethod;
  shippingFee: number;
  total: number;
  coupon: { code: string; discount: number } | null;
  couponError: string | null;
  shippingOptions: Array<{
    method: ShippingMethod;
    label: string;
    fee: number;
  }>;
}

/** Availability of a cart line against current catalog state. */
export function lineIssue(item: CartItem): string | null {
  const variant = item.variant;
  if (!variant || !variant.isActive || !variant.product?.isActive)
    return 'This item is no longer available';
  if (variant.stock <= 0) return 'Out of stock';
  if (variant.stock < item.quantity)
    return `Only ${variant.stock} left in stock`;
  return null;
}

@Injectable()
export class CartService {
  private readonly shippingRules: ShippingRules;

  constructor(
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
    private readonly coupons: CouponsService,
    private readonly products: ProductsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.shippingRules = config.get('shipping', { infer: true });
  }

  async getCart(
    userId: string,
    shippingMethod: ShippingMethod = 'standard',
  ): Promise<CartView> {
    const cart = await this.loadCart(userId);
    return this.buildView(cart, shippingMethod);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartView> {
    const variant = await this.getPurchasableVariant(dto.variantId);
    const cart = await this.getOrCreateCart(userId);
    const existing = await this.items.findOneBy({
      cartId: cart.id,
      variantId: variant.id,
    });
    const quantity = (existing?.quantity ?? 0) + dto.quantity;
    this.assertQuantity(variant, quantity);

    await this.items.upsert(
      { cartId: cart.id, variantId: variant.id, quantity },
      ['cartId', 'variantId'],
    );
    return this.getCart(userId);
  }

  async updateItem(
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartView> {
    const item = await this.getOwnedItem(userId, itemId);
    const variant = await this.getPurchasableVariant(item.variantId);
    this.assertQuantity(variant, quantity);
    await this.items.update({ id: item.id }, { quantity });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartView> {
    const item = await this.getOwnedItem(userId, itemId);
    await this.items.delete({ id: item.id });
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<void> {
    await this.carts.update({ userId }, { couponCode: null });
    const cart = await this.carts.findOneBy({ userId });
    if (cart) await this.items.delete({ cartId: cart.id });
  }

  /**
   * Merges a guest cart into the user's cart. For each line the larger quantity wins
   * (so repeating a merge is harmless) and quantities are clamped to available stock.
   */
  async merge(
    userId: string,
    dto: MergeCartDto,
  ): Promise<
    CartView & { skipped: Array<{ variantId: string; reason: string }> }
  > {
    const cart = await this.getOrCreateCart(userId);
    const skipped: Array<{ variantId: string; reason: string }> = [];

    for (const line of dto.items) {
      const variant = await this.variants.findOne({
        where: { id: line.variantId },
        relations: { product: true },
      });
      if (!variant || !variant.isActive || !variant.product?.isActive) {
        skipped.push({
          variantId: line.variantId,
          reason: 'Item is no longer available',
        });
        continue;
      }
      if (variant.stock <= 0) {
        skipped.push({ variantId: line.variantId, reason: 'Out of stock' });
        continue;
      }
      const existing = await this.items.findOneBy({
        cartId: cart.id,
        variantId: variant.id,
      });
      const quantity = Math.min(
        Math.max(existing?.quantity ?? 0, line.quantity),
        variant.stock,
        MAX_LINE_QUANTITY,
      );
      await this.items.upsert(
        { cartId: cart.id, variantId: variant.id, quantity },
        ['cartId', 'variantId'],
      );
    }
    return { ...(await this.getCart(userId)), skipped };
  }

  async applyCoupon(userId: string, code: string): Promise<CartView> {
    const cart = await this.loadCart(userId);
    const lines = (cart?.items ?? []).filter((item) => !lineIssue(item));
    if (!cart || !lines.length)
      throw new BadRequestException(
        'Add items to your cart before applying a coupon',
      );

    const subtotal = lines.reduce(
      (sum, item) => sum + item.variant!.price * item.quantity,
      0,
    );
    const evaluation = evaluateCoupon(
      await this.coupons.findByCode(code),
      subtotal,
    );
    if (!evaluation.valid) throw new BadRequestException(evaluation.reason);

    await this.carts.update(
      { id: cart.id },
      { couponCode: code.toUpperCase() },
    );
    return this.getCart(userId);
  }

  async removeCoupon(userId: string): Promise<CartView> {
    await this.carts.update({ userId }, { couponCode: null });
    return this.getCart(userId);
  }

  // ── Internals ──────────────────────────────────────────

  private loadCart(userId: string): Promise<Cart | null> {
    return this.carts.findOne({
      where: { userId },
      relations: { items: { variant: { product: true } } },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  private async buildView(
    cart: Cart | null,
    shippingMethod: ShippingMethod,
  ): Promise<CartView> {
    const items = cart?.items ?? [];
    const images = await this.products.primaryImages([
      ...new Set(items.map((item) => item.variant!.productId)),
    ]);

    const lines: CartLineView[] = items.map((item) => {
      const variant = item.variant!;
      const issue = lineIssue(item);
      return {
        id: item.id,
        variantId: variant.id,
        productId: variant.productId,
        slug: variant.product!.slug,
        name: variant.product!.name,
        variantLabel: variant.label,
        imageUrl: images.get(variant.productId)?.thumbUrl ?? null,
        unitPrice: toRupees(variant.price),
        compareAtPrice: toRupeesOrNull(variant.compareAtPrice),
        quantity: item.quantity,
        lineTotal: toRupees(variant.price * item.quantity),
        maxQuantity: Math.max(0, Math.min(variant.stock, MAX_LINE_QUANTITY)),
        available: issue === null,
        issue,
      };
    });

    // Only purchasable lines count towards totals.
    const priced = items
      .filter((item) => !lineIssue(item))
      .map((item) => ({
        unitPrice: item.variant!.price,
        quantity: item.quantity,
      }));
    const preDiscount = computeTotals(
      priced,
      shippingMethod,
      this.shippingRules,
    );

    let couponDiscount = 0;
    let couponError: string | null = null;
    if (cart?.couponCode) {
      const evaluation = evaluateCoupon(
        await this.coupons.findByCode(cart.couponCode),
        preDiscount.subtotal,
      );
      if (evaluation.valid) couponDiscount = evaluation.discount;
      else couponError = evaluation.reason;
    }
    const totals = computeTotals(
      priced,
      shippingMethod,
      this.shippingRules,
      couponDiscount,
    );

    return {
      items: lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      currency: 'INR',
      subtotal: toRupees(totals.subtotal),
      discount: toRupees(totals.discount),
      shippingMethod,
      shippingFee: toRupees(totals.shippingFee),
      total: toRupees(totals.total),
      coupon:
        cart?.couponCode && !couponError
          ? { code: cart.couponCode, discount: toRupees(totals.discount) }
          : null,
      couponError,
      shippingOptions: totals.options.map((option) => ({
        ...option,
        fee: toRupees(option.fee),
      })),
    };
  }

  private async getOrCreateCart(userId: string): Promise<Cart> {
    await this.carts
      .createQueryBuilder()
      .insert()
      .values({ userId })
      .orIgnore()
      .execute();
    return this.carts.findOneByOrFail({ userId });
  }

  private async getPurchasableVariant(
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variants.findOne({
      where: { id: variantId },
      relations: { product: true },
    });
    if (!variant || !variant.isActive || !variant.product?.isActive)
      throw new NotFoundException('Product variant not found');
    return variant;
  }

  /** Ownership is enforced through the join, so other users' items look like missing items. */
  private async getOwnedItem(
    userId: string,
    itemId: string,
  ): Promise<CartItem> {
    const item = await this.items
      .createQueryBuilder('item')
      .innerJoin('item.cart', 'cart', 'cart.userId = :userId', { userId })
      .where('item.id = :itemId', { itemId })
      .getOne();
    if (!item) throw new NotFoundException('Cart item not found');
    return item;
  }

  private assertQuantity(variant: ProductVariant, quantity: number): void {
    if (quantity > MAX_LINE_QUANTITY) {
      throw new BadRequestException(
        `You can order at most ${MAX_LINE_QUANTITY} of an item`,
      );
    }
    if (quantity > variant.stock) {
      throw new ConflictException(
        variant.stock > 0
          ? `Only ${variant.stock} left in stock`
          : 'This item is out of stock',
      );
    }
  }
}
