import { MigrationInterface, QueryRunner } from 'typeorm';

export class NullableFaviconBookmark1741004721666 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "bookmark" ALTER COLUMN "faviconUrl" DROP NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "bookmark" ALTER COLUMN "faviconUrl" SET NOT NULL');
  }
}
