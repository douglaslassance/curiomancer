import { redirect } from '@sveltejs/kit';
import { listConversationsFor } from '$lib/server/messages';
import { isSubscriber } from '$lib/server/subscriptions';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/messages');
	if (!(await isSubscriber(locals.user.id))) throw redirect(302, '/subscribe');
	const conversations = await listConversationsFor(locals.user.id);
	return { conversations };
};
