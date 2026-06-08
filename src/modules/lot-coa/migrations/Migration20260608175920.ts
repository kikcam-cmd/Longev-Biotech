import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260608175920 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "lot" drop constraint if exists "lot_product_id_lot_number_unique";`);
    this.addSql(`create table if not exists "lot" ("id" text not null, "product_id" text not null, "variant_id" text null, "lot_number" text not null, "purity_pct" integer null, "measured_mass" integer null, "coa_file_id" text null, "released_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "lot_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_lot_deleted_at" ON "lot" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_lot_product_id_lot_number_unique" ON "lot" ("product_id", "lot_number") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "lot" cascade;`);
  }

}
