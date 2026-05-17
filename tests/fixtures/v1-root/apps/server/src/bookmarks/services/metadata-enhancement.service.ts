import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as Sentry from '@sentry/nestjs';
import { Repository } from 'typeorm';
import { Bookmark } from '../entities/bookmark.entity';
import { MetadataService } from './metadata.service';

@Injectable()
export class MetadataEnhancementService {
  constructor(
    @InjectRepository(Bookmark)
    private readonly bookmarkRepository: Repository<Bookmark>,
    private readonly metadataService: MetadataService,
  ) {}

  async queueEnhancement(bookmarkId: string): Promise<void> {
    setImmediate(() => {
      this.enhanceBookmarkMetadata(bookmarkId);
    });
  }

  private async enhanceBookmarkMetadata(bookmarkId: string): Promise<void> {
    try {
      const bookmark = await this.bookmarkRepository.findOne({
        where: { id: bookmarkId },
      });

      if (!bookmark) return;

      const metadata = await this.metadataService.fetchMetadata(bookmark.url);

      const updateData: Partial<Bookmark> = {};

      if (metadata.title?.trim()) {
        updateData.title = metadata.title.trim();
      }
      if (metadata.description?.trim()) {
        updateData.description = metadata.description.trim();
      }
      if (metadata.logo?.trim()) {
        updateData.faviconUrl = metadata.logo.trim();
      }

      if (Object.keys(updateData).length > 0) {
        await this.bookmarkRepository.update(bookmarkId, updateData);
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'metadata-enhancement' },
        extra: { bookmarkId },
      });
    }
  }
}
