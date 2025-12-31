import type { CollectionEntry } from "astro:content";

type PostEntry = CollectionEntry<"posts">;

const getPosts = (): PostEntry[] => {
	return (globalThis as any).__TEST_POSTS__ ?? [];
};

export function includePostInBuild(): boolean {
	return true;
}

export async function getAllPosts(): Promise<PostEntry[]> {
	return getPosts();
}

export function sortPostsByPublishedDesc(posts: PostEntry[]): PostEntry[] {
	return posts;
}

export function attachPrevNext(posts: PostEntry[]): PostEntry[] {
	return posts;
}
