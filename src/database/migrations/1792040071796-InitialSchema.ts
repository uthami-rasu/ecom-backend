import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1792040071796 implements MigrationInterface {
  name = 'InitialSchema1792040071796';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_role" AS ENUM('customer', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(254) NOT NULL, "password_hash" character varying(255) NOT NULL, "first_name" character varying(80) NOT NULL, "last_name" character varying(80) NOT NULL, "display_name" character varying(80), "phone" character varying(20), "avatar_url" character varying(500), "role" "public"."user_role" NOT NULL DEFAULT 'customer', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_email" ON "users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "family_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_refresh_tokens_hash" ON "refresh_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens"  ("family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(80) NOT NULL, "slug" character varying(100) NOT NULL, "description" text, "image_url" character varying(500), "image_storage_key" character varying(255), "parent_id" uuid, "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_categories_slug" ON "categories"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_categories_parent" ON "categories"  ("parent_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "product_images" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "product_id" uuid NOT NULL, "url" character varying(500) NOT NULL, "medium_url" character varying(500) NOT NULL, "thumb_url" character varying(500) NOT NULL, "alt" character varying(200), "sort_order" integer NOT NULL DEFAULT '0', "storage_key" character varying(255) NOT NULL, CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_product_images_product" ON "product_images"  ("product_id", "sort_order") `,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(160) NOT NULL, "slug" character varying(180) NOT NULL, "subtitle" character varying(300), "description" text, "origin" character varying(120), "badge" character varying(40), "category_id" uuid NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "is_featured" boolean NOT NULL DEFAULT false, "is_trending" boolean NOT NULL DEFAULT false, "min_price" integer NOT NULL DEFAULT '0', "rating_avg" numeric(3,2) NOT NULL DEFAULT '0', "review_count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_products_slug" ON "products"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_featured" ON "products"  ("is_active", "is_featured") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_active_created" ON "products"  ("is_active", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_active_rating" ON "products"  ("is_active", "rating_avg") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_active_price" ON "products"  ("is_active", "min_price") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_category_price" ON "products"  ("is_active", "category_id", "min_price") `,
    );
    await queryRunner.query(
      `CREATE TABLE "product_variants" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "product_id" uuid NOT NULL, "label" character varying(40) NOT NULL, "sku" character varying(64) NOT NULL, "price" integer NOT NULL, "compare_at_price" integer, "stock" integer NOT NULL DEFAULT '0', "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "uq_product_variants_product_label" UNIQUE ("product_id", "label"), CONSTRAINT "chk_product_variants_price" CHECK ("price" >= 0), CONSTRAINT "chk_product_variants_stock" CHECK ("stock" >= 0), CONSTRAINT "PK_281e3f2c55652d6a22c0aa59fd7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_product_variants_sku" ON "product_variants"  ("sku") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_product_variants_product" ON "product_variants"  ("product_id", "sort_order") `,
    );
    await queryRunner.query(
      `CREATE TABLE "carts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "coupon_code" character varying(40), CONSTRAINT "PK_b5f695a59f5ebb50af3c8160816" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_carts_user" ON "carts"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cart_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cart_id" uuid NOT NULL, "variant_id" uuid NOT NULL, "quantity" integer NOT NULL, CONSTRAINT "uq_cart_items_cart_variant" UNIQUE ("cart_id", "variant_id"), CONSTRAINT "chk_cart_items_quantity" CHECK ("quantity" > 0), CONSTRAINT "PK_6fccf5ec03c172d27a28a82928b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "contact_messages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "full_name" character varying(120) NOT NULL, "email" character varying(254) NOT NULL, "phone" character varying(20) NOT NULL, "order_number" character varying(20), "subject" character varying(40) NOT NULL, "message" text NOT NULL, "is_resolved" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b74f96eb2edd977ccfba6533293" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contact_messages_created" ON "contact_messages"  ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "newsletter_subscribers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(254) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_38f9333e9961b2fdb589128d19b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_newsletter_subscribers_email" ON "newsletter_subscribers"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."coupon_type" AS ENUM('percentage', 'fixed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "coupons" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(40) NOT NULL, "description" character varying(200), "type" "public"."coupon_type" NOT NULL, "value" integer NOT NULL, "min_subtotal" integer NOT NULL DEFAULT '0', "max_discount" integer, "starts_at" TIMESTAMP WITH TIME ZONE, "expires_at" TIMESTAMP WITH TIME ZONE, "usage_limit" integer, "used_count" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "chk_coupons_used_count" CHECK ("used_count" >= 0), CONSTRAINT "PK_d7ea8864a0150183770f3e9a8cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_coupons_code" ON "coupons"  ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'payment_failed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_number" character varying(20) NOT NULL, "user_id" uuid, "status" "public"."order_status" NOT NULL DEFAULT 'pending_payment', "subtotal" integer NOT NULL, "discount" integer NOT NULL DEFAULT '0', "shipping_fee" integer NOT NULL DEFAULT '0', "total" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'INR', "coupon_code" character varying(40), "coupon_id" uuid, "shipping_method" character varying(20) NOT NULL, "shipping_address" jsonb NOT NULL, "billing_address" jsonb NOT NULL, "contact_email" character varying(254) NOT NULL, "notes" character varying(500), "paid_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_orders_number" ON "orders"  ("order_number") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_status_created" ON "orders"  ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_user_created" ON "orders"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "order_id" uuid NOT NULL, "product_id" uuid, "variant_id" uuid, "product_name" character varying(160) NOT NULL, "product_slug" character varying(180) NOT NULL, "variant_label" character varying(40) NOT NULL, "sku" character varying(64) NOT NULL, "image_url" character varying(500), "unit_price" integer NOT NULL, "quantity" integer NOT NULL, "line_total" integer NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_product" ON "order_items"  ("product_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_items_order" ON "order_items"  ("order_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'succeeded', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" uuid NOT NULL, "provider" character varying(20) NOT NULL, "provider_order_id" character varying(100) NOT NULL, "provider_payment_id" character varying(100), "amount" integer NOT NULL, "currency" character(3) NOT NULL DEFAULT 'INR', "status" "public"."payment_status" NOT NULL DEFAULT 'created', "failure_reason" character varying(255), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payments_provider_order" ON "payments"  ("provider_order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_order" ON "payments"  ("order_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "product_id" uuid NOT NULL, "user_id" uuid NOT NULL, "rating" smallint NOT NULL, "title" character varying(120) NOT NULL, "content" text NOT NULL, "is_verified_purchase" boolean NOT NULL DEFAULT false, "is_published" boolean NOT NULL DEFAULT true, CONSTRAINT "uq_reviews_product_user" UNIQUE ("product_id", "user_id"), CONSTRAINT "chk_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reviews_product_created" ON "reviews"  ("product_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "addresses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "label" character varying(40), "first_name" character varying(80) NOT NULL, "last_name" character varying(80) NOT NULL, "phone" character varying(20) NOT NULL, "line1" character varying(200) NOT NULL, "line2" character varying(200), "city" character varying(100) NOT NULL, "state" character varying(100) NOT NULL, "postal_code" character varying(12) NOT NULL, "country" character(2) NOT NULL DEFAULT 'IN', "is_default_shipping" boolean NOT NULL DEFAULT false, "is_default_billing" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_addresses_user" ON "addresses"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "wishlist_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "product_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_wishlist_items_user_product" UNIQUE ("user_id", "product_id"), CONSTRAINT "PK_0bd52924a97cda208ed2a07bd69" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD CONSTRAINT "fk_product_images_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "fk_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD CONSTRAINT "fk_product_variants_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" ADD CONSTRAINT "fk_carts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "fk_cart_items_cart" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "fk_cart_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "fk_reviews_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "fk_reviews_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" ADD CONSTRAINT "fk_addresses_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" ADD CONSTRAINT "fk_wishlist_items_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" ADD CONSTRAINT "fk_wishlist_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" DROP CONSTRAINT "fk_wishlist_items_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlist_items" DROP CONSTRAINT "fk_wishlist_items_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" DROP CONSTRAINT "fk_addresses_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "fk_reviews_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "fk_reviews_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "fk_payments_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "fk_order_items_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "fk_order_items_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "fk_order_items_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "fk_orders_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "fk_cart_items_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "fk_cart_items_cart"`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" DROP CONSTRAINT "fk_carts_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP CONSTRAINT "fk_product_variants_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "fk_products_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT "fk_product_images_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "fk_categories_parent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_user"`,
    );
    await queryRunner.query(`DROP TABLE "wishlist_items"`);
    await queryRunner.query(`DROP INDEX "public"."idx_addresses_user"`);
    await queryRunner.query(`DROP TABLE "addresses"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_reviews_product_created"`,
    );
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_order"`);
    await queryRunner.query(`DROP INDEX "public"."uq_payments_provider_order"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payment_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_order_items_order"`);
    await queryRunner.query(`DROP INDEX "public"."idx_order_items_product"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP INDEX "public"."idx_orders_user_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_orders_status_created"`);
    await queryRunner.query(`DROP INDEX "public"."uq_orders_number"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."order_status"`);
    await queryRunner.query(`DROP INDEX "public"."uq_coupons_code"`);
    await queryRunner.query(`DROP TABLE "coupons"`);
    await queryRunner.query(`DROP TYPE "public"."coupon_type"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_newsletter_subscribers_email"`,
    );
    await queryRunner.query(`DROP TABLE "newsletter_subscribers"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_contact_messages_created"`,
    );
    await queryRunner.query(`DROP TABLE "contact_messages"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(`DROP INDEX "public"."uq_carts_user"`);
    await queryRunner.query(`DROP TABLE "carts"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_product_variants_product"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_product_variants_sku"`);
    await queryRunner.query(`DROP TABLE "product_variants"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_products_category_price"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_products_active_price"`);
    await queryRunner.query(`DROP INDEX "public"."idx_products_active_rating"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_products_active_created"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_products_featured"`);
    await queryRunner.query(`DROP INDEX "public"."uq_products_slug"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP INDEX "public"."idx_product_images_product"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
    await queryRunner.query(`DROP INDEX "public"."idx_categories_parent"`);
    await queryRunner.query(`DROP INDEX "public"."uq_categories_slug"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_family"`);
    await queryRunner.query(`DROP INDEX "public"."uq_refresh_tokens_hash"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
  }
}
