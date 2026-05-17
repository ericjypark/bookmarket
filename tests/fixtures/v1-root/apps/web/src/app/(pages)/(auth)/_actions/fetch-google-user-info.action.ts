'use server';

import { type TokenResponse as GoogleTokenResponse } from '@react-oauth/google';
import * as Sentry from '@sentry/nextjs';
import ky from 'ky';
import { redirect } from 'next/navigation';
import { setAccessToken, setRefreshToken } from '~/app/_common/actions/auth.action';
import { type TokenResponse } from '~/app/_common/interfaces/token.interface';
import { http } from '~/app/_common/utils/http';

export const fetchGoogleUserInfo = async (codeResponse: GoogleTokenResponse) => {
  try {
    const userInfo: {
      id: string;
      email: string;
      picture: string;
      name?: string;
      given_name?: string;
      family_name?: string;
    } = await ky
      .get('https://www.googleapis.com/oauth2/v1/userinfo', {
        searchParams: { access_token: codeResponse.access_token },
      })
      .json();

    const googleTokenDto = {
      id: userInfo.id,
      email: userInfo.email,
      picture: userInfo.picture,
      firstName: userInfo.given_name ?? userInfo.name,
      lastName: userInfo.family_name,
    };

    const response: TokenResponse = await http
      .post(`authentication/google`, {
        json: googleTokenDto,
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
