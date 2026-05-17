export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

export const ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type SameSite = 'lax' | 'strict' | 'none';

export type AuthCookieOptions = {
  maxAge: number;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSite;
  domain?: string;
};

const configuredCookieDomain = () => process.env.BOOKMARKET_COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_DOMAIN;

const normalizeHostname = (value?: string) => {
  if (!value) return undefined;

  const withoutProtocol = value.replace(/^https?:\/\//i, '');
  const host = withoutProtocol.split('/')[0]?.split(':')[0]?.trim().toLowerCase();

  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.includes(':')) {
    return undefined;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return undefined;
  }

  return host.replace(/^\.+/, '');
};

const isConfiguredLocalhost = () => {
  const value = configuredCookieDomain();
  if (!value) return process.env.NODE_ENV !== 'production';

  const withoutProtocol = value.replace(/^https?:\/\//i, '');
  const host = withoutProtocol.split('/')[0]?.split(':')[0]?.trim().toLowerCase();

  return !host || host === 'localhost' || host.endsWith('.localhost');
};

const cookieDomain = () => {
  const host = normalizeHostname(configuredCookieDomain());
  return host ? `.${host}` : undefined;
};

export const getAuthCookieOptions = (maxAge: number): AuthCookieOptions => {
  const domain = cookieDomain();

  return {
    maxAge,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !isConfiguredLocalhost(),
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  };
};

export const getAccessTokenCookieOptions = () => getAuthCookieOptions(ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS);

export const getRefreshTokenCookieOptions = () => getAuthCookieOptions(REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS);

export const getExpiredAuthCookieOptions = () => getAuthCookieOptions(0);
