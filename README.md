# Social Media App (SQLite + Node + React)

Demo-ready local social media app built with SQLite + Express + React + Tailwind.

Core features:
- Auth: signup/login with access + refresh tokens
- Feed: image posts via URLs, likes, comments
- Social: friends + friends-only feed scope
- Post visibility: `public` or `friends` (no `private`)
- Post categories: `all`, `food`, `studies`, `jobs`, `travel`, `others`
- Notifications: in-app notifications + unread badge
- Search: users + posts
- Admin: analytics dashboard + read-only SQL console
- UI: dark mode + polished design system
- Realtime: live updates for post/like/comment changes (Socket.IO)

## Prereqs
- Node.js 18+ recommended

## Runtime Requirements
This project is intended to run on common desktop operating systems including macOS, Linux, and Windows, provided that the required tooling is installed. Cross-platform compatibility is expected, but it should not be treated as guaranteed on every environment without verification.

Required software:
- Node.js 18 or later
- npm
- A modern web browser

Optional software:
- Docker and Docker Compose, if running the containerized setup instead of local Node.js processes

Possible build tooling requirement:
- Python 3, `make`, and a C/C++ compiler may be required on some systems when installing the `sqlite3` dependency from source

Environment requirements:
- `server/.env` must be configured
- `client/.env` must be configured
- Required server and client environment variables must be set correctly

System requirements:
- Port `4000` should be available for the backend server
- Port `5173` should be available for the frontend development server
- The machine must allow local file creation and write access because the application uses SQLite for local database storage

Functional capability requirements:
- The backend server must be able to start and run migrations
- The frontend must be able to connect to the backend API
- The frontend must be able to connect to the Socket.IO realtime service
- The application must be able to read from and write to the local SQLite database

## Quickstart (clone → setup → seed → run)
1) Install deps: `npm install`
2) Seed demo data (wipes & resets the local DB): `npm -w server run seed:test`
3) Start both apps: `npm run dev`
   - API: http://localhost:4000
   - Web: http://localhost:5173

## Docker (easiest for others)
1) (Optional) Seed demo data (wipes & resets the DB volume): `docker compose run --rm server npm run seed:test`
2) Start containers: `docker compose up --build`
3) Open: http://localhost:5173

### Demo accounts
- Admin: `admin` / `admin123`
- Users: `seed_user01` … `seed_user10` / `password123`

## Seeding notes
- `npm -w server run seed:test` is intended for demos and is deterministic.
- By default it resets the database so each run starts from the same state.
- To keep existing data: `npm -w server run seed:test -- --no-force`
- Seeded posts use fixed image URLs for stable demo content.
 - The SQLite data directory is created automatically on first run.

## Scripts
- Dev (both): `npm run dev`
- Dev (server only): `npm run dev:server`
- Dev (client only): `npm run dev:client`
- Build: `npm run build`
- Lint: `npm run lint`

## Seed only an admin user (optional)
- `npm -w server run seed:admin`

## Database Schema
Core application tables:

### Table Relationships
- `users` -> `sessions`: one-to-many through `sessions.user_id` with `ON DELETE CASCADE`
- `users` -> `posts`: one-to-many through `posts.user_id` with `ON DELETE CASCADE`
- `users` -> `comments`: one-to-many through `comments.user_id` with `ON DELETE CASCADE`
- `posts` -> `comments`: one-to-many through `comments.post_id` with `ON DELETE CASCADE`
- `users` <-> `posts` through `likes`: many-to-many using composite primary key (`user_id`, `post_id`) with `ON DELETE CASCADE`
- `users` <-> `users` through `friendships`: self-referencing many-to-many using (`user_id1`, `user_id2`); `action_user_id` is a nullable reference to the user who last acted on the friendship
- `users` -> `notifications`: one-to-many through `notifications.user_id` with `ON DELETE CASCADE`
- `users` -> `notifications` as actor: one-to-many through `notifications.actor_user_id` with `ON DELETE SET NULL`
- `migrations` is standalone and used only for schema version tracking

