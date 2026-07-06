import { PostHog } from 'posthog-node';
import { PUBLIC_POSTHOG_PROJECT_TOKEN, PUBLIC_POSTHOG_HOST } from '$env/static/public';

let posthogClient: PostHog | null = null;

// Opt-in: only reports when a project token is configured for this deployment.
export function getPostHogClient(): PostHog | null {
	if (!PUBLIC_POSTHOG_PROJECT_TOKEN) return null;
	if (!posthogClient) {
		posthogClient = new PostHog(PUBLIC_POSTHOG_PROJECT_TOKEN, {
			host: PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0
		});
	}
	return posthogClient;
}
