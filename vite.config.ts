import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// Vite doesn't load .env files into config evaluation on its own.
	const env = loadEnv(mode, process.cwd(), '');

	return {
		plugins: [
			// Uploads source maps on build so Sentry stack traces show real
			// file/line info. Skipped entirely (not just no-op) when there's no
			// auth token, so local/CI builds without Sentry credentials don't warn.
			...(env.SENTRY_AUTH_TOKEN
				? [
						sentrySvelteKit({
							org: env.SENTRY_ORG,
							project: env.SENTRY_PROJECT,
							authToken: env.SENTRY_AUTH_TOKEN,
							// Delete the client source maps once uploaded so the original
							// source isn't left served publicly under build/client.
							sourcemaps: {
								filesToDeleteAfterUpload: ['./build/client/**/*.map']
							}
						})
					]
				: []),
			tailwindcss(),
			sveltekit()
		]
	};
});
