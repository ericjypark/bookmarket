'use server';

import * as Sentry from '@sentry/nextjs';
import { type ApiToken, type CreateApiTokenResponse } from '../interfaces/api-token.interface';
import { getAuthCookie } from '../utils/get-auth-cookie';
import { http } from '../utils/http';

const raycastScopes = ['bookmarks:read', 'bookmarks:write'];

export const listApiTokens = async (): Promise<ApiToken[]> => {
  try {
    return await http
      .get('api-tokens', {
        headers: {
          Cookie: await getAuthCookie(),
        },
      })
      .json<ApiToken[]>();
  } catch (error) {
    Sentry.captureException(error);
    throw new Error('Failed to load API tokens');
  }
};

export const createRaycastApiToken = async (): Promise<CreateApiTokenResponse> => {
  try {
    return await http
      .post('api-tokens', {
        headers: {
          Cookie: await getAuthCookie(),
        },
        json: {
          name: 'Raycast',
          scopes: raycastScopes,
        },
      })
      .json<CreateApiTokenResponse>();
  } catch (error) {
    Sentry.captureException(error);
    throw new Error('Failed to create API token');
  }
};

export const revokeApiToken = async (id: string) => {
  try {
    await http.delete(`api-tokens/${id}`, {
      headers: {
        Cookie: await getAuthCookie(),
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    throw new Error('Failed to revoke API token');
  }
};
