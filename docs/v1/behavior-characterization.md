# V1 Behavior Characterization

Date: 2026-05-15

This document captures the Bookmarket v1 behavior that v2 must preserve during the parity phase. It is based on the committed v1 source fixture at `tests/fixtures/v1-root` plus a read-only production check against `https://bmkt.ericjypark.com`.

## Source Inventory

V1 is a pnpm/Turborepo application with:

- Next.js 15 web app in `apps/web`.
- NestJS 10 API in `apps/server`.
- PostgreSQL through TypeORM migrations and entities.
- JWT auth stored in cookies by web server actions.
- PWA assets and middleware-driven subdomain rewrites.

## Route Inventory

| Route | V1 source | Behavior to preserve |
| --- | --- | --- |
| `/` | `apps/web/src/app/(pages)/(home)/page.tsx` | Public landing page with fixed top header, logo, `Bookmarket` wordmark on larger screens, hero copy, slot counter, `Join Now`/`Sign In` call to action, `Github` button, and desktop/mobile screenshots. |
| `/login` | `apps/web/src/app/(pages)/(auth)/login/page.tsx` | Centered auth form. Copy: `Sign In to Bookmarket`, `Welcome back! Sign in to continue`, OAuth buttons `Google` and `Github`, separator `Or continue with`, `Email`, `Password`, `Sign In`, and link copy `Don't have an account? Create account`. |
| `/signup` | `apps/web/src/app/(pages)/(auth)/signup/page.tsx` | Centered signup form. Copy: `Jump into Bookmarket`, `Create an account to continue`, slot counter, OAuth buttons, separator, `Email`, `Password`, and submit label `Sign Up` or `Slots Full` based on slot state. Link copy: `Already have an account? Sign in`. |
| `/home` | `apps/web/src/app/(pages)/(home)/home/page.tsx` | Authenticated bookmark workspace. Shows sticky top nav, category tabs/drawer, URL input, bookmark list, command menu provider, user avatar/settings, and bottom/top toast placement by viewport. |
| `/s/[username]` | `apps/web/src/app/(pages)/(shared)/s/[username]/page.tsx` | Public view-only bookmark profile. Reuses the bookmark list/card layout with interactions limited to opening shared bookmark links. |
| `/oauth/github` | `apps/web/src/app/(pages)/(auth)/oauth/github/page.tsx` | GitHub callback route used by the login/signup OAuth flow. |
| User subdomain | `apps/web/src/middleware.ts` | Requests to user subdomains under the main domain are rewritten to `/s/[subdomain]`, except static assets and reserved prefixes such as `www.`, `api.`, `bmkt.`, and `ericpark.`. |

Auth-related routes redirect authenticated users to `/home`. In the current v1 source, `unauthenticatedRoutes` includes `/` and the middleware checks `pathname.startsWith(route)`, so every path, including `/home`, matches the unauthenticated allow-list before refresh or login redirect logic runs. V2 preserves that actual source behavior: unauthenticated `/home` renders the logged-out shell instead of redirecting.

## Production Read-Only Observation

Read-only HTTP checks on 2026-05-15 showed:

- `GET https://bmkt.ericjypark.com` returns `200` with Next.js static HTML.
- `GET https://bmkt.ericjypark.com/login` renders the same login copy and layout structure as the local v1 source.
- `GET https://bmkt.ericjypark.com/signup` renders the same signup copy and starts with slot-dependent controls disabled until the client slot query resolves.

Follow-up read-only HTTP checks on 2026-05-16 showed:

- `GET https://bmkt.ericjypark.com/home` returns `200` with the logged-out home SSR payload: logo/wordmark, `Login` link, headline `Bookmarket - Buy and Sell Expert's Bookmark Collections`, bookmark input placeholder `Paste a link to add a bookmark`, empty `categories`, and empty `bookmarks`.
- `GET https://bmkt.ericjypark.com/login` returns `200` with the full login form SSR payload, including `Sign In to Bookmarket`, `Welcome back! Sign in to continue`, `Google`, `Github`, `Or continue with`, `Email`, `Password`, `Sign In`, and `Don't have an account? Create account`.
- `GET https://bmkt.ericjypark.com/health` returns `404` on the current v1 production deployment; this is not a v1 UI route.
- `GET https://api.bmkt.ericjypark.com/health` cannot be used as a current v1 reference in this shell because the served certificate does not cover `api.bmkt.ericjypark.com`.

