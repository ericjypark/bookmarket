import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CategoriesService } from 'src/categories/categories.service';
import { Category } from 'src/categories/entities/category.entity';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { FindOptionsWhere, Repository } from 'typeorm';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { UpdateBookmarkDto } from './dto/update-bookmark.dto';
import { Bookmark } from './entities/bookmark.entity';
import { MetadataService } from './services/metadata.service';

@Injectable()
export class BookmarksService {
  constructor(
    @InjectRepository(Bookmark)
    private bookmarksRepository: Repository<Bookmark>,
    private categoriesService: CategoriesService,
    private readonly usersService: UsersService,
    private readonly metadataService: MetadataService,
  ) {}

  async createBookmark(createBookmarkDto: CreateBookmarkDto, userId: string) {
    let category: Category | undefined;

    if (createBookmarkDto.category) {
      category = await this.categoriesService.findOneByName(createBookmarkDto.category, userId);

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    return this.bookmarksRepository.save({
      ...createBookmarkDto,
      category,
      user: { id: userId },
    });
  }

  findAllBookmarks(userId: string, categoryName?: Category['name']) {
    const where: FindOptionsWhere<Bookmark> = {
      user: { id: userId },
    };

    if (categoryName) {
      where.category = { name: categoryName };
    }

    return this.bookmarksRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findAllBookmarksByUsername(username: User['username'], categoryName?: Category['name']) {
    const user = await this.usersService.findOneByUsername(username);

    if (!user) throw new NotFoundException('User does not exist');
    if (!user?.isPublic) throw new ForbiddenException("This user's profile is private");

    const where: FindOptionsWhere<Bookmark> = {
      user: { id: user.id },
    };

    if (categoryName) {
      where.category = { name: categoryName };
    }

    return this.bookmarksRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOneBookmark(userId: string, id: string) {
    const bookmark = await this.bookmarksRepository.findOne({
      where: { user: { id: userId }, id },
    });

    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    return bookmark;
  }

  async updateBookmark(userId: string, id: string, updateBookmarkDto: UpdateBookmarkDto) {
    const bookmark = await this.findOneBookmark(userId, id);

    if (bookmark.user.id !== userId) {
      throw new ForbiddenException("This bookmark doesn't belong to the user");
    }

    let category: Category | undefined;

    if (updateBookmarkDto.category) {
      category = await this.categoriesService.findOneByName(updateBookmarkDto.category, userId);
    }

    return this.bookmarksRepository.update(id, {
      ...updateBookmarkDto,
      user: { id: userId },
      category,
    });
  }

  async updateBookmarkCategory(userId: string, id: string, categoryId?: string) {
    const bookmark = await this.findOneBookmark(userId, id);

    if (bookmark.user.id !== userId) {
      throw new ForbiddenException("This bookmark doesn't belong to the user");
    }

    if (categoryId) {
      const category = await this.categoriesService.findOne(categoryId);

      if (category.user.id !== userId) {
        throw new ForbiddenException("This category doesn't belong to the user");
      }

      bookmark.category = category;
    } else {
      bookmark.category = undefined;
    }

    return this.bookmarksRepository.save(bookmark);
  }

  async removeBookmark(userId: string, id: string) {
    const bookmark = await this.findOneBookmark(userId, id);

    if (bookmark.user.id !== userId) {
      throw new ForbiddenException("This bookmark doesn't belong to the user");
    }

    return this.bookmarksRepository.delete(id);
  }

  async refetchBookmarkMetadata(userId: string, id: string) {
    const bookmark = await this.findOneBookmark(userId, id);

    if (bookmark.user.id !== userId) {
      throw new ForbiddenException("This bookmark doesn't belong to the user");
    }

    try {
      const metadata = await this.metadataService.fetchMetadata(bookmark.url);

      const updateData: Partial<Bookmark> = {};

      if (metadata.title && metadata.title.trim()) {
        updateData.title = metadata.title.trim();
      }

      if (metadata.description && metadata.description.trim()) {
        updateData.description = metadata.description.trim();
      }

      if (metadata.logo !== undefined) {
        updateData.faviconUrl = metadata.logo?.trim() || undefined;
      }

      if (Object.keys(updateData).length > 0) {
        await this.bookmarksRepository.update(id, updateData);
      }

      return this.findOneBookmark(userId, id);
    } catch (error) {
      throw new Error('Failed to refetch bookmark metadata');
    }
  }
}
