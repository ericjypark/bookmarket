'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { slotStatusQuery } from '../_store/queries/slot-status.query';
import { SlotsCounter } from './slots-counter';

export const HomeContent = () => {
  const router = useRouter();
  const { data: slotStatus } = useQuery(slotStatusQuery());

  const handleJoinNowButtonClick = () => {
    if (slotStatus?.canSignUp) {
      router.push('/login');
    }
  };

  const handleGithubButtonClick = () => {
    router.push('https://github.com/ericjypark/bookmarket');
  };

  return (
    <div className='fixed left-0 top-24 flex size-full flex-col items-center justify-start overflow-hidden sm:top-32 md:top-44'>
      <motion.h2
        className='text-center text-4xl font-black sm:text-6xl md:text-7xl'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        Your Bookmarks, <span className='bg-yellow-200 px-2'>Reimagined</span>
      </motion.h2>
      <motion.p
        className='mt-6 text-balance text-center text-sm text-gray-600 sm:text-xl md:text-2xl'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Organize, discover, and access your favorite sites in one place
      </motion.p>

      <motion.div
        className='mt-4'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
      >
        <SlotsCounter />
      </motion.div>

      <motion.div
        className='mt-6 flex gap-4'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <motion.button
          onClick={handleJoinNowButtonClick}
          disabled={!slotStatus?.canSignUp}
          className={`h-10 rounded-full px-5 text-sm font-bold transition-colors md:h-12 md:px-8 md:text-lg ${
            slotStatus?.canSignUp
              ? 'bg-black text-white hover:bg-gray-800'
              : 'cursor-not-allowed bg-gray-400 text-white'
          }`}
        >
          {slotStatus?.canSignUp ? 'Join Now' : 'Slots Full'}
        </motion.button>
        <motion.button
          onClick={handleGithubButtonClick}
          className='h-10 rounded-full border-2 border-black px-5 text-sm font-bold transition-colors hover:bg-gray-100 md:h-12 md:px-8 md:text-lg'
        >
          Github
        </motion.button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className='flex justify-center'
      >
        <Image
          src={'/images/screenshot.png'}
          alt='Screenshot of the bookmarket service'
          width={1920}
          height={1080}
          className='my-8 hidden h-auto w-11/12 max-w-[1280px] overflow-hidden rounded-2xl border-2 border-black md:block'
        />
        <Image
          src={'/images/screenshot-mobile.png'}
          alt='Screenshot of the bookmarket service'
          width={1080}
          height={1920}
          className='my-8 block h-auto w-5/6 overflow-hidden rounded-2xl border-2 border-black md:hidden'
        />
      </motion.div>
    </div>
  );
};