Read-only Chrome-profile checks on 2026-05-16 showed:

- The available Chrome profile did not expose an authenticated Bookmarket production session. Latest Computer Use checks of `https://bmkt.ericjypark.com/home` and `/login` rendered only the blank pale Bookmarket shell with no accessible authenticated controls.
- A non-destructive hard reload of `/home` in that Chrome profile did not recover the rendered UI. A cache-busted read-only navigation to `/login?codex_readonly=20260516` also rendered only the blank shell. Direct HTTP checks in the same pass still returned the expected SSR payloads for `/home` and `/login`, so the blocker is the unavailable authenticated/browser-rendered oracle, not missing public SSR markup.
- No production login, OAuth flow, bookmark action, profile edit, purchase, sale, or destructive action was performed.
- The Chrome profile did not have an authenticated Bookmarket production session available, so authenticated production reference inspection remains a release blocker unless a read-only session becomes available.

## Layout And Interaction Notes

Global layout:

- Body uses Geist font, `select-none` by default, and text selection on larger screens.
- Main content is constrained to `max-w-2xl` for app/auth routes with horizontal padding.
- Desktop toasts are bottom-center and hidden on mobile. Mobile toasts are top-center with shorter duration.

Landing route:

- Header is fixed at the top with backdrop blur.
- Hero copy is centered and animated with Framer Motion.
- Slot status drives `Join Now`, `Sign In`, or `Slots Full` labels.
- `Github` opens `https://github.com/eric-jy-park/bookmarket`.

Home route:

- The URL input is sticky under the nav with a search icon, progressive blur, pending spinner, and inline red validation error.
- Invalid/empty URL returns `Invalid URL` or `URL is required` in the input area.
- URLs missing a protocol are normalized to `https://`.
- Bookmark cards show favicon or logo fallback, title, hostname with `www.` removed, and `createdAt` formatted as `en-US` short month plus day.
- Desktop right-click opens a context menu. Mobile long-press for 500 ms opens a drawer.
- Clicking a non-active, non-blurred bookmark opens `bookmark.url` in a new tab with `noopener,noreferrer`.

Bookmark context actions:

- `Copy` writes the URL to clipboard and shows `Copied to clipboard` or `Failed to copy to clipboard`.
- `Rename` toggles inline title editing for the active bookmark.
- `Refetch` shows `Refreshing bookmark metadata...`, blurs the bookmark during refetch, then shows success or failure toast.
- `Delete` shows promise toasts: `Deleting bookmark...`, `Bookmark deleted successfully`, or `Failed to delete bookmark`.
- `Category` opens a category submenu on desktop and nested drawer on mobile.

Categories:

- Desktop categories are centered pill tabs in the top nav.
- The active category uses a black animated background and white/mix-blend-exclusion text.
- Clicking the active category clears the `c` query parameter.
- Mobile uses a drawer trigger with a folder icon and current category name or `All`.
- Category filtering uses the `c` query parameter and filters by category name.
- Add-category UI is hidden on shared pages and only appears when the user has 5 or fewer categories.

Command menu:

- Opens with `Meta+K` or `Ctrl+K`.
- Search placeholder is `Search for a bookmark...`.
- Without search, shows up to 8 recent bookmarks under `Recent Bookmarks`.
- With search, filters client-side by title or URL and changes heading to `Search Results`.
- Empty state copy is `No results found.`
- Categories appear under `Categories`.
- Footer copy is `All your bookmarks in one place`.
- Bookmark selection opens the URL in a new tab. Category selection sets `c` and closes the menu.

Profile/settings:

- User avatar opens profile/settings UI.
- Dialog title is `Edit profile`.
- Editable fields: `First Name`, `Last Name`, and `Personal Subdomain`.
- Subdomain field is visually composed as `https://` + input + `.bmkt.tech`.
- Availability states show loading, green check, or red X.
- Taken username copy is `Username already taken`.
- Buttons: `Cancel` and `Save changes`.
- Save is disabled while username is checking/taken, username is empty, or no editable field changed.

Shared profile:

- Uses the same bookmark-card list density and date formatting as `/home`.
- Cards are links and open in new tabs.
- Private or missing users surface API errors from the public endpoints.

