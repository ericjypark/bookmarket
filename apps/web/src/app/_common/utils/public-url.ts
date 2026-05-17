const DEFAULT_PUBLIC_APP_HOST = 'bmkt.ericjypark.com';

export const PUBLIC_PROFILE_USERNAME_MAX_LENGTH = 12;
export const PUBLIC_PROFILE_USERNAME_PATTERN = /^[a-z]+$/;
export const RESERVED_PUBLIC_PROFILE_USERNAMES = new Set(['www', 'api', 's']);

const cleanHost = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).host.toLowerCase();
  } catch {
    return null;
  }
};

const cleanOrigin = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.origin;
  } catch {
    return null;
  }
};

export const publicAppHost = (): string =>
  cleanHost(process.env.NEXT_PUBLIC_DOMAIN) ??
  cleanHost(process.env.NEXT_PUBLIC_APP_URL) ??
  cleanHost(process.env.NEXT_PUBLIC_BASE_URL) ??
  DEFAULT_PUBLIC_APP_HOST;

export const publicAppOrigin = (): string => {
  const configuredOrigin = cleanOrigin(process.env.NEXT_PUBLIC_APP_URL) ?? cleanOrigin(process.env.NEXT_PUBLIC_BASE_URL);
  if (configuredOrigin) return configuredOrigin;

  const host = publicAppHost();
  const protocol = host.startsWith('localhost') || host.endsWith('.localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
};

export const publicAppProtocol = (): string => new URL(publicAppOrigin()).protocol.replace(':', '');

