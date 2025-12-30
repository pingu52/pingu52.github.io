import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { isBlank, normalizeLower, trimOrEmpty } from "@utils/string-utils";

export const MAX_CATEGORY_DEPTH = 3;
export const CATEGORY_SEPARATOR = " / ";

export function getUncategorizedLabel(): string {
	return i18n(I18nKey.uncategorized);
}

function normalizeCategorySegment(category: string): string {
	return trimOrEmpty(category).replace(/\s+/g, " ");
}

export function normalizeCategoryPath(
	category: string | string[] | null | undefined,
): string[] {
	const parts = Array.isArray(category)
		? category
		: category
			? [category]
			: [];

	const normalized = parts
		.map(normalizeCategorySegment)
		.filter((segment) => segment !== "");

	return normalized.slice(0, MAX_CATEGORY_DEPTH);
}

export function categoryPathKey(categoryPath: string[]): string {
	return categoryPath.map((segment) => normalizeLower(segment)).join("///");
}

export function formatCategoryPath(categoryPath: string[]): string {
	return categoryPath.join(CATEGORY_SEPARATOR);
}

export function parseCategoryLabel(label: string): string[] {
	const trimmed = trimOrEmpty(label);
	if (trimmed === "") return [];

	// If the label was URL-encoded (e.g., C%2B%2B), decode it first so we don't double-encode.
	let decoded = trimmed;
	try {
		decoded = decodeURIComponent(trimmed);
	} catch {
		// fall back to the original value if decoding fails
	}

	if (decoded.includes(CATEGORY_SEPARATOR)) {
		return normalizeCategoryPath(decoded.split(CATEGORY_SEPARATOR));
	}

	if (decoded.includes("/")) {
		return normalizeCategoryPath(
			decoded.split("/").map((segment) => trimOrEmpty(segment)),
		);
	}

	return normalizeCategoryPath([decoded]);
}

export function normalizeCategoryName(
	category: string | null | undefined,
): string {
	const [first] = normalizeCategoryPath(category);
	return first ?? "";
}

export function getCategoryPathFromData(data: {
	category?: string | null;
	categoryPath?: string[] | null;
}): string[] {
	if (data?.categoryPath && data.categoryPath.length > 0) {
		return normalizeCategoryPath(data.categoryPath);
	}

	if (data?.category) {
		return normalizeCategoryPath([data.category]);
	}

	return [];
}

export function isUncategorizedCategory(
	category: string | string[] | null | undefined,
): boolean {
	const parts = normalizeCategoryPath(category);
	if (parts.length === 0) return true;

	const label = formatCategoryPath(parts);
	return normalizeLower(label) === normalizeLower(getUncategorizedLabel());
}

export function isUncategorizedPath(path: string[]): boolean {
	return isBlank(formatCategoryPath(path));
}

export function getCategoryLabelOrDefault(
	category: string | string[] | null | undefined,
	uncategorizedLabel = getUncategorizedLabel(),
): string {
	const parts = normalizeCategoryPath(category);
	if (parts.length === 0) return uncategorizedLabel;
	return formatCategoryPath(parts);
}

export function categoryPathIsPrefix(
	prefix: string[],
	fullPath: string[],
): boolean {
	if (prefix.length > fullPath.length) return false;
	return prefix.every((segment, index) => fullPath[index] === segment);
}
