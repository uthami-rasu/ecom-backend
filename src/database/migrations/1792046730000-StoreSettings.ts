import { MigrationInterface, QueryRunner } from 'typeorm';

/** Store/branding + Gmail SMTP settings move from data/store-settings.json into the DB. */
export class StoreSettings1792046730000 implements MigrationInterface {
  name = 'StoreSettings1792046730000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "store_settings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "store_name" character varying(120) NOT NULL, "store_logo_url" character varying(500), "store_logo_key" character varying(255), "favicon_url" character varying(500), "favicon_key" character varying(255), "contact_email" character varying(254) NOT NULL, "phone" character varying(40) NOT NULL, "store_address" text NOT NULL, "tax_id" character varying(40) NOT NULL, "registration_details" text NOT NULL, "currency" character varying(20) NOT NULL, "time_zone" character varying(80) NOT NULL, "standard_delivery_charge" numeric(12,2) NOT NULL DEFAULT '0', "free_delivery_threshold" numeric(12,2) NOT NULL DEFAULT '0', "delivery_regions" text array NOT NULL DEFAULT '{}', "enable_tax" boolean NOT NULL DEFAULT true, "default_tax_rate" numeric(5,2) NOT NULL DEFAULT '0', "product_price_type" character varying(12) NOT NULL DEFAULT 'inclusive', "min_order_value" numeric(12,2) NOT NULL DEFAULT '0', "max_order_value" numeric(12,2) NOT NULL DEFAULT '0', "allow_cod" boolean NOT NULL DEFAULT true, "cancellation_window_minutes" integer NOT NULL DEFAULT '30', "payment_upi" boolean NOT NULL DEFAULT true, "payment_card" boolean NOT NULL DEFAULT true, "payment_net_banking" boolean NOT NULL DEFAULT false, "payment_cod" boolean NOT NULL DEFAULT true, "mail_host" character varying(255) NOT NULL DEFAULT 'smtp.gmail.com', "mail_port" integer NOT NULL DEFAULT '587', "mail_user" character varying(255), "mail_password" character varying(500), "mail_from" character varying(320) NOT NULL, "mail_secure" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_store_settings" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "store_settings"`);
  }
}
