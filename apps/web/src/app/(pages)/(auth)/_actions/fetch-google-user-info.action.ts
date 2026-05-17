'use server';

import { type TokenResponse as GoogleTokenResponse } from '@react-oauth/google';
import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { setAccessToken, setRefreshToken } from '~/app/_common/actions/auth.action';
import { type TokenResponse } from '~/app/_common/interfaces/token.interface';
import { http } from '~/app/_common/utils/http';

export const fetchGoogleUserInfo = async (codeResponse: GoogleTokenResponse) => {
  try {
    const response: TokenResponse = await http
      .post(`auth/oauth/google`, {
        json: {
          accessToken: codeResponse.access_token,
          state: codeResponse.state,
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
