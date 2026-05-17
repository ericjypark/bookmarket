'use server';
import * as Sentry from '@sentry/nextjs';
import ky from 'ky';

const options = {
  timeout: 30000,
  retry: 2,
  prefixUrl: `${(process.env.BOOKMARKET_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
    credentials: 'include',
  },
  onError: (e: any) => {
    Sentry.captureException(JSON.stringify(e));
  },
};

export const http = ky.create({
  ...options,
});
