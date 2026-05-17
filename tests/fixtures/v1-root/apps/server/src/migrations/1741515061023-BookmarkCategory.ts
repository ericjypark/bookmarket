import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookmarkCategory1741515061023 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create Category table
    await queryRunner.query(`
      CREATE TABLE "category" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "userId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_category_name_userId" UNIQUE ("name", "userId"),
        CONSTRAINT "FK_category_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // Add categoryId column to Bookmark table
    await queryRunner.query(`
      ALTER TABLE "bookmark" ADD COLUMN "categoryId" uuid
    `);

    // Add foreign key from Bookmark to Category
    await queryRunner.query(`
      ALTER TABLE "bookmark"
      ADD CONSTRAINT "FK_bookmark_category"
      FOREIGN KEY ("categoryId")
      REFERENCES "category"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key constraint from Bookmark
    await queryRunner.query(`
      ALTER TABLE "bookmark"
      DROP CONSTRAINT "FK_bookmark_category"
    `);

    // Remove categoryId column from Bookmark
    await queryRunner.query(`
      ALTER TABLE "bookmark"
      DROP COLUMN "categoryId"
    `);

    // Drop Category table
    await queryRunner.query(`
      DROP TABLE "category"
    `);
  }
}
