export type ApiTokenScope = 'bookmarks:read' | 'bookmarks:write' | 'profile:read' | (string & {});

export interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface CreateApiTokenResponse {
  token: string;
  tokenMetadata: ApiToken;
}
