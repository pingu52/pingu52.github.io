import { type CollectionEntry, getCollection } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

export function getPostSlug(post: Pick<PostEntry, "id">): string {
	return post.id.replace(/\/index$/, "").replace(/\.(md|mdx)$/, "");
}

export function getPostContentDir(
	post: Pick<PostEntry, "id" | "filePath">,
): string {
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
	return posts.map((post, idx) => {
		const next = idx > 0 ? posts[idx - 1] : undefined;
		const prev = idx < posts.length - 1 ? posts[idx + 1] : undefined;

		return {
			...post,
			data: {
				...post.data,
				nextSlug: next ? getPostSlug(next) : "",
				nextTitle: next?.data.title ?? "",
				prevSlug: prev ? getPostSlug(prev) : "",
				prevTitle: prev?.data.title ?? "",
			},
		};
	});
}
