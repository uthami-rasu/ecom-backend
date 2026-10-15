import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trigram index backing the case-insensitive product search (ILIKE '%term%').
 * The indexed expression must stay identical to the one used in ProductsService.
 */
export class ProductSearchIndex1792040071797 implements MigrationInterface {
  name = 'ProductSearchIndex1792040071797';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX "idx_products_search_trgm" ON "products" USING gin ((name || ' ' || coalesce(subtitle, '') || ' ' || coalesce(origin, '')) gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_search_trgm"`);
  }
}
