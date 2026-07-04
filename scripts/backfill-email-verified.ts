/**
 * One-time grandfather script: marks every existing user as email-verified.
 *
 * Run this once, before deploying the emailAndPassword.requireEmailVerification
 * change (src/lib/server/auth.ts) - otherwise every current user gets locked
 * out of sign-in the next time they try (email_verified defaults to false).
 * New sign-ups after that deploy go through the real verification flow.
 *
 * Run with: pnpm backfill:email-verified
 *
 * Self-contained connection (like seed.ts) because src/lib/server/db reads
 * DATABASE_URL through SvelteKit's $env alias, which only exists inside the
 * app runtime.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = postgres(url);
const db = drizzle(client);

const result = await db.execute(sql`
	UPDATE "user" SET email_verified = true WHERE email_verified = false
`);

console.log(`[backfill] marked ${result.count ?? 0} existing user(s) as email-verified`);
await client.end();
