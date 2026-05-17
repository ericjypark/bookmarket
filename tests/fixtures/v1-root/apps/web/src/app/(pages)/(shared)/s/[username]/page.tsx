import { BookmarkList } from '~/app/(pages)/(home)/home/_components/bookmark-list';
import { getSharedUsersBookmarks } from '../../_actions/shared.actions';
import SharedPageClient from './page-client';

const SharedUserPage = async ({ params }: { params: Promise<{ username: string }> }) => {
  const { username } = await params;
  const bookmarks = await getSharedUsersBookmarks(username);

  return (
    <SharedPageClient username={username}>
      <BookmarkList bookmarks={bookmarks} isViewOnly={true} />
    </SharedPageClient>
  );
};

export default SharedUserPage;
