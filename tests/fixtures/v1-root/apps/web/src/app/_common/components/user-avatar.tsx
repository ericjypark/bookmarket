'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOutIcon, SettingsIcon, UserRoundIcon } from 'lucide-react';
import React from 'react';
import { type User } from '~/app/(pages)/(auth)/types';
import { useAppState } from '~/app/(pages)/(home)/home/_state/store/use-app-state-store';
import { Avatar, AvatarFallback, AvatarImage } from '~/app/_core/components/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/app/_core/components/dropdown-menu';
import { signOut } from '../actions/auth.action';
import { withDeploymentCheck } from '../utils/deployment-mismatch';
import { modalIds } from '../constants/modal-id.constants';
import { UserProfile } from './user-profile';
import UserSettingsDialog from './user-settings-dialog';

export const UserAvatar = ({ user }: { user: User }) => {
  const { openModal, closeModal } = useAppState();
  const queryClient = useQueryClient();

  const handleSettingsClick = React.useCallback(() => {
    openModal({
      id: modalIds.userSettings,
      content: <UserSettingsDialog onCloseClick={() => closeModal({ id: modalIds.userSettings })} initialUser={user} />,
    });
  }, [closeModal, openModal, user]);

  const handleLogout = React.useCallback(async () => {
    queryClient.clear();

    localStorage.clear();
    sessionStorage.clear();

    await withDeploymentCheck(signOut());
  }, [queryClient]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className='cursor-pointer rounded-md'>
          <AvatarImage src={user.picture} alt={user.email} />
          <AvatarFallback>
            <UserRoundIcon size={16} className='opacity-60' aria-hidden='true' />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='max-w-64' side='bottom' sideOffset={12} collisionPadding={12}>
        <DropdownMenuLabel className='flex w-full items-center gap-3'>
          <UserProfile user={user} />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className='cursor-pointer' onClick={handleSettingsClick}>
          <SettingsIcon size={16} className='opacity-60' aria-hidden='true' />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className='cursor-pointer' onClick={handleLogout}>
          <LogOutIcon size={16} className='opacity-60' aria-hidden='true' />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
