import assert from "node:assert/strict";
import { describe, it } from "node:test";
import taxonomy from "@/data/category-taxonomy.json";
import {
	type CategoryNode,
	MAX_CATEGORY_DEPTH,
	aggregateCounts,
	buildLeafLabelMap,
	findNodeBySlugPath,
	getAncestorsForSlugPath,
	parseCategoryLabelPath,
	resolvePostCategorySlugPath,
	resolveSlugPathFromCategoryPath,
	resolveSlugPathFromLabelPath,
} from "@utils/category-taxonomy-utils";
import { normalizeTaxonomyLabel, UNCATEGORIZED_SLUG } from "@utils/taxonomy-utils";

const taxonomyNodes = taxonomy;

describe("category-taxonomy-utils", () => {
	it("parses category label paths by trimming and removing empty segments", () => {
		assert.deepStrictEqual(
			parseCategoryLabelPath(" Embedded System / BSP & Build "),
			["Embedded System", "BSP & Build"],
		);
		assert.deepStrictEqual(parseCategoryLabelPath("///System Engineering//"), [
			"System Engineering",
		]);
	});

	it("resolves slug paths from label paths with optional leaf enforcement", () => {
		const slugPath = resolveSlugPathFromLabelPath(
			["System Engineering", "Virtualization"],
			taxonomyNodes,
		);
		assert.deepStrictEqual(slugPath, ["system-engineering", "virtualization"]);

		const parentOnly = resolveSlugPathFromLabelPath(
			["System Engineering"],
			taxonomyNodes,
			true,
		);
		assert.equal(parentOnly, null);
	});

	it("resolves category paths, enforcing maximum depth and leaf requirement", () => {
		assert.deepStrictEqual(
			resolveSlugPathFromCategoryPath(
				["System Engineering", "Virtualization"],
				taxonomyNodes,
			),
			["system-engineering", "virtualization"],
		);

		assert.throws(() =>
			resolveSlugPathFromCategoryPath(
				["Embedded System", "BSP & Build", "Extra"],
				taxonomyNodes,
			),
		);

		// Parent labels must not be used as category paths (must resolve to leaf)
		assert.throws(() =>
			resolveSlugPathFromCategoryPath(["Embedded System"], taxonomyNodes),
		);
	});

	it("resolves post category slug paths preferring explicit categoryPath", () => {
		const pathPreferred = resolvePostCategorySlugPath(
			{
				categoryPath: ["System Engineering", "Virtualization"],
				category: "Ignored",
			},
			taxonomyNodes,
		);
		assert.deepStrictEqual(pathPreferred, ["system-engineering", "virtualization"]);

		const fallbackToCategory = resolvePostCategorySlugPath(
			{ category: "BSP & Build" },
			taxonomyNodes,
		);
		assert.deepStrictEqual(fallbackToCategory, [
			"embedded-system",
			"bsp-build-system",
		]);

		const uncategorized = resolvePostCategorySlugPath(
			{ category: "" },
			taxonomyNodes,
		);
		assert.deepStrictEqual(uncategorized, [UNCATEGORIZED_SLUG]);

		const normalized = resolvePostCategorySlugPath(
			{ category: "  new   label " },
			taxonomyNodes,
		);
		assert.deepStrictEqual(normalized, [normalizeTaxonomyLabel("new   label")]);

		assert.throws(() =>
			resolvePostCategorySlugPath({ category: "System Engineering" }, taxonomyNodes),
		);
	});

	it("builds ancestors and aggregates counts for hierarchical categories", () => {
		const leafCounts = new Map([
			["embedded-system/bsp-build-system", 2],
			["system-engineering/virtualization", 1],
		]);
		const totals = aggregateCounts(leafCounts, taxonomyNodes);

		assert.deepStrictEqual(
			getAncestorsForSlugPath(["embedded-system", "bsp-build-system"]),
			[["embedded-system"], ["embedded-system", "bsp-build-system"]],
		);

		assert.equal(totals.get("embedded-system"), 2);
		assert.equal(totals.get("embedded-system/bsp-build-system"), 2);
		assert.equal(totals.get("system-engineering"), 1);
		assert.equal(totals.get("system-engineering/virtualization"), 1);

		// Ensure taxonomy nodes exist even with zero posts.
		const findNetworkDb = findNodeBySlugPath(
			["computer-science", "network-database"],
			taxonomyNodes,
		);
		assert.ok(findNetworkDb);
		assert.equal(totals.get("computer-science/network-database"), 0);
	});

	it("creates a leaf label map that errors on duplicate labels", () => {
		const map = buildLeafLabelMap(taxonomyNodes, MAX_CATEGORY_DEPTH);
		assert.deepStrictEqual(map.get("BSP & Build"), [
			"embedded-system",
			"bsp-build-system",
		]);
		assert.deepStrictEqual(map.get("C / C++"), ["languages-tools", "c-cpp"]);

		// Verify duplicate leaf labels are rejected (buildLeafLabelMap should throw)
		const dup: CategoryNode[] = [
			{ label: "A", slug: "a", children: [{ label: "Leaf", slug: "leaf-1" }] },
			{ label: "B", slug: "b", children: [{ label: "Leaf", slug: "leaf-2" }] },
		];
		assert.throws(() => buildLeafLabelMap(dup, MAX_CATEGORY_DEPTH));
	});
});
