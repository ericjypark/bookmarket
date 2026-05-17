import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { type Category } from '~/app/_common/interfaces/category.interface';
import { http } from '~/app/_common/utils/http';
import { tryCatch } from '~/app/_common/utils/try-catch';

export const getSharedUsersCategories = async (username: string) => {
  const { data, error } = await tryCatch(http.get<Category[]>(`categories/s/${username}`).json());

  if (error) {
    Sentry.captureException(`${username} does not exist or is a private profile`);
    redirect('/');
  }

  return data;
};

export const getSharedUsersBookmarks = async (username: string) => {
  const { data, error } = await tryCatch(http.get<Bookmark[]>(`bookmarks/s/${username}`).json());

  if (error) {
    Sentry.captureException(`${username} does not exist or is a private profile`);
    redirect('/');
  }

  return data;
};
