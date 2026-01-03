import { type CollectionEntry, getCollection } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

export function includePostInBuild(data: PostEntry["data"]): boolean {
	return import.meta.env.PROD ? data.draft !== true : true;
}

export async function getAllPosts(): Promise<PostEntry[]> {
	return getCollection("posts", ({ data }) => includePostInBuild(data));
}

export function sortPostsByPublishedDesc(posts: PostEntry[]): PostEntry[] {
	// Avoid in-place mutation to keep the function referentially transparent.
	return posts
		.slice()
		.sort(
			(a, b) =>
				new Date(b.data.published).getTime() -
				new Date(a.data.published).getTime(),
		);
}

export function attachPrevNext(posts: PostEntry[]): PostEntry[] {
	// Do NOT mutate content entry data in-place. Instead, return a new array
	// with shallow-copied entries and an updated data payload.
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
