import {
	normalizeTaxonomyLabel,
	UNCATEGORIZED_SLUG,
} from "@utils/taxonomy-utils";

export type CategoryNode = {
	label: string;
	slug: string;
	children?: CategoryNode[];
};

export const MAX_CATEGORY_DEPTH = 2;

export function isNumericSegment(seg: string): boolean {
	return /^\d+$/.test(seg);
}

export function parseCategoryLabelPath(category: string): string[] {
	return category
		.split("/")
		.map((seg) => seg.trim())
		.filter((seg) => seg !== "");
}

export function isLeaf(node: CategoryNode): boolean {
	return !node.children || node.children.length === 0;
}

function assertValidSlug(slug: string) {
	if (slug.includes("/")) {
		throw new Error(`Invalid category slug contains '/': ${slug}`);
	}
	if (isNumericSegment(slug)) {
		throw new Error(`Invalid category slug is purely numeric: ${slug}`);
	}
}

export function pruneTaxonomyToDepth(
	taxonomy: CategoryNode[],
	maxDepth: number = MAX_CATEGORY_DEPTH,
): CategoryNode[] {
	const prune = (nodes: CategoryNode[], depth: number): CategoryNode[] =>
		nodes.map((node) => {
			assertValidSlug(node.slug);
			if (depth >= maxDepth || !node.children?.length) {
				return { ...node, children: undefined };
			}
			return { ...node, children: prune(node.children, depth + 1) };
		});

	return prune(taxonomy, 1);
}

export function findNodeBySlugPath(
	slugPath: string[],
	taxonomy: CategoryNode[],
): { node: CategoryNode; labelPath: string[] } | null {
	let currentLevel = taxonomy;
	const labelPath: string[] = [];
	let currentNode: CategoryNode | undefined;

	for (const segment of slugPath) {
		currentNode = currentLevel.find((node) => node.slug === segment);
		if (!currentNode) return null;
		labelPath.push(currentNode.label);
		currentLevel = currentNode.children ?? [];
	}

	return currentNode ? { node: currentNode, labelPath } : null;
}

export function resolveSlugPathFromLabelPath(
	labelPath: string[],
	taxonomy: CategoryNode[],
	requireLeaf = false,
): string[] | null {
	let currentLevel = taxonomy;
	const slugPath: string[] = [];

	for (const rawLabel of labelPath) {
		const label = rawLabel.trim();
		if (!label) return null;
		const node = currentLevel.find((candidate) => candidate.label === label);
		if (!node) return null;
		slugPath.push(node.slug);
		currentLevel = node.children ?? [];
	}

	if (requireLeaf && currentLevel.length > 0) {
		const found = findNodeBySlugPath(slugPath, taxonomy);
		if (found && !isLeaf(found.node)) return null;
	}

	return slugPath;
}

export function flattenSlugPathsWithPrefixes(
	taxonomy: CategoryNode[],
	maxDepth: number = MAX_CATEGORY_DEPTH,
): string[][] {
	const paths: string[][] = [];

	const dfs = (nodes: CategoryNode[], prefix: string[], depth: number) => {
		for (const node of nodes) {
			assertValidSlug(node.slug);
			const slugPath = [...prefix, node.slug];
			paths.push(slugPath);
			if (node.children?.length && depth < maxDepth) {
				dfs(node.children, slugPath, depth + 1);
			}
		}
	};

	dfs(taxonomy, [], 1);
	return paths;
}

export function getChildrenBySlugPath(
	slugPath: string[],
	taxonomy: CategoryNode[],
): CategoryNode[] {
	if (slugPath.length === 0) return taxonomy;
	const found = findNodeBySlugPath(slugPath, taxonomy);
	if (!found) return [];
	return found.node.children ?? [];
}

export function buildLeafLabelMap(
	taxonomy: CategoryNode[],
	maxDepth: number = MAX_CATEGORY_DEPTH,
): Map<string, string[]> {
	const map = new Map<string, string[]>();
	const traverse = (nodes: CategoryNode[], prefix: string[], depth: number) => {
		for (const node of nodes) {
			assertValidSlug(node.slug);
			const slugPath = [...prefix, node.slug];
			const nextDepth = depth + 1;
			if (!node.children?.length || depth >= maxDepth) {
				if (map.has(node.label)) {
					throw new Error(
						`Duplicate category label found in taxonomy: ${node.label}`,
					);
				}
				map.set(node.label, slugPath);
				continue;
			}
			if (nextDepth <= maxDepth) {
				traverse(node.children, slugPath, nextDepth);
			}
		}
	};
	traverse(taxonomy, [], 0);
	return map;
}

