import { defineCollection, z, glob } from "astro:content";

type CollectionDef = ReturnType<typeof defineCollection>;

const postsCollection: CollectionDef = defineCollection({

	loader: glob({
		base: "./src/content/posts",
		pattern: [
			"**/*.{md,mdx}",
			"!**/image/**",
			"!**/images/**",
		],
	}),
	schema: z.object({
		title: z.string(),
		published: z.date(),
		updated: z.date().optional(),
		draft: z.boolean().optional().default(false),
		description: z.string().optional().default(""),
		image: z.string().optional().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		categoryPath: z.array(z.string()).optional().default([]),
		lang: z.string().optional().default(""),

		/* For internal use */
		prevTitle: z.string().default(""),
		prevSlug: z.string().default(""),
		nextTitle: z.string().default(""),
		nextSlug: z.string().default(""),
	}),
});
const specCollection: CollectionDef = defineCollection({
	schema: z.object({}),
});

export const collections: {
	posts: typeof postsCollection;
	spec: typeof specCollection;
} = {
	posts: postsCollection,
	spec: specCollection,
};
