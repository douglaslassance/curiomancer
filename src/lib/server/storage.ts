/**
 * Avatar storage: Cloudflare R2 (S3-compatible) when configured, local disk
 * otherwise. Mirrors kitsch's storage.ts fallback pattern - dev environments
 * without R2 credentials still work, uploads just land under STORAGE_DIR
 * instead of the "curiomancer" bucket. Replaces storing avatars as base64
 * data URIs directly in the `user.image` column - see settings/+page.server.ts
 * and scripts/backfill-avatars-to-r2.ts for the one-time migration of
 * existing rows.
 *
 * `user.image` holds one of:
 * - null / '' - no avatar
 * - "/avatars/<uuid>.<ext>" - our own avatar, served by
 *   src/routes/avatars/[filename]/+server.ts regardless of backend
 *
 * Env (same S3_* convention as this account's other apps, e.g. kitsch):
 * - S3_BUCKET / S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY: R2
 *   credentials. When all four are set, avatars go to R2; otherwise they're
 *   written to STORAGE_DIR (default: "storage/avatars" under the project root).
 * - S3_REGION: defaults to "auto" (R2 doesn't use real regions).
 */
import { env } from '$env/dynamic/private';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const AVATAR_PREFIX = '/avatars/';
const MAX_DATA_URI_LENGTH = 500_000;
const STORAGE_DIR = env.STORAGE_DIR ?? join(process.cwd(), 'storage', 'avatars');

const MAGIC: Array<{ ext: string; mime: string; match: (b: Buffer) => boolean }> = [
	{
		ext: 'png',
		mime: 'image/png',
		match: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
	},
	{
		ext: 'jpg',
		mime: 'image/jpeg',
		match: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
	},
	{
		ext: 'webp',
		mime: 'image/webp',
		match: (b) =>
			b.length >= 12 &&
			b.subarray(0, 4).toString('ascii') === 'RIFF' &&
			b.subarray(8, 12).toString('ascii') === 'WEBP'
	},
	{
		ext: 'gif',
		mime: 'image/gif',
		match: (b) => b.length >= 6 && b.subarray(0, 6).toString('ascii').startsWith('GIF8')
	}
];

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(MAGIC.map((m) => [m.ext, m.mime]));

export class AvatarValidationError extends Error {}

function r2Configured(): boolean {
	return Boolean(
		env.S3_BUCKET && env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
	);
}

async function r2Client() {
	const { S3Client } = await import('@aws-sdk/client-s3');
	return new S3Client({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION ?? 'auto',
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY_ID!,
			secretAccessKey: env.S3_SECRET_ACCESS_KEY!
		}
	});
}

function objectKey(filename: string): string {
	return `avatars/${filename}`;
}

async function putR2(filename: string, buffer: Buffer, mime: string): Promise<void> {
	const { PutObjectCommand } = await import('@aws-sdk/client-s3');
	await (
		await r2Client()
	).send(
		new PutObjectCommand({
			Bucket: env.S3_BUCKET,
			Key: objectKey(filename),
			Body: buffer,
			ContentType: mime
		})
	);
}

async function putLocal(filename: string, buffer: Buffer): Promise<void> {
	await mkdir(STORAGE_DIR, { recursive: true });
	await writeFile(join(STORAGE_DIR, filename), buffer);
}

/**
 * Validates a `data:image/...;base64,...` URI and stores its decoded bytes
 * (R2 if configured, local disk otherwise). Returns the `/avatars/<uuid>.<ext>`
 * reference to store in `user.image`. Throws AvatarValidationError for a
 * bad/oversized/unrecognized image, so callers can turn that into a form
 * `fail()`.
 */
export async function uploadAvatar(dataUri: string): Promise<string> {
	if (!dataUri.startsWith('data:image/')) {
		throw new AvatarValidationError('Please choose an image file.');
	}
	if (dataUri.length > MAX_DATA_URI_LENGTH) {
		throw new AvatarValidationError('That image is too large. Try a smaller one.');
	}
	const comma = dataUri.indexOf(',');
	if (comma === -1) throw new AvatarValidationError('Please choose an image file.');
	const buffer = Buffer.from(dataUri.slice(comma + 1), 'base64');

	const match = MAGIC.find((m) => m.match(buffer));
	if (!match) throw new AvatarValidationError('Please choose a PNG, JPEG, WEBP, or GIF image.');

	const filename = `${crypto.randomUUID()}.${match.ext}`;
	if (r2Configured()) await putR2(filename, buffer, match.mime);
	else await putLocal(filename, buffer);

	return `${AVATAR_PREFIX}${filename}`;
}

/** Deletes the stored object behind `imageRef`. No-ops for null/legacy/foreign values. */
export async function deleteAvatar(imageRef: string | null | undefined): Promise<void> {
	if (!imageRef || !imageRef.startsWith(AVATAR_PREFIX)) return;
	const filename = imageRef.slice(AVATAR_PREFIX.length);
	if (r2Configured()) {
		const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
		await (
			await r2Client()
		).send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey(filename) }));
	} else {
		await unlink(join(STORAGE_DIR, filename)).catch(() => {});
	}
}

/** Fetches an avatar object for the serving route. Returns null if not found. */
export async function getAvatarObject(
	filename: string
): Promise<{ body: Uint8Array; contentType: string } | null> {
	if (r2Configured()) {
		const { GetObjectCommand } = await import('@aws-sdk/client-s3');
		try {
			const result = await (
				await r2Client()
			).send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey(filename) }));
			return {
				body: await result.Body!.transformToByteArray(),
				contentType: result.ContentType ?? 'application/octet-stream'
			};
		} catch (err) {
			if (err instanceof Error && err.name === 'NoSuchKey') return null;
			throw err;
		}
	}

	try {
		const buffer = await readFile(join(STORAGE_DIR, filename));
		const ext = filename.split('.').pop() ?? '';
		return { body: buffer, contentType: EXT_TO_MIME[ext] ?? 'application/octet-stream' };
	} catch {
		return null;
	}
}
