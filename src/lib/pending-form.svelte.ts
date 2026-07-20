import type { ActionResult, SubmitFunction } from '@sveltejs/kit';

/**
 * Standard pending state for an enhanced form. Flips `submitting` while the
 * action is in flight so a submit button (see <SubmitButton>) can show a
 * spinner and disable itself, instead of sitting there looking unresponsive
 * and tempting a second click. Runs the default `update()`, then an optional
 * `onDone` (e.g. close a dialog, clear fields), then clears `submitting`.
 *
 *   const login = pendingForm();
 *   <form method="post" use:enhance={login.enhance}>
 *     ...
 *     <SubmitButton pending={login.submitting} pendingLabel="Signing in…">Sign in</SubmitButton>
 *   </form>
 */
export function pendingForm(onDone?: (result: ActionResult) => void | Promise<void>): {
	readonly submitting: boolean;
	enhance: SubmitFunction;
} {
	let submitting = $state(false);
	const enhance: SubmitFunction = () => {
		submitting = true;
		return async ({ update, result }) => {
			await update();
			await onDone?.(result);
			submitting = false;
		};
	};
	return {
		get submitting() {
			return submitting;
		},
		enhance
	};
}
