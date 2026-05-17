import * as Sentry from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, refreshNewAccessToken } from '~/app/_common/actions/auth.action';
import { authRelatedRoutes, unauthenticatedRoutes } from '~/path';

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

  let auth: boolean | undefined;

  if (authRelatedRoutes.some(route => request.nextUrl.pathname.startsWith(route))) {
    auth = await isAuthenticated();
    if (auth) return NextResponse.redirect(new URL('/home', request.url));
  }

  if (unauthenticatedRoutes.some(route => request.nextUrl.pathname.startsWith(route))) return NextResponse.next();

  if (!auth) auth = await isAuthenticated();

  if (!auth) {
    try {
      const tokens = await refreshNewAccessToken();

      if (!tokens) return NextResponse.redirect(new URL('/login', request.url));

      return NextResponse.next();
    } catch (e) {
      Sentry.captureException(e);
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)'],
};
