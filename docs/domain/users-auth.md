# Users And Auth

## Principles

- Never expose persistence entities directly.
- Never expose password hashes.
- OAuth identity must be verified server-side.
- Raycast and other external clients require stable scoped tokens.

## User Model

The API should distinguish:
- User profile
- Auth account
- Session or refresh token state
- API token for external clients

## Required Client Types

- Web browser session
- Future Raycast extension
- Future public marketplace browsing client

## Token Policy

Access tokens should be short-lived. Refresh tokens should be revocable and stored or tracked server-side.

## Current Implementation Slice

- Email signup/login is implemented in the Kotlin API under `/api/v1/auth/*`.
- Access tokens are signed short-lived HMAC JWTs.
- Refresh tokens are random opaque tokens stored as hashes in `refresh_tokens`, rotated on refresh, and revoked on logout.
- API tokens are implemented under `/api/v1/api-tokens` for future Raycast and external clients.
- API token plain values are shown only once, hashes are stored in `api_tokens`, and display prefixes are returned for management UI.
- Supported API token scopes are `bookmarks:read`, `bookmarks:write`, and `profile:read`.
- Token management requires a normal user session. API tokens can authenticate scoped bookmark/category reads with `bookmarks:read`, bookmark/category mutations with `bookmarks:write`, and current-profile reads with `profile:read`.
- Signup slot enforcement uses the 100-user limit and locks the `users` table during account creation to avoid overbooking.
- Signup, login, and refresh attempts use Redis-backed rate limits when `BOOKMARKET_REDIS_ENABLED=true`.
- OAuth login endpoints verify Google and GitHub identities server-side, reject unverified emails, and consume Redis-backed one-time OAuth state values minted by `/api/v1/auth/oauth/state`.
- Current-user and profile update endpoints return `UserProfileDto` only.
