import { MigrationInterface, QueryRunner } from 'typeorm';

export class NullableDescriptionBookmark1741003681675 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "bookmark" ALTER COLUMN "description" DROP NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "bookmark" ALTER COLUMN "description" SET NOT NULL');
  }
}
