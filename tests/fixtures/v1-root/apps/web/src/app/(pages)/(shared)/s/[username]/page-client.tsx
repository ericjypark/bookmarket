'use client';

import { useEffect } from 'react';
import { trackSharingEvent } from '~/app/_common/utils/analytics';

interface SharedPageClientProps {
  username: string;
  children: React.ReactNode;
}

export default function SharedPageClient({ username, children }: SharedPageClientProps) {
  useEffect(() => {
    trackSharingEvent.profileView(username);
  }, [username]);

  return <>{children}</>;
}