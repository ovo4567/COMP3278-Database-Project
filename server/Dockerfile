FROM node:18-bookworm-slim AS deps
WORKDIR /app

# sqlite3 may need native build tooling depending on platform/Node ABI.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

FROM node:18-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server ./server
COPY client ./client

RUN npm -w server run build

FROM node:18-bookworm-slim AS runner
ENV NODE_ENV=production

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server/package.json server/package.json

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/migrations ./server/migrations

# Keep TS sources + scripts so demo seeding can be run via:
#   docker compose run --rm server npm run seed:test
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/server/scripts ./server/scripts

RUN mkdir -p /app/server/data

WORKDIR /app/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
