# Social Media App (SQLite + Node + React)

Demo-ready local social media app built with SQLite + Express + React + Tailwind.

Core features:
- Auth: signup/login with access + refresh tokens
- Feed: public or friends-only posts with category filters
- Posts: create, edit, delete, save draft, schedule publish, quick edit
- Collections: collect/uncollect posts and view a personal collections page
- Comments: replies, likes, collections, `@user` mentions, realtime notifications
- Social: friendships + friends-only visibility
- Profiles: editable profile, post stats, friend state
- Notifications: in-app notifications + unread badge
- Search: users + posts
- Admin: analytics dashboard + read-only SQL console
- Realtime: live updates for post/like/comment changes (Socket.IO)
- Metadata: IP + formatted location shown on posts, comments, and device sessions

## Prereqs
- Node.js 18+ recommended
- npm
- A modern web browser

Possible native build requirement:
- Python 3, `make`, and a C/C++ compiler may be required on some systems when installing `sqlite3`

## Runtime Requirements
- `server/.env` must exist
- `client/.env` must exist
- Port `4000` should be available for the backend server
- Port `5173` should be available for the frontend development server
- The machine must allow local file creation and write access because the app uses SQLite for local storage

## Quickstart (clone -> setup -> seed -> run)
1. Install deps: `npm install`
2. Create env files:
   - `cp server/.env.example server/.env`
   - `cp client/.env.example client/.env`
3. Seed demo data (wipes and resets the local DB): `npm -w server run seed:test`
4. Start both apps: `npm run dev`
   - API: http://localhost:4000
   - Web: http://localhost:5173

## Docker
1. Optional seed: `docker compose run --rm server npm run seed:test`
2. Start containers: `docker compose up --build`
3. Open: http://localhost:5173

### Demo accounts
- Admin: `admin` / `admin123`
- Users: `seed_user01` ... `seed_user10` / `password123`

## Seeding notes
- `npm -w server run seed:test` is demo-oriented and resets the database by default.
- To keep existing data: `npm -w server run seed:test -- --no-force`
- Seeded posts use fixed image URLs chosen to match categories.
- Seeded users may or may not have avatar photos.
- The seed is not strictly deterministic: the structure is stable, but timestamps and interaction distribution are regenerated each reset.
- The SQLite data directory is created automatically on first run.

## Scripts
- Dev (both): `npm run dev`
- Dev (server only): `npm run dev:server`
- Dev (client only): `npm run dev:client`
- Build: `npm run build`
- Lint: `npm run lint`
- Seed demo data: `npm -w server run seed:test`
- Seed admin only: `npm -w server run seed:admin`

## Repo structure
- `client/`: React frontend
- `client/src/pages/`: page-level screens such as feed, profile, collections, admin, and post editor
- `client/src/components/`: reusable UI components
- `client/src/lib/`: frontend config, API helpers, realtime, types
- `server/`: Express backend
- `server/src/routes/`: API route handlers
- `server/src/db/`: SQLite connection and migration logic
- `server/src/services/`: backend service helpers
- `server/src/realtime.ts`: Socket.IO setup
- `server/schema.sql`: consolidated database schema bootstrap
- `server/scripts/seedTestData.ts`: demo data seeding
- `scripts/dev.cjs`: starts server and client together in development

## Database Schema
Core tables:
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
- `users` -> `sessions`: one-to-many through `sessions.user_id`
- `users` -> `posts`: one-to-many through `posts.user_id`
- `users` -> `comments`: one-to-many through `comments.user_id`
- `posts` -> `comments`: one-to-many through `comments.post_id`
- `users` <-> `posts` through `likes`: many-to-many
- `users` <-> `posts` through `post_collections`: many-to-many
- `users` <-> `comments` through `comment_likes`: many-to-many
- `users` <-> `comments` through `comment_collections`: many-to-many
- `users` <-> `users` through `friendships`: self-referencing many-to-many using a canonical user pair
- `posts` -> `post_views`: one-to-many
- `notifications` belongs to a recipient user and optionally an actor user

