import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserNameFirstNameLastName1742215844517 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE "user"
        ADD COLUMN "username" VARCHAR NULL UNIQUE,
        ADD COLUMN "firstName" VARCHAR NULL,
        ADD COLUMN "lastName" VARCHAR NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE "user"
        DROP COLUMN "username",
        DROP COLUMN "firstName",
        DROP COLUMN "lastName"
    `);
  }
}
