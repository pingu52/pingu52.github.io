import assert from "node:assert/strict";
import { describe, it } from "node:test";
import taxonomy from "@/data/category-taxonomy.json";
import {
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
		assert.deepStrictEqual(parseCategoryLabelPath(" Linux / Ubuntu "), [
			"Linux",
			"Ubuntu",
		]);
		assert.deepStrictEqual(parseCategoryLabelPath("///Linux//"), ["Linux"]);
	});

	it("resolves slug paths from label paths with optional leaf enforcement", () => {
		const slugPath = resolveSlugPathFromLabelPath(
			["Linux", "Ubuntu"],
			taxonomyNodes,
		);
		assert.deepStrictEqual(slugPath, ["Linux", "Ubuntu"]);

		const parentOnly = resolveSlugPathFromLabelPath(
			["Linux"],
			taxonomyNodes,
			true,
		);
		assert.equal(parentOnly, null);
	});

	it("resolves category paths, enforcing maximum depth and leaf requirement", () => {
		assert.deepStrictEqual(
			resolveSlugPathFromCategoryPath(["Linux", "WSL2"], taxonomyNodes),
			["Linux", "WSL2"],
		);

		assert.throws(() =>
			resolveSlugPathFromCategoryPath(
				["Linux", "Ubuntu", "Desktop"],
				taxonomyNodes,
			),
		);
	});

	it("resolves post category slug paths preferring explicit categoryPath", () => {
		const pathPreferred = resolvePostCategorySlugPath(
			{ categoryPath: ["Linux", "WSL2"], category: "Ignored" },
			taxonomyNodes,
		);
		assert.deepStrictEqual(pathPreferred, ["Linux", "WSL2"]);

		const fallbackToCategory = resolvePostCategorySlugPath(
			{ category: "Ubuntu" },
			taxonomyNodes,
		);
		assert.deepStrictEqual(fallbackToCategory, ["Linux", "Ubuntu"]);

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
			resolvePostCategorySlugPath({ category: "Linux" }, taxonomyNodes),
		);
	});

	it("builds ancestors and aggregates counts for hierarchical categories", () => {
		const leafCounts = new Map([
			["Linux/Ubuntu", 2],
			["Linux/WSL2", 1],
		]);
		const totals = aggregateCounts(leafCounts, taxonomyNodes);

		assert.deepStrictEqual(getAncestorsForSlugPath(["Linux", "Ubuntu"]), [
			["Linux"],
			["Linux", "Ubuntu"],
		]);

		assert.equal(totals.get("Linux"), 3);
		assert.equal(totals.get("Linux/Ubuntu"), 2);
		assert.equal(totals.get("Linux/WSL2"), 1);
		// Ensure taxonomy nodes exist even with zero posts.
		const findExamples = findNodeBySlugPath(["Examples"], taxonomyNodes);
		assert.ok(findExamples);
		assert.equal(totals.get("Examples"), 0);
	});

	it("creates a leaf label map that errors on duplicate labels", () => {
		const map = buildLeafLabelMap(taxonomyNodes, MAX_CATEGORY_DEPTH);
		assert.deepStrictEqual(map.get("Ubuntu"), ["Linux", "Ubuntu"]);
		assert.deepStrictEqual(map.get("C++"), ["c-plus-plus"]);
	});
});
