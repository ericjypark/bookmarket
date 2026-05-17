import { type Category } from './category.interface';

export type BookmarkMetadataStatus = 'PENDING' | 'READY' | 'FAILED' | string;

export interface Bookmark {
  id: string;
  url: string;
  title?: string;
  description?: string;
  faviconUrl?: string;
  metadataStatus?: BookmarkMetadataStatus;
  metadataUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  category?: Category;
  isOptimistic?: boolean;
}

export interface MetadataJobStatus {
  bookmarkId: string;
  metadataStatus: BookmarkMetadataStatus;
  metadataVersion: number;
}
