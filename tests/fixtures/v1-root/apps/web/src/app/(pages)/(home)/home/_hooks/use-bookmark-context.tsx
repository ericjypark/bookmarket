import { useBookmarkDelete } from './use-bookmark-delete';

import { CopyIcon, RefreshCwIcon, TrashIcon } from 'lucide-react';

import { PencilIcon } from 'lucide-react';
import React from 'react';
import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { trackBookmarkEvent } from '~/app/_common/utils/analytics';
import { useBookmarkStore } from '../_state/store/use-bookmark-store';
import { useBookmarkCopy } from './use-bookmark-copy';
import { useBookmarkRefetch } from './use-bookmark-refetch';

export const useBookmarkContext = ({ bookmark }: { bookmark: Bookmark }) => {
  const { handleDelete } = useBookmarkDelete();
  const { handleCopy } = useBookmarkCopy();
  const { handleRefetch } = useBookmarkRefetch();
  const { refetchingBookmarkId } = useBookmarkStore();

  const { setActiveBookmarkId, activeBookmarkId } = useBookmarkStore();

  const isCurrentBookmarkRefetching = refetchingBookmarkId === bookmark.id;

  const menuItems = React.useMemo(
    () => [
      {
        icon: CopyIcon,
        label: 'Copy',
        onClick: () => {
          trackBookmarkEvent.copyUrl(bookmark.url);
          void handleCopy(bookmark.url);
        },
        disabled: false,
      },
      {
        icon: PencilIcon,
        label: 'Rename',
        onClick: () => {
          if (activeBookmarkId !== bookmark.id) {
            trackBookmarkEvent.editTitle(bookmark.url);
            setActiveBookmarkId(bookmark.id);
          } else {
            setActiveBookmarkId(null);
          }
        },
        disabled: false,
      },
      {
        icon: RefreshCwIcon,
        label: 'Refetch',
        onClick: () => {
          trackBookmarkEvent.refetch(bookmark.url);
          handleRefetch(bookmark.id);
        },
        disabled: isCurrentBookmarkRefetching,
      },
      {
        icon: TrashIcon,
        label: 'Delete',
        onClick: () => {
          trackBookmarkEvent.delete(bookmark.url);
          void handleDelete(bookmark.id);
        },
        disabled: false,
      },
    ],
    [
      activeBookmarkId,
      bookmark.id,
      bookmark.url,
      handleCopy,
      handleDelete,
      handleRefetch,
      isCurrentBookmarkRefetching,
      setActiveBookmarkId,
    ],
  );

  return { menuItems, isCurrentBookmarkRefetching };
};
