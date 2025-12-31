import assert from "node:assert/strict";
import test from "node:test";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { buildCategoryList, type Category } from "./content-utils";
import type { PostEntry } from "./post-utils";
import { UNCATEGORIZED_SLUG } from "./taxonomy-utils";

type MinimalPost = Pick<PostEntry, "data">;

const createPost = (category: string | null | undefined): MinimalPost =>
	({ data: { category } } as unknown as PostEntry);

const uncategorizedLabel = i18n(I18nKey.uncategorized);

const findByName = (categories: Category[], name: string) =>
	categories.find((category) => category.name.toLowerCase() === name.toLowerCase());

test("collapses categories case-insensitively with normalized labels", () => {
	const categories = buildCategoryList([
		createPost("AI"),
		createPost("ai"),
		createPost(" AI "),
	]);

	const aiCategory = findByName(categories, "ai");
	assert.ok(aiCategory, "AI category should exist");
	assert.equal(aiCategory.count, 3);
	assert.match(
		aiCategory.url,
		/\/category\/ai\//i,
		"AI category URL should be stable",
	);
});

test("uses a stable uncategorized slug key and localized label", () => {
	const categories = buildCategoryList([createPost(""), createPost("  ")]);

	const uncategorized = findByName(categories, uncategorizedLabel);
	assert.ok(uncategorized, "Uncategorized category should exist");
	assert.equal(uncategorized.count, 2);
	assert.match(
		uncategorized.url,
		new RegExp(`/category/${UNCATEGORIZED_SLUG}/`),
		"Uncategorized category should use slug path in URLs",
	);
});
