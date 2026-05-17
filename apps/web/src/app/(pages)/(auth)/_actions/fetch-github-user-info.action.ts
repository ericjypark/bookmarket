'use server';

import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { setAccessToken, setRefreshToken } from '~/app/_common/actions/auth.action';
import { type TokenResponse } from '~/app/_common/interfaces/token.interface';
import { http } from '~/app/_common/utils/http';

export const fetchGithubUserInfo = async (code: string, state?: string | null) => {
  try {
    const response: TokenResponse = await http
      .post(`auth/oauth/github`, {
        json: {
          code,
          redirectUri: process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI,
          state,
        },
      })
      .json();

    await setAccessToken(response.accessToken);
    await setRefreshToken(response.refreshToken);
    redirect('/home');
  } catch (error) {
    Sentry.captureException(error);

    if (error instanceof Error && error.message.includes('403')) {
      redirect('/signup?error=slots_full');
    } else {
      redirect('/login?error=oauth_failed');
    }
  }
};
