import type { CollectionEntry } from "astro:content";
import {
	categoryPathIsPrefix,
	categoryPathKey,
	formatCategoryPath,
	getCategoryPathFromData,
	normalizeCategoryPath,
} from "@utils/category-utils";
import { normalizeLower, trimOrEmpty } from "@utils/string-utils";
import type { PaginateFunction, PaginateOptions } from "astro";

/**
 * Slug used for posts that do not have a category.
 * The user-facing label is localized via i18n.
 */
export const UNCATEGORIZED_SLUG = "uncategorized" as const;

type PostEntry = CollectionEntry<"posts">;

const sortCi = (a: string, b: string) =>
	a.toLowerCase().localeCompare(b.toLowerCase());

/**
 * Normalize a taxonomy label (tag/category) for display and for stable URL encoding.
 * - trims
 * - collapses internal whitespace
 */
export function normalizeTaxonomyLabel(value: string): string {
	return trimOrEmpty(value).replace(/\s+/g, " ");
}

/**
 * Create a case-insensitive "key" for grouping taxonomy values.
 * This avoids accidental duplicates like "Yocto" vs "yocto" or "Yocto  Build" vs "Yocto Build".
 */
export function taxonomyKey(value: string): string {
	return normalizeLower(normalizeTaxonomyLabel(value));
}

/**
 * Encode a taxonomy label for use in URL path segments.
 * NOTE: This is only for building URLs (strings). Do NOT pass encoded strings into Astro params.
 */
export function encodeTaxonomySegment(value: string): string {
	return encodeURIComponent(normalizeTaxonomyLabel(value));
}

/**
 * Decode a taxonomy segment (from Astro params or URL hashes) to a readable label.
 * Fallbacks gracefully if the segment is not a valid URI component.
 */
export function decodeTaxonomySegment(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

const normalizeTags = (tags?: string[]) =>
	(tags ?? []).map(normalizeTaxonomyLabel).filter((t) => t !== "");

/**
 * Collect categories with a stable label for each group (case-insensitive).
 * Returns the chosen display labels in case-insensitive sorted order.
 */
export function collectCategories(posts: PostEntry[]) {
	const map = new Map<string, string[]>(); // key -> path segments
	let hasUncategorized = false;

	for (const post of posts) {
		const path = getCategoryPathFromData(post.data);
		if (path.length === 0) {
			hasUncategorized = true;
			continue;
		}

		for (let i = 1; i <= path.length; i++) {
			const prefix = path.slice(0, i);
			const key = categoryPathKey(prefix);
			if (!map.has(key)) map.set(key, prefix);
		}
	}

	const categories = Array.from(map.values()).sort((a, b) =>
		sortCi(formatCategoryPath(a), formatCategoryPath(b)),
	);

	return { categories, hasUncategorized };
}

/**
 * Collect tags with a stable label for each group (case-insensitive).
 */
export function collectTags(posts: PostEntry[]) {
	const map = new Map<string, string>(); // key -> label

	for (const post of posts) {
		for (const raw of normalizeTags(post.data.tags)) {
			const key = taxonomyKey(raw);
			if (!map.has(key)) map.set(key, raw);
		}
	}

	return Array.from(map.values()).sort(sortCi);
}

type TaxonomyProps = { taxonomyTitle: string; taxonomyKey: string };

type TaxonomyPaginateFunction<Params extends Record<string, string>> = (
	data: readonly PostEntry[],
	args?: PaginateOptions<TaxonomyProps, Params>,
) => ReturnType<PaginateFunction>;

type TaxonomyPaths<Params extends Record<string, string>> = ReturnType<
	TaxonomyPaginateFunction<Params>
>;

/**
 * Build paginated static paths for /category/<category>/<page>.
 *
 * IMPORTANT:
 * - params must use unencoded labels (Astro will encode the URL for you).
 * - we group case-insensitively for consistency.
 */
export function buildCategoryStaticPaths(
	paginate: TaxonomyPaginateFunction<{ category: string }>,
	posts: PostEntry[],
	pageSize: number,
): TaxonomyPaths<{ category: string }> {
	const { categories, hasUncategorized } = collectCategories(posts);
	const paths: TaxonomyPaths<{ category: string }> = [];

	for (const categoryPath of categories) {
		const filtered = posts.filter((post) => {
			const postPath = normalizeCategoryPath(
				getCategoryPathFromData(post.data),
			);
			return categoryPathIsPrefix(categoryPath, postPath);
		});

		const categoryLabel = formatCategoryPath(categoryPath);
		const key = categoryPathKey(categoryPath);

		paths.push(
			...paginate(filtered, {
				pageSize,
				params: { category: categoryLabel },
				props: { taxonomyTitle: categoryLabel, taxonomyKey: key },
			}),
		);
	}

	if (hasUncategorized) {
		const filtered = posts.filter(
			(p) => normalizeTaxonomyLabel(formatCategoryPath(getCategoryPathFromData(p.data))) === "",
		);
		paths.push(
			...paginate(filtered, {
				pageSize,
				params: { category: UNCATEGORIZED_SLUG },
				props: { taxonomyTitle: UNCATEGORIZED_SLUG, taxonomyKey: "" },
			}),
		);
	}

	return paths;
}

/**
 * Build paginated static paths for /tag/<tag>/<page>.
 */
export function buildTagStaticPaths(
	paginate: TaxonomyPaginateFunction<{ tag: string }>,
	posts: PostEntry[],
	pageSize: number,
): TaxonomyPaths<{ tag: string }> {
	const tags = collectTags(posts);
	const paths: TaxonomyPaths<{ tag: string }> = [];

	for (const tagLabel of tags) {
		const key = taxonomyKey(tagLabel);
		const filtered = posts.filter((p) =>
			normalizeTags(p.data.tags).some((t) => taxonomyKey(t) === key),
		);

		paths.push(
			...paginate(filtered, {
				pageSize,
				params: { tag: tagLabel },
				props: { taxonomyTitle: tagLabel, taxonomyKey: key },
			}),
		);
	}

	return paths;
}
