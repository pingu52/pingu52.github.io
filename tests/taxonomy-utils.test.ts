import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPostEntry } from "./fixtures/posts.ts";
import {
	buildCategoryStaticPaths,
	collectCategories,
	collectTags,
	decodeTaxonomySegment,
	encodeTaxonomySegment,
	normalizeTaxonomyLabel,
	taxonomyKey,
	UNCATEGORIZED_SLUG,
} from "@utils/taxonomy-utils";

describe("taxonomy-utils", () => {
	it("normalizes taxonomy labels by trimming and collapsing whitespace", () => {
		assert.equal(normalizeTaxonomyLabel("  Yocto   Build  "), "Yocto Build");
		assert.equal(normalizeTaxonomyLabel(""), "");
	});

	it("builds a stable taxonomy key case-insensitively", () => {
		assert.equal(taxonomyKey("Linux"), taxonomyKey(" linux "));
	});

	it("encodes and decodes taxonomy segments safely", () => {
		assert.equal(encodeTaxonomySegment(" Yocto Build "), "Yocto%20Build");
		assert.equal(decodeTaxonomySegment("Yocto%20Build"), "Yocto Build");
		assert.equal(decodeTaxonomySegment("bad%"), "bad%");
	});

	it("collects categories with case-insensitive grouping and uncategorized flagging", () => {
		const posts = [
			createPostEntry({ slug: "one", category: "Linux" }),
			createPostEntry({ slug: "two", category: " linux " }),
			createPostEntry({ slug: "three", category: "" }),
			createPostEntry({ slug: "four", category: "Guides" }),
		];

		const result = collectCategories(posts);
		assert.deepStrictEqual(result.categories, ["Guides", "Linux"]);
		assert.equal(result.hasUncategorized, true);
	});

	it("collects tags with case-insensitive grouping", () => {
		const posts = [
			createPostEntry({ slug: "one", tags: ["Astro", "Blog"] }),
			createPostEntry({ slug: "two", tags: ["astro", "blog", "Notes"] }),
		];

		assert.deepStrictEqual(collectTags(posts), ["Astro", "Blog", "Notes"]);
	});

	it("builds category static paths grouped by normalized category labels", () => {
		const posts = [
			createPostEntry({ slug: "one", category: "Linux" }),
			createPostEntry({ slug: "two", category: " linux " }),
			createPostEntry({ slug: "three", category: "Guides" }),
			createPostEntry({ slug: "four", category: "" }),
		];

		const calls: Array<{
			slugList: string[];
			params: { category: string };
			props: { taxonomyTitle: string; taxonomyKey: string };
			pageSize?: number;
		}> = [];

		const paginate = (data, args) => {
			calls.push({
				slugList: data.map((post) => post.slug),
				params: args?.params ?? { category: "" },
				props: args?.props ?? { taxonomyKey: "", taxonomyTitle: "" },
				pageSize: args?.pageSize,
			});
			return [
				{
					params: args?.params,
					props: args?.props,
					slugList: data.map((post) => post.slug),
					pageSize: args?.pageSize,
				},
			];
		};

		const paths = buildCategoryStaticPaths(paginate as any, posts, 10);

		assert.equal(paths.length, 3);
		assert.deepStrictEqual(calls.map((c) => c.params.category), [
			"Guides",
			"Linux",
			UNCATEGORIZED_SLUG,
		]);
		assert.deepStrictEqual(calls.map((c) => c.slugList.sort()), [
			["three"],
			["one", "two"],
			["four"],
		]);
		assert.ok(calls.every((c) => c.pageSize === 10));
	});
});