### Important schema notes
- Usernames are stored and enforced case-insensitively.
- The schema is consolidated into `server/schema.sql`.
- Core enum-like fields now have DB-level `CHECK` constraints, including:
  - `users.role`
  - `posts.visibility`
  - `posts.category`
  - `posts.status`
  - `friendships.status`
  - `notifications.type`
- Post lifecycle rules are enforced in the DB:
  - drafts cannot have publish timestamps
  - scheduled posts must have `scheduled_publish_at`
  - published posts must have `published_at`
  - scheduled/published posts must contain text or an image URL
- Comment reply integrity is enforced with a composite foreign key so a parent comment must belong to the same post.
- `notifications.entity_type` + `entity_id` is still polymorphic, so it is validated by constraints but not backed by a strict FK to multiple target tables.

### Key columns by table
- `users`: account/profile fields, `role`, `status_text`, `is_banned`
- `sessions`: refresh-session state, device metadata, IP, country, region, city
- `posts`: body, image URL, visibility, category, status, scheduling/publish timestamps, counters, IP/location metadata
- `comments`: body, optional parent comment, like/collect counters, IP/location metadata
- `notifications`: recipient, actor, type, optional polymorphic entity reference, read state

## Key endpoints
- Auth:
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
- Me:
  - `GET /api/me`
  - `PATCH /api/me`
  - `GET /api/me/devices`
  - `DELETE /api/me/devices/:sessionId`
  - `DELETE /api/me`
- Users:
  - `GET /api/users/:username`
- Posts:
  - `GET /api/posts/feed`
  - `GET /api/posts/user/:username`
  - `GET /api/posts/:id`
  - `GET /api/posts/:id/manage`
  - `GET /api/posts/:id/analytics`
  - `GET /api/posts/mine/manage`
  - `GET /api/posts/collections/mine`
  - `POST /api/posts`
  - `PUT /api/posts/:id`
  - `DELETE /api/posts/:id`
  - `POST /api/posts/:id/like`
  - `POST /api/posts/:id/collect`
- Comments:
  - `GET /api/comments/post/:postId`
  - `POST /api/comments/post/:postId`
  - `POST /api/comments/:id/like`
  - `POST /api/comments/:id/collect`
- Friends:
  - `GET /api/friends`
  - `GET /api/friends/requests`
  - `GET /api/friends/requests/sent`
  - `POST /api/friends/request/:userId`
  - `PUT /api/friends/request/:userId/accept`
  - `PUT /api/friends/request/:userId/reject`
- Notifications:
  - `GET /api/notifications`
  - `GET /api/notifications/unread-count`
  - `POST /api/notifications/read`
  - `POST /api/notifications/read-all`
  - `POST /api/notifications/read-by-entity`
- Admin:
  - `GET /api/admin/analytics`
  - `POST /api/admin/sql`

## Profile editing
- Go to `/u/<yourUsername>`.
- If you are viewing your own profile, you can edit `displayName`, `status`, `bio`, and `avatarUrl`.
- Username changes are intentionally not supported.

## Realtime
- Socket.IO emits `event` messages for post creation, post updates, post deletion, likes, and comment creation.
- Notification pushes are emitted to the recipient user's room.

## Database and migration notes
- SQLite is used for persistence.
- The server initializes the schema automatically on startup via `server/src/db/migrate.ts`.
- `server/schema.sql` is the single source of truth for fresh database initialization.
- This project no longer uses incremental SQL migration files.

## Known gaps and risks
- There is no automated test suite yet.
- Root `npm run lint` only lints the client, not the server.
- The app is optimized for local/demo use rather than production deployment.
- SQLite is convenient here but not intended for high-concurrency production traffic.
- Example auth secrets are development-only values.

## Notes
- Server code: `server/src/`
- Client code: `client/src/`
- Schema: `server/schema.sql`
