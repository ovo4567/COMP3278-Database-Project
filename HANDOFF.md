# Project Handoff

## 1. Project Summary
This project is a demo-ready social media app built with:
- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Express + TypeScript
- Database: SQLite
- Realtime: Socket.IO

Main features currently implemented:
- User signup/login with access and refresh tokens
- Feed with categories, likes, comments, and collections
- Draft posts, scheduled posts, and quick edit flows
- Friends system with public/friends-only visibility
- Comment replies, likes, collections, and `@user` mention notifications
- Device session management with IP/location display
- Search for users and posts
- Admin dashboard and read-only SQL console
- Realtime updates for post/comment/like activity

## 2. Current Status
The project is in a runnable local demo state.

Main local entry points:
- API: `http://localhost:4000`
- Web: `http://localhost:5173`

This app targets local/demo use rather than production deployment.

## 3. Runtime Requirements
Required software:
- Node.js 18 or later
- npm
- A modern web browser

Optional software:
- Docker and Docker Compose

Possible native build requirement:
- Python 3, `make`, and a C/C++ compiler may be required when installing `sqlite3`

Environment and system requirements:
- `server/.env` must exist
- `client/.env` must exist
- Port `4000` should be available
- Port `5173` should be available
- The machine must allow local file creation and write access because SQLite is used for persistence

## 4. How To Run
### Local development
1. Install dependencies: `npm install`
2. Create env files:
   - `cp server/.env.example server/.env`
   - `cp client/.env.example client/.env`
3. Seed demo data: `npm -w server run seed:test`
4. Start both frontend and backend: `npm run dev`

### Docker
1. Optional seed: `docker compose run --rm server npm run seed:test`
2. Start containers: `docker compose up --build`

## 5. Demo Accounts
- Admin: `admin` / `admin123`
- Demo users: `seed_user01` to `seed_user10`
- Demo user password: `password123`

## 6. Important Repo Structure
- `client/`: React frontend
- `client/src/pages/`: page-level screens
- `client/src/components/`: reusable UI components
- `client/src/lib/`: frontend config, API helpers, realtime, types
- `server/`: Express backend
- `server/src/routes/`: API route handlers
- `server/src/db/`: SQLite connection and migration logic
- `server/src/services/`: backend helpers such as notifications, publish scheduler, and location formatting
- `server/src/realtime.ts`: Socket.IO setup
- `server/schema.sql`: consolidated database schema bootstrap
- `server/scripts/seedTestData.ts`: demo data seeding
- `scripts/dev.cjs`: starts server and client together in development

## 7. Database Schema
Core application tables:
- `users`
- `sessions`
- `posts`
- `likes`
- `comments`
- `friendships`
- `notifications`
- `post_collections`
- `post_views`
- `comment_likes`
- `comment_collections`

### Relationship summary
- `users` -> `sessions`: one-to-many via `sessions.user_id`
- `users` -> `posts`: one-to-many via `posts.user_id`
- `users` -> `comments`: one-to-many via `comments.user_id`
- `posts` -> `comments`: one-to-many via `comments.post_id`
- `users` <-> `posts` via `likes`: many-to-many
- `users` <-> `posts` via `post_collections`: many-to-many
- `users` <-> `comments` via `comment_likes`: many-to-many
- `users` <-> `comments` via `comment_collections`: many-to-many
- `users` <-> `users` via `friendships`: self-referencing many-to-many with canonical ordering
- `posts` -> `post_views`: one-to-many
- `notifications` belongs to a recipient user and optionally an actor user

### Important schema notes
- Usernames are case-insensitive at the DB level.
- The schema is consolidated into `server/schema.sql`.
- Native `CHECK` constraints now enforce:
  - `users.role`
  - `users.is_banned`
  - `friendships.status`
  - `posts.visibility`
  - `posts.category`
  - `posts.status`
  - post lifecycle validity
  - non-negative counters on posts/comments
  - `notifications.type`
  - `notifications.is_read`
- Comments now enforce same-post parent integrity through a composite foreign key.
- `post_views.viewer_session` now references `sessions(id)`.
- `notifications.entity_type` + `entity_id` remains polymorphic: validated, but not backed by a single strict FK to multiple target tables.

## 8. API Surface
Major backend areas:
- Auth: signup, login, refresh, logout
- Me: profile read/update/delete, device session list/remove
- Users: public profile read
- Posts: feed, user posts, post detail, post create/edit/delete, collections, manage list, per-post analytics
- Comments: list/create, like, collect
- Friends: list, incoming requests, sent requests, request/accept/reject/remove/cancel
- Notifications: list, unread count, mark read variants
- Search: users + posts
- Admin: analytics, SQL console, user moderation

## 9. Environment Variables
### Server
Important variables:
- `PORT`
- `CLIENT_ORIGIN`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ACCESS_TOKEN_TTL_SECONDS`
- `REFRESH_TOKEN_TTL_SECONDS`
- `SQLITE_PATH`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

### Client
Important variables:
- `VITE_API_BASE`
- `VITE_SOCKET_URL`

## 10. Database and Migration Notes
- SQLite is used for persistence.
- Schema initialization runs automatically when the backend starts.
- `server/schema.sql` is the single source of truth for fresh database initialization.
- This project no longer uses incremental SQL migration files.

## 11. Seeding Notes
- `npm -w server run seed:test` resets the local database by default.
- To avoid resetting existing data: `npm -w server run seed:test -- --no-force`
- Seeded posts use fixed category-matched image URLs.
- Seeded user avatars are mixed: some users have avatars, some do not.
- The seed is demo-oriented, not strictly deterministic. The content shape is stable, but timestamps and interactions are regenerated on each reset.

## 12. Known Gaps and Risks
- There is no automated test suite currently.
- Root `npm run lint` only lints the client, not the server.
- The project is optimized for local/demo use rather than production hardening.
- SQLite is not intended here for production-scale concurrent traffic.
- Notification entities are still polymorphic rather than strict typed foreign keys.
- Example auth secrets are development-only values.

## 13. Recommended First Tasks For the Next Maintainer
- Add backend linting and an automated test suite
- Add API-level regression tests for auth/session revocation, post visibility, collections, and scheduling
- Review whether notifications should remain polymorphic or move to explicit typed foreign keys
- Decide whether the app remains demo-only or should be hardened for deployment
- Add a deployment/release process if production use is expected

## 14. Suggested Ownership Checklist
The next maintainer should verify the following after setup:
- Local startup works
- Seed script works
- Login and signup work
- Feed create/read/update/delete works
- Draft and scheduled post flows work
- Friends-only visibility works
- Collections work
- Comment replies, likes, collections, and mentions work
- Device session removal works
- Notifications work
- Admin dashboard works
- Realtime updates work across two browser windows

## 15. Final Notes
Before making schema changes:
- Update `server/schema.sql`
- Test against a freshly seeded database

Before demoing:
- Reseed the database for a clean state
- Confirm the demo accounts still work
- Confirm the frontend is pointing to the correct backend URL
