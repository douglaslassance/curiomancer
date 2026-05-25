/**
 * Mints short-lived MapKit JS tokens signed with our Apple .p8 private key.
 *
 * The browser calls /api/mapkit-token to get one of these, then passes it
 * to `mapkit.init({ authorizationCallback })`. Apple's CDN validates the
 * signature against the public key it has on file for our Key ID.
 *
 * Docs: https://developer.apple.com/documentation/mapkitjs/creating_and_using_tokens_with_mapkit_js
 */
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { SignJWT, importPKCS8 } from 'jose';

// Read from process.env directly (rather than $env/dynamic/private) so this
// module is callable from both the SvelteKit server and standalone CLI
// scripts like the demo seed runner.

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24h — see "long-lived hardcoded vs short-lived" debate; this is the sane middle.

let cachedKey: CryptoKey | null = null;
let cachedToken: { value: string; expiresAt: number; origin: string } | null = null;

async function loadPrivateKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;

	const path = process.env.MAPKIT_KEY_PATH;
	if (!path) throw new Error('MAPKIT_KEY_PATH is not set');

	const pem = await readFile(resolvePath(path), 'utf8');
	cachedKey = await importPKCS8(pem, 'ES256');
	return cachedKey;
}

/**
 * Returns a MapKit JS JWT, cached until close to expiry. `origin` is bound
 * into the token so the browser can only use it from the matching site.
 */
export async function mintMapkitToken(origin: string): Promise<string> {
	const teamId = process.env.APPLE_TEAM_ID;
	const keyId = process.env.MAPKIT_KEY_ID;
	if (!teamId) throw new Error('APPLE_TEAM_ID is not set');
	if (!keyId) throw new Error('MAPKIT_KEY_ID is not set');

	// Reuse the cached token if it's still good (refresh 5 min before expiry).
	const now = Math.floor(Date.now() / 1000);
	if (cachedToken && cachedToken.origin === origin && cachedToken.expiresAt - 300 > now) {
		return cachedToken.value;
	}

	const key = await loadPrivateKey();

	const token = await new SignJWT({})
		.setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
		.setIssuer(teamId)
		.setIssuedAt(now)
		.setExpirationTime(now + TOKEN_TTL_SECONDS)
		// `origin` claim restricts the token to our site; Apple enforces this.
		.setAudience('mapkit')
		.setSubject(origin)
		.sign(key);

	cachedToken = { value: token, expiresAt: now + TOKEN_TTL_SECONDS, origin };
	return token;
}
