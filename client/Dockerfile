FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules
COPY package.json package-lock.json ./
COPY client ./client
COPY server ./server

ARG VITE_API_BASE="http://localhost:4000"
ARG VITE_SOCKET_URL="http://localhost:4000"
RUN VITE_API_BASE="$VITE_API_BASE" VITE_SOCKET_URL="$VITE_SOCKET_URL" npm -w client run build

FROM nginx:1.27-alpine AS runner
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
