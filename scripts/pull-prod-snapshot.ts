/**
 * Pulls a scoped copy of production data into the LOCAL database, so matching,
 * twins and Tune can be worked on against real ratings instead of seed noise.
 *
 * Runs pg_dump inside the Postgres container over SSH, so nothing has to be
 * published on the VM's network and no port is exposed:
 *
 *   ssh $PROD_SSH_HOST docker exec $PROD_PG_CONTAINER pg_dump ...
 *
 * Deliberately partial. It copies the tables the recommendation and twin work
 * needs and leaves behind the ones whose contents would be a liability on a
 * laptop:
 *
 *   copied   user, place, place_relation, block, user_location
 *   skipped  account (password hashes), session, api_token, verification,
 *            conversation, message, message_reaction (message.body is
 *            plaintext today, see the E2EE item in CLAUDE.md)
 *
 * Direction is enforced, not trusted. The target is read from DATABASE_URL and
 * the script refuses to run unless it points at localhost, because the restore
 * truncates before loading and CLAUDE.md is explicit that a `user` delete
 * cascades away every rating and every message with no way back.
 *
 * Env (add to .env):
 *   PROD_SSH_HOST       e.g. root@5.78.192.180
 *   PROD_PG_CONTAINER   container name or id of the Postgres container
 *   PROD_PG_USER        defaults to "postgres"
 *   PROD_PG_DB          defaults to "curiomancer"
 *
 * Run with: pnpm pull:snapshot [-- --yes] [--anonymize-emails] [--keep-file]
 *
 * A separate mode, `--places-fixture`, writes production's `place` rows to a
 * committed JSON fixture the demo seed reads. Venue names and coordinates are
 * not personal data, so unlike the tables above the fixture is safe to check
 * in; no ratings, users or locations go anywhere near it.
 *
 * Without --yes it dumps and stops, so you can inspect the file before anything
 * local is touched.
 *
 * Self-contained (own connection, dotenv) like the other scripts here, since
 * src/lib/server/db reads env through SvelteKit's $env alias, which only exists
 * inside the app runtime.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Tables worth copying. Order is irrelevant, FKs are deferred on restore. */
const TABLES = ['"user"', 'place', 'place_relation', 'block', 'user_location'];

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);

const target = process.env.DATABASE_URL;
const sshHost = process.env.PROD_SSH_HOST;
const container = process.env.PROD_PG_CONTAINER;
const pgUser = process.env.PROD_PG_USER ?? 'postgres';
const pgDb = process.env.PROD_PG_DB ?? 'curiomancer';

/**
 * Quote one argument for the remote shell. `ssh host a b c` does not exec argv
 * remotely, it concatenates and runs the result through sh, so a SQL string or
 * a quoted identifier like "user" has to survive a second round of parsing.
 */
