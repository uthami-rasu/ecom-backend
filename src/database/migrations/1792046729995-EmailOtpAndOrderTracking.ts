import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email verification / OTP codes and the order fulfilment lifecycle (hand-written).
 *
 * - users.email_verified_at (existing users are backfilled as verified at sign-up time)
 * - email_otps table + otp_purpose enum
 * - order_status gains 'packed' and 'out_for_delivery'. ALTER TYPE ... ADD VALUE may run
 *   inside a transaction (PG 12+) as long as the new values are not used in it, which
 *   this migration does not.
 * - orders tracking columns, order_events timeline (+ backfilled "Order placed" /
 *   "Payment received" events for existing orders)
 */
export class EmailOtpAndOrderTracking1792046729995 implements MigrationInterface {
  name = 'EmailOtpAndOrderTracking1792046729995';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Email verification ──
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_verified_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "email_verified_at" = "created_at"`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."otp_purpose" AS ENUM('verify_email', 'reset_password', 'change_email')`,
    );
    await queryRunner.query(
      `CREATE TABLE "email_otps" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "email" character varying(254) NOT NULL, "purpose" "public"."otp_purpose" NOT NULL, "code_hash" character varying(64) NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c66a6bae8086377ae2b0f5b177e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_email_otps_user_purpose_created" ON "email_otps" ("user_id", "purpose", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "email_otps" ADD CONSTRAINT "fk_email_otps_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // ── Order lifecycle ──
    await queryRunner.query(
      `ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'packed' AFTER 'processing'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'out_for_delivery' AFTER 'shipped'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "carrier" character varying(80), ADD "tracking_number" character varying(80), ADD "tracking_url" character varying(500), ADD "estimated_delivery_at" TIMESTAMP WITH TIME ZONE, ADD "shipped_at" TIMESTAMP WITH TIME ZONE, ADD "delivered_at" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."order_event_actor" AS ENUM('system', 'customer', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "order_id" uuid NOT NULL, "status" "public"."order_status", "title" character varying(120) NOT NULL, "note" character varying(500), "actor" "public"."order_event_actor" NOT NULL, "actor_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(), CONSTRAINT "PK_cc1b82b0fcf1be577d9d7ecbf8b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_events_order_created" ON "order_events" ("order_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "order_events" ADD CONSTRAINT "fk_order_events_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_events" ADD CONSTRAINT "fk_order_events_actor_user" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Backfill a minimal timeline for orders placed before events existed.
    await queryRunner.query(
      `INSERT INTO "order_events" ("order_id", "status", "title", "actor", "actor_user_id", "created_at")
       SELECT "id", 'pending_payment', 'Order placed', 'customer', "user_id", "created_at" FROM "orders"`,
    );
    await queryRunner.query(
      `INSERT INTO "order_events" ("order_id", "status", "title", "actor", "created_at")
       SELECT "id", 'paid', 'Payment received', 'system', "paid_at" FROM "orders" WHERE "paid_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Order lifecycle ──
    await queryRunner.query(
      `ALTER TABLE "order_events" DROP CONSTRAINT "fk_order_events_actor_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_events" DROP CONSTRAINT "fk_order_events_order"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_order_events_order_created"`,
    );
    await queryRunner.query(`DROP TABLE "order_events"`);
    await queryRunner.query(`DROP TYPE "public"."order_event_actor"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "delivered_at", DROP COLUMN "shipped_at", DROP COLUMN "estimated_delivery_at", DROP COLUMN "tracking_url", DROP COLUMN "tracking_number", DROP COLUMN "carrier"`,
    );

    // Postgres cannot drop enum values: map them to their nearest old status, then
    // rebuild the type without them.
    await queryRunner.query(
      `UPDATE "orders" SET "status" = 'processing' WHERE "status" = 'packed'`,
    );
    await queryRunner.query(
      `UPDATE "orders" SET "status" = 'shipped' WHERE "status" = 'out_for_delivery'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."order_status" RENAME TO "order_status_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'payment_failed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."order_status" USING "status"::text::"public"."order_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending_payment'`,
    );
    await queryRunner.query(`DROP TYPE "public"."order_status_old"`);

    // ── Email verification ──
    await queryRunner.query(
      `ALTER TABLE "email_otps" DROP CONSTRAINT "fk_email_otps_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_email_otps_user_purpose_created"`,
    );
    await queryRunner.query(`DROP TABLE "email_otps"`);
    await queryRunner.query(`DROP TYPE "public"."otp_purpose"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "email_verified_at"`,
    );
  }
}
