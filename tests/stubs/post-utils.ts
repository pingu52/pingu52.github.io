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

export function getPostSlug(post: { id: string }): string {
	return post.id.replace(/\/index$/, "").replace(/\.(md|mdx)$/, "");
}

export function getPostContentDir(post: {
	id: string;
	filePath?: string;
}): string {
	const normalizedFilePath = post.filePath?.replace(/\\/g, "/");

	if (normalizedFilePath) {
		const marker = "src/content/posts/";
		const relativePath = normalizedFilePath.includes(marker)
			? normalizedFilePath.slice(
					normalizedFilePath.indexOf(marker) + marker.length,
				)
			: normalizedFilePath.replace(/^.*content\/posts\//, "");

		const lastSlash = relativePath.lastIndexOf("/");
		return lastSlash >= 0 ? relativePath.slice(0, lastSlash + 1) : "";
	}

	return `${post.id.replace(/\/index$/, "").replace(/\.(md|mdx)$/, "")}/`;
}