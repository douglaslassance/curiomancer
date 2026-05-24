import 'dotenv/config';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { place, type NewPlace } from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = new Database(url);
const db = drizzle(client);

const seed: NewPlace[] = [
	// Los Angeles
	{
		name: 'Bestia',
		category: 'restaurant',
		city: 'Los Angeles',
		neighborhood: 'Arts District',
		description:
			'Italian small plates with a wood-fired heart and a constantly packed dining room.'
	},
	{
		name: 'Apparatus Coffee',
		category: 'shop',
		city: 'Los Angeles',
		neighborhood: 'Silver Lake',
		description: 'Pour-overs and pastries in a quiet, tile-lined room.'
	},
	{
		name: 'The Varnish',
		category: 'bar',
		city: 'Los Angeles',
		neighborhood: 'Downtown',
		description: "Hidden cocktail bar behind Cole's, classics done with care."
	},
	{
		name: 'Sqirl',
		category: 'restaurant',
		city: 'Los Angeles',
		neighborhood: 'Virgil Village',
		description: 'Jam toast, rice bowls, brunch lines worth the wait.'
	},
	{
		name: 'Heritage Fine Wines',
		category: 'shop',
		city: 'Los Angeles',
		neighborhood: 'Beverly Hills',
		description: "Wine shop for natural and old-world bottles you can't find elsewhere."
	},

	// Tokyo
	{
		name: 'Fuglen Tokyo',
		category: 'shop',
		city: 'Tokyo',
		neighborhood: 'Shibuya',
		description: 'Norwegian-Japanese coffee shop by day, cocktail bar by night.'
	},
	{
		name: 'Bar Trench',
		category: 'bar',
		city: 'Tokyo',
		neighborhood: 'Ebisu',
		description: 'Tiny absinthe-leaning bar with a thoughtful classic cocktail list.'
	},
	{
		name: 'Tsuta',
		category: 'restaurant',
		city: 'Tokyo',
		neighborhood: 'Yoyogi-Uehara',
		description: 'Truffle-shoyu ramen from the first ramen shop ever to get a Michelin star.'
	},
	{
		name: 'Sushi Saito',
		category: 'restaurant',
		city: 'Tokyo',
		neighborhood: 'Roppongi',
		description:
			'Counter-only sushi widely regarded as the best in the city. Book months ahead.'
	},
	{
		name: 'Cow Books',
		category: 'shop',
		city: 'Tokyo',
		neighborhood: 'Nakameguro',
		description:
			'Curated used bookstore along the Meguro river, heavy on art and counterculture.'
	}
];

console.log(`Seeding ${seed.length} places…`);
db.delete(place).run();
db.insert(place).values(seed).run();
console.log('Done.');
client.close();
