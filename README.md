# Social Media App (SQLite + Node + React)

Demo-ready local social media app built with SQLite + Express + React + Tailwind.

Core features:
- Auth: signup/login with access + refresh tokens
- Feed: image posts via URLs, likes, comments
- Social: friends + friends-only feed scope
- Post visibility: `public` or `friends` (no `private`)
- Notifications: in-app notifications + unread badge
- Search: users + posts
- Admin: analytics dashboard + read-only SQL console
- UI: dark mode + polished design system
- Realtime: live updates for post/like/comment changes (Socket.IO)

## Prereqs
- Node.js 18+ recommended

## Quickstart (clone → seed → run)
1) Install deps: `npm install`
2) Seed demo data (wipes & resets the local DB): `npm -w server run seed:test`
3) Start both apps: `npm run dev`
   - API: http://localhost:4000
   - Web: http://localhost:5173

### Demo accounts
- Admin: `admin` / `admin123`
- Users: `seed_user01` … `seed_user10` / `password123`

## Seeding notes
- `npm -w server run seed:test` is intended for demos and is deterministic.
- By default it resets the database so each run starts from the same state.
- To keep existing data: `npm -w server run seed:test -- --no-force`
- Seeded content does not rely on external image URLs (offline-friendly).

## Setup (optional)
- Server env: copy `server/.env.example` → `server/.env` to customize secrets/ports.
- Client env: copy `client/.env.example` → `client/.env` to customize API/socket URLs.

## Scripts
- Dev (both): `npm run dev`
- Dev (server only): `npm run dev:server`
- Dev (client only): `npm run dev:client`
- Build: `npm run build`
- Lint: `npm run lint`

## Seed only an admin user (optional)
- `npm -w server run seed:admin`

## Key endpoints
- Auth: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`
- Me: `GET /api/me`, `PATCH /api/me`, `DELETE /api/me`
- Users (public profile): `GET /api/users/:username`
- Posts: `GET /api/posts/feed`, `POST /api/posts`, `PUT /api/posts/:id`, `DELETE /api/posts/:id`, `POST /api/posts/:id/like`
- Post detail: `GET /api/posts/:id`
- Comments: `GET /api/comments/post/:postId`, `POST /api/comments/post/:postId`
- Admin (admin-only): `GET /api/admin/analytics`, `POST /api/admin/sql`

## Profile editing
- Go to your profile at `/u/<yourUsername>`.
- If you're viewing your own profile, you'll see an **Edit profile** form.
- Username changes are intentionally not supported.

## Realtime
- Socket.IO server emits `event` messages for post/like/comment changes.

## Notes
- Server runs SQLite migrations automatically on startup (`server/src/db/migrate.ts`).
