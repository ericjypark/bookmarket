import { type Bookmark } from '../interfaces/bookmark.interface';

const activePendingWindowMs = 5 * 60 * 1000;

export const isBookmarkMetadataActive = (bookmark: Bookmark): boolean => {
  if (bookmark.isOptimistic) return true;
  if (bookmark.metadataStatus !== 'PENDING') return false;

  const pendingSince = bookmark.metadataUpdatedAt ?? bookmark.createdAt;
  const metadataUpdatedAt = new Date(pendingSince).getTime();
  if (Number.isNaN(metadataUpdatedAt)) return false;

  return Date.now() - metadataUpdatedAt < activePendingWindowMs;
};
