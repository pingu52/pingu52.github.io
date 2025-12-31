import type { CollectionEntry } from "astro:content";
import {
	attachPrevNext,
	getAllPosts,
	type PostEntry,
	sortPostsByPublishedDesc,
} from "@utils/post-utils";
import {
	getUncategorizedLabel,
	normalizeCategoryName,
} from "@utils/category-utils";
import { trimOrEmpty } from "@utils/string-utils";
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

	const countMap: Record<string, number> = {};
	allBlogPosts.forEach((post) => {
		(post.data.tags ?? []).forEach((tag) => {
			const key = trimOrEmpty(tag);
			if (!key) return;
			countMap[key] = (countMap[key] ?? 0) + 1;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
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
