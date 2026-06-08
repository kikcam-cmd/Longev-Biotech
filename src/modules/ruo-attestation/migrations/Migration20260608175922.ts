import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260608175922 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ruo_attestation" ("id" text not null, "order_id" text null, "cart_id" text null, "customer_id" text null, "email" text not null, "affirmed_research_use" boolean not null, "affirmed_qualified" boolean not null, "affirmed_not_human" boolean not null, "attestation_text" text not null, "ip_address" text null, "user_agent" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ruo_attestation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ruo_attestation_deleted_at" ON "ruo_attestation" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ruo_attestation" cascade;`);
  }

}
