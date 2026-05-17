import * as Sentry from '@sentry/nextjs';
import { updateUserProfile } from '~/app/_common/actions/user.action';

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
    const englishOnlyRegex = /^[a-z]+$/;
    if (!englishOnlyRegex.test(username)) {
      error.username = 'Username must contain only lowercase characters';
    }
  }
  if (username && username.length >= 10) {
    error.username = 'Username must be shorter than 10';
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
