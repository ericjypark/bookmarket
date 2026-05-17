import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { CategoriesModule } from './categories/categories.module';
import { IamModule } from './iam/iam.module';
import { SlotsModule } from './slots/slots.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    BookmarksModule,
    UsersModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      host: process.env.POSTGRES_HOST,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_NAME,

      autoLoadEntities: true,
      // FIXME: Should be set to false on prod
      synchronize: false,
      migrations: [`${__dirname}/migrations/**/*{.ts,.js}`],
      migrationsTableName: 'migrations',
      migrationsRun: true,
    }),
    IamModule,
    CategoriesModule,
    SlotsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
  controllers: [],
})
export class AppModule {}
