import {
	buildLeafLabelMap,
	type CategoryNode,
	MAX_CATEGORY_DEPTH,
	parseCategoryLabelPath,
	resolveSlugPathFromLabelPath,
} from "@utils/category-taxonomy-utils";
import {
	isUncategorizedCategory,
	normalizeCategoryName,
} from "@utils/category-utils";
import { isBlank } from "@utils/string-utils";
import {
	encodeTaxonomySegment,
	normalizeTaxonomyLabel,
	UNCATEGORIZED_SLUG,
} from "@utils/taxonomy-utils";
import taxonomy from "@/data/category-taxonomy.json";

export function pathsEqual(path1: string, path2: string): boolean {
	const normalizedPath1 = path1.replace(/^\/|\/$/g, "").toLowerCase();
	const normalizedPath2 = path2.replace(/^\/|\/$/g, "").toLowerCase();
	return normalizedPath1 === normalizedPath2;
}

function joinUrl(...parts: string[]): string {
	const joined = parts.join("/");
	return joined.replace(/\/+/g, "/");
}

export function url(path: string): string {
	const base = import.meta.env?.BASE_URL ?? "/";
	return joinUrl("", base, path);
}

export function getDir(path: string): string {
	const lastSlashIndex = path.lastIndexOf("/");
	if (lastSlashIndex < 0) {
		return "/";
	}
	return path.substring(0, lastSlashIndex + 1);
}

type UrlUtils = {
	getPostUrlBySlug: (slug: string) => string;
	getTagUrl: (tag: string) => string;
	getCategorySlugPathUrl: (slugPath: string[], page?: number) => string;
	getCategoryUrl: (category: string | null) => string;
};

/**
 * Create URL utilities bound to a particular category taxonomy.
 *
 * This makes url-utils testable and keeps taxonomy coupling explicit.
 */
export function createUrlUtils(taxonomyData: CategoryNode[]): UrlUtils {
	const leafLabelMap = buildLeafLabelMap(taxonomyData, MAX_CATEGORY_DEPTH);

	function resolveCategoryLabelPath(labelPath: string[]): string[] {
		if (labelPath.length > MAX_CATEGORY_DEPTH) {
			throw new Error(
				`Category label path exceeds maximum depth of ${MAX_CATEGORY_DEPTH}: ${labelPath.join(" / ")}`,
			);
		}

		if (labelPath.length === 1) {
			const resolved = leafLabelMap.get(labelPath[0]);
			return resolved ?? [normalizeTaxonomyLabel(labelPath[0])];
		}

		const resolved = resolveSlugPathFromLabelPath(
			labelPath,
			taxonomyData,
			true /* requireLeaf */,
		);
		if (!resolved) {
			throw new Error(
				`Category label path not found in taxonomy: ${labelPath.join(" / ")}`,
			);
		}

		return resolved;
	}

	function getPostUrlBySlug(slug: string): string {
		return url(`/posts/${slug}/`);
	}

	function getTagUrl(tag: string): string {
		if (isBlank(tag)) return url("/archive/");
		return url(`/tag/${encodeTaxonomySegment(tag)}/`);
	}

	function getCategorySlugPathUrl(slugPath: string[], page?: number): string {
		const encoded = slugPath.map((segment) => encodeURIComponent(segment));
		const basePath = encoded.join("/");
		const pageSuffix = page && page >= 2 ? `${page}/` : "";
		const categoryPath =
			basePath === "" ? "/category/" : `/category/${basePath}/`;
		return url(`${categoryPath}${pageSuffix}`);
	}

	function getCategoryUrl(category: string | null): string {
		if (isUncategorizedCategory(category)) {
			return getCategorySlugPathUrl([UNCATEGORIZED_SLUG]);
		}

		const normalized = normalizeCategoryName(category);
		const labelPath = parseCategoryLabelPath(normalized);

		if (labelPath.length === 0)
			return getCategorySlugPathUrl([UNCATEGORIZED_SLUG]);

		const slugPath = resolveCategoryLabelPath(labelPath);
		return getCategorySlugPathUrl(slugPath);
	}

	return {
		getPostUrlBySlug,
		getTagUrl,
		getCategorySlugPathUrl,
		getCategoryUrl,
	};
}

const defaultTaxonomyData = taxonomy as CategoryNode[];
const defaults = createUrlUtils(defaultTaxonomyData);

export const getPostUrlBySlug: UrlUtils["getPostUrlBySlug"] = defaults.getPostUrlBySlug;
export const getTagUrl: UrlUtils["getTagUrl"] = defaults.getTagUrl;
export const getCategorySlugPathUrl: UrlUtils["getCategorySlugPathUrl"] = defaults.getCategorySlugPathUrl;
export const getCategoryUrl: UrlUtils["getCategoryUrl"] = defaults.getCategoryUrl;
