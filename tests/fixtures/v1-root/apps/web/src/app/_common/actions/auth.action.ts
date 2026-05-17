'use server';

import * as Sentry from '@sentry/nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type TokenResponse } from '../interfaces/token.interface';
import { http } from '../utils/http';
import { getMe } from './user.action';

const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

export const refreshNewAccessToken = async () => {
  try {
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      return null;
    }

    const tokens: TokenResponse = await http
      .post('authentication/refresh-token', {
        json: {
          refreshToken,
        },
      })
      .json();

    await setAccessToken(tokens.accessToken);
    await setRefreshToken(tokens.refreshToken);
    return tokens;
  } catch (error: any) {
    Sentry.captureException('Failed to refresh token:', error);

    if (error instanceof TypeError || error.name === 'AbortError') {
      return null;
    }

    if (error.status === 401 || error.status === 403) {
      await signOut();
    }

    return null;
  }
};

export const setAccessToken = async (accessToken: string) => {
  'use server';
  const cookieStore = await cookies();

  // Check if we're in a container/localhost environment
  const isLocalhost =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DOMAIN?.includes('localhost') ||
    !process.env.NEXT_PUBLIC_DOMAIN;

  const cookieOptions = {
    maxAge: 604800, // 7 days
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    sameSite: 'lax' as const,
    domain: isLocalhost ? undefined : `.${process.env.NEXT_PUBLIC_DOMAIN}`,
  };

  cookieStore.set(ACCESS_TOKEN_COOKIE_NAME, accessToken, cookieOptions);
};

export const setRefreshToken = async (refreshToken: string) => {
  'use server';
  const cookieStore = await cookies();

  // Check if we're in a container/localhost environment
  const isLocalhost =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DOMAIN?.includes('localhost') ||
    !process.env.NEXT_PUBLIC_DOMAIN;

  cookieStore.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    maxAge: 3024000, // 35 days
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    sameSite: 'lax',
    domain: isLocalhost ? undefined : `.${process.env.NEXT_PUBLIC_DOMAIN}`,
  });
};

export const getAccessToken = async () => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME);
  return accessToken ? accessToken.value : undefined;
};

export const getRefreshToken = async () => {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME);
  return refreshToken ? refreshToken.value : undefined;
};

export const isAuthenticated = async () => {
  try {
    const user = await getMe();
    return user !== null;
  } catch (error) {
    Sentry.captureException(error);
    return false;
  }
};

export const signOut = async () => {
  try {
    const cookieStore = await cookies();

    cookieStore.delete(ACCESS_TOKEN_COOKIE_NAME);
    cookieStore.delete(REFRESH_TOKEN_COOKIE_NAME);
  } catch (e) {
    Sentry.captureException(e);
  }
  
  redirect('/');
};
