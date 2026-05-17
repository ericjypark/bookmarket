'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';
import { handleStaleDeployment, isStaleDeploymentError } from '~/app/_common/utils/deployment-mismatch';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const isStale = isStaleDeploymentError(error);

  useEffect(() => {
    if (isStale) {
      handleStaleDeployment();
      return;
    }
    Sentry.captureException(error);
  }, [error, isStale]);

  if (isStale) {
    return (
      <html>
        <body style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '4rem' }}>
          <h2>App Updated</h2>
          <p>A new version has been deployed. Please reload to continue.</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </body>
      </html>
    );
  }

  return (
    <html>
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
