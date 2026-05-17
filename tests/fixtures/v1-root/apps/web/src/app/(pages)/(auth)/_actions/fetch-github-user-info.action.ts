'use server';

import * as Sentry from '@sentry/nextjs';
import ky from 'ky';
import { redirect } from 'next/navigation';
import { setAccessToken, setRefreshToken } from '~/app/_common/actions/auth.action';
import { type TokenResponse } from '~/app/_common/interfaces/token.interface';
import { http } from '~/app/_common/utils/http';

export const fetchGithubUserInfo = async (code: string) => {
  try {
    const data: { access_token: string } = await ky
      .post(`https://github.com/login/oauth/access_token`, {
        json: {
          code,
          client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          scope: 'user:email',
        },
        headers: {
          Accept: 'application/json',
        },
      })
      .json();

    const user: { id: string; email?: string; avatar_url: string; name?: string } = await ky
      .get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      .json();

    const emails: {
      email: string;
      primary: boolean;
      verified: boolean;
      visibility: 'public' | 'private';
    }[] = await ky
      .get('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      })
      .json();

    const primaryEmail = emails.find(
      (email: { primary: boolean; verified: boolean }) => email.primary && email.verified,
    );
    const verifiedEmail = emails.find((email: { verified: boolean }) => email.verified);

    const githubTokenDto = {
      id: String(user.id),
      email: primaryEmail?.email ?? verifiedEmail?.email ?? `${user.id}@github.com`,
      picture: user.avatar_url,
      firstName: user.name,
    };

    const response: TokenResponse = await http
      .post(`authentication/github`, {
        json: githubTokenDto,
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
