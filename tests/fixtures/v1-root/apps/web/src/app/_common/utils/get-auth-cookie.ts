import { cookies } from 'next/headers';

export const getAuthCookie = async () => {
  return (await cookies()).toString();
};
