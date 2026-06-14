import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Additive-only: add verbatim display fields for the per-lot CoA hero
 * (purity text, strength, lab name, test method, endotoxin). All nullable,
 * no type changes to existing columns — safe to apply on the live Cloud DB.
 */
export class Migration20260614000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "lot" add column if not exists "purity_text" text null;`);
    this.addSql(`alter table if exists "lot" add column if not exists "strength" text null;`);
    this.addSql(`alter table if exists "lot" add column if not exists "lab_name" text null;`);
    this.addSql(`alter table if exists "lot" add column if not exists "test_method" text null;`);
    this.addSql(`alter table if exists "lot" add column if not exists "endotoxin" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "lot" drop column if exists "purity_text";`);
    this.addSql(`alter table if exists "lot" drop column if exists "strength";`);
    this.addSql(`alter table if exists "lot" drop column if exists "lab_name";`);
    this.addSql(`alter table if exists "lot" drop column if exists "test_method";`);
    this.addSql(`alter table if exists "lot" drop column if exists "endotoxin";`);
  }

}
