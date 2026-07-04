import { redirect } from '@sveltejs/kit';
import { listConversationsFor } from '$lib/server/messages';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/messages');
	const conversations = await listConversationsFor(locals.user.id);
	return { conversations };
};
