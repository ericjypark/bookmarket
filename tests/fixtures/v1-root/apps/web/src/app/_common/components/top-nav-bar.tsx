import Link from 'next/link';
import { getCategories } from '../actions/category.action';
import { getMe } from '../actions/user.action';
import { AnimatedTab } from './animated-tab';
import { Logo } from './logo';
import { UserAvatar } from './user-avatar';

export async function TopNavbar() {
  const user = await getMe();
  const categories = await getCategories();

  return (
    <aside className='sticky top-0 z-50 w-full bg-background pt-2 tracking-tight'>
      <nav className='fade relative flex items-center justify-between overflow-auto py-2' id='nav'>
        <span className='hidden md:block'>
          <Logo />
        </span>
        <span className='block md:hidden'>
          <Logo includeText={false} />
        </span>
        {user && <AnimatedTab categories={categories} />}
        {user ? <UserAvatar user={user} /> : <Link href='/login'>Login</Link>}
      </nav>
    </aside>
  );
}
