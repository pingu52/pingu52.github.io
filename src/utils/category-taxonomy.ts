import { normalizeLower, trimOrEmpty } from "@utils/string-utils";

export type CategoryNode = {
	label: string;
	slug: string;
	children?: CategoryNode[];
};

export const UNCATEGORIZED_SLUG = "uncategorized" as const;

const normalizeLabel = (label: string) => normalizeLower(trimOrEmpty(label));

export function parseCategoryLabelPath(
	value: string | null | undefined,
): string[] {
	if (!value) return [];
	return value
		.split("/")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

export function labelPathToSlugPath(
	labels: string[],
	taxonomy: CategoryNode[],
): string[] | null {
	let nodes = taxonomy;
	const slugPath: string[] = [];

	for (const rawLabel of labels) {
		const needle = normalizeLabel(rawLabel);
		const match = nodes.find(
			(node) => normalizeLabel(node.label) === needle,
		);
		if (!match) return null;
		slugPath.push(match.slug);
		nodes = match.children ?? [];
	}

	return slugPath;
}

export function findNodeBySlugPath(
	slugPath: string[],
	taxonomy: CategoryNode[],
): CategoryNode | null {
	let nodes = taxonomy;
	let current: CategoryNode | undefined;

	for (const slug of slugPath) {
		current = nodes.find((node) => node.slug === slug);
		if (!current) return null;
		nodes = current.children ?? [];
	}

	return current ?? null;
}

export function flattenSlugPathsWithPrefixes(
	taxonomy: CategoryNode[],
	prefix: string[] = [],
): string[][] {
	const paths: string[][] = [];

	for (const node of taxonomy) {
		const next = [...prefix, node.slug];
		paths.push(next);
		if (node.children?.length) {
			paths.push(...flattenSlugPathsWithPrefixes(node.children, next));
		}
	}

	return paths;
}

export function isSlugPathPrefix(prefix: string[], full: string[]): boolean {
	if (prefix.length === 0) return true;
	if (prefix.length > full.length) return false;
	return prefix.every((slug, index) => full[index] === slug);
}
