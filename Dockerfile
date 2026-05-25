FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ─── Runtime image ────────────────────────────────────────────────────────────

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl && corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle
COPY migrate.mjs ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "node migrate.mjs && node build/index.js"]
