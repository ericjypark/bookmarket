# V1 Parity Checklist

The v2 rewrite is not acceptable until this checklist passes against the same seeded data as v1.

## Public Routes

- `/` renders the same landing experience.
- `/login` renders the same login form and OAuth actions.
- `/signup` renders the same signup form and slot state.
- `/s/[username]` renders the same public bookmark profile.
- User subdomain rewrite behavior matches v1.
- Shared profile bookmark click behavior matches v1.

Automated coverage:

- `pnpm test:v1-routing-parity` covers public user subdomain rewrites, query preservation, shared profile bookmark opening, and reserved `www.` host behavior against local seeded data.

## Auth

- Email signup returns the same visible success and error behavior.
- Email login returns the same visible success and error behavior.
- Google login keeps the same user-facing flow.
- GitHub login keeps the same user-facing flow.
- Expired access token refresh behavior matches v1.
- Logout clears the user session.

Automated coverage:

- `pnpm test:v1-auth-parity` covers unauthenticated `/home` logged-out shell behavior, invalid login copy, duplicate-signup copy or full-slot controls depending on local seed state, local GitHub OAuth navigation with a minted `state` parameter, logout cookie clearing, and refresh-token revocation against local seeded data.
- `pnpm test:api` covers refresh-token rotation, old-refresh-token invalidation, logout revocation of the active refresh token, and rejection after logout. Browser-visible refresh parity follows the actual v1 middleware source: because `/` is in `unauthenticatedRoutes` and matching uses `pathname.startsWith(route)`, visible routes such as `/home` are allowed before middleware refresh logic runs.
- The v2 OAuth adapter mints a Redis-backed one-time state value before Google/GitHub provider navigation and sends it back to the API without changing the visible v1 OAuth buttons or route surfaces.
- `docs/testing/oauth-verification.md` defines the split between automated OAuth coverage and the provider-backed browser smoke signoff required before release.

## Bookmarks

- User can create a bookmark by URL.
- Creation returns immediately before metadata fetch completes.
- Bookmark order matches v1.
- Bookmark title edit behavior matches v1.
- Bookmark deletion behavior matches v1.
- Bookmark open behavior matches v1.
- Copy URL behavior matches v1.
- Metadata refetch behavior matches v1 visually.

Automated coverage:

- `pnpm test:v1-interactions` covers desktop URL-input bookmark creation, bookmark click-to-open behavior, context-menu copy/rename/category/delete, and visible refetch menu availability against local seeded data.
- `pnpm check:web-ui-parity` source-checks the async creation boundary by failing if the v2 bookmark creation adapter reintroduces the v1 synchronous `getMetadata`/`bookmarks/metadata` path or if the API service stops marking/publishing metadata work before returning the created bookmark.

## Categories

- Category creation behavior matches v1.
- Category filter query parameter behavior matches v1.
- Bookmark category assignment and removal match v1.
- Mobile category drawer behavior matches v1.

Automated coverage:

- `pnpm test:v1-interactions` covers desktop category creation through the v1 sheet, desktop category query filtering, bookmark category reassignment, and mobile category drawer filtering against local seeded data.

## Command Menu

- Keyboard shortcut opens command menu.
- Recent bookmark display matches v1.
- Search filtering behavior matches v1 until server search replaces it.
- Category selection behavior matches v1.

Automated coverage:

- `pnpm test:v1-interactions` covers the authenticated desktop command menu shortcut, recent/search states, search filtering, and category selection against local seeded data.

## Profile Settings

- User avatar opens the profile/settings menu.
- Settings opens the `Edit profile` dialog.
- `First Name`, `Last Name`, and `Personal Subdomain` fields match v1.
- Personal subdomain renders the same `https://` and `.bmkt.tech` visual composition.
- Taken username validation and disabled save behavior match v1.
- Saving a valid profile change shows the same success toast and closes the dialog.

Automated coverage:

- `pnpm test:v1-interactions` covers the desktop profile/settings menu, dialog fields, username-taken state, disabled/enabled save states, success toast, and local cleanup back to the seeded owner profile.

## Interaction Regression

- Local-only interaction checks must not target production.
- Desktop bookmark context menu exposes and preserves Copy, Rename, Refetch, Delete, and Category actions.
- Copy URL shows the same success toast.
- Rename shows the inline title input and update toast.
- Bookmark category reassignment shows the same update toast.
- Bookmark deletion shows the same delete toast and removes the item.
- Bookmark click opens the URL in a new tab.
- Mobile category drawer filters through the same `c` query parameter.

## Visual Regression

- Desktop screenshots match v1 for all main routes.
- Mobile screenshots match v1 for all main routes.
- Empty states match v1.
- Loading and error states match v1.

Automated/source coverage:

- `pnpm test:v1-visual:verify` checks that the Playwright visual spec, project viewports, and required 5 route x 3 viewport PNG baseline matrix are present.
- `pnpm test:v1-visual:public` and `pnpm test:v1-visual:seeded` cover the main route screenshots across the required desktop, tablet, and mobile viewports.
- `pnpm check:web-ui-parity` covers exact v1 source parity for the empty bookmark-list behavior, `app/(pages)/loading.tsx`, `app/(pages)/(home)/home/error.tsx`, `app/global-error.tsx`, and `next-env.d.ts`. It also resolves and compares the effective v1 web TypeScript config, guards the v2 web package script/dev-tooling surface, and fails if an allowed v2 API adapter diff contains visual styling, JSX-returning UI, Tailwind-style tokens, or imports from the copied core UI components. In v1, the root loading component renders its children, an empty bookmark list renders the same empty list container without extra copy, and the home error boundary renders `Something went wrong!` plus `Try again`.

## Non-Goals During Parity

- Marketplace UI.
- Visual redesign.
- New category model visible to users.
- New search ranking visible to users.
