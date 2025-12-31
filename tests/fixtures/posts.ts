import type { CollectionEntry } from "astro:content";

let counter = 0;

export function createPostEntry(
	overrides: Partial<CollectionEntry<"posts">["data"]> & { slug?: string },
): CollectionEntry<"posts"> {
	const data: CollectionEntry<"posts">["data"] = {
		title: overrides.title ?? `Post ${counter + 1}`,
		published: overrides.published ?? new Date("2024-01-01"),
		updated: overrides.updated,
		draft: overrides.draft ?? false,
		description: overrides.description ?? "",
		image: overrides.image ?? "",
		tags: overrides.tags ?? [],
		category: overrides.category ?? "",
		categoryPath: overrides.categoryPath ?? overrides.categorypath ?? [],
		lang: overrides.lang ?? "",
		prevTitle: overrides.prevTitle ?? "",
		prevSlug: overrides.prevSlug ?? "",
		nextTitle: overrides.nextTitle ?? "",
		nextSlug: overrides.nextSlug ?? "",
	};

	const slug =
		overrides.slug ??
		`post-${++counter}-${data.title.toLowerCase().replace(/\s+/g, "-")}`;

	return {
		id: slug,
		slug,
		body: "",
		collection: "posts",
		data,
		// The render function shape is not used in these tests.
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as CollectionEntry<"posts">;
}
