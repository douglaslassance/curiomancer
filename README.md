# Curiomancer

Taste-based place recommendations (shops, bars, restaurants). SvelteKit + Postgres, deployed on Coolify (Hetzner) behind Cloudflare.

## Local development

```
cp .env.example .env   # fill in the values you need
pnpm install
pnpm db:migrate
pnpm dev
```

Optional integrations stay off until their keys are set: PostHog (analytics), Sentry (errors), Stripe (billing). See `.env.example` for the full list.

## Deploying

Push to `main`; Coolify builds and deploys. Set secrets as env vars on the Coolify app, never in the repo. Apply pending DB migrations to production (`pnpm db:migrate` against the prod `DATABASE_URL`) as part of the deploy.

### Going live with Stripe

`STRIPE_*` are runtime vars, so set them in Coolify and restart the app (no rebuild needed). Billing stays disabled until `STRIPE_SECRET_KEY` is present.

In the Stripe dashboard, in **Live mode**:

1. Activate the account (business details + payout bank).
2. Create a product **"Subscription"**, recurring **$4.99/month USD**; note the price id.
3. Create a **restricted key** (`rk_live_`) with **write** on Checkout Sessions, Customers, Billing Portal Sessions, Subscriptions and **read** on Prices, Products.
4. Add a webhook to `https://curiomancer.com/api/stripe/webhook` for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`; note the signing secret.
5. Activate the **Customer Portal** (the test-mode config does not carry over to live).

Then set in Coolify and restart:

- `STRIPE_SECRET_KEY` (the `rk_live_` key)
- `STRIPE_PRICE_ID` (the live price id)
- `STRIPE_WEBHOOK_SECRET` (the webhook signing secret)
- `ORIGIN=https://curiomancer.com` (checkout redirect URLs derive from it)

Cloudflare: make sure `/api/stripe/webhook` isn't challenged by Bot Fight Mode or a WAF rule, or Stripe's deliveries will fail silently. Watch the webhook's delivery log in the dashboard after launch.
