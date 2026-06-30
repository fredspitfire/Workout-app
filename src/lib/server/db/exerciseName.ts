/** Shared exercise-name matching helpers (used by catalog import + dedup). */

export const norm = (s: string) => s.trim().toLowerCase();

/**
 * Normalized BASE name: lowercased, with grip/variation suffixes ("- Medium
 * Grip"), parentheticals, and punctuation stripped. So "Barbell Bench Press -
 * Medium Grip" and "Barbell Bench Press" share a base key.
 */
export const baseKey = (name: string) =>
	name
		.toLowerCase()
		.split(' - ')[0]
		.replace(/\(.*?\)/g, '')
		.replace(/[^a-z0-9 ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
