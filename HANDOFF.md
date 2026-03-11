# Handoff (for next AI agent)

## What this repo is
- Monorepo (npm workspaces): `server/` (Express + TypeScript + SQLite) + `client/` (Vite React TS + Tailwind)
- Current state: full local social app with posts/likes/comments, **friend system**, **post visibility** (`public|friends`), **in-app notifications**, **search**, **admin analytics + read-only SQL console**, and **dark mode**.

## Quick start
- Install: `npm install`
- Seed demo data (deterministic; resets DB by default): `npm -w server run seed:test`
- Run both: `npm run dev`
  - API: `http://localhost:4000`
  - Web: `http://localhost:5173`
- Health check: `GET /health` → `{ ok: true }`

### Demo accounts
- Admin: `admin` / `admin123`
- Users: `seed_user01` … `seed_user10` / `password123`

### Seeding behavior
- `seed:test` is intended for demos and is offline-friendly (no external image URLs).
- Default behavior is to wipe/reset and re-seed so each run starts from a known state.
- Escape hatch: `npm -w server run seed:test -- --no-force`

## Environment
- Server env: copy `server/.env.example` → `server/.env` (optional in dev; required in prod)
  - SQLite: `SQLITE_PATH=./data/app.db`
  - CORS: `CLIENT_ORIGIN=http://localhost:5173`
  - Optional admin seed (script): `ADMIN_USERNAME`, `ADMIN_PASSWORD` then run `npm -w server run seed:admin`
- Client env (optional): `VITE_API_BASE`, `VITE_SOCKET_URL` (defaults to `http://localhost:4000`)

## Architecture overview

### Auth/session model
- Access token: JWT (short TTL), stored in localStorage.
- Refresh token: JWT (long TTL), stored in localStorage.
- Refresh sessions persisted in SQLite (`sessions` table) with hashed refresh token.
- Multi-device supported (each login creates a session row).
- Code: `server/src/routes/auth.ts`, `server/src/auth/tokens.ts`, `server/src/middleware/auth.ts`.

### Database & migrations
- SQLite migrations are applied automatically on server startup.
- Migration runner: `server/src/db/migrate.ts`
- Migration files live in `server/migrations/` and are applied in order:
  - `001_init.sql`: users/sessions/posts/likes/comments
  - `004_user_status.sql`: adds `users.status_text`
  - `005_user_ban.sql`: adds user ban flag (admin moderation support)
  - `006_friendships.sql`: friendships table (requests + accepted + rejected)
  - `007_post_visibility_notifications.sql`: posts visibility + notifications table

### Realtime (Socket.IO)
- Server: `server/src/realtime.ts`
- Socket auth: client passes access token via `socket.handshake.auth.token`
- Rooms:
  - Per-user notifications: `user:<id>`
- Events:
  - Social feed: `event` (post/like/comment changes)
  - Notifications: `notify:event` (per-user)

### Client API + realtime
- REST wrapper with automatic refresh on `401`: `client/src/lib/api.ts`
- Token storage: `client/src/lib/storage.ts`
- Socket singleton + buffered notify subscription: `client/src/lib/realtime.ts`
- Unread badge resync mechanism: `client/src/lib/notificationsSync.ts`
- Dark mode (Tailwind class strategy):
  - Theme provider: `client/src/lib/theme.tsx`
  - Tailwind config: `client/tailwind.config.js`

## Key REST endpoints (high-level)

### Auth
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### Profiles
- `GET /api/me`
- `PATCH /api/me`
- `DELETE /api/me`
- `GET /api/users/:username`

### Posts / social
- `GET /api/posts/feed?sort=new|popular&scope=global|friends&limit=..&cursor=..`
- `GET /api/posts/user/:username?limit=..&cursor=..`
- `GET /api/posts/:id`
- `POST /api/posts` (supports `visibility: public|friends`)
- `PUT /api/posts/:id` (supports `visibility` changes)
- `DELETE /api/posts/:id`
- `POST /api/posts/:id/like`
- `GET /api/comments/post/:postId`
- `POST /api/comments/post/:postId`

### Friends
- `GET /api/friends?limit=..&cursor=..` (accepted friends)
- `GET /api/friends/requests?limit=..&cursor=..` (incoming requests)
- `GET /api/friends/requests/sent?limit=..&cursor=..` (sent requests)
- `POST /api/friends/request/:userId` (send request)
- `POST /api/friends/accept/:userId`
- `POST /api/friends/reject/:userId`
- `DELETE /api/friends/request/:userId` (cancel)
- `DELETE /api/friends/:userId` (unfriend)

