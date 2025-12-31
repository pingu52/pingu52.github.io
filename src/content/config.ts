import { defineCollection, z } from "astro:content";

const postsCollection = defineCollection({
	schema: z
		.object({
			title: z.string(),
			published: z.date(),
			updated: z.date().optional(),
			draft: z.boolean().optional().default(false),
			description: z.string().optional().default(""),
			image: z.string().optional().default(""),
			tags: z.array(z.string()).optional().default([]),
			category: z.string().optional().nullable().default(""),
			categoryPath: z.array(z.string()).optional(),
			categorypath: z.array(z.string()).optional(),
			lang: z.string().optional().default(""),

			/* For internal use */
			prevTitle: z.string().default(""),
			prevSlug: z.string().default(""),
			nextTitle: z.string().default(""),
			nextSlug: z.string().default(""),
		})
		.transform((data) => {
			const { categorypath, ...rest } = data;
			return {
				...rest,
				categoryPath: data.categoryPath ?? categorypath ?? [],
			};
		}),
});
const specCollection = defineCollection({
	schema: z.object({}),
});
export const collections = {
	posts: postsCollection,
	spec: specCollection,
};
