'use client';

import { useSearchParams } from 'next/navigation';
import React from 'react';
import { trackAuthEvent } from '~/app/_common/utils/analytics';
import { fetchGithubUserInfo } from '../../_actions/fetch-github-user-info.action';

export default function GithubOAuthPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  React.useEffect(() => {
    if (!code) {
      return;
    }

    trackAuthEvent.loginSuccess('github');
    void fetchGithubUserInfo(code);
  }, [code]);

  return null;
}
