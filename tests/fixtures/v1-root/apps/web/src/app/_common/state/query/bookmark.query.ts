import { queryOptions } from '@tanstack/react-query';
import { getBookmarks } from '../../actions/bookmark.action';

export const bookmarksQuery = () =>
  queryOptions({
    queryKey: ['bookmarks'],
    queryFn: getBookmarks,
  });
