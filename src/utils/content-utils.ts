import type { CollectionEntry } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import {
	attachPrevNext,
	getAllPosts,
	type PostEntry,
	sortPostsByPublishedDesc,
} from "@utils/post-utils";
import { trimOrEmpty } from "@utils/string-utils";
import {
	normalizeTaxonomyLabel,
	taxonomyKey,
	UNCATEGORIZED_SLUG,
} from "@utils/taxonomy-utils";
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

type CategoryAccumulator = {
	label: string;
	count: number;
};

export function buildCategoryList(posts: PostEntry[]): Category[] {
	const count = new Map<string, CategoryAccumulator>();
	const uncategorizedLabel = i18n(I18nKey.uncategorized);

	posts.forEach((post) => {
		const normalized = normalizeTaxonomyLabel(post.data.category ?? "");
		const key =
			normalized === "" ? UNCATEGORIZED_SLUG : taxonomyKey(normalized);
		const label = normalized === "" ? UNCATEGORIZED_SLUG : normalized;

		const current = count.get(key);
		if (current) {
			current.count += 1;
		} else {
			count.set(key, { label, count: 1 });
		}
	});

	const sortedEntries = Array.from(count.entries()).sort((a, b) => {
		const [aKey, aData] = a;
		const [bKey, bData] = b;
		const aLabel = aKey === UNCATEGORIZED_SLUG ? uncategorizedLabel : aData.label;
		const bLabel = bKey === UNCATEGORIZED_SLUG ? uncategorizedLabel : bData.label;
		return aLabel.toLowerCase().localeCompare(bLabel.toLowerCase());
	});

	return sortedEntries.map(([key, data]) => {
		const labelForUrl = key === UNCATEGORIZED_SLUG ? UNCATEGORIZED_SLUG : data.label;
		return {
			name: key === UNCATEGORIZED_SLUG ? uncategorizedLabel : data.label,
			count: data.count,
			url: getCategoryUrl(labelForUrl),
		};
	});
}

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getAllPosts();
	return buildCategoryList(allBlogPosts);
}
