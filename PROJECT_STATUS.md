# Project Status & Handoff

## Overview
This project is a simplified Instagram-style app built with:
- **Backend:** FastAPI + SQLite (`chat_app_ct.py`)
- **Frontend:** React + Vite + Tailwind (`frontend/`)
- **Auth:** HttpOnly cookie (`session_user`)
- **Storage:** Local filesystem for uploads (`uploads/`)

Core design: **profile-centric navigation**. No main feed; discovery happens through Explore and user profiles.

---

## Current Features Implemented

### 1) Core User Flows
- **Create Post:** upload image or paste image URL + caption → post saved → redirect to user’s profile → new post appears at top of their profile grid.
- **Profile Pages:** avatar, username, bio, follower/following counts, image-only post grid.
- **Post Detail Modal:** image, actions (like/comment/share/save icons), like count, caption, timestamp, comments, add comment box.
- **Explore Page:** popular posts (sorted by likes), suggested users, search bar filtering suggested list.
- **Activity Page:** placeholder UI (future notifications feed).

### 2) Social Graph
- **Follow Requests:** follow is request-based (accept/decline).
- **Mutual Follow:** required to start DMs or invite to group.
- **Mutual Badge:** shown in Friends list.

### 3) Messaging & Groups
- **DMs:** only possible with mutual followers. Created via `/dm/{username}` and stored as a hidden group (`dm:a:b`).
- **Group Chats:** members-only; invites restricted to mutual followers.
- **Group Members List:** visible in chat room; refreshes after invite.
- **WebSocket Chat:** `/ws?room=<room>` requires auth + membership.

### 4) Security & Validation
- **Session cookie** for auth.
- **Rate limiting** on write endpoints.
- **Input sanitization** for usernames, text, URLs.
- **CORS fixed** (credentials allowed; no wildcard origin).

---

## Backend API Summary (Key Endpoints)

### Auth
- `POST /auth/register` → create user + global group membership
- `POST /auth/login` → login + global group membership
- `POST /auth/logout`
- `GET /auth/me`

### Posts / Messages
- `POST /groups/{group}/messages` → create post/message (membership enforced)
- `GET /groups/{group}/messages` → list group messages (auth + membership enforced)
- `GET /feed` → requires auth; returns global/following feed

### Likes / Comments
- `POST /messages/{id}/like`
- `GET /messages/{id}/comments` (auth required)
- `POST /messages/{id}/comments`
- `DELETE /comments/{id}`

### Follows & Requests
- `POST /users/{username}/follow` → creates follow request
- `POST /users/{username}/unfollow` → remove follow + request
- `GET /follow/requests/incoming`
- `GET /follow/requests/outgoing`
- `POST /follow/requests/{username}/accept`
- `POST /follow/requests/{username}/decline`

### Users
- `GET /users` (search with `?query=`)
- `GET /users/{username}`
- `GET /users/{username}/messages` (user posts)
- `GET /users/{username}/followers`
- `GET /users/{username}/following`
- `PUT /users/{username}/profile`

### Groups / DMs
- `POST /groups` → create group
- `GET /groups` → only groups the user belongs to
- `POST /groups/{group}/members` → invite mutual follower
- `GET /groups/{group}/members` → list members
- `POST /dm/{username}` → create/get DM group

### Uploads
- `POST /upload` → accepts jpg/png/gif/webp ≤ 5MB
- Served via `/uploads/{filename}`

---

## Frontend Structure

### Navigation
- **Top Nav:** logo + auth buttons
- **Bottom Nav:** Explore, Search, Create, Activity, Profile

### Pages
- `Explore` → discover popular posts, suggested users
- `Create` → post creation
- `Profile` → profile info + grid + modals
- `Friends` (Search) → user search + follow requests + message
- `Messages` → list groups (auth required)
- `ChatRoom` → member list + invite + messages
- `Activity` → placeholder

### Components
- `PostGrid` → image grid
- `PostModal` → post detail overlay
- `PostComposer` → create post
- `PostCard` → legacy feed card (still used in some lists)
- `BottomNav`, `NavBar`

---

## Important Logic Decisions

1) **No main feed** — home is Explore.
2) **Profile-centric browsing** — every username links to profile.
3) **Mutual follow required** — for DMs and group invites.
4) **Follow requests** — must accept/decline.
5) **Group membership enforced** — all chat visibility is members-only.


## Recent Changes (2026-02-06)

- **Conversations abstraction added:** new DB tables `conversations` and `conversation_participants` to support DM and group threads uniformly.
- **Migration script:** `migrate_to_conversations.py` creates conversation rows for existing groups, migrates `group_members` -> `conversation_participants`, and updates messages to reference `conversation_id` where possible. A backup of the DB is created during migration.
- **Demo data updated:** `add_demo_data.py` now inserts conversation-backed demo content (group messages + DM conversations, comments, likes).
- **Backend endpoints added/updated:**
  - `GET /conversations` — list conversations for current user
  - `GET /conversations/{id}/messages` — list messages in a conversation (permission enforced)
  - `GET /conversations/{id}/participants` — list conversation participants
  - `POST /dm/{username}` — now creates/returns a DM `conversation` and links it to the created group entry (if any)
  - Existing group message endpoints and WebSocket persistence were updated to insert `conversation_id` when available and to enforce `conversation_participants` checks for likes/comments where applicable.
- **WebSocket:** `/ws?room=` now accepts `conversation:{id}` rooms; connections are validated against `conversation_participants`. Legacy `group` room names are still supported.
- **Frontend changes:** `frontend/src/pages/Messages.jsx`, `ChatRoom.jsx`, `Profile.jsx`, and `Friends.jsx` were updated to use the new conversation endpoints and to route DM opens to `conv:{id}` rooms (which map to `conversation:{id}` for websockets).
- **Branch & commits:** Changes are committed on branch `feature/profile-centric-instagram` and pushed to remotes. 
- **Next manual step:** run the migration (if not already run) then seed demo data; frontend requires running `npm run dev` and backend `uvicorn chat_app_ct:app` (see below).

---

## How to Run

### Backend
```
pip install -r requirements.txt
python3 chat_app_ct.py
```
Runs at http://localhost:8000

### Frontend
```
cd frontend
npm install
npm run dev
```
Runs at http://localhost:5173

### Smoke Test
```
python3 tests/smoke_test.py
```

---

## Known Gaps / Next Steps

- Activity feed (likes/comments/follows) not implemented beyond placeholder.
- Messages page doesn’t have 2‑pane DM UI.
- Post grid only shows image posts; text‑only posts appear as "No image" in grid.
- No notification badge or seen status in messages.

---

## Files Most Likely to Edit

- Backend: `chat_app_ct.py`
- Frontend:
  - `frontend/src/App.jsx`
  - `frontend/src/pages/Explore.jsx`
  - `frontend/src/pages/Profile.jsx`
  - `frontend/src/pages/Friends.jsx`
  - `frontend/src/pages/Messages.jsx`
  - `frontend/src/pages/ChatRoom.jsx`
  - `frontend/src/components/PostModal.jsx`
  - `frontend/src/components/PostGrid.jsx`

---

## Quick Architecture Summary
- **Data:** SQLite DB (`demo_chat_app.sqlite`)
- **Auth:** Cookie-based (`session_user`)
- **Uploads:** Local filesystem `uploads/`
- **Chat:** WebSockets + persisted messages in `messages` table

---

This file should allow another developer/AI to quickly understand the current state and continue development without digging through the codebase.