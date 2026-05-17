'use server';

import * as Sentry from '@sentry/nextjs';
import { type UrlMetadata } from '~/app/_common/interfaces/metadata.interface';
import { getAuthCookie } from '~/app/_common/utils/get-auth-cookie';
import { http } from '~/app/_common/utils/http';

export async function getMetadata(url: string) {
  try {
    const metadata = await http
      .get('bookmarks/metadata', {
        searchParams: { url },
        headers: {
          Cookie: await getAuthCookie(),
        },
        timeout: 15000,
        retry: 1,
      })
      .json<UrlMetadata>();

    return metadata;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { action: 'get-metadata' },
      extra: {
        message: 'Failed to fetch metadata from server',
        url,
        error,
      },
    });
    // Fallback: return basic metadata from URL
    return {
      title: extractTitleFromUrl(url),
      description: '',
      url: url,
    };
  }
}

function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}