## API Behavior Notes

Base API routes from v1 Nest controllers:

| Method and path | Auth | Notes |
| --- | --- | --- |
| `POST /authentication/signup` | none | Creates email user if signup slots remain. Returns `{ accessToken, refreshToken }`. Conflicts with `User already exists`; full slots use `No more signup slots available. Maximum of 100 users reached.` |
| `POST /authentication/signin` | none | Returns tokens. Unknown email: `User not found`; wrong password: `Incorrect credentials provided`. |
| `POST /authentication/refresh-token` | none | Returns new tokens or `Invalid refresh token`. |
| `POST /authentication/google` | none | Authenticates/creates OAuth user from client-provided OAuth user info DTO. |
| `POST /authentication/github` | none | Authenticates/creates OAuth user from client-provided OAuth user info DTO. |
| `GET /slots/status` | none | Returns `{ remaining, total, canSignUp }`; total is 100. |
| `GET /users/me` | cookie | Returns only `id`, `email`, `picture`, `username`, `firstName`, and `lastName`. |
| `GET /users/check-username?username=` | cookie | Returns `{ isAvailable }`; rejects unallowed usernames. |
| `PATCH /users` | cookie | Updates profile fields. |
| `POST /bookmarks` | cookie | Creates a bookmark, optionally by category name, then queues background metadata enhancement. |
| `GET /bookmarks?category=` | cookie | Returns current user's bookmarks ordered by `createdAt DESC`. |
| `GET /bookmarks/metadata?url=` | cookie | Fetches URL metadata synchronously. |
| `POST /bookmarks/:id/refetch` | cookie | Refetches metadata synchronously and returns the updated bookmark. |
| `PATCH /bookmarks/:id` | cookie | Updates bookmark fields, but currently returns TypeORM update result. UI mostly uses this for title edit. |
| `PATCH /bookmarks/:id/category` | cookie | Assigns or clears category by category id and returns saved bookmark. |
| `DELETE /bookmarks/:id` | cookie | Deletes bookmark and returns TypeORM delete result. |
| `GET /bookmarks/s/:username?category=` | none | Returns public user's bookmarks ordered by `createdAt DESC`; 404 for missing user and 403 for private profile. |
| `POST /categories` | cookie | Creates category. Duplicate name returns `Category with name {name} already exists`. |
| `GET /categories` | cookie | Returns current user's categories ordered by `createdAt ASC`. |
| `PATCH /categories/:id` | cookie | Updates category. |
| `DELETE /categories/:id` | cookie | Deletes category. Bookmark foreign key is set null. |
| `GET /categories/s/:username` | none | Returns public user's categories ordered by `createdAt ASC`. |

## Data Model Notes

V1 source-of-truth tables/entities:

- `User`: `id`, `email`, `username`, `firstName`, `lastName`, `password`, `isPublic`, `auth_provider`, `google_id`, `github_id`, `picture`, `createdAt`, `updatedAt`.
- `Bookmark`: `id`, `url`, `title`, `description`, `faviconUrl`, `createdAt`, `updatedAt`, many-to-one eager `user`, optional eager `category`.
- `Category`: `id`, `name`, `createdAt`, `updatedAt`, many-to-one eager `user`; unique name per user.

Ordering contracts:

- Bookmarks: newest first by `createdAt DESC`.
- Categories: oldest first by `createdAt ASC`.
- Command menu recents: first 8 bookmarks from the current bookmark query.

## V2 Parity Risks To Account For

- V1 web creation fetches metadata before sending `POST /bookmarks`; the v2 goal requires bookmark creation to return immediately and metadata fetch to be async. The visible input/pending/toast behavior still needs to feel the same even though the internal timing changes.
- V1 API sometimes returns TypeORM entities and update/delete results. V2 must return DTOs without changing visible behavior.
- V1 OAuth trusts client-supplied OAuth user info DTOs. V2 must verify OAuth server-side without changing the user-facing flow.
- V1 public profile exposes all bookmarks when `isPublic` is true. V2 must preserve that behavior for parity while keeping future collection/listing privacy separate.
- V1 has no explicit metadata job status field. The v2 async pipeline needs a visual compatibility layer for missing, pending, failed, and refreshed metadata.
