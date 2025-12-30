export type CategoryNode = {
	label: string;
	slug: string;
	children?: CategoryNode[];
};

export function isNumericSegment(seg: string): boolean {
	return /^\d+$/.test(seg);
}

export function parseCategoryLabelPath(category: string): string[] {
	return category
		.split("/")
		.map((seg) => seg.trim())
		.filter((seg) => seg !== "");
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

	return slugPath;
}

function assertValidSlug(slug: string) {
	if (slug.includes("/")) {
		throw new Error(`Invalid category slug contains '/': ${slug}`);
	}
	if (isNumericSegment(slug)) {
		throw new Error(`Invalid category slug is purely numeric: ${slug}`);
	}
}

export function flattenSlugPathsWithPrefixes(
	taxonomy: CategoryNode[],
): string[][] {
	const paths: string[][] = [];

	const dfs = (nodes: CategoryNode[], prefix: string[]) => {
		for (const node of nodes) {
			assertValidSlug(node.slug);
			const slugPath = [...prefix, node.slug];
			paths.push(slugPath);
			if (node.children?.length) {
				dfs(node.children, slugPath);
			}
		}
	};

	dfs(taxonomy, []);
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
