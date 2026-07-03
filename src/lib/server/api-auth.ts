import { error } from '@sveltejs/kit';
import { authenticateToken } from './api-tokens';

/**
 * Resolve a request's `Authorization: Bearer <token>` header to a user id, or
 * throw a 401. The shared guard for every /api/v1 route: unlike the cookie
 * sessions the web pages use, the native and third-party clients authenticate
 * with a personal access token (see api-tokens.ts).
 */
export async function requireApiUser(request: Request): Promise<string> {
	const userId = await authenticateToken(request.headers.get('authorization'));
	if (!userId) {
		throw error(401, 'Provide a valid token: Authorization: Bearer <token>');
	}
	return userId;
}
