import { MigrationInterface, QueryRunner } from "typeorm";

export class ProfilePublic1742896225807 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        ALTER TABLE "user"
        ADD COLUMN "isPublic" BOOLEAN DEFAULT true
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        ALTER TABLE "user"
        DROP COLUMN "isPublic"
        `)
    }

}
