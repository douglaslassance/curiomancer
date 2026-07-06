FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Sentry source map upload (optional) - set these as Coolify build variables,
# same as the app's other PUBLIC_* build-time vars, to enable it.
ARG PUBLIC_SENTRY_DSN
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV PUBLIC_SENTRY_DSN=$PUBLIC_SENTRY_DSN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

RUN pnpm build

# ─── Runtime image ────────────────────────────────────────────────────────────

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl && corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/src/lib/server/ws ./src/lib/server/ws
COPY migrate.mjs server.ts ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "node migrate.mjs && pnpm start"]
