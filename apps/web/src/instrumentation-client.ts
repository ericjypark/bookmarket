import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://f9c20f85c6a68912b9abf63269a33f6c@o4506297759105024.ingest.us.sentry.io/4508866174844928',
  integrations: [Sentry.replayIntegration()],
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
