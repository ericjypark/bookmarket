'use client';

import React from 'react';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateBookmark } from '~/app/_common/actions/bookmark.action';
import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { withDeploymentCheck } from '~/app/_common/utils/deployment-mismatch';
import { useBookmarkStore } from '../_state/store/use-bookmark-store';

export const BookmarkCardTitleInput = ({ bookmark }: { bookmark: Bookmark }) => {
  const router = useRouter();
  const { setActiveBookmarkId } = useBookmarkStore();
  const [inputValue, setInputValue] = React.useState(bookmark.title);

  const handleUpdateBookmark = React.useCallback(async () => {
    toast.promise(
      withDeploymentCheck(updateBookmark({
        ...bookmark,
        category: bookmark.category?.name,
        title: inputValue,
      })),
      {
        loading: 'Updating bookmark...',
        success: 'Bookmark updated!',
        error: 'Failed to update bookmark',
        finally: () => {
          setActiveBookmarkId(null);
          router.refresh();
        },
      },
    );
  }, [bookmark, inputValue, router, setActiveBookmarkId]);

  const handleFormSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (inputValue === bookmark.title) {
        setActiveBookmarkId(null);
        return;
      }
      handleUpdateBookmark();
    },
    [bookmark.title, handleUpdateBookmark, inputValue, setActiveBookmarkId],
  );

  return (
    <form onSubmit={handleFormSubmit}>
      <input
        ref={node => {
          setTimeout(() => node?.focus(), 250);
        }}
        onBlur={handleUpdateBookmark}
        type='text'
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        className='w-full bg-transparent text-sm font-medium text-foreground/50 focus-visible:outline-none'
      />
    </form>
  );
};
