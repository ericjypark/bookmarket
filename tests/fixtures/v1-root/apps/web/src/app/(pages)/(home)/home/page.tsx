import { getBookmarks } from '~/app/_common/actions/bookmark.action';
import { getCategories } from '~/app/_common/actions/category.action';
import { ServerPrefetcher } from '~/app/_common/providers/server-prefetcher';
import { BookmarkInput } from './_components/bookmark-input';
import { BookmarkList } from './_components/bookmark-list';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: 'no',
};

export default async function HomePage() {
  const bookmarks = await getBookmarks();

  return (
    <ServerPrefetcher
      queries={[
        {
          queryKey: ['categories'],
          queryFn: getCategories,
        },
        {
          queryKey: ['bookmarks'],
          queryFn: getBookmarks,
        },
      ]}
    >
      <h1 className='sr-only'>{`Bookmarket - Buy and Sell Expert's Bookmark Collections`}</h1>
      <BookmarkInput />
      <BookmarkList bookmarks={bookmarks} isViewOnly={false} />
    </ServerPrefetcher>
  );
}
