import * as Sentry from '@sentry/nextjs';
import { updateUserProfile } from '~/app/_common/actions/user.action';
import {
  PUBLIC_PROFILE_USERNAME_MAX_LENGTH,
  PUBLIC_PROFILE_USERNAME_PATTERN,
  RESERVED_PUBLIC_PROFILE_USERNAMES,
} from '~/app/_common/utils/public-url';

export const updateUserProfileAction = async (formData: FormData) => {
  const username = formData.get('username') as string;
  const firstName = formData.get('firstName') as string;
  const lastName = formData.get('lastName') as string;

  let error: {
    username?: string;
    firstName?: string;
    lastName?: string;
    general?: string;
  } = {};

  if (username) {
    if (!PUBLIC_PROFILE_USERNAME_PATTERN.test(username)) {
      error.username = 'Username must contain only lowercase characters';
    }
  }
  if (username && username.length > PUBLIC_PROFILE_USERNAME_MAX_LENGTH) {
    error.username = `Username cannot exceed ${PUBLIC_PROFILE_USERNAME_MAX_LENGTH} characters`;
  }
  if (username && RESERVED_PUBLIC_PROFILE_USERNAMES.has(username.toLowerCase())) {
    error.username = 'This username is not allowed';
  }
  if (firstName && firstName.length > 20) {
    error.firstName = 'First Name must be shorter than 20';
  }
  if (lastName && lastName.length > 20) {
    error.lastName = 'Last Name must be shorter than 20';
  }

  if (error.firstName || error.lastName || error.username) {
    return {
      error,
      success: '',
    };
  }

  try {
    await updateUserProfile({ username, firstName, lastName });

    return {
      error: {},
      success: 'User profile updated successfully.',
    };
  } catch (e) {
    Sentry.captureException(JSON.stringify(e));

    return {
      error: {
        general: 'Error occurred while updating user profile',
      },
      success: '',
    };
  }
};
