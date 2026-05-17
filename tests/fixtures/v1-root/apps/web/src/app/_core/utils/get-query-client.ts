import { isServer, MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { handleStaleDeployment, isStaleDeploymentError } from '~/app/_common/utils/deployment-mismatch';

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isStaleDeploymentError(error)) handleStaleDeployment();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isStaleDeploymentError(error)) handleStaleDeployment();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isStaleDeploymentError(error)) return false;
          return failureCount < 3;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}
