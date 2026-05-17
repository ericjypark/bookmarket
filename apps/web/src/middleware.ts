import * as Sentry from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import { type TokenResponse } from '~/app/_common/interfaces/token.interface';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  getAccessTokenCookieOptions,
  getExpiredAuthCookieOptions,
  getRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
} from '~/app/_common/utils/auth-cookies';
import { authRelatedRoutes, unauthenticatedRoutes } from '~/path';

const apiBaseUrl = () =>
  (process.env.BOOKMARKET_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080').replace(
    /\/$/,
    ''
  );

const matchesRoute = (pathname: string, route: string) =>
  route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`);

const cookieHeaderWithTokens = (cookieHeader: string | null, tokens: TokenResponse) => {
  const cookies = new Map<string, string>();

  cookieHeader
    ?.split(';')
    .map(cookie => cookie.trim())
    .filter(Boolean)
    .forEach(cookie => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex <= 0) return;
      cookies.set(cookie.slice(0, separatorIndex), cookie.slice(separatorIndex + 1));
    });

  cookies.set(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken);
  cookies.set(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken);

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
};

const setAuthCookies = (response: NextResponse, tokens: TokenResponse) => {
  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, getAccessTokenCookieOptions());
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, getRefreshTokenCookieOptions());
};

const clearAuthCookies = (response: NextResponse) => {
  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, '', getExpiredAuthCookieOptions());
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, '', getExpiredAuthCookieOptions());
};

const nextWithAuthCookies = (request: NextRequest, tokens: TokenResponse) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('cookie', cookieHeaderWithTokens(request.headers.get('cookie'), tokens));

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  setAuthCookies(response, tokens);
  return response;
};

const redirectWithAuthCookies = (url: URL, tokens: TokenResponse) => {
  const response = NextResponse.redirect(url);
  setAuthCookies(response, tokens);
  return response;
};

const redirectToLogin = (request: NextRequest) => {
  const response = NextResponse.redirect(new URL('/login', request.url));
  clearAuthCookies(response);
  return response;
};

const isRequestAuthenticated = async (request: NextRequest) => {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;

  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/users/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });

    return response.ok;
  } catch (error) {
    Sentry.captureException(error);
    return false;
  }
};

const refreshSession = async (request: NextRequest): Promise<TokenResponse | null> => {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    return (await response.json()) as TokenResponse;
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
};

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  const mainDomain = process.env.NEXT_PUBLIC_DOMAIN;
  const pathname = request.nextUrl.pathname;

  // Log for debugging in production
  console.log(`Middleware processing: Host=${host}, MainDomain=${mainDomain}, Path=${pathname}`);

  // Skip subdomain rewriting for static assets and images
  const isStaticAsset =
    pathname.match(/\.(jpe?g|png|gif|svg|webp|avif|ico|bmp|css|js)$/i) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/_vercel/');

  // Static assets should always be accessible
  if (isStaticAsset) {
    return NextResponse.next();
  }

  if (
    host &&
    mainDomain &&
    host.includes('.') &&
    host.endsWith(mainDomain) &&
    !host.startsWith('www.') &&
    !host.startsWith('api.') &&
    !host.startsWith('bmkt.') &&
    !host.startsWith('ericpark.')
  ) {
    // Logic for handling subdomains
    const subdomain = host.split('.')[0];
    console.log(`Detected subdomain: ${subdomain}`);

    const protocol = request.nextUrl.protocol;
    const newUrl = new URL(`/s/${subdomain}`, `${protocol}//${mainDomain}`);

    newUrl.search = request.nextUrl.search;
    if (request.nextUrl.pathname !== '/') {
      newUrl.pathname = `${newUrl.pathname}${request.nextUrl.pathname}`;
    }

    console.log(`Rewriting to: ${newUrl.toString()}`);
    return NextResponse.rewrite(newUrl);
  }

  const isAuthRelatedRoute = authRelatedRoutes.some(route => matchesRoute(request.nextUrl.pathname, route));
  const isUnauthenticatedRoute = unauthenticatedRoutes.some(route => matchesRoute(request.nextUrl.pathname, route));

  if (isAuthRelatedRoute) {
    if (await isRequestAuthenticated(request)) return NextResponse.redirect(new URL('/home', request.url));

    const tokens = await refreshSession(request);
    if (tokens) return redirectWithAuthCookies(new URL('/home', request.url), tokens);
  }

  if (isUnauthenticatedRoute) return NextResponse.next();

  if (await isRequestAuthenticated(request)) return NextResponse.next();

  const tokens = await refreshSession(request);

  if (!tokens) return redirectToLogin(request);

  return nextWithAuthCookies(request, tokens);
}

export const config = {
  matcher: ['/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)'],
};
