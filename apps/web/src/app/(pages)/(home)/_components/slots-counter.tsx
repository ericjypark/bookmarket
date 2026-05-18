'use client';

import { useQuery } from '@tanstack/react-query';
import { slotStatusQuery } from '../_store/queries/slot-status.query';

export const SlotsCounter = () => {
  const { data: slotStatus, isLoading, error } = useQuery(slotStatusQuery());

  if (isLoading) {
    return (
      <div className='flex items-center justify-center gap-2 rounded-full bg-gray-100 px-4 py-2'>
        <div className='h-2 w-2 animate-pulse rounded-full bg-gray-400' />
        <span className='text-sm text-gray-600'>Checking slots...</span>
      </div>
    );
  }

  if (error || !slotStatus) {
    return (
      <div className='rounded-full bg-red-100 px-4 py-2'>
        <span className='text-sm text-red-600'>Unable to check slot status</span>
      </div>
    );
  }

  const isLow = slotStatus.remaining <= 10;
  const isFull = slotStatus.remaining === 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-4 py-2 ${
        isFull ? 'bg-red-100 text-red-700' : isLow ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
      }`}
    >
      <div className={`h-2 w-2 rounded-full ${isFull ? 'bg-red-500' : isLow ? 'bg-orange-500' : 'bg-green-500'}`} />
      <span className='text-sm font-medium'>
        {slotStatus.remaining} slot{slotStatus.remaining !== 1 ? 's' : ''} left
      </span>
    </div>
  );
};
