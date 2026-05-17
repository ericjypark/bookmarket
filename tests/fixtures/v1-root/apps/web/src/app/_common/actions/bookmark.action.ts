'use server';

import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { http } from '~/app/_common/utils/http';
import { getAuthCookie } from '~/app/_common/utils/get-auth-cookie';
import { isAuthenticated } from '~/app/_common/actions/auth.action';

export const getBookmarks = async () => {
  const isAuth = await isAuthenticated();

  if (!isAuth) {
    return [];
  }

  const response: Bookmark[] = await http
    .get('bookmarks', {
      headers: {
        Cookie: await getAuthCookie(),
      },
    })
    .json();

  return response;
};

export const createBookmark = async ({
  title,
  description,
  faviconUrl,
  url,
  category,
}: {
  title: string;
  url: string;
  description?: string;
  faviconUrl?: string;
  category?: string;
}) => {
  const response: Bookmark = await http
    .post('bookmarks', {
      json: {
        title,
        description,
        faviconUrl,
        url,
        category,
      },
      headers: {
        Cookie: await getAuthCookie(),
      },
    })
    .json();

  return response;
};

export const updateBookmark = async ({
  id,
  title,
  description,
  faviconUrl,
  url,
  category,
}: {
  id: string;
  title?: string;
  description?: string;
  faviconUrl?: string;
  url?: string;
  category?: string;
}) => {
  try {
    const response: Bookmark = await http
      .patch(`bookmarks/${id}`, {
        json: {
          title,
          description,
          faviconUrl,
          url,
          category,
        },
        headers: {
          Cookie: await getAuthCookie(),
        },
      })
      .json();

    return response;
  } catch (error) {
    throw error;
  }
};

export const updateBookmarkCategory = async ({ id, categoryId }: { id: string; categoryId?: string }) => {
  const response: Bookmark = await http
    .patch(`bookmarks/${id}/category`, {
      json: { categoryId },
      headers: {
        Cookie: await getAuthCookie(),
      },
    })
    .json();

  return response;
};

export const deleteBookmark = async ({ id }: { id: string }) => {
  await http.delete(`bookmarks/${id}`, {
    headers: {
      Cookie: await getAuthCookie(),
    },
  });
};

export const refetchBookmark = async ({ id }: { id: string }) => {
  const response: Bookmark = await http
    .post(`bookmarks/${id}/refetch`, {
      headers: {
        Cookie: await getAuthCookie(),
      },
    })
    .json();

  return response;
};
