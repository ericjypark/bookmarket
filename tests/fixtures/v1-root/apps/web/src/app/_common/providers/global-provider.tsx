'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import React from 'react';
import { getQueryClient } from '~/app/_core/utils/get-query-client';
import { ModalProvider } from './modal-provider';

export const GlobalProvider = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = React.useState(() => getQueryClient());

  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>
          {children}
          <ModalProvider />
        </NuqsAdapter>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
};
