import { getDomainSafely } from './url';

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, any>) => void;
    };
  }
}

/**
 * Core analytics tracking function
 * Safely sends events to Umami with error handling
 */
export const trackEvent = (eventName: string, data?: Record<string, any>) => {
  if (typeof window !== 'undefined' && window.umami) {
    try {
      window.umami.track(eventName, data);
    } catch (error) {
      console.warn('Analytics tracking failed:', error);
    }
  }
};

/**
 * Authentication event tracking
 * Handles user authentication flows and OAuth interactions
 */
export const trackAuthEvent = {
  signupStart: () => trackEvent('auth_signup_start'),
  signupSuccess: (method: 'email' | 'google' | 'github') => trackEvent('auth_signup_success', { method }),
  loginStart: () => trackEvent('auth_login_start'),  
  loginSuccess: (method: 'email' | 'google' | 'github') => trackEvent('auth_login_success', { method }),
  oauthGoogle: () => trackEvent('auth_oauth_google'),
  oauthGithub: () => trackEvent('auth_oauth_github'),
};

/**
 * Bookmark interaction tracking
 * Safely handles URL parsing with fallback for invalid URLs
 */
export const trackBookmarkEvent = {
  createStart: (url: string) => trackEvent('bookmark_create_start', { domain: getDomainSafely(url) }),
  createSuccess: (url: string) => trackEvent('bookmark_create_success', { domain: getDomainSafely(url) }),
  createError: (error: string) => trackEvent('bookmark_create_error', { error }),
  open: (url: string, source: 'list' | 'command' | 'context') => trackEvent('bookmark_open', { domain: getDomainSafely(url), source }),
  delete: (url: string) => trackEvent('bookmark_delete', { domain: getDomainSafely(url) }),
  editTitle: (url: string) => trackEvent('bookmark_edit_title', { domain: getDomainSafely(url) }),
  copyUrl: (url: string) => trackEvent('bookmark_copy_url', { domain: getDomainSafely(url) }),
  refetch: (url: string) => trackEvent('bookmark_refetch', { domain: getDomainSafely(url) }),
  fixFavicon: (url: string) => trackEvent('favicon_fix_attempt', { domain: getDomainSafely(url) }),
};

/**
 * Category management tracking
 * Tracks category creation, assignment, and filtering
 */
export const trackCategoryEvent = {
  create: (categoryName: string) => trackEvent('category_create', { name: categoryName }),
  createError: (error: string) => trackEvent('category_create_error', { error }),
  assign: (categoryName: string) => trackEvent('category_assign', { name: categoryName }),
  filter: (categoryName: string) => trackEvent('category_filter', { name: categoryName }),
};

/**
 * Command menu interaction tracking
 * Tracks search behavior and navigation patterns
 */
export const trackCommandEvent = {
  open: () => trackEvent('command_menu_open'),
  search: (query: string) => trackEvent('command_menu_search', { query_length: query.length }),
  bookmarkOpen: (url: string) => trackEvent('command_menu_bookmark_open', { domain: getDomainSafely(url) }),
  categorySelect: (categoryName: string) => trackEvent('command_menu_category_select', { name: categoryName }),
};

/**
 * User profile and settings tracking
 * Handles profile editing and username validation
 */
export const trackProfileEvent = {
  editStart: () => trackEvent('profile_edit_start'),
  editSave: (changed_fields: string[]) => trackEvent('profile_edit_save', { changed_fields }),
  usernameCheck: (available: boolean) => trackEvent('username_check', { available }),
};

/**
 * Shared content interaction tracking
 * Tracks public profile views and shared bookmark interactions
 */
export const trackSharingEvent = {
  profileView: (username: string) => trackEvent('shared_profile_view', { username }),
  bookmarkClick: (url: string, username: string) => trackEvent('shared_bookmark_click', { domain: getDomainSafely(url), username }),
};

/**
 * Error and exception tracking
 * Centralized error event handling
 */
export const trackErrorEvent = {
  pageError: (error: string, page: string) => trackEvent('page_error', { error, page }),
  metadataFetchError: (url: string, error: string) => trackEvent('metadata_fetch_error', { domain: getDomainSafely(url), error }),
};