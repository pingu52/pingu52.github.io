import { isUncategorizedCategory, normalizeCategoryName } from "@utils/category-utils";
import { encodeTaxonomySegment } from "@utils/taxonomy-utils";
import { isBlank, trimOrEmpty } from "@utils/string-utils";

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

export function getCategoryUrl(category: string | null): string {
	// Category pages are rendered as main-feed style pages under /category/:category/...
	if (isUncategorizedCategory(category)) return url("/category/uncategorized/");
	return url(`/category/${encodeTaxonomySegment(normalizeCategoryName(category))}/`);
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
