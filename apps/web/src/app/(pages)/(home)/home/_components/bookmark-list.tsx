'use client';

import BlurFade from '~/app/_core/components/blur-fade';
import { useBookmarkStore } from '../_state/store/use-bookmark-store';
import { BookmarkCard } from './bookmark-card';

import { parseAsString, useQueryState } from 'nuqs';
import React from 'react';
import { useBodyScrollLock } from '~/app/_common/hooks/use-body-scroll-lock';
import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { useQuery } from '@tanstack/react-query';
import { bookmarksQuery } from '~/app/_common/state/query/bookmark.query';
import { isBookmarkMetadataActive } from '~/app/_common/utils/bookmark-metadata';

export function BookmarkList({ bookmarks: initialBookmarks, isViewOnly }: { bookmarks: Bookmark[]; isViewOnly: boolean }) {
  const { activeBookmarkId } = useBookmarkStore();
  useBodyScrollLock({ isDisabled: activeBookmarkId === null });
  const [category] = useQueryState('c', parseAsString);

  // Use React Query for real-time updates, fallback to initial bookmarks
  const { data: bookmarks = initialBookmarks, refetch } = useQuery({
    ...bookmarksQuery(),
    initialData: initialBookmarks,
    enabled: !isViewOnly, // Only fetch updates when not in view-only mode
  });

  const hasPendingMetadata = React.useMemo(
    () => bookmarks.some(isBookmarkMetadataActive),
    [bookmarks],
  );

  React.useEffect(() => {
    if (isViewOnly || !hasPendingMetadata) return;

    const interval = window.setInterval(() => {
      void refetch();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [hasPendingMetadata, isViewOnly, refetch]);

  const filteredBookmarks = React.useMemo(
    () =>
      bookmarks.filter(bookmark => {
        if (!category) return true;
        return bookmark.category?.name === category;
      }),
    [bookmarks, category],
  );

  return (
    <div className='relative flex flex-col gap-2'>
      {filteredBookmarks?.map((bookmark, index) => (
        <BlurFade key={bookmark.id} delay={Math.min(index, 12) * 0.025}>
          <BookmarkCard
            bookmark={bookmark}
            isActive={activeBookmarkId === bookmark.id}
            isBlurred={activeBookmarkId !== null && activeBookmarkId !== bookmark.id}
            isViewOnly={isViewOnly}
          />
        </BlurFade>
      ))}
    </div>
  );
}
