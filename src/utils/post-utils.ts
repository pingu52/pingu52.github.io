import { type CollectionEntry, getCollection } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

export function includePostInBuild(data: PostEntry["data"]): boolean {
	return import.meta.env.PROD ? data.draft !== true : true;
}

export async function getAllPosts(): Promise<PostEntry[]> {
	return getCollection("posts", ({ data }) => includePostInBuild(data));
}

export function sortPostsByPublishedDesc(posts: PostEntry[]): PostEntry[] {
	return posts.sort(
		(a, b) =>
			new Date(b.data.published).getTime() - new Date(a.data.published).getTime(),
	);
}

export function attachPrevNext(posts: PostEntry[]): PostEntry[] {
	for (let i = 1; i < posts.length; i++) {
		posts[i].data.nextSlug = posts[i - 1].slug;
		posts[i].data.nextTitle = posts[i - 1].data.title;
	}
	for (let i = 0; i < posts.length - 1; i++) {
		posts[i].data.prevSlug = posts[i + 1].slug;
		posts[i].data.prevTitle = posts[i + 1].data.title;
	}
	return posts;
}
