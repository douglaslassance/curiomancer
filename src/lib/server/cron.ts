import cron from 'node-cron';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { snapshotActiveUsers } from './metrics';

let started = false;

// Arbitrary but stable key for the Postgres advisory lock that serializes the
// snapshot across replicas. Change it only if it ever collides with another
// advisory lock in this database.
const SNAPSHOT_LOCK_KEY = 728_413;

/**
 * Start the in-process daily metrics cron. We run on the same node server
 * (adapter-node) rather than a separate worker - simplest for a single
 * instance. The daily job captures active-user counts into `metric_snapshot`.
 *
 * Guarded by `started` so repeated imports / dev HMR don't stack schedules
 * within a process. Across replicas, each process schedules its own timer, so
 * the job itself takes a Postgres advisory lock and only the winner runs it -
 * the snapshot is already an idempotent upsert, but the lock also keeps any
 * future non-idempotent cron work from double-firing. Also fires once at boot
 * so a freshly deployed process has today's row without waiting until midnight.
 */
export function startMetricsCron(): void {
	if (started) return;
	started = true;

	// 00:10 UTC daily. Keyed on the DB's CURRENT_DATE.
	cron.schedule('10 0 * * *', runSnapshot, { timezone: 'UTC' });
	// Catch-up run so today's row exists after a restart/deploy.
	void runSnapshot();
}

async function runSnapshot(): Promise<void> {
	try {
		await db.transaction(async (tx) => {
			// Transaction-scoped advisory lock: auto-released on commit, and any
			// other replica trying at the same time gets `false` and skips.
			const rows = await tx.execute<{ locked: boolean }>(
				sql`SELECT pg_try_advisory_xact_lock(${SNAPSHOT_LOCK_KEY}) AS locked`
			);
			if (!rows[0]?.locked) {
				console.log('[metrics] snapshot claimed by another instance, skipping');
				return;
			}
			const counts = await snapshotActiveUsers();
			console.log('[metrics] daily snapshot captured', counts);
		});
	} catch (err) {
		console.error('[metrics] daily snapshot failed:', err);
	}
}
