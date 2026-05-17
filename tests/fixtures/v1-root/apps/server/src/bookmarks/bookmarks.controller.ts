import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Category } from 'src/categories/entities/category.entity';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { User } from 'src/users/entities/user.entity';
import { BookmarksService } from './bookmarks.service';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { UpdateBookmarkDto } from './dto/update-bookmark.dto';
import { MetadataEnhancementService } from './services/metadata-enhancement.service';
import { MetadataService } from './services/metadata.service';

@Controller('bookmarks')
export class BookmarksController {
  constructor(
    private readonly bookmarksService: BookmarksService,
    private readonly metadataService: MetadataService,
    private readonly metadataEnhancementService: MetadataEnhancementService,
  ) {}

  @Post()
  @Auth(AuthType.Cookie)
  async createBookmark(@ActiveUser('id') userId: string, @Body() createBookmarkDto: CreateBookmarkDto) {
    const bookmark = await this.bookmarksService.createBookmark(createBookmarkDto, userId);

    // Queue background metadata enhancement (fire and forget)
    this.metadataEnhancementService.queueEnhancement(bookmark.id);

    return bookmark;
  }

  @Get()
  @Auth(AuthType.Cookie)
  findAllBookmarks(@ActiveUser('id') userId: string, @Query('category') categoryName?: Category['name']) {
    return this.bookmarksService.findAllBookmarks(userId, categoryName);
  }

  @Get('metadata')
  @Auth(AuthType.Cookie)
  async getMetadata(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL parameter is required');
    }
    return this.metadataService.fetchMetadata(url);
  }

  @Post(':id/enhance')
  @Auth(AuthType.Cookie)
  async enhanceBookmark(@ActiveUser('id') userId: string, @Param('id') id: string) {
    // Verify user owns this bookmark
    const bookmark = await this.bookmarksService.findOneBookmark(userId, id);
    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    // Queue enhancement (fire and forget)
    this.metadataEnhancementService.queueEnhancement(id);

    return { message: 'Enhancement queued', bookmarkId: id };
  }

  @Post(':id/refetch')
  @Auth(AuthType.Cookie)
  async refetchBookmark(@ActiveUser('id') userId: string, @Param('id') id: string) {
    // Verify user owns this bookmark
    const bookmark = await this.bookmarksService.findOneBookmark(userId, id);
    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    // Refetch metadata immediately and return updated bookmark
    return this.bookmarksService.refetchBookmarkMetadata(userId, id);
  }

  @Get('/s/:username')
  @Auth(AuthType.None)
  findAllBookmarksByUsername(
    @Param('username') username: User['username'],
    @Query('category') categoryName?: Category['name'],
  ) {
    return this.bookmarksService.findAllBookmarksByUsername(username, categoryName);
  }

  @Get(':id')
  @Auth(AuthType.Cookie)
  findOneBookmark(@ActiveUser('id') userId: string, @Param('id') id: string) {
    return this.bookmarksService.findOneBookmark(userId, id);
  }

  @Patch(':id')
  @Auth(AuthType.Cookie)
  updateBookmark(
    @ActiveUser('id') userId: string,
    @Param('id') id: string,
    @Body() updateBookmarkDto: UpdateBookmarkDto,
  ) {
    return this.bookmarksService.updateBookmark(userId, id, updateBookmarkDto);
  }

  @Patch(':id/category')
  @Auth(AuthType.Cookie)
  updateBookmarkCategory(
    @ActiveUser('id') userId: string,
    @Param('id') id: string,
    @Body('categoryId') categoryId: string,
  ) {
    return this.bookmarksService.updateBookmarkCategory(userId, id, categoryId);
  }

  @Delete(':id')
  @Auth(AuthType.Cookie)
  removeBookmark(@ActiveUser('id') userId: string, @Param('id') id: string) {
    return this.bookmarksService.removeBookmark(userId, id);
  }
}
