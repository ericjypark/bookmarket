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

  React.useEffect(() => {
    trackProfileEvent.editStart();
  }, []);

  const { data: usernameCheck, isLoading: isUsernameChecking } = useQuery({
    queryFn: () => checkUsernameAvailable(user.username!),
    queryKey: ['username', user.username],
    enabled: !!user.username && user.username !== initialUser.username,
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
    if (isUsernameChecking) return 'loading';
    if (user.username === initialUser.username) return 'idle';

    if (usernameCheck?.isAvailable) return 'available';
    return 'taken';
  }, [initialUser.username, isUsernameChecking, user.username, usernameCheck?.isAvailable]);

  const subdomainStatusIcon = React.useMemo(() => {
    switch (subdomainStatus) {
      case 'available':
        return <CheckIcon className='text-green-300' />;
      case 'taken':
        return <XIcon className='text-red-300' />;
      case 'loading':
        return <Loader2Icon className='animate-spin text-gray-300' />;
      case 'idle':
      default:
        return null;
    }
  }, [subdomainStatus]);

  const isProfileSaveable = React.useMemo(() => {
    if (subdomainStatus === 'loading' || subdomainStatus === 'taken') return false;
    if (user.username?.length === 0) return false;
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
    user.username?.length,
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
              <div className='shadow-xs relative flex rounded-md'>
                <span className='inline-flex items-center rounded-s-md border border-input bg-background px-3 text-sm text-muted-foreground'>
                  https://
                </span>
                <Input
                  placeholder='google'
                  name='username'
                  type='text'
                  value={user.username}
                  onChange={handleInputChange}
                  className='mr-px rounded-none border-x-0'
                />
                <div className='absolute right-[100px] top-1/2 -translate-y-1/2'>{subdomainStatusIcon}</div>
                <span className='inline-flex items-center rounded-e-md border border-input bg-background px-3 text-sm text-muted-foreground'>
                  .bmkt.tech
                </span>
              </div>
              {state.error.username && <p className='mt-1 text-sm text-red-500'>{state.error.username}</p>}
              {usernameCheck?.isAvailable === false && (
                <p className='mt-1 text-sm text-red-500'>Username already taken</p>
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
