import { createBookmark } from '~/app/_common/actions/bookmark.action';
import * as Sentry from '@sentry/nextjs';
import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { isValidBookmarkUrl, normalizeBookmarkUrl } from '~/app/_common/utils/url';

export interface CreateBookmarkState {
  error: string;
  success: string;
  bookmark?: Bookmark;
}

export const createBookmarkAction = async (
  previousState: CreateBookmarkState,
  formData: FormData,
  category?: string,
): Promise<CreateBookmarkState> => {
  const url = formData.get('url') as string;

  if (!url) {
    return { error: 'URL is required', success: previousState.success };
  }

  const fullUrl = normalizeBookmarkUrl(url);

  if (!isValidBookmarkUrl(fullUrl)) {
    return { error: 'Invalid URL', success: previousState.success };
  }

  try {
    const bookmark = await createBookmark({
      title: fullUrl,
      url: fullUrl,
      category: category,
    });

    return { success: 'Bookmark created', error: '', bookmark };
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
