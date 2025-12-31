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

const taxonomyData = taxonomy as CategoryNode[];
const taxonomyLeafLabelMap = buildLeafLabelMap(
	taxonomyData,
	MAX_CATEGORY_DEPTH,
);

export function pathsEqual(path1: string, path2: string) {
	const normalizedPath1 = path1.replace(/^\/|\/$/g, "").toLowerCase();
	const normalizedPath2 = path2.replace(/^\/|\/$/g, "").toLowerCase();
	return normalizedPath1 === normalizedPath2;
}

function joinUrl(...parts: string[]): string {
	const joined = parts.join("/");
	return joined.replace(/\/+/g, "/");
}

export function getPostUrlBySlug(slug: string): string {
	return url(`/posts/${slug}/`);
}

export function getTagUrl(tag: string): string {
	if (isBlank(tag)) return url("/archive/");
	return url(`/tag/${encodeTaxonomySegment(tag)}/`);
}

export function getCategorySlugPathUrl(
	slugPath: string[],
	page?: number,
): string {
	const encoded = slugPath.map((segment) => encodeURIComponent(segment));
	const basePath = encoded.join("/");
	const pageSuffix = page && page >= 2 ? `${page}/` : "";
	const categoryPath =
		basePath === "" ? "/category/" : `/category/${basePath}/`;
	return url(`${categoryPath}${pageSuffix}`);
}

function resolveCategoryLabelPath(labelPath: string[]): string[] {
	if (labelPath.length > MAX_CATEGORY_DEPTH) {
		throw new Error(
			`Category label path exceeds maximum depth of ${MAX_CATEGORY_DEPTH}: ${labelPath.join(" / ")}`,
		);
	}

	if (labelPath.length === 1) {
		const resolved = taxonomyLeafLabelMap.get(labelPath[0]);
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

export function getCategoryUrl(category: string | null): string {
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

export function getDir(path: string): string {
	const lastSlashIndex = path.lastIndexOf("/");
	if (lastSlashIndex < 0) {
		return "/";
	}
	return path.substring(0, lastSlashIndex + 1);
}

export function url(path: string) {
	const base = import.meta.env?.BASE_URL ?? "/";
	return joinUrl("", base, path);
}
