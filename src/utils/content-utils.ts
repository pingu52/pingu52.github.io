import type { CollectionEntry } from "astro:content";
import {
	getUncategorizedLabel,
	normalizeCategoryName,
} from "@utils/category-utils";
import {
	attachPrevNext,
	getAllPosts,
	type PostEntry,
	sortPostsByPublishedDesc,
} from "@utils/post-utils";
import { trimOrEmpty } from "@utils/string-utils";
import { normalizeTaxonomyLabel, taxonomyKey } from "@utils/taxonomy-utils";
import { getCategoryUrl } from "@utils/url-utils.ts";

// Retrieve posts and sort them by publication date (DESC)
async function getRawSortedPosts(): Promise<PostEntry[]> {
	const allBlogPosts = await getAllPosts();
	return sortPostsByPublishedDesc(allBlogPosts);
}

export async function getSortedPosts(): Promise<PostEntry[]> {
	const sorted = await getRawSortedPosts();
	return attachPrevNext(sorted);
}

export type PostForList = {
	slug: string;
	data: CollectionEntry<"posts">["data"];
};

export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getSortedPosts();
	return sortedFullPosts.map((post) => ({ slug: post.slug, data: post.data }));
}

export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getAllPosts();

	// Group tags case-insensitively and with collapsed whitespace so that
	// sidebar tags match the same normalization used by static path generation.
	const grouped = new Map<string, { label: string; count: number }>();

	for (const post of allBlogPosts) {
		for (const raw of post.data.tags ?? []) {
			const trimmed = trimOrEmpty(raw);
			if (!trimmed) continue;
			const label = normalizeTaxonomyLabel(trimmed);
			const key = taxonomyKey(label);
			const prev = grouped.get(key);
			if (!prev) grouped.set(key, { label, count: 1 });
			else prev.count += 1;
		}
	}

	return Array.from(grouped.values())
		.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()))
		.map((t) => ({ name: t.label, count: t.count }));
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getAllPosts();
	const uncategorizedLabel = getUncategorizedLabel();
	const counts = new Map<string, number>();

	allBlogPosts.forEach((post) => {
		const category = normalizeCategoryName(post.data.category);
		const key = category === "" ? uncategorizedLabel : category;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	});

	const sortedNames = Array.from(counts.keys()).sort((a, b) =>
		a.toLowerCase().localeCompare(b.toLowerCase()),
	);

	return sortedNames.map((name) => ({
		name,
		count: counts.get(name) ?? 0,
		url: getCategoryUrl(name),
	}));
}
