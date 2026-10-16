import { RefreshToken } from '../modules/auth/entities/refresh-token.entity.js';
import { CartItem } from '../modules/cart/entities/cart-item.entity.js';
import { Cart } from '../modules/cart/entities/cart.entity.js';
import { Category } from '../modules/categories/category.entity.js';
import { ContactMessage } from '../modules/contact/entities/contact-message.entity.js';
import { NewsletterSubscriber } from '../modules/contact/entities/newsletter-subscriber.entity.js';
import { Coupon } from '../modules/coupons/coupon.entity.js';
import { OrderEvent } from '../modules/orders/entities/order-event.entity.js';
import { OrderItem } from '../modules/orders/entities/order-item.entity.js';
import { Order } from '../modules/orders/entities/order.entity.js';
import { EmailOtp } from '../modules/otp/entities/email-otp.entity.js';
import { Payment } from '../modules/payments/payment.entity.js';
import { ProductImage } from '../modules/products/entities/product-image.entity.js';
import { ProductVariant } from '../modules/products/entities/product-variant.entity.js';
import { Product } from '../modules/products/entities/product.entity.js';
import { Review } from '../modules/reviews/review.entity.js';
import { Address } from '../modules/users/entities/address.entity.js';
import { User } from '../modules/users/entities/user.entity.js';
import { StoreSetting } from '../modules/admin/store-setting.entity.js';
import { WishlistItem } from '../modules/wishlist/wishlist-item.entity.js';

/** Explicit list (not a glob) so it works identically from ts sources and compiled js. */
export const entities = [
  User,
  Address,
  RefreshToken,
  EmailOtp,
  Category,
  Product,
  ProductVariant,
  ProductImage,
  Review,
  WishlistItem,
  Cart,
  CartItem,
  Coupon,
  Order,
  OrderItem,
  OrderEvent,
  Payment,
  ContactMessage,
  NewsletterSubscriber,
  StoreSetting,
];
