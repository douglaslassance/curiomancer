import { db } from './db';
import { place } from './db/schema';
import { setRelation } from './likes';
import { findExistingApplePlaceId } from './places';
import { getPostHogClient } from './posthog';
import type { PlaceRelationKind } from './db/schema';

export interface SavePlaceInput {
	externalId?: string;
	source?: 'apple' | 'manual';
	name?: string;
	category?: 'eat' | 'drink' | 'shop' | 'visit';
	city?: string;
	neighborhood?: string;
	description?: string;
	latitude?: number;
	longitude?: number;
	/** Relation to set in the same call; defaults to 'liked'. */
	kind?: PlaceRelationKind;
}

export type SavePlaceResult =
	| { ok: true; placeId: string; kind: PlaceRelationKind }
	| { ok: false; status: 400; message: string };

/**
 * Upsert a place by (source, external_id) and set the caller's relation to it.
 * Shared by the web `/api/places` and the native `POST /api/v1/places` so the
 * dedupe and rating rules can't drift between them.
 *
 * Apple places are deduped by `findExistingApplePlaceId`: by muid, then by
 * canonical identity (name + rounded coords), since the same place carries
 * different Apple muids across MapKit JS, the Apple Server API, and native
 * MapKit. That name+coords fallback is what lets a native client pass a
 * synthesized external id and still merge with a web-imported place.
 */
export async function savePlaceRelation(
	userId: string,
	input: SavePlaceInput
): Promise<SavePlaceResult> {
	const name = input.name?.trim();
	const category = input.category;
	const city = input.city?.trim();
	const source = input.source ?? 'apple';
	const externalId = input.externalId?.trim();
	const kind: PlaceRelationKind = input.kind ?? 'liked';

	if (!name) return { ok: false, status: 400, message: 'name is required' };
	if (!category) return { ok: false, status: 400, message: 'category is required' };
	if (!city) return { ok: false, status: 400, message: 'city is required' };
	if (source === 'apple' && !externalId) {
		return { ok: false, status: 400, message: 'externalId is required for source=apple' };
	}
	if (kind !== 'liked' && kind !== 'disliked' && kind !== 'want_to_go' && kind !== 'seen') {
		return {
			ok: false,
			status: 400,
			message: "kind must be 'liked', 'disliked', 'seen', or 'want_to_go'."
		};
	}

	let placeId: string | null = null;
	if (source === 'apple') {
		placeId = await findExistingApplePlaceId({
			externalId,
			name,
			latitude: input.latitude,
			longitude: input.longitude
		});
	}

	if (!placeId) {
		const [created] = await db
			.insert(place)
			.values({
				name,
				category,
				city,
				neighborhood: input.neighborhood?.trim() || null,
				description: input.description?.trim() || `${name}, ${city}`,
				latitude: input.latitude ?? null,
				longitude: input.longitude ?? null,
				source,
				externalId: externalId ?? null
			})
			.returning({ id: place.id });
		placeId = created.id;
	}

	await setRelation(userId, placeId, kind);

	getPostHogClient()?.capture({
		distinctId: userId,
		event: 'place_added',
		properties: {
			place_id: placeId,
			place_name: name,
			place_category: category,
			place_city: city,
			place_source: source,
			kind
		}
	});

	return { ok: true, placeId, kind };
}
