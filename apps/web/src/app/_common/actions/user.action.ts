'use server';

import * as Sentry from '@sentry/nextjs';
import { type User } from '~/app/(pages)/(auth)/types';
import { getAuthCookie } from '../utils/get-auth-cookie';
import { http } from '../utils/http';

type UserProfileResponse = User & {
  pictureUrl?: string | null;
};

const normalizeUser = (user: UserProfileResponse): User => ({
  ...user,
  picture: user.picture ?? user.pictureUrl ?? '',
});

export const getMe = async (): Promise<User | null> => {
  try {
    const user: UserProfileResponse = await http
      .get('users/me', {
        headers: {
          Cookie: await getAuthCookie(),
        },
      })
      .json();
    return normalizeUser(user);
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
};

export const updateUserProfile = async (updatedUserInfo: Pick<User, 'username' | 'firstName' | 'lastName'>) => {
  try {
    const user: UserProfileResponse = await http
      .patch('users/me', {
        headers: {
          Cookie: await getAuthCookie(),
        },
        json: { ...updatedUserInfo },
      })
      .json();

    return normalizeUser(user);
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
