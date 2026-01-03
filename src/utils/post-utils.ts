import type { CollectionEntry } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

export type PostNav = {
	prevSlug: string;
	prevTitle: string;
	nextSlug: string;
	nextTitle: string;
};

export type PostEntryWithNav = PostEntry & { nav: PostNav };

export function sortPostsByPublishedDesc(posts: PostEntry[]): PostEntry[] {
	// Avoid in-place mutation.
	return posts.slice().sort(
		(a, b) =>
			new Date(b.data.published).getTime() -
			new Date(a.data.published).getTime(),
	);
}

/**
 * Attach prev/next navigation info without mutating Astro content entries.
 * Returns a view model shape: { ...entry, nav: {...} }
 */
export function attachPrevNext(posts: PostEntry[]): PostEntryWithNav[] {
	return posts.map((post, idx) => {
		const next = idx > 0 ? posts[idx - 1] : undefined;
		const prev = idx < posts.length - 1 ? posts[idx + 1] : undefined;

		const nav: PostNav = {
			nextSlug: next?.slug ?? "",
			nextTitle: next?.data.title ?? "",
			prevSlug: prev?.slug ?? "",
			prevTitle: prev?.data.title ?? "",
		};

		// Important: do NOT spread `post` (Astro ContentEntry has special typing)
		// Use Object.assign to keep the original type and just add a field.
		return Object.assign(post, { nav });
	});
}
