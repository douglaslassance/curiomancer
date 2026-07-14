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

# PostHog (optional) - set these as Coolify build variables to enable
ARG PUBLIC_POSTHOG_PROJECT_TOKEN
ARG PUBLIC_POSTHOG_HOST
ENV PUBLIC_POSTHOG_PROJECT_TOKEN=$PUBLIC_POSTHOG_PROJECT_TOKEN
ENV PUBLIC_POSTHOG_HOST=$PUBLIC_POSTHOG_HOST

# SvelteKit's build-time route analysis imports hooks.server.ts, which pulls
# in the db client and constructs the better-auth instance. Neither actually
# runs a query or serves a request during the build, so these placeholders
# just need to satisfy module-load-time validation. The real values are
# supplied at runtime.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV BETTER_AUTH_SECRET=build-time-placeholder-secret-do-not-use-in-prod

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

# Drop root: the node images ship an unprivileged `node` user. Own /app by it
# so the runtime process (and tsx's cache under $HOME) has what it needs.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Let the orchestrator tell a wedged process from a healthy one. `/` is public
# (served to signed-out visitors), so a 200 means the server is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
	CMD curl -fsS http://localhost:3000/ || exit 1

CMD ["sh", "-c", "node migrate.mjs && pnpm start"]
