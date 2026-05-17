'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Logo } from '~/app/_common/components/logo';
import { Button } from '~/app/_core/components/button';
import { slotStatusQuery } from '../_store/queries/slot-status.query';

export const HomeHeader = () => {
  const router = useRouter();
  const { data: slotStatus } = useQuery(slotStatusQuery());

  const handleJoinNowButtonClick = () => {
    router.push('/login');
  };

  return (
    <div className='fixed left-0 top-0 flex h-20 w-full items-center justify-between px-8 backdrop-blur-xl md:h-32'>
      <div className='flex items-center gap-2'>
        <Logo includeText={false} className='z-10 size-12 shrink-0' />
        <h1 className='hidden font-black sm:block sm:text-2xl md:text-3xl'>Bookmarket</h1>
      </div>
      <Button
        onClick={handleJoinNowButtonClick}
        className='text-md h-10 w-28 rounded-full bg-black md:h-14 md:w-40 md:text-xl'
      >
        {slotStatus?.canSignUp ? 'Join Now' : 'Sign In'}
      </Button>
    </div>
  );
};
