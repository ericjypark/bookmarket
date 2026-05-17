'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { slotStatusQuery } from '../_store/queries/slot-status.query';

export const SlotsCounter = () => {
  const { data: slotStatus, isLoading, error } = useQuery(slotStatusQuery());

  if (isLoading) {
    return (
      <motion.div
        className='flex items-center justify-center gap-2 rounded-full bg-gray-100 px-4 py-2'
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className='h-2 w-2 animate-pulse rounded-full bg-gray-400' />
        <span className='text-sm text-gray-600'>Checking slots...</span>
      </motion.div>
    );
  }

  if (error || !slotStatus) {
    return (
      <motion.div className='rounded-full bg-red-100 px-4 py-2' initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <span className='text-sm text-red-600'>Unable to check slot status</span>
      </motion.div>
    );
  }

  const isLow = slotStatus.remaining <= 10;
  const isFull = slotStatus.remaining === 0;

  return (
    <motion.div
      className={`flex items-center gap-2 rounded-full px-4 py-2 ${
        isFull ? 'bg-red-100 text-red-700' : isLow ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
      }`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className={`h-2 w-2 rounded-full ${isFull ? 'bg-red-500' : isLow ? 'bg-orange-500' : 'bg-green-500'}`} />
      <span className='text-sm font-medium'>
        {slotStatus.remaining} slot{slotStatus.remaining !== 1 ? 's' : ''} left
      </span>
    </motion.div>
  );
};
