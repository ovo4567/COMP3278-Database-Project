# Client (Vite + React + Tailwind)

This is the web UI for the social media app.

## Run (from repo root)
- Dev server: `npm run dev:client`
- Build: `npm -w client run build`
- Lint: `npm -w client run lint`

## Environment (optional)
Create `client/.env` (or copy from `client/.env.example`) to override defaults:
- `VITE_API_BASE` (default: `http://localhost:4000`)
- `VITE_SOCKET_URL` (default: `http://localhost:4000`)

## Notes
- Dark mode is supported via the theme toggle in the navbar.
- Realtime updates come from Socket.IO (`event` for post/like/comment changes).

