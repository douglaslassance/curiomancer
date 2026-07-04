# PostHog post-wizard report

The wizard has completed a full PostHog integration for Curiomancer. The following changes were made:

- **`src/hooks.client.ts`** (new) - Initializes PostHog in the browser via the SvelteKit `init` hook and captures client-side exceptions via `handleError`.
- **`src/lib/server/posthog.ts`** (new) - Singleton PostHog Node.js client used by all server-side event capture.
- **`src/hooks.server.ts`** - Added a reverse proxy under `/ingest` to route PostHog requests through the app (bypasses ad blockers) and added `handleError` to capture server-side exceptions.
- **`svelte.config.js`** - Set `paths.relative: false`, required for session replay to work correctly with SSR.
- **`src/routes/+layout.svelte`** - Added `posthog.identify()` on every page load when a user is logged in (and `posthog.reset()` on logout), so both fresh sign-ins and returning sessions are attributed correctly.
- **`src/routes/rate/+page.svelte`** - Added `place_skipped` event when a user skips a place in the quick-rate flow.
- **`src/routes/sign-in/+page.server.ts`** - Captures `user_signed_in` after a successful email sign-in.
- **`src/routes/sign-up/+page.server.ts`** - Captures `user_signed_up` after invite redemption succeeds.
- **`src/routes/sign-out/+page.server.ts`** - Captures `user_signed_out` before the session is cleared.
- **`src/routes/api/location/+server.ts`** - Captures `location_updated` with city and country after the user's location is set.
- **`src/routes/api/relations/+server.ts`** - Captures `place_rated` with place ID and relation kind after a rating is saved.
- **`src/routes/api/places/+server.ts`** - Captures `place_added` with place metadata after a new Apple Maps POI is ingested and rated.
- **`src/routes/api/follow/[id]/+server.ts`** - Captures `user_followed` and `user_unfollowed` with the target user ID.
- **`src/routes/settings/+page.server.ts`** - Captures `profile_updated` on name changes and `api_token_created` when a new API token is issued.

Environment variables `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST` were added to `.env`.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | New user registered via invite-gated signup | `src/routes/sign-up/+page.server.ts` |
| `user_signed_in` | User authenticated with email and password | `src/routes/sign-in/+page.server.ts` |
| `user_signed_out` | User ended their session | `src/routes/sign-out/+page.server.ts` |
| `location_updated` | User set or updated their current city location | `src/routes/api/location/+server.ts` |
| `place_rated` | User set a relation on a known place | `src/routes/api/relations/+server.ts` |
| `place_added` | User rated a new Apple Maps POI, creating it in the DB | `src/routes/api/places/+server.ts` |
| `place_skipped` | User skipped a place in the quick-rate flow | `src/routes/rate/+page.svelte` |
| `user_followed` | User started following another user | `src/routes/api/follow/[id]/+server.ts` |
| `user_unfollowed` | User unfollowed another user | `src/routes/api/follow/[id]/+server.ts` |
| `invite_created` | Not tracked (invites are pre-generated at signup, not created on demand) | - |
| `api_token_created` | User created a new API token | `src/routes/settings/+page.server.ts` |
| `profile_updated` | User changed their display name | `src/routes/settings/+page.server.ts` |

## Next steps

A dashboard and five insights have been created in PostHog:

- [Analytics basics (wizard) dashboard](https://us.posthog.com/project/496883/dashboard/1797888)
- [New signups over time](https://us.posthog.com/project/496883/insights/NXuVtAYn) - monthly signup count for the last 90 days
- [Weekly active users](https://us.posthog.com/project/496883/insights/z6O6Hbog) - distinct users signing in per week
- [Place ratings per day](https://us.posthog.com/project/496883/insights/jySM3iBq) - daily rating volume (known + new places)
- [Signup activation funnel](https://us.posthog.com/project/496883/insights/3MJfv5lk) - signed up -> set location -> first rating
- [Social connections (follows)](https://us.posthog.com/project/496883/insights/Ka76oTvI) - weekly follow activity

## Verify before merging

- [ ] Run a full production build (`pnpm build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite - call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST` to `.env.example` and any bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` - the layout effect handles this, but verify it fires correctly on a page refresh with an active session.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-sveltekit/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
