import { toast } from 'sonner';
import React from 'react';
import { deleteBookmark } from '~/app/_common/actions/bookmark.action';
import { withDeploymentCheck } from '~/app/_common/utils/deployment-mismatch';
import { useRouter } from 'next/navigation';

export const useBookmarkDelete = () => {
  const router = useRouter();

  const handleDelete = React.useCallback(
    async (id: string) => {
      try {
        toast.promise(withDeploymentCheck(deleteBookmark({ id })), {
          loading: 'Deleting bookmark...',
          success: 'Bookmark deleted successfully',
          error: 'Failed to delete bookmark',
          finally: () => {
            router.refresh();
          },
        });
      } catch {
        toast.error('Failed to delete bookmark');
      }
    },
    [router],
  );

  return { handleDelete };
};
