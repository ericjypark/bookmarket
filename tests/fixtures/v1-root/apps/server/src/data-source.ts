import { config } from 'dotenv';
import { DataSource } from 'typeorm';

// Load environment variables from .env file
config();
export const AppDataSource = new DataSource({
  type: 'postgres',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  host: process.env.POSTGRES_HOST,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_NAME,

  entities: ['./dist/**/*.entity.js'],
  // FIXME: Should be set to false on prod
  synchronize: false,
  migrations: ['./dist/migrations/**/*.js'],
  migrationsTableName: 'migrations',
  migrationsRun: true,
});
