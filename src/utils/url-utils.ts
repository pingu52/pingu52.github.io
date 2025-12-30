import {
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

export function getCategoryUrl(category: string | null): string {
	if (isUncategorizedCategory(category)) {
		return getCategorySlugPathUrl([UNCATEGORIZED_SLUG]);
	}

	const normalized = normalizeCategoryName(category);
	const labelPath = parseCategoryLabelPath(normalized);

	if (labelPath.length === 0)
		return getCategorySlugPathUrl([UNCATEGORIZED_SLUG]);

	if (labelPath.length === 1) {
		const resolved = resolveSlugPathFromLabelPath(labelPath, taxonomy);
		const slugPath = resolved ?? [normalizeTaxonomyLabel(normalized)];
		return getCategorySlugPathUrl(slugPath);
	}

	const resolved = resolveSlugPathFromLabelPath(labelPath, taxonomy);
	if (!resolved) {
		throw new Error(
			`Category label path not found in taxonomy: ${labelPath.join(" / ")}`,
		);
	}

	return getCategorySlugPathUrl(resolved);
}

export function getDir(path: string): string {
	const lastSlashIndex = path.lastIndexOf("/");
	if (lastSlashIndex < 0) {
		return "/";
	}
	return path.substring(0, lastSlashIndex + 1);
}

export function url(path: string) {
	return joinUrl("", import.meta.env.BASE_URL, path);
}
