import { type UrlMetadata } from '~/app/_common/interfaces/metadata.interface';
import { getMetadata } from './get-metadata.action';
import { createBookmark } from '~/app/_common/actions/bookmark.action';
import * as Sentry from '@sentry/nextjs';

const urlRegex = /^(http[s]?:\/\/)?(www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,5}\.?/;

const validateUrl = (input: string) => {
  try {
    return urlRegex.test(input);
  } catch {
    return false;
  }
};

export const createBookmarkAction = async (
  previousState: { error: string; success: string },
  formData: FormData,
  category?: string,
) => {
  const url = formData.get('url') as string;

  if (!url) {
    return { error: 'URL is required', success: previousState.success };
  }

  let fullUrl = url;
  if (!fullUrl.startsWith('http')) {
    fullUrl = `https://${fullUrl}`;
  }

  if (!validateUrl(fullUrl)) {
    return { error: 'Invalid URL', success: previousState.success };
  }

  const data: UrlMetadata = await getMetadata(fullUrl);

  try {
    await createBookmark({
      title: data.title,
      description: data.description,
      url: fullUrl,
      category: category,
    });

    return { success: 'Bookmark created', error: '' };
  } catch (error) {
    Sentry.captureException('Error creating bookmark:', {
      extra: {
        url: fullUrl,
        error,
      },
    });

    return {
      error: 'Failed to create bookmark. Please try again.',
      success: previousState.success,
    };
  }
};