### `users`
Stores account and profile data.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER | Primary key |
| `username` | TEXT | Unique, required |
| `password_hash` | TEXT | Required |
| `role` | TEXT | Defaults to `user` |
| `display_name` | TEXT | Nullable |
| `bio` | TEXT | Nullable |
| `avatar_url` | TEXT | Nullable |
| `created_at` | TEXT | Defaults to current timestamp |
| `status_text` | TEXT | Nullable |
| `is_banned` | INTEGER | Defaults to `0` |

### `sessions`
Stores refresh-session state for authenticated users.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT | Primary key |
| `user_id` | INTEGER | Foreign key to `users.id` |
| `refresh_token_hash` | TEXT | Required |
| `created_at` | TEXT | Defaults to current timestamp |
| `last_used_at` | TEXT | Defaults to current timestamp |
| `expires_at` | TEXT | Required |
| `user_agent` | TEXT | Nullable |
| `ip` | TEXT | Nullable |

### `posts`
Stores user-created posts.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER | Primary key |
| `user_id` | INTEGER | Foreign key to `users.id` |
| `text` | TEXT | Required |
| `image_url` | TEXT | Nullable |
| `like_count` | INTEGER | Defaults to `0` |
| `created_at` | TEXT | Defaults to current timestamp |
| `updated_at` | TEXT | Nullable |
| `visibility` | TEXT | Defaults to `public`; used for access control |
| `category` | TEXT | Defaults to `all`; used for feed/category filtering |

### `likes`
Associative table between users and posts.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | INTEGER | Composite primary key, foreign key to `users.id` |
| `post_id` | INTEGER | Composite primary key, foreign key to `posts.id` |
| `created_at` | TEXT | Defaults to current timestamp |

### `comments`
Stores comments on posts.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER | Primary key |
| `post_id` | INTEGER | Foreign key to `posts.id` |
| `user_id` | INTEGER | Foreign key to `users.id` |
| `text` | TEXT | Required |
| `created_at` | TEXT | Defaults to current timestamp |

### `friendships`
Stores friendship requests and accepted relationships between user pairs.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id1` | INTEGER | Composite primary key, foreign key to `users.id` |
| `user_id2` | INTEGER | Composite primary key, foreign key to `users.id` |
| `status` | TEXT | Defaults to `pending`; valid values are `pending`, `accepted`, `rejected` |
| `action_user_id` | INTEGER | Nullable foreign key to `users.id` |
| `created_at` | TEXT | Defaults to current timestamp |
| `updated_at` | TEXT | Nullable |

### `notifications`
Stores in-app notification records.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER | Primary key |
| `user_id` | INTEGER | Foreign key to `users.id`; notification recipient |
| `type` | TEXT | Required |
| `actor_user_id` | INTEGER | Nullable foreign key to `users.id` |
| `entity_type` | TEXT | Nullable polymorphic reference type |
| `entity_id` | INTEGER | Nullable polymorphic reference id |
| `is_read` | INTEGER | Defaults to `0` |
| `created_at` | TEXT | Defaults to current timestamp |

### `migrations`
Tracks which schema migrations have already been applied.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INTEGER | Primary key |
| `name` | TEXT | Unique, required |
| `applied_at` | TEXT | Defaults to current timestamp |

Schema notes:
- Primary keys:
  - `users.id`
  - `sessions.id`
  - `posts.id`
  - `comments.id`
  - `notifications.id`
  - `migrations.id`
  - composite primary key on `likes(user_id, post_id)`
  - composite primary key on `friendships(user_id1, user_id2)`
- Unique constraints:
  - `users.username`
  - `migrations.name`
- Foreign keys are enabled in SQLite and most child rows use `ON DELETE CASCADE`
- `friendships` enforces one row per user pair using `CHECK (user_id1 < user_id2)`
- `friendships.status` is restricted to `pending`, `accepted`, or `rejected`
- `notifications.entity_type` and `entity_id` are polymorphic references and are not strict foreign keys

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
