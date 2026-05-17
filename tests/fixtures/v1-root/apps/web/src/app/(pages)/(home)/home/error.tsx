'use client';

import * as Sentry from '@sentry/nextjs';
import React from 'react';
import { handleStaleDeployment, isStaleDeploymentError } from '~/app/_common/utils/deployment-mismatch';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isStale = isStaleDeploymentError(error);

  React.useEffect(() => {
    if (isStale) {
      handleStaleDeployment();
      return;
    }
    Sentry.captureException(error);
  }, [error, isStale]);

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
