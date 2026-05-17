'use server';

import * as Sentry from '@sentry/nextjs';
import { http } from '~/app/_common/utils/http';

interface SlotStatus {
  remaining: number;
  total: number;
  canSignUp: boolean;
}

export const fetchSlotStatus = async () => {
  try {
    const response = await http.get('signup-slots').json<SlotStatus>();
    return response;
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
};
