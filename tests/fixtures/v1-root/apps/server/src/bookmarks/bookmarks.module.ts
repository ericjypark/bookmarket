import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from 'src/categories/categories.module';
import { Category } from 'src/categories/entities/category.entity';
import { jwtConfig } from 'src/iam/config/jwt.config';
import { UsersModule } from 'src/users/users.module';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { Bookmark } from './entities/bookmark.entity';
import { MetadataService } from './services/metadata.service';
import { MetadataEnhancementService } from './services/metadata-enhancement.service';

@Module({
  controllers: [BookmarksController],
  providers: [BookmarksService, MetadataService, MetadataEnhancementService],
  imports: [
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
    TypeOrmModule.forFeature([Bookmark, Category]),
    CategoriesModule,
    UsersModule,
  ],
  exports: [BookmarksService],
})
export class BookmarksModule {}
