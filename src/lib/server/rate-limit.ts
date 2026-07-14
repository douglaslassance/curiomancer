/**
 * Minimal in-process, fixed-window rate limiter.
 *
 * Keyed by an arbitrary string (typically an IP, or `ip:email`). Each key gets
 * a rolling count that resets once its window elapses. Intended as a first line
 * of defense against brute-force and abuse on the auth and public endpoints,
 * not a distributed quota: the counters live in this process's memory, so with
 * multiple replicas the effective limit is per-replica. That's acceptable for
 * slowing password guessing and email/API spam; move to a shared store (Redis /
 * Postgres) if a hard global cap is ever required.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

/**
 * Record a hit against `key` and report whether it's within `limit` for the
 * current `windowMs` window. The first hit in a new window always passes.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	const bucket = buckets.get(key);

	if (!bucket || now >= bucket.resetAt) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { ok: true, retryAfterSec: 0 };
	}

	if (bucket.count >= limit) {
		return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
	}

	bucket.count++;
	return { ok: true, retryAfterSec: 0 };
}

// Evict expired buckets periodically so the Map doesn't grow without bound on a
// long-lived process. Unref'd so it never keeps the process alive on its own.
const SWEEP_MS = 10 * 60 * 1000;
const sweeper = setInterval(() => {
	const now = Date.now();
	for (const [key, bucket] of buckets) {
		if (now >= bucket.resetAt) buckets.delete(key);
	}
}, SWEEP_MS);
sweeper.unref?.();
