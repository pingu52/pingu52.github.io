import { type CollectionEntry, getCollection } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

export function includePostInBuild(data: PostEntry["data"]): boolean {
	return import.meta.env.PROD ? data.draft !== true : true;
}

export async function getAllPosts(): Promise<PostEntry[]> {
	// Explicitly type the callback param to avoid implicit-any under isolatedDeclarations
	return getCollection("posts", (entry: PostEntry) =>
		includePostInBuild(entry.data),
	);
}

export function sortPostsByPublishedDesc(posts: PostEntry[]): PostEntry[] {
	// Avoid in-place mutation.
	return posts
		.slice()
		.sort(
			(a, b) =>
				new Date(b.data.published).getTime() -
				new Date(a.data.published).getTime(),
		);
}

export function attachPrevNext(posts: PostEntry[]): PostEntry[] {
	// Avoid mutating Astro content entries; return shallow copies with updated `data`.
	return posts.map((post, idx) => {
		const next = idx > 0 ? posts[idx - 1] : undefined;
		const prev = idx < posts.length - 1 ? posts[idx + 1] : undefined;

		return {
			...post,
			data: {
				...post.data,
				nextSlug: next?.slug ?? "",
				nextTitle: next?.data.title ?? "",
				prevSlug: prev?.slug ?? "",
				prevTitle: prev?.data.title ?? "",
			},
		};
	});
}
