import { useGoogleLogin } from '@react-oauth/google';
import { createOAuthState } from '../_actions/create-oauth-state.action';
import { fetchGoogleUserInfo } from '../_actions/fetch-google-user-info.action';
import * as Sentry from '@sentry/nextjs';
import React from 'react';
import { trackAuthEvent } from '~/app/_common/utils/analytics';

export const useOAuth = () => {
  const [oauthStates, setOAuthStates] = React.useState<Partial<Record<'google' | 'github', string>>>({});
  const [pendingGithubLogin, setPendingGithubLogin] = React.useState(false);

  const refreshOAuthState = React.useCallback(async (provider: 'google' | 'github') => {
    const state = await createOAuthState(provider);
    setOAuthStates(current => ({
      ...current,
      [provider]: state,
    }));
    return state;
  }, []);

  React.useEffect(() => {
    void refreshOAuthState('google').catch(error => Sentry.captureException(error));
    void refreshOAuthState('github').catch(error => Sentry.captureException(error));

    const interval = window.setInterval(() => {
      void refreshOAuthState('google').catch(error => Sentry.captureException(error));
      void refreshOAuthState('github').catch(error => Sentry.captureException(error));
    }, 8 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [refreshOAuthState]);

  const startGoogleLogin = useGoogleLogin({
    onSuccess: codeResponse => {
      trackAuthEvent.loginSuccess('google');
      void fetchGoogleUserInfo(codeResponse);
    },
    onError: error => Sentry.captureException(error),
  });

  const googleLogin = React.useCallback(() => {
    try {
      const googleState = oauthStates.google;
      if (googleState) {
        startGoogleLogin({ state: googleState });
        return;
      }

      void refreshOAuthState('google')
        .then(state => startGoogleLogin({ state }))
        .catch(error => {
          Sentry.captureException(error);
          window.location.href = '/login?error=oauth_failed';
        });
    } catch (error) {
      Sentry.captureException(error);
      window.location.href = '/login?error=oauth_failed';
    }
  }, [oauthStates.google, refreshOAuthState, startGoogleLogin]);

  const navigateToGithub = React.useCallback((state: string) => {
    const searchParams = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? '',
      redirect_uri: process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI ?? '',
      scope: 'user:email',
      state,
    });

    window.location.href = `https://github.com/login/oauth/authorize?${searchParams.toString()}`;
  }, []);

  React.useEffect(() => {
    if (!pendingGithubLogin || !oauthStates.github) {
      return;
    }

    setPendingGithubLogin(false);
    navigateToGithub(oauthStates.github);
  }, [navigateToGithub, oauthStates.github, pendingGithubLogin]);

  const githubLogin = React.useCallback(() => {
    try {
      const githubState = oauthStates.github;
      if (githubState) {
        navigateToGithub(githubState);
        return;
      }

      setPendingGithubLogin(true);
      void refreshOAuthState('github')
        .catch(error => {
          setPendingGithubLogin(false);
          Sentry.captureException(error);
          window.location.href = '/login?error=oauth_failed';
        });
    } catch (error) {
      Sentry.captureException(error);
      window.location.href = '/login?error=oauth_failed';
    }
  }, [navigateToGithub, oauthStates.github, refreshOAuthState]);

  return { googleLogin, githubLogin };
};
