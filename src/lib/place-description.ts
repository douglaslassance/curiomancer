/**
 * The description a card should actually render.
 *
 * Apple-saved places used to get `${name}, ${city}` written in as a stand-in
 * blurb (see `add-place.ts`), which then rendered directly under a card header
 * already showing the name and the city - "Broken Arm" / "Le Marais, Paris" /
 * "Broken Arm, Paris". New rows store an empty description instead, so this
 * exists to strip the placeholder off the rows written before that.
 *
 * Applied server-side, in the API responses, so the web, iOS, and Android all
 * get nothing to render rather than each learning the same rule.
 */
export function displayDescription(p: {
	name: string;
	city: string;
	description: string | null;
}): string {
	const description = p.description?.trim() ?? '';
	if (!description) return '';
	const placeholder = `${p.name.trim()}, ${p.city.trim()}`;
	return description.localeCompare(placeholder, undefined, { sensitivity: 'accent' }) === 0
		? ''
		: description;
}