### Notifications
- `GET /api/notifications?limit=..&cursor=..`
- `GET /api/notifications/unread-count`
- `POST /api/notifications/read` (by ids)
- `POST /api/notifications/read-all`
- `POST /api/notifications/read-by-entity` (used for auto-mark-read when opening a post)

### Search
- `GET /api/search?q=...&limit=..` (users + posts)

### Admin (admin-only)
- `GET /api/admin/analytics?days=7|30|90|365`
- `POST /api/admin/sql` (read-only console)
- `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id`, `DELETE /api/admin/users/:id` (moderation)

## Important UI files
- Routing + session bootstrap + unread badge: `client/src/App.tsx`
- Navigation (theme toggle + unread badge): `client/src/components/NavBar.tsx`
- Feed: `client/src/pages/FeedPage.tsx`
- Composer: `client/src/components/PostComposer.tsx`
- Feed cards: `client/src/components/PostCard.tsx`
- Post detail: `client/src/pages/PostPage.tsx`
- Profile (includes friend actions + friends pagination): `client/src/pages/ProfilePage.tsx`
- Notifications inbox: `client/src/pages/NotificationsPage.tsx`
- Search page: `client/src/pages/SearchPage.tsx`
- Admin dashboard: `client/src/pages/AdminPage.tsx`

## Current design philosophy
- The UI direction is intentionally more vibrant and youthful than the original neutral dashboard style.
- Visual language is based on glassmorphism, but not the flat "frosted card everywhere" version. Panels should feel layered, floating, and slightly luminous.
- The core palette is warm pink/coral plus aqua, with small amber accents to keep gradients from feeling generic.
- Typography is part of the identity: `Space Grotesk` for display, `Sora` for body, and `IBM Plex Mono` for system/meta labels.
- Motion should support atmosphere and hierarchy, not become noise. Prefer soft lift, blur, shimmer, and staggered reveal over busy animation.
- Surfaces should feel translucent and elevated: rounded corners, soft borders, inset highlights, deep but diffused shadows, and visible depth between background and content.
- Interactive elements should read clearly at a glance. Important controls should have stronger glow/contrast states rather than relying only on subtle border changes.
- Empty states and hero sections should feel art-directed, with ambient blobs, glow, and supporting copy rather than plain centered boxes.
- Preserve responsiveness. The visual system should still work on mobile, which means avoiding oversized decorative layers that break stacking or readability.
- When editing UI, prefer extending the shared tokens and utility classes in `client/src/index.css` instead of scattering one-off styling across pages.

## Recent UI direction changes
- Global visual system in `client/src/index.css` was refreshed to use brighter gradients, stronger glass panels, floating ambient backgrounds, and updated typography.
- Branding in `client/index.html` now uses the `Social Pulse` title and a matching inline gradient favicon.
- `client/src/components/NavBar.tsx` was redesigned into a floating glass header with stronger active states and a more branded identity.
- `client/src/pages/FeedPage.tsx` now has a more expressive hero section with layered glow, stronger copy, and a clearer sense of motion and energy.
- `client/src/components/PostComposer.tsx` and `client/src/components/PostCard.tsx` were updated to feel more tactile and elevated, including stronger glass surfaces and highlighted interaction states.

## Recent bug fixes
- Feed pagination bug fixed in `server/src/routes/posts.ts`: cursor-based feed requests were generating invalid SQL because the query appended a second `WHERE` instead of an `AND`.
- Pagination labels were clarified in the feed, profile, and notifications views so the UI now explicitly says there is no more content instead of feeling broken.

## Known nuances / follow-ups
- Username changes are intentionally not supported (users cannot rename their account after signup).
- Automated tests are not set up yet (only manual testing).
- The current vibrant glass style is strongest on the navbar, feed hero, composer, and post cards. Login, signup, search, notifications, profile detail surfaces, and admin can still be brought further into the same visual language.

## High-value next tasks
Pick one depending on your goal:

1) Add automated tests
- Server: add a minimal API test runner (e.g., Vitest/Jest + Supertest) and cover auth/friends/visibility/notifications.
- Optional: add Playwright/Cypress for a few end-to-end flows.

2) Notifications: more grouping/coalescing
- UI grouping beyond message notifications (e.g., likes/comments grouped by post).
- Optional server-side coalescing/rate limiting.

3) Advanced social UX
- Better post filtering, follow/muting, or richer profile sections.

## Testing checklist (manual)
- Auth: signup/login/logout/refresh
- Posts: create/edit/delete; set visibility; verify friends-only access rules
- Friends: request/accept/reject/cancel/unfriend; verify friends feed scope
- Notifications: receive friend request notifications; unread badge updates; auto-mark-read on open
- Admin: seed admin, load analytics, export JSON/CSV, run read-only SQL
