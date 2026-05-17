'use server';

import { type Bookmark } from '~/app/_common/interfaces/bookmark.interface';
import { http } from '~/app/_common/utils/http';
import { getAuthCookie } from '~/app/_common/utils/get-auth-cookie';

export async function fixBrokenFavicon({ id }: Pick<Bookmark, 'id'>) {
  try {
    // Use the new enhancement endpoint for better metadata
    await http.post(`bookmarks/${id}/enhance`, {
      headers: {
        Cookie: await getAuthCookie(),
      },
    });
    
    return { success: true, id };
  } catch (error) {
    console.error(`Error enhancing bookmark ${id}:`, error);
    return { success: false, error: String(error) };
  }
}
