/**
 * One-time migration: the old updateAvatar action stored `user.image` as a
 * `data:image/...;base64,...` URI directly in Postgres. This uploads each of
 * those to R2 and replaces the column with the `/avatars/<uuid>.<ext>`
 * reference src/lib/server/storage.ts now writes for new uploads.
 *
 * Per CLAUDE.md: back up the `user` table before running this against
 * production, then verify the row count and that a few avatars still render
 * afterward.
 *
 * Run with: pnpm backfill:avatars
 *
 * Self-contained connection + R2 client (like backfill-email-verified.ts) -
 * storage.ts reads env through SvelteKit's $env alias, which only exists
 * inside the app runtime.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, like } from 'drizzle-orm';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
	throw new Error('R2 storage env vars are not set (S3_BUCKET / S3_ENDPOINT / ...)');
}

const client = postgres(url);
const db = drizzle(client);

const s3 = new S3Client({
	endpoint: S3_ENDPOINT,
	region: S3_REGION ?? 'auto',
	credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
});

// Minimal shape - only the column this script touches.
const user = pgTable('user', { id: text('id').primaryKey(), image: text('image') });

const EXT_BY_MIME: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

const rows = await db
	.select({ id: user.id, image: user.image })
	.from(user)
	.where(like(user.image, 'data:image/%'));

console.log(`[backfill] found ${rows.length} avatar(s) stored as base64 data URIs`);

let migrated = 0;
for (const row of rows) {
	const image = row.image!;
	const match = image.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
	if (!match) {
		console.warn(`[backfill] user ${row.id}: unrecognized data URI, skipping`);
		continue;
	}
	const [, mime, base64] = match;
	const ext = EXT_BY_MIME[mime.toLowerCase()];
	if (!ext) {
		console.warn(`[backfill] user ${row.id}: unsupported mime ${mime}, skipping`);
		continue;
	}

	const buffer = Buffer.from(base64, 'base64');
	const filename = `${crypto.randomUUID()}.${ext}`;
	await s3.send(
		new PutObjectCommand({
			Bucket: S3_BUCKET,
			Key: `avatars/${filename}`,
			Body: buffer,
			ContentType: mime
		})
	);
	await db
		.update(user)
		.set({ image: `/avatars/${filename}` })
		.where(eq(user.id, row.id));
	migrated++;
}

console.log(`[backfill] migrated ${migrated}/${rows.length} avatar(s) to R2`);
await client.end();
