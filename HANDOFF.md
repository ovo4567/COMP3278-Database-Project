# Handoff (for next AI agent)

## What this repo is
- Monorepo (npm workspaces): `server/` (Express + TypeScript + SQLite) + `client/` (Vite React TS + Tailwind)
- Current state: full local social app with posts/likes/comments, **friend system**, **post visibility** (`public|friends|private`), **realtime chat + DMs**, **in-app notifications**, **search**, **admin analytics + read-only SQL console**, and **dark mode**.

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
  - Optional: `FRIENDS_ONLY_DM=true` to restrict starting new DMs to friends only (enforced in `server/src/routes/chat.ts`)
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
  - `002_chat.sql`: chat groups/members/invites/messages
  - `003_chat_dm.sql`: DM mapping table
  - `004_user_status.sql`: adds `users.status_text`
  - `005_user_ban.sql`: adds user ban flag (admin moderation support)
  - `006_friendships.sql`: friendships table (requests + accepted + rejected)
  - `007_post_visibility_notifications.sql`: posts visibility + notifications table

### Realtime (Socket.IO)
- Server: `server/src/realtime.ts`
- Socket auth: client passes access token via `socket.handshake.auth.token`
- Rooms:
  - Chat: `group:<id>`
  - Per-user notifications: `user:<id>`
- Events:
  - Social feed: `event` (post/like/comment changes)
  - Chat messages: `chat:event`
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
- `POST /api/posts` (supports `visibility: public|friends|private`)
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
- `POST /api/notifications/read-by-entity` (used for auto-mark-read when opening a post/chat)

### Search
- `GET /api/search?q=...&limit=..` (users + posts)

### Chat
- `GET /api/chat/groups/public`
- `GET /api/chat/groups/mine`
- `GET /api/chat/groups/invites`
- `POST /api/chat/groups`
- `POST /api/chat/groups/:id/join`
- `POST /api/chat/groups/:id/leave`
- `POST /api/chat/groups/:id/invite` (private groups; group-admin only)
- `GET /api/chat/groups/:id/messages`
- `POST /api/chat/dm/:username` (may be blocked when `FRIENDS_ONLY_DM=true`)

### Admin (admin-only)
- `GET /api/admin/analytics?days=7|30|90|365`
- `POST /api/admin/sql` (read-only console)
- `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id`, `DELETE /api/admin/users/:id` (moderation)

## Important UI files
- Routing + session bootstrap + unread badge: `client/src/App.tsx`
- Navigation (theme toggle + unread badge): `client/src/components/NavBar.tsx`
- Feed: `client/src/pages/FeedPage.tsx`
- Post detail: `client/src/pages/PostPage.tsx`
- Profile (includes friend actions + friends pagination): `client/src/pages/ProfilePage.tsx`
- Chat: `client/src/pages/ChatPage.tsx`
- Notifications inbox: `client/src/pages/NotificationsPage.tsx`
- Search page: `client/src/pages/SearchPage.tsx`
- Admin dashboard: `client/src/pages/AdminPage.tsx`

## Known nuances / follow-ups
- Username changes are intentionally not supported (users cannot rename their account after signup).
- Automated tests are not set up yet (only manual testing).

## High-value next tasks
Pick one depending on your goal:

1) Add automated tests
- Server: add a minimal API test runner (e.g., Vitest/Jest + Supertest) and cover auth/friends/visibility/notifications.
- Optional: add Playwright/Cypress for a few end-to-end flows.

2) Notifications: more grouping/coalescing
- UI grouping beyond message notifications (e.g., likes/comments grouped by post).
- Optional server-side coalescing/rate limiting.

3) Advanced chat UX
- Presence/typing/unread per thread (currently not implemented as a full feature).

## Testing checklist (manual)
- Auth: signup/login/logout/refresh
- Posts: create/edit/delete; set visibility; verify friends-only and private access rules
- Friends: request/accept/reject/cancel/unfriend; verify friends feed scope
- Notifications: receive friend request + message notifications; unread badge updates; auto-mark-read on open
- Chat: create group, join, send messages realtime; private invite flow; DM start (and friends-only DM behavior if enabled)
- Admin: seed admin, load analytics, export JSON/CSV, run read-only SQL
