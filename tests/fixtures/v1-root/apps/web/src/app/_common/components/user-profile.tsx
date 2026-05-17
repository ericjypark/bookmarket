import { UserRoundIcon } from 'lucide-react';
import React from 'react';
import { type User } from '~/app/(pages)/(auth)/types';
import { Avatar, AvatarFallback, AvatarImage } from '~/app/_core/components/avatar';
import { TextMorph } from './text-morph';

export const UserProfile = React.memo(({ user }: { user: User }) => {
  return (
    <div className='flex items-center gap-3'>
      <Avatar className='rounded-md'>
        <AvatarImage src={user.picture} alt={user.email} />
        <AvatarFallback>
          <UserRoundIcon size={16} className='opacity-60' aria-hidden='true' />
        </AvatarFallback>
      </Avatar>
      <div className='flex min-w-0 flex-col'>
        <TextMorph className='truncate text-sm font-medium text-foreground'>
          {[user.firstName, user.lastName].join(' ')}
        </TextMorph>
        <p className='truncate text-xs font-normal text-muted-foreground'>{user.email}</p>
      </div>
    </div>
  );
});

UserProfile.displayName = 'UserProfile';
