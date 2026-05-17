import Link from 'next/link';
import { getMe } from '~/app/_common/actions/user.action';
import { AnimatedTab } from '~/app/_common/components/animated-tab';
import { Logo } from '~/app/_common/components/logo';
import { UserAvatar } from '~/app/_common/components/user-avatar';
import { type Category } from '~/app/_common/interfaces/category.interface';

export const SharedTopNavBar = async ({
  categories,
  sharedUsername,
}: {
  categories: Category[];
  sharedUsername: string;
}) => {
  const user = await getMe();

  return (
    <aside className='sticky top-0 z-50 w-full bg-background pt-2 tracking-tight'>
      <nav className='fade relative flex items-center justify-between overflow-auto py-2' id='nav'>
        <span className='hidden md:block'>
          <Logo sharedUsername={sharedUsername} />
        </span>
        <span className='block md:hidden'>
          <Logo includeText={false} />
        </span>
        <AnimatedTab categories={categories} isShared={true} />
        {user ? <UserAvatar user={user} /> : <Link href='/login'>Login</Link>}
      </nav>
    </aside>
  );
};
