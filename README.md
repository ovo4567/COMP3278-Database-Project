<h1 align="center">COMP3278 Social Media Demo</h1>

## Project App (Instagram-style)

This folder contains a FastAPI backend and a React (Vite) frontend.

This is a lightweight local project—no Docker or cloud setup required.

## Download & Run Locally

### 1) Clone the repository

```bash
git clone https://github.com/CordyZZZ/COMP3278-GP.git
cd COMP3278-GP
```

### 2) Backend setup

```bash
pip install -r requirements.txt
python3 "chat_app_ct.py"
```

Backend runs at http://localhost:8000

### 3) Frontend setup

```bash
cd "frontend"
npm install
npm run dev
```

Frontend runs at http://localhost:5173

### 4) Optional smoke test

```bash
python3 "tests/smoke_test.py"
```

## Features Implemented

- Cinematic UI (glassmorphism, neon accents, smooth page + modal transitions)
- Profile-centric navigation (Explore is the home view)
- Create post (image upload or image URL + caption) → redirects to your profile
- Profile pages with avatar, bio, counts, and image grid
- Post detail modal with likes and comments
- Follow requests (accept/decline), mutual-follow badges
- Direct messages only between mutual followers
- Group chat with member invites (mutual followers only)
- Explore page with popular posts and suggested users
- Activity page placeholder
- Session auth with HttpOnly cookie
- Rate limiting and input sanitization
- Skeleton loading states and micro‑interactions

## How to Use (Quick Tour)

- **Explore**: Discover popular posts and suggested users. Click any username to visit a profile.
- **Create**: Upload a photo or paste an image URL, add a caption, then share. You are redirected to your profile and the post appears at the top of your grid.
- **Profile**: View user info, followers/following counts, and a grid of posts. Click any thumbnail to open the post detail modal.
- **Follow**: Follow requests must be accepted. Mutual follow is required to message.
- **Message**: Start a DM from a mutual follower’s profile or from search results.

## Backend Structure (FastAPI)

Single service file: `chat_app_ct.py`

### Layers
- **DB init + migrations**: creates SQLite schema and backfills missing columns on startup.
- **REST endpoints**: auth, users, follows, feed, posts, comments, likes, groups, conversations.
- **WebSockets**: `/ws?room=` supports `conversation:{id}` (preferred) and legacy group rooms.
- **Uploads**: stored under `uploads/` and served at `/uploads/{filename}`.

### Key Endpoints
- **Auth**: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- **Users**: `GET /users`, `GET /users/{username}`, `PUT /users/{username}/profile`
- **Posts**: `POST /groups/{group}/messages`, `GET /groups/{group}/messages`, `GET /feed`
- **Likes/Comments**: `POST /messages/{id}/like`, `GET/POST /messages/{id}/comments`, `DELETE /comments/{id}`
- **Follows**: `/users/{username}/follow`, `/users/{username}/unfollow`, request accept/decline
- **Conversations**: `GET /conversations`, `GET /conversations/{id}/messages`, `GET /conversations/{id}/participants`
- **Uploads**: `POST /upload`

## Database Structure (SQLite)

Core tables (simplified):

- **users**: `id`, `username`, `display_name`, `avatar_url`, `password_hash`, `created_at`
- **user_profiles**: `user_id`, `bio`, `website`, `location`
- **groups**: `id`, `name`, `description`, `conversation_id`, `created_at`
- **group_members**: `group_id`, `user_id`, `role`, `joined_at`
- **messages**: `id`, `group_id`, `conversation_id`, `user_id`, `content`, `image_url`, `created_at`
- **conversations**: `id`, `type` (`dm`/`group`), `title`, `metadata`, `created_at`, `last_activity_at`
- **conversation_participants**: `conversation_id`, `user_id`, `role`, `last_read_at`
- **message_likes**: `message_id`, `user_id`, `created_at`
- **comments**: `message_id`, `user_id`, `content`, `created_at`
- **follows**: `follower_id`, `followee_id`, `created_at`
- **follow_requests**: `requester_id`, `target_id`, `created_at`

Notes:
- DMs and group chats are unified via the **conversations** abstraction.
- Uploaded images are stored locally and returned as absolute URLs for the frontend.

## Notes

- Image uploads accept jpg/png/gif/webp up to 5MB and are stored under the local uploads/ folder.
- Session auth uses an HttpOnly cookie named session_user.
