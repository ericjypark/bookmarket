'use server';

import * as Sentry from '@sentry/nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type TokenResponse } from '../interfaces/token.interface';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  getAccessTokenCookieOptions,
  getExpiredAuthCookieOptions,
  getRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
} from '../utils/auth-cookies';
import { http } from '../utils/http';
import { getMe } from './user.action';

export const refreshNewAccessToken = async () => {
  try {
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      return null;
    }

    const tokens: TokenResponse = await http
      .post('auth/refresh', {
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

  cookieStore.set(ACCESS_TOKEN_COOKIE_NAME, accessToken, getAccessTokenCookieOptions());
};

export const setRefreshToken = async (refreshToken: string) => {
  'use server';
  const cookieStore = await cookies();

  cookieStore.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, getRefreshTokenCookieOptions());
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
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value;

    if (refreshToken) {
      await http
        .post('auth/logout', {
          json: {
            refreshToken,
          },
        })
        .catch(error => {
          Sentry.captureException(error);
        });
    }

    cookieStore.set(ACCESS_TOKEN_COOKIE_NAME, '', getExpiredAuthCookieOptions());
    cookieStore.set(REFRESH_TOKEN_COOKIE_NAME, '', getExpiredAuthCookieOptions());
  } catch (e) {
    Sentry.captureException(e);
  }

  redirect('/');
};
