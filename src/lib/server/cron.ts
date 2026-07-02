import cron from 'node-cron';
import { snapshotActiveUsers } from './metrics';

let started = false;

/**
 * Start the in-process daily metrics cron. We run on the same node server
 * (adapter-node) rather than a separate worker - simplest for a single
 * instance. The daily job captures active-user counts into `metric_snapshot`.
 *
 * Guarded by `started` so repeated imports / dev HMR don't stack schedules.
 * The snapshot is idempotent (upsert on day), so even if two instances ever
 * run it, the result is the same. Also fires once at boot so a freshly
 * deployed process has today's row without waiting until midnight.
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
		const counts = await snapshotActiveUsers();
		console.log('[metrics] daily snapshot captured', counts);
	} catch (err) {
		console.error('[metrics] daily snapshot failed:', err);
	}
}
