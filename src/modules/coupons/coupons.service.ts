import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import {
  offsetOf,
  paginate,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { toPaise, toRupees, toRupeesOrNull } from '../../common/utils/money.js';
import { escapeLike } from '../../common/utils/text.js';
import { Coupon, CouponType } from './coupon.entity.js';
import type {
  AdminCouponQueryDto,
  CreateCouponDto,
  UpdateCouponDto,
} from './dto/coupon.dto.js';

export interface CouponView {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

const toCouponView = (coupon: Coupon): CouponView => ({
  id: coupon.id,
  code: coupon.code,
  description: coupon.description,
  type: coupon.type,
  value:
    coupon.type === CouponType.Percentage
      ? coupon.value
      : toRupees(coupon.value),
  minSubtotal: toRupees(coupon.minSubtotal),
  maxDiscount: toRupeesOrNull(coupon.maxDiscount),
  startsAt: coupon.startsAt,
  expiresAt: coupon.expiresAt,
  usageLimit: coupon.usageLimit,
  usedCount: coupon.usedCount,
  isActive: coupon.isActive,
});

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon) private readonly coupons: Repository<Coupon>,
  ) {}

  findByCode(code: string, manager?: EntityManager): Promise<Coupon | null> {
    const repo = manager ? manager.getRepository(Coupon) : this.coupons;
    return repo.findOneBy({ code: code.toUpperCase() });
  }

  /** Atomically consumes one use; returns false when the usage limit was reached concurrently. */
  async consume(manager: EntityManager, couponId: string): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(Coupon)
      .set({ usedCount: () => 'used_count + 1' })
      .where('id = :couponId', { couponId })
      .andWhere('(usage_limit IS NULL OR used_count < usage_limit)')
      .execute();
    return Boolean(result.affected);
  }

  async release(manager: EntityManager, couponId: string): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Coupon)
      .set({ usedCount: () => 'GREATEST(used_count - 1, 0)' })
      .where('id = :couponId', { couponId })
      .execute();
  }

  // ── Admin ──────────────────────────────────────────────

  async list(query: AdminCouponQueryDto): Promise<Paginated<CouponView>> {
    const qb = this.coupons.createQueryBuilder('c');
    if (query.search)
      qb.andWhere('c.code ILIKE :search', {
        search: `%${escapeLike(query.search)}%`,
      });
    if (query.isActive !== undefined)
      qb.andWhere('c.isActive = :isActive', { isActive: query.isActive });
    const [rows, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .addOrderBy('c.id', 'ASC')
      .offset(offsetOf(query))
      .limit(query.limit)
      .getManyAndCount();
    return paginate(rows.map(toCouponView), total, query);
  }

  async get(id: string): Promise<CouponView> {
    const coupon = await this.coupons.findOneBy({ id });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return toCouponView(coupon);
  }

  async create(dto: CreateCouponDto): Promise<CouponView> {
    const coupon = this.coupons.create(this.toEntityFields(dto));
    this.assertConsistent(coupon);
    return toCouponView(await this.coupons.save(coupon));
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponView> {
    const coupon = await this.coupons.findOneBy({ id });
    if (!coupon) throw new NotFoundException('Coupon not found');
    Object.assign(coupon, this.toEntityFields({ type: coupon.type, ...dto }));
    this.assertConsistent(coupon);
    return toCouponView(await this.coupons.save(coupon));
  }

  async remove(id: string): Promise<void> {
    const result = await this.coupons.delete({ id });
    if (!result.affected) throw new NotFoundException('Coupon not found');
  }

  private toEntityFields(dto: UpdateCouponDto): Partial<Coupon> {
    const fields: Partial<Coupon> = {};
    if (dto.code !== undefined) fields.code = dto.code;
    if (dto.description !== undefined)
      fields.description = dto.description || null;
    if (dto.type !== undefined) fields.type = dto.type;
    if (dto.value !== undefined)
      fields.value =
        dto.type === CouponType.Percentage
          ? Math.round(dto.value)
          : toPaise(dto.value);
    if (dto.minSubtotal !== undefined)
      fields.minSubtotal = toPaise(dto.minSubtotal);
    if (dto.maxDiscount !== undefined)
      fields.maxDiscount =
        dto.maxDiscount === null ? null : toPaise(dto.maxDiscount);
    if (dto.startsAt !== undefined) fields.startsAt = dto.startsAt;
    if (dto.expiresAt !== undefined) fields.expiresAt = dto.expiresAt;
    if (dto.usageLimit !== undefined) fields.usageLimit = dto.usageLimit;
    if (dto.isActive !== undefined) fields.isActive = dto.isActive;
    return fields;
  }

  private assertConsistent(coupon: Coupon): void {
    if (
      coupon.type === CouponType.Percentage &&
      (coupon.value < 1 || coupon.value > 100)
    ) {
      throw new BadRequestException(
        'Percentage coupons must have a value between 1 and 100',
      );
    }
    if (
      coupon.startsAt &&
      coupon.expiresAt &&
      coupon.expiresAt <= coupon.startsAt
    ) {
      throw new BadRequestException('expiresAt must be after startsAt');
    }
  }
}
