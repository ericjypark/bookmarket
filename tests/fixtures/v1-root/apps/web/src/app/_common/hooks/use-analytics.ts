import { useMemo } from 'react';
import {
  trackAuthEvent,
  trackBookmarkEvent,
  trackCategoryEvent,
  trackCommandEvent,
  trackProfileEvent,
  trackSharingEvent,
  trackErrorEvent,
} from '../utils/analytics';

/**
 * Analytics hook that provides safe, memoized tracking functions
 * Follows single responsibility principle by focusing only on tracking coordination
 */
export const useAnalytics = () => {
  // Memoize tracking objects to prevent unnecessary re-renders
  const trackAuth = useMemo(() => ({
    signupStart: trackAuthEvent.signupStart,
    signupSuccess: trackAuthEvent.signupSuccess,
    loginStart: trackAuthEvent.loginStart,
    loginSuccess: trackAuthEvent.loginSuccess,
    oauthGoogle: trackAuthEvent.oauthGoogle,
    oauthGithub: trackAuthEvent.oauthGithub,
  }), []);

  const trackBookmark = useMemo(() => ({
    createStart: trackBookmarkEvent.createStart,
    createSuccess: trackBookmarkEvent.createSuccess,
    createError: trackBookmarkEvent.createError,
    open: trackBookmarkEvent.open,
    delete: trackBookmarkEvent.delete,
    editTitle: trackBookmarkEvent.editTitle,
    copyUrl: trackBookmarkEvent.copyUrl,
    refetch: trackBookmarkEvent.refetch,
    fixFavicon: trackBookmarkEvent.fixFavicon,
  }), []);

  const trackCategory = useMemo(() => ({
    create: trackCategoryEvent.create,
    createError: trackCategoryEvent.createError,
    assign: trackCategoryEvent.assign,
    filter: trackCategoryEvent.filter,
  }), []);

  const trackCommand = useMemo(() => ({
    open: trackCommandEvent.open,
    search: trackCommandEvent.search,
    bookmarkOpen: trackCommandEvent.bookmarkOpen,
    categorySelect: trackCommandEvent.categorySelect,
  }), []);

  const trackProfile = useMemo(() => ({
    editStart: trackProfileEvent.editStart,
    editSave: trackProfileEvent.editSave,
    usernameCheck: trackProfileEvent.usernameCheck,
  }), []);

  const trackSharing = useMemo(() => ({
    profileView: trackSharingEvent.profileView,
    bookmarkClick: trackSharingEvent.bookmarkClick,
  }), []);

  const trackError = useMemo(() => ({
    pageError: trackErrorEvent.pageError,
    metadataFetchError: trackErrorEvent.metadataFetchError,
  }), []);

  return {
    trackAuth,
    trackBookmark,
    trackCategory,
    trackCommand,
    trackProfile,
    trackSharing,
    trackError,
  };
};