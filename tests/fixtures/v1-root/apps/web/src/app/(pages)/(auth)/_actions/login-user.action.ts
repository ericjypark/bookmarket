'use server';

import { redirect } from 'next/navigation';
import { setAccessToken, setRefreshToken } from '~/app/_common/actions/auth.action';
import { type TokenResponse } from '~/app/_common/interfaces/token.interface';
import { http } from '~/app/_common/utils/http';

export const loginUser = async (state: { error: string; field: string } | null, formData: FormData) => {
  const email = formData.get('email');
  const password = formData.get('password');

  try {
    const response: TokenResponse = await http
      .post(`authentication/signin`, {
        json: { email, password },
      })
      .json();

    await setAccessToken(response.accessToken);
    await setRefreshToken(response.refreshToken);
  } catch (error: any) {
    // Handle HTTPError from ky
    if (error.name === 'HTTPError' && error.response) {
      const status = error.response.status;
      
      if (status === 401) {
        return {
          error: 'Invalid email or password. Please try again.',
          field: 'general'
        };
      }
      
      if (status === 400) {
        return {
          error: 'Please check your email and password are valid.',
          field: 'general'
        };
      }
    }
    
    // Generic error fallback
    return {
      error: 'Something went wrong. Please try again.',
      field: 'general'
    };
  }
  
  redirect('/home');
};
