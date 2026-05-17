import { HomeContent } from './_components/content';
import { HomeHeader } from './_components/header';

export default async function HomePage() {
  return (
    <div className='relative h-full min-h-screen w-full'>
      <HomeHeader />
      <HomeContent />
    </div>
  );
}
