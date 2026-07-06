const CLOUD_INGEST_HOST = /^(us|eu)\.i\.posthog\.com$/;

// PostHog Cloud splits UI, ingest, and static asset traffic across dedicated
// per-region subdomains. Self-hosted PostHog serves everything from one
// domain, so any host that isn't a recognized Cloud ingest host is treated
// as self-hosted and reused as-is for every purpose.
export function resolvePostHogHosts(ingestHost: string) {
	const hostname = ingestHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
	const region = hostname.match(CLOUD_INGEST_HOST)?.[1];
	return {
		ingest: hostname,
		assets: region ? `${region}-assets.i.posthog.com` : hostname,
		ui: region ? `https://${region}.posthog.com` : `https://${hostname}`
	};
}
