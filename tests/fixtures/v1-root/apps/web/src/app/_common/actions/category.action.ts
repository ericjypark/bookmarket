'use server';

import { type Category } from '../interfaces/category.interface';
import { getAuthCookie } from '../utils/get-auth-cookie';
import { http } from '../utils/http';
import { isAuthenticated } from './auth.action';

export const createCategory = async (categoryName: Category['name']) => {
  const res: Category = await http
    .post('categories', {
      json: {
        name: categoryName,
      },
      headers: {
        Cookie: await getAuthCookie(),
      },
    })
    .json();

  return res;
};

export const getCategories = async () => {
  const isAuth = await isAuthenticated();

  if (!isAuth) {
    return [];
  }

  const res: Category[] = await http
    .get('categories', {
      headers: {
        Cookie: await getAuthCookie(),
      },
    })
    .json();

  return res;
};