function shq(arg: string): string {
	return `'` + arg.replace(/'/g, `'\\''`) + `'`;
}

function fail(message: string): never {
	console.error(`\n  ${message}\n`);
	process.exit(1);
}

if (!target) fail('DATABASE_URL is not set. It is the restore target and must be local.');
if (!sshHost) fail('PROD_SSH_HOST is not set (e.g. root@5.78.192.180).');
if (!container) fail('PROD_PG_CONTAINER is not set (the Postgres container name).');

// The one guard that matters. Everything below truncates, so a target that is
// not unambiguously local is refused before a single byte moves.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '']);
let targetHost: string;
try {
	targetHost = new URL(target).hostname;
} catch {
	fail(`DATABASE_URL is not a parseable URL, refusing to guess where it points.`);
}
if (!LOCAL_HOSTS.has(targetHost)) {
	fail(
		`DATABASE_URL points at "${targetHost}", not localhost. This script truncates ` +
			`its target before loading, so it only ever runs against a local database.`
	);
}

/**
 * `--places-fixture`: export just the place catalogue for the demo seed, and
 * stop. Nothing local is truncated, so this mode is safe to run at any time.
 */
if (has('--places-fixture')) {
	const query =
		'SELECT json_agg(row_to_json(p)) FROM (' +
		'SELECT name, category, city, neighborhood, description, latitude, longitude, external_id ' +
		'FROM place WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND external_id IS NOT NULL ' +
		'ORDER BY city, name) p';
	let json: string;
	try {
		const remote = [
			'docker exec -i',
			shq(container),
			'psql -U',
			shq(pgUser),
			'-d',
			shq(pgDb),
			'-tAc',
			shq(query)
		].join(' ');
		json = execFileSync('ssh', [sshHost, remote], {
			encoding: 'utf8',
			maxBuffer: 512 * 1024 * 1024
		});
	} catch (err) {
		fail(`Place export failed: ${(err as Error).message}`);
	}
	const rows = JSON.parse(json.trim() || '[]');
	const fixture = join(process.cwd(), 'src/lib/server/db/places-fixture.json');
	writeFileSync(fixture, JSON.stringify(rows, null, '\t') + '\n');
	const byCity = new Map<string, number>();
	for (const r of rows) byCity.set(r.city, (byCity.get(r.city) ?? 0) + 1);
	const top = [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
	console.log(`  Wrote ${rows.length} places to ${fixture}`);
	console.log(
		`  Cities: ${top.map(([c, n]) => `${c} (${n})`).join(', ')}${byCity.size > 8 ? ', …' : ''}`
	);
	process.exit(0);
}

const workDir = mkdtempSync(join(tmpdir(), 'curiomancer-snapshot-'));
const dumpPath = join(workDir, 'snapshot.sql');

console.log(`  source  ${sshHost} → docker exec ${container} (db ${pgDb})`);
console.log(`  target  ${target.replace(/:\/\/[^@]*@/, '://***@')}`);
console.log(`  tables  ${TABLES.join(', ')}\n`);

console.log('  Dumping...');
const dumpArgs = [
	sshHost,
	[
		'docker exec -i',
		shq(container),
		'pg_dump -U',
		shq(pgUser),
		'-d',
		shq(pgDb),
		'--data-only --no-owner --no-privileges',
		...TABLES.map((t) => `-t ${shq(t)}`)
	].join(' ')
];
try {
	// Straight to a file: a production dump can be large enough that buffering
	// it through Node's stdout pipe is pointless overhead.
	execFileSync('ssh', dumpArgs, {
		stdio: ['inherit', openSync(dumpPath, 'w'), 'inherit'],
		maxBuffer: 1024 * 1024 * 1024
	});
} catch (err) {
	rmSync(workDir, { recursive: true, force: true });
	fail(`pg_dump failed: ${(err as Error).message}`);
}
const bytes = statSync(dumpPath).size;
console.log(`  Dumped ${(bytes / 1024).toFixed(0)} KB to ${dumpPath}`);

/**
 * pg_dump writes a header of `SET` statements for the server it ran on, and a
 * newer server knows settings an older one rejects outright. Production is
 * Postgres 18 and a local install is very likely older, where
 * `transaction_timeout` (new in 17) aborts the whole restore.
 *
 * These four are all timeouts, and a restore wants none of them, so dropping
 * them costs nothing. The encoding and quoting SETs in the same header do
 * matter and are deliberately left alone.
 */
const DROPPABLE_SETS = [
	'statement_timeout',
	'lock_timeout',
	'idle_in_transaction_session_timeout',
	'transaction_timeout'
];
const dropPattern = new RegExp(`^SET (${DROPPABLE_SETS.join('|')}) = `);
// Read whole: a --data-only dump of these tables stays small enough that
// streaming would be more machinery than it earns.
const lines = readFileSync(dumpPath, 'utf8').split('\n');
const kept = lines.filter((l) => !dropPattern.test(l));
if (kept.length !== lines.length) {
	writeFileSync(dumpPath, kept.join('\n'));
	console.log(
		`  Stripped ${lines.length - kept.length} timeout setting(s) the local server may not know`
	);
}

if (!has('--yes')) {
	console.log(
		`\n  Stopping here. Nothing local was touched.\n` +
			`  Inspect the dump, then rerun with --yes to load it.\n` +
			`  Note that loading TRUNCATEs "user" CASCADE, which also clears your\n` +
			`  local conversations and messages.\n`
	);
	process.exit(0);
}

console.log('\n  Restoring (truncate + load, FKs deferred)...');
try {
	// session_replication_role = replica defers FK checks, so a --data-only dump
	// can load in pg_dump's alphabetical table order without tripping over them.
	execFileSync(
		'psql',
		[
			target,
			'-v',
			'ON_ERROR_STOP=1',
			'-1',
			'-c',
			'SET session_replication_role = replica;',
			'-c',
			`TRUNCATE ${TABLES.join(', ')} CASCADE;`,
			'-f',
			dumpPath
		],
		{ stdio: ['inherit', 'inherit', 'inherit'] }
	);
} catch (err) {
	fail(
		`Restore failed: ${(err as Error).message}\n` +
			`  A missing column means your local schema is behind, so run "pnpm db:migrate".\n` +
			`  An "unrecognized configuration parameter" means production's Postgres is\n` +
			`  newer than yours and emitted a setting this server does not have; add it to\n` +
			`  DROPPABLE_SETS in this script if it is only a timeout.`
	);
}

if (has('--anonymize-emails')) {
	console.log('\n  Anonymizing emails...');
	execFileSync(
		'psql',
		[
			target,
			'-v',
			'ON_ERROR_STOP=1',
			'-c',
			`UPDATE "user" SET email = 'user-' || id || '@example.invalid';`
		],
		{ stdio: 'inherit' }
	);
	console.log('  Done. Note that you can no longer sign in locally as these users.');
}

if (has('--keep-file')) {
	console.log(`\n  Dump kept at ${dumpPath}`);
} else {
	rmSync(workDir, { recursive: true, force: true });
}

console.log('\n  Snapshot loaded.\n');
process.exit(0);
