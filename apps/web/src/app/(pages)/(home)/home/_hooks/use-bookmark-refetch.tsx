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
      const now = new Date();
      setRefetchingBookmarkId(variables.id);
      queryClient.setQueryData(['bookmarks'], (oldData: Bookmark[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(bookmark =>
          bookmark.id === variables.id ? { ...bookmark, metadataStatus: 'PENDING', metadataUpdatedAt: now } : bookmark,
        );
      });
    },
    onSuccess: (status, variables) => {
      queryClient.setQueryData(['bookmarks'], (oldData: Bookmark[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(bookmark =>
          bookmark.id === status.bookmarkId ? { ...bookmark, metadataStatus: status.metadataStatus } : bookmark,
        );
      });

      setRefetchingBookmarkId(null);

      toast.dismiss(`refetch-${variables.id}`);
      toast.message('Refreshing metadata in the background');
      void queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
    onError: (error, variables) => {
      console.error('Failed to refetch bookmark:', error);

      setRefetchingBookmarkId(null);

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
