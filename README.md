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

- Profile-centric navigation (no main feed)
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

## How to Use (Quick Tour)

- **Explore**: Discover popular posts and suggested users. Click any username to visit a profile.
- **Create**: Upload a photo or paste an image URL, add a caption, then share. You are redirected to your profile and the post appears at the top of your grid.
- **Profile**: View user info, followers/following counts, and a grid of posts. Click any thumbnail to open the post detail modal.
- **Follow**: Follow requests must be accepted. Mutual follow is required to message.
- **Message**: Start a DM from a mutual follower’s profile or from search results.

## Notes

- Image uploads accept jpg/png/gif/webp up to 5MB and are stored under the local uploads/ folder.
- Session auth uses an HttpOnly cookie named session_user.
