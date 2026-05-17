'use server';

import { cookies } from 'next/headers';
import { setRefreshToken } from '~/app/_common/actions/auth.action';
import { setAccessToken } from '~/app/_common/actions/auth.action';
import { type TokenResponse } from '~/app/_common/interfaces/token.interface';
import { http } from '~/app/_common/utils/http';

export async function refreshToken() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('refresh_token');

  if (!refreshToken) {
    return { error: 'No refresh token found' };
  }

  const response: TokenResponse = await http
    .post(`authentication/refresh-token`, {
      json: { refreshToken: refreshToken.value },
    })
    .json();

  await setAccessToken(response.accessToken);
  await setRefreshToken(response.refreshToken);
}
