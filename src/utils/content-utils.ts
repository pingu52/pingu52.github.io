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
	categoryPathKey,
	getCategoryPathFromData,
	normalizeCategoryPath,
} from "@utils/category-utils";
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

export type CategoryTreeNode = {
	name: string;
	count: number;
	url: string;
	depth: number;
	path: string[];
};

export async function getCategoryList(): Promise<CategoryTreeNode[]> {
	const allBlogPosts = await getAllPosts();
	const uncategorizedLabel = i18n(I18nKey.uncategorized);

	type Node = {
		name: string;
		path: string[];
		count: number;
		children: Map<string, Node>;
	};

	const root: Node = { name: "", path: [], count: 0, children: new Map() };
	let uncategorizedCount = 0;

	const insertPath = (path: string[]) => {
		let current = root;
		for (const segment of path) {
			const key = categoryPathKey([...current.path, segment]);
			if (!current.children.has(key)) {
				current.children.set(key, {
					name: segment,
					path: [...current.path, segment],
					count: 0,
					children: new Map(),
				});
			}
			const node = current.children.get(key)!;
			node.count += 1;
			current = node;
		}
	};

	allBlogPosts.forEach((post) => {
		const path = getCategoryPathFromData(post.data);
		if (path.length === 0) {
			uncategorizedCount += 1;
			return;
		}

		insertPath(normalizeCategoryPath(path));
	});

	const sortNodes = (node: Node) =>
		Array.from(node.children.values()).sort((a, b) =>
			a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
		);

	const flatten = (nodes: Node[], depth: number): CategoryTreeNode[] => {
		let result: CategoryTreeNode[] = [];
		nodes.forEach((node) => {
			result.push({
				name: node.name,
				count: node.count,
				url: getCategoryUrl(node.path),
				depth,
				path: node.path,
			});
			result = result.concat(flatten(sortNodes(node), depth + 1));
		});
		return result;
	};

	const flat = flatten(sortNodes(root), 0);

	if (uncategorizedCount > 0) {
		flat.push({
			name: uncategorizedLabel,
			count: uncategorizedCount,
			url: getCategoryUrl(null),
			depth: 0,
			path: [],
		});
	}

	return flat;
}
