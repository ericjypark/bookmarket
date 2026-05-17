import { queryOptions } from '@tanstack/react-query';
import { fetchSlotStatus } from '~/app/(pages)/(auth)/_actions/fetch-slot-status.action';

export const slotStatusQuery = () =>
  queryOptions({
    queryKey: ['slot-status'],
    queryFn: fetchSlotStatus,
    refetchInterval: 1000 * 5,
  });
