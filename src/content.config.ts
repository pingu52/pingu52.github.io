import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postsCollection = defineCollection({
	loader: glob({
		pattern: "**/[^_]*.{md,mdx}",
		base: "./src/content/posts",
	}),
	schema: z.object({
		title: z.string(),
		published: z.coerce.date(),
		updated: z.coerce.date().optional(),
		draft: z.boolean().optional().default(false),
		description: z.string().optional().default(""),
		image: z.string().optional().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		categoryPath: z.array(z.string()).optional().default([]),
		lang: z.string().optional().default(""),

		prevTitle: z.string().optional().default(""),
		prevSlug: z.string().optional().default(""),
		nextTitle: z.string().optional().default(""),
		nextSlug: z.string().optional().default(""),
	}),
});

const specCollection = defineCollection({
	loader: glob({
		pattern: "**/[^_]*.{md,mdx}",
		base: "./src/content/spec",
	}),
	schema: z.looseObject({}),
});

export const collections = {
	posts: postsCollection,
	spec: specCollection,
};