export function findNodeByLabel(
	taxonomy: CategoryNode[],
	label: string,
	maxDepth: number = MAX_CATEGORY_DEPTH,
): { node: CategoryNode; slugPath: string[] } | null {
	let result: { node: CategoryNode; slugPath: string[] } | null = null;

	const dfs = (nodes: CategoryNode[], prefix: string[], depth: number) => {
		for (const node of nodes) {
			assertValidSlug(node.slug);
			const slugPath = [...prefix, node.slug];
			if (node.label === label) {
				result = { node, slugPath };
				return;
			}
			if (node.children?.length && depth < maxDepth) {
				dfs(node.children, slugPath, depth + 1);
			}
			if (result) return;
		}
	};

	dfs(taxonomy, [], 1);
	return result;
}

export function resolveSlugPathFromCategoryPath(
	categoryPath: string[],
	taxonomy: CategoryNode[],
): string[] | null {
	const cleaned = categoryPath.map((seg) => seg.trim()).filter(Boolean);
	if (cleaned.length === 0) return null;
	if (cleaned.length > MAX_CATEGORY_DEPTH) {
		throw new Error(
			`Category path exceeds maximum depth of ${MAX_CATEGORY_DEPTH}: ${cleaned.join(" / ")}`,
		);
	}
	const slugPath = resolveSlugPathFromLabelPath(cleaned, taxonomy);
	if (!slugPath) return null;
	const found = findNodeBySlugPath(slugPath, taxonomy);
	if (found && !isLeaf(found.node)) {
		throw new Error(
			`Category path must resolve to a leaf node: ${cleaned.join(" / ")}`,
		);
	}
	return slugPath;
}

export function getAncestorsForSlugPath(slugPath: string[]): string[][] {
	const ancestors: string[][] = [];
	for (let i = 1; i <= slugPath.length; i++) {
		ancestors.push(slugPath.slice(0, i));
	}
	return ancestors;
}

export type CategoryLike = {
	category?: string | null;
	categoryPath?: string[];
};

export function resolvePostCategorySlugPath(
	input: CategoryLike,
	taxonomy: CategoryNode[],
): string[] {
	const { categoryPath, category } = input;
	const trimmedPath =
		categoryPath?.map((seg) => seg.trim()).filter(Boolean) ?? [];
	if (trimmedPath.length > 0) {
		const resolved = resolveSlugPathFromCategoryPath(trimmedPath, taxonomy);
		if (!resolved) {
			throw new Error(
				`Category path not found in taxonomy: ${trimmedPath.join(" / ")}`,
			);
		}
		return resolved;
	}

	const single = category?.trim() ?? "";
	if (single === "") return [UNCATEGORIZED_SLUG];

	const leafMap = buildLeafLabelMap(taxonomy);
	const match = leafMap.get(single);
	if (match) return match;

	const labelMatch = findNodeByLabel(taxonomy, single);
	if (labelMatch?.node.children?.length) {
		throw new Error(
			`Category label refers to a parent category. Use categoryPath instead: ${labelMatch.slugPath.join(" / ")}`,
		);
	}

	return [normalizeTaxonomyLabel(single)];
}

export function aggregateCounts(
	leafCounts: Map<string, number>,
	taxonomy: CategoryNode[],
): Map<string, number> {
	const totals = new Map<string, number>();

	const addToTotals = (slugPath: string[], count: number) => {
		for (const ancestor of getAncestorsForSlugPath(slugPath)) {
			const key = ancestor.join("/");
			totals.set(key, (totals.get(key) ?? 0) + count);
		}
	};

	for (const [key, count] of leafCounts.entries()) {
		addToTotals(key.split("/"), count);
	}

	// Ensure taxonomy nodes exist in totals even when zero posts.
	for (const path of flattenSlugPathsWithPrefixes(taxonomy)) {
		const key = path.join("/");
		if (!totals.has(key)) totals.set(key, 0);
	}

	return totals;
}
