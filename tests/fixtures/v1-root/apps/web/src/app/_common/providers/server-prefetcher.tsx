import { dehydrate, HydrationBoundary, type UseQueryOptions } from '@tanstack/react-query';
import React from 'react';
import { getQueryClient } from '~/app/_core/utils/get-query-client';

export const ServerPrefetcher = async ({
  children,
  queries,
}: {
  children: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queries: UseQueryOptions<any, any, any, any>[];
}) => {
  const queryClient = getQueryClient();

  for (const q of queries) {
    await queryClient.prefetchQuery(q);
  }

  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
};
