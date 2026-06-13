import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613225050 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "referral_order" drop constraint if exists "referral_order_order_id_unique";`);
    this.addSql(`alter table if exists "affiliate" drop constraint if exists "affiliate_code_unique";`);
    this.addSql(`alter table if exists "affiliate" drop constraint if exists "affiliate_customer_id_unique";`);
    this.addSql(`create table if not exists "affiliate" ("id" text not null, "customer_id" text not null, "code" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "affiliate_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_customer_id_unique" ON "affiliate" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_affiliate_code_unique" ON "affiliate" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_affiliate_deleted_at" ON "affiliate" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "referral_order" ("id" text not null, "code" text not null, "affiliate_customer_id" text not null, "order_id" text not null, "order_total" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "referral_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_referral_order_order_id_unique" ON "referral_order" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_referral_order_deleted_at" ON "referral_order" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "affiliate" cascade;`);

    this.addSql(`drop table if exists "referral_order" cascade;`);
  }

}
