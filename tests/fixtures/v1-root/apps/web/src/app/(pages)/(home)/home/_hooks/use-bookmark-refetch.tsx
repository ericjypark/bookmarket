import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { refetchBookmark } from '~/app/_common/actions/bookmark.action';
import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { useBookmarkStore } from '../_state/store/use-bookmark-store';

export const useBookmarkRefetch = () => {
  const queryClient = useQueryClient();
  const { refetchingBookmarkId, setRefetchingBookmarkId } = useBookmarkStore();

  const refetchMutation = useMutation({
    mutationFn: refetchBookmark,
    onMutate: variables => {
      // Set the refetching bookmark ID when mutation starts
      setRefetchingBookmarkId(variables.id);
    },
    onSuccess: (updatedBookmark: Bookmark, variables) => {
      // Update the specific bookmark in the cache
      queryClient.setQueryData(['bookmarks'], (oldData: Bookmark[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(bookmark => (bookmark.id === updatedBookmark.id ? updatedBookmark : bookmark));
      });

      // Clear refetching state
      setRefetchingBookmarkId(null);

      // Dismiss loading toast and show success
      toast.dismiss(`refetch-${variables.id}`);
      toast.success('Bookmark metadata refreshed successfully');
    },
    onError: (error, variables) => {
      console.error('Failed to refetch bookmark:', error);

      // Clear refetching state
      setRefetchingBookmarkId(null);

      // Dismiss loading toast and show error
      toast.dismiss(`refetch-${variables.id}`);
      toast.error('Failed to refresh bookmark metadata');
    },
  });

  const handleRefetch = (id: string) => {
    toast.loading('Refreshing bookmark metadata...', { id: `refetch-${id}` });
    refetchMutation.mutate({ id });
  };

  return {
    handleRefetch,
    isRefetching: refetchMutation.isPending,
    refetchingBookmarkId,
  };
};
