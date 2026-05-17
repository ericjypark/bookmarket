'use server';

import * as Sentry from '@sentry/nextjs';
import { type User } from '~/app/(pages)/(auth)/types';
import { getAuthCookie } from '../utils/get-auth-cookie';
import { http } from '../utils/http';

export const getMe = async (): Promise<User | null> => {
  try {
    const user: User = await http
      .get('users/me', {
        headers: {
          Cookie: await getAuthCookie(),
        },
      })
      .json();
    return user;
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
};

export const updateUserProfile = async (updatedUserInfo: Pick<User, 'username' | 'firstName' | 'lastName'>) => {
  try {
    const user: User = await http
      .patch('users', {
        headers: {
          Cookie: await getAuthCookie(),
        },
        json: { ...updatedUserInfo },
      })
      .json();

    return user;
  } catch (error) {
    Sentry.captureException(error);
    throw new Error(JSON.stringify(error));
  }
};

export const checkUsernameAvailable = async (username: string) => {
  try {
    const isAvailable: { isAvailable: boolean } = await http
      .get('users/check-username', {
        headers: {
          Cookie: await getAuthCookie(),
        },
        searchParams: { username },
      })
      .json();

    return isAvailable;
  } catch (error) {
    Sentry.captureException(error);
    throw new Error(JSON.stringify(error));
  }
};
