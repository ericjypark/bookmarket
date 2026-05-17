import { getPreferenceValues } from "@raycast/api";
import { randomUUID } from "node:crypto";

type Preferences = {
  apiBaseUrl: string;
  apiToken: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
};

export type Category = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Bookmark = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  metadataStatus: "PENDING" | "READY" | "FAILED" | string;
  metadataUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: Category | null;
};

export class BookmarketApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "BookmarketApiError";
  }
}

type RequestOptions = RequestInit & {
  searchParams?: Record<string, string | number | boolean | undefined>;
};

const apiVersionSuffix = "/api/v1";

const preferences = () => getPreferenceValues<Preferences>();

const apiRoot = () => {
  const rawBaseUrl = preferences().apiBaseUrl.trim().replace(/\/+$/, "");
  if (!rawBaseUrl) {
    throw new BookmarketApiError(
      "Set the Bookmarket API base URL in extension preferences.",
      0,
      "PREFERENCES_MISSING",
    );
  }

  return rawBaseUrl.endsWith(apiVersionSuffix)
    ? rawBaseUrl
    : `${rawBaseUrl}${apiVersionSuffix}`;
};

const apiToken = () => {
  const token = preferences().apiToken.trim();
  if (!token) {
    throw new BookmarketApiError(
      "Set a Bookmarket API token in extension preferences.",
      0,
      "API_TOKEN_MISSING",
    );
  }
  return token;
};

const buildUrl = (
  path: string,
  searchParams?: RequestOptions["searchParams"],
) => {
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, `${apiRoot()}/`);

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });

  return url;
};

const parseApiError = async (response: Response) => {
  const bodyText = await response.text();
  let body: ApiErrorBody | undefined;

  try {
    body = bodyText ? (JSON.parse(bodyText) as ApiErrorBody) : undefined;
  } catch {
    body = undefined;
  }

  const error = body?.error;
  const message = error?.message ?? `${response.status} ${response.statusText}`;
  const suffix = error?.requestId ? ` (${error.requestId})` : "";

  return new BookmarketApiError(
    `${message}${suffix}`,
    response.status,
    error?.code,
    error?.requestId,
  );
};

const requestJson = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const { searchParams, headers, ...requestOptions } = options;
  const response = await fetch(buildUrl(path, searchParams), {
    ...requestOptions,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken()}`,
      ...headers,
    },
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const searchBookmarks = async (query: string, signal?: AbortSignal) =>
  requestJson<Bookmark[]>("/search/bookmarks", {
    signal,
    searchParams: {
      q: query,
    },
  });

export const createBookmark = async ({
  url,
  categoryName,
}: {
  url: string;
  categoryName?: string;
}) =>
  requestJson<Bookmark>("/bookmarks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `raycast-bookmark-create-${randomUUID()}`,
    },
    body: JSON.stringify({
      url,
      ...(categoryName ? { categoryName } : {}),
    }),
  });

export const displayTitle = (bookmark: Bookmark) =>
  bookmark.title?.trim() || bookmark.url;

export const displayHost = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
};

export const userFacingError = (error: unknown) => {
  if (error instanceof BookmarketApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
};
