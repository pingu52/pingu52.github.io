import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPostEntry } from "./fixtures/posts.ts";

describe("content-utils getCategoryList", () => {
	it("counts categories and includes uncategorized bucket", async () => {
		const posts = [
			createPostEntry({ slug: "one", category: "Linux" }),
			createPostEntry({ slug: "two", category: "" }),
			createPostEntry({ slug: "three", category: "guides" }),
		];

		(globalThis as any).__TEST_POSTS__ = posts;
		const { getCategoryList } = await import("@utils/content-utils");
		const categories = await getCategoryList();

		delete (globalThis as any).__TEST_POSTS__;

		assert.deepStrictEqual(categories.map((c) => c.name), [
			"guides",
			"Linux",
			"분류되지 않음",
		]);
		assert.deepStrictEqual(categories.map((c) => c.count), [1, 1, 1]);
		assert.equal(
			categories.find((c) => c.name === "분류되지 않음")?.url,
			"/category/uncategorized/",
		);
	});
});
