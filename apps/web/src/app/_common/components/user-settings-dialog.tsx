'use client';

import { motion } from 'framer-motion';
import { CheckIcon, Loader2Icon, LoaderCircleIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { type User } from '~/app/(pages)/(auth)/types';
import { updateUserProfileAction } from '~/app/(pages)/(home)/home/_actions/update-user.action';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '~/app/_core/components/button';
import { DialogFooter, DialogHeader, DialogTitle } from '~/app/_core/components/dialog';
import { Input } from '~/app/_core/components/input';
import { Label } from '~/app/_core/components/label';
import { trackProfileEvent } from '../utils/analytics';
import { checkUsernameAvailable } from '../actions/user.action';
import { useBodyScrollLock } from '../hooks/use-body-scroll-lock';
import {
  PUBLIC_PROFILE_USERNAME_MAX_LENGTH,
  PUBLIC_PROFILE_USERNAME_PATTERN,
  RESERVED_PUBLIC_PROFILE_USERNAMES,
  publicAppHost,
  publicAppProtocol,
} from '../utils/public-url';
import { UserProfile } from './user-profile';

export default function UserSettingsDialog({
  onCloseClick,
  initialUser,
}: {
  onCloseClick: () => void;
  initialUser: User;
}) {
  useBodyScrollLock({});
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [user, setUser] = React.useState(() => initialUser);
  const publicProfileHost = publicAppHost();
  const publicProfileProtocol = publicAppProtocol();
  const usernameValue = user.username ?? '';
  const initialUsernameValue = initialUser.username ?? '';
  const hasEditedUsername = usernameValue !== initialUsernameValue;
  const usernameValidationError = React.useMemo(() => {
    if (!usernameValue) return 'Subdomain is required';
    if (!PUBLIC_PROFILE_USERNAME_PATTERN.test(usernameValue)) {
      return 'Subdomain must contain only lowercase letters';
    }
    if (usernameValue.length > PUBLIC_PROFILE_USERNAME_MAX_LENGTH) {
      return `Subdomain must be ${PUBLIC_PROFILE_USERNAME_MAX_LENGTH} characters or fewer`;
    }
    if (RESERVED_PUBLIC_PROFILE_USERNAMES.has(usernameValue.toLowerCase())) {
      return 'This subdomain is reserved';
    }
    return null;
  }, [usernameValue]);

  React.useEffect(() => {
    trackProfileEvent.editStart();
  }, []);

  const {
    data: usernameCheck,
    isError: isUsernameCheckError,
    isLoading: isUsernameChecking,
  } = useQuery({
    queryFn: () => checkUsernameAvailable(usernameValue),
    queryKey: ['username', usernameValue],
    enabled: hasEditedUsername && !usernameValidationError,
  });

  // Track username availability check results
  React.useEffect(() => {
    if (usernameCheck?.isAvailable !== undefined) {
      try {
        trackProfileEvent.usernameCheck(usernameCheck.isAvailable);
      } catch (error) {
        console.warn('Failed to track username check:', error);
      }
    }
  }, [usernameCheck?.isAvailable]);

  const handleFormAction = React.useCallback(
    async (_: any, formData: FormData) => {
      const result = await updateUserProfileAction(formData);
      if (result?.success) {
        const changedFields = [];
        if (formData.get('firstName') !== initialUser.firstName) changedFields.push('firstName');
        if (formData.get('lastName') !== initialUser.lastName) changedFields.push('lastName');
        if (formData.get('username') !== initialUser.username) changedFields.push('username');
        
        trackProfileEvent.editSave(changedFields);
        router.refresh();
        onCloseClick();
        toast.success(result.success);
      }
      return result;
    },
    [onCloseClick, router, initialUser.firstName, initialUser.lastName, initialUser.username],
  );

  const [state, formAction, isPending] = React.useActionState(handleFormAction, {
    error: {},
    success: '',
  });

  const handleCancelClick = React.useCallback(() => {
    onCloseClick();
  }, [onCloseClick]);

  const handleSaveClick = React.useCallback(() => {
    formRef.current?.requestSubmit();
  }, []);

  const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.name as keyof User;
    setUser(prev => ({
      ...prev,
      [key]: e.target.value,
    }));
  }, []);

  const subdomainStatus = React.useMemo(() => {
    if (hasEditedUsername && usernameValidationError) return 'invalid';
    if (isUsernameChecking) return 'loading';
    if (isUsernameCheckError) return 'unavailable';
    if (!hasEditedUsername) return 'idle';

    if (usernameCheck?.isAvailable) return 'available';
    return 'taken';
  }, [hasEditedUsername, isUsernameCheckError, isUsernameChecking, usernameCheck?.isAvailable, usernameValidationError]);

  const subdomainStatusIcon = React.useMemo(() => {
    switch (subdomainStatus) {
      case 'available':
        return <CheckIcon className='text-green-300' />;
      case 'taken':
        return <XIcon className='text-red-300' />;
      case 'loading':
        return <Loader2Icon className='animate-spin text-gray-300' />;
      case 'invalid':
      case 'unavailable':
        return <XIcon className='text-red-300' />;
      case 'idle':
      default:
        return null;
    }
  }, [subdomainStatus]);

  const isProfileSaveable = React.useMemo(() => {
    if (subdomainStatus === 'loading' || subdomainStatus === 'taken' || subdomainStatus === 'unavailable') return false;
    if (usernameValidationError) return false;
    if (
      user.firstName === initialUser.firstName &&
      user.lastName === initialUser.lastName &&
      subdomainStatus === 'idle'
    )
      return false;
    return true;
  }, [
    initialUser.firstName,
    initialUser.lastName,
    subdomainStatus,
    user.firstName,
    user.lastName,
    usernameValidationError,
  ]);

  return (
    <motion.div
      className={'relative w-full max-w-md rounded-xl bg-white p-0'}
      onClick={e => {
        e.stopPropagation();
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <DialogHeader className='contents space-y-0 text-left'>
        <DialogTitle className='border-b px-6 py-4 text-base'>Edit profile</DialogTitle>
      </DialogHeader>
      <div className='overflow-y-auto'>
        <div className='flex w-full items-center justify-start px-6 py-4'>
          <UserProfile user={user} />
        </div>
        <hr />
        <div className='px-6 pb-6 pt-4'>
          <form className='space-y-5' action={formAction} ref={formRef}>
            <div className='flex flex-col gap-4 sm:flex-row'>
              <div className='flex-1 space-y-2'>
                <Label htmlFor={`firstName`}>First Name</Label>
                <Input
                  name={`firstName`}
                  placeholder='Eric'
                  value={user.firstName}
                  onChange={handleInputChange}
                  type='text'
                />
                {state.error.firstName && <p className='mt-1 text-sm text-red-500'>{state.error.firstName}</p>}
              </div>
              <div className='flex-1 space-y-2'>
                <Label htmlFor={`lastName`}>Last Name</Label>
                <Input
                  name={`lastName`}
                  placeholder='Park'
                  value={user.lastName}
                  onChange={handleInputChange}
                  type='text'
                />
                {state.error.lastName && <p className='mt-1 text-sm text-red-500'>{state.error.lastName}</p>}
              </div>
            </div>
            <div className='*:not-first:mt-2 space-y-2'>
              <Label htmlFor={`username`}>Personal Subdomain</Label>
              <div className='shadow-xs relative flex min-w-0 rounded-md'>
                <span className='inline-flex shrink-0 items-center rounded-s-md border border-input bg-background px-3 text-sm text-muted-foreground'>
                  {publicProfileProtocol}://
                </span>
                <div className='relative min-w-0 flex-1'>
                  <Input
                    placeholder='google'
                    name='username'
                    type='text'
                    value={user.username}
                    onChange={handleInputChange}
                    className='h-full rounded-none border-x-0 pr-9'
                  />
                  {subdomainStatusIcon && (
                    <div className='pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center [&_svg]:size-4'>
                      {subdomainStatusIcon}
                    </div>
                  )}
                </div>
                <span className='inline-flex min-w-0 max-w-[58%] items-center rounded-e-md border border-input bg-background px-3 text-sm text-muted-foreground'>
                  <span className='block truncate' title={`.${publicProfileHost}`}>
                    .{publicProfileHost}
                  </span>
                </span>
              </div>
              {state.error.username && <p className='mt-1 text-sm text-red-500'>{state.error.username}</p>}
              {!state.error.username && hasEditedUsername && usernameValidationError && (
                <p className='mt-1 text-sm text-red-500'>{usernameValidationError}</p>
              )}
              {!state.error.username && !usernameValidationError && usernameCheck?.isAvailable === false && (
                <p className='mt-1 text-sm text-red-500'>Username already taken</p>
              )}
              {!state.error.username && !usernameValidationError && isUsernameCheckError && (
                <p className='mt-1 text-sm text-red-500'>Could not check this subdomain</p>
              )}
            </div>
            {/* @FIXME: Uncomment when public/private planning and implementation is done */}
            {/* <div className='mt-2 flex items-center justify-end gap-2'>
              <Label htmlFor={`userName`}>Allow public access</Label>
              <Switch
                className='h-5 w-8 [&_span]:size-4 data-[state=checked]:[&_span]:translate-x-3 data-[state=checked]:[&_span]:rtl:-translate-x-3'
                defaultChecked
              />
            </div> */}
          </form>
        </div>
      </div>
      <DialogFooter className='border-t px-6 py-4'>
        <Button type='button' variant='outline' onClick={handleCancelClick} disabled={isPending}>
          Cancel
        </Button>
        <Button type='submit' disabled={!isProfileSaveable} onClick={handleSaveClick}>
          {isPending && <LoaderCircleIcon className='-ms-1 animate-spin' size={16} aria-hidden='true' />}
          Save changes
        </Button>
      </DialogFooter>
    </motion.div>
  );
}
