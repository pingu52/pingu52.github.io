import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	getCategorySlugPathUrl,
	getCategoryUrl,
	getDir,
	getPostUrlBySlug,
	getTagUrl,
	pathsEqual,
} from "@utils/url-utils";

describe("url-utils", () => {
	it("compares paths case-insensitively and without leading/trailing slashes", () => {
		assert.equal(pathsEqual("/Category/Linux/", "category/linux"), true);
		assert.equal(pathsEqual("/posts", "/other"), false);
	});

	it("constructs common urls with the base url applied", () => {
		// Ensure a predictable base for these assertions.
		(import.meta.env as any).BASE_URL = "/";
		assert.equal(getPostUrlBySlug("hello-world"), "/posts/hello-world/");
		assert.equal(getTagUrl("astro"), "/tag/astro/");
	});

	it("falls back to the archive url when the tag is blank", () => {
		assert.equal(getTagUrl(""), "/archive/");
	});

	it("builds category urls from labels and paths", () => {
		(import.meta.env as any).BASE_URL = "/";
		assert.equal(getCategoryUrl(null), "/category/uncategorized/");
		assert.equal(getCategoryUrl(""), "/category/uncategorized/");
		// leaf label -> slugPath (from taxonomy)
		assert.equal(
			getCategoryUrl("BSP & Build"),
			"/category/embedded-system/bsp-build-system/",
		);
		// labelPath (parent/leaf) -> slugPath (from taxonomy)
		assert.equal(
			getCategoryUrl("System Engineering/Virtualization"),
			"/category/system-engineering/virtualization/",
		);
		assert.equal(
			getCategorySlugPathUrl(["system-engineering", "virtualization"], 3),
			"/category/system-engineering/virtualization/3/",
		);
	});

	it("throws for category label paths exceeding the maximum depth or missing taxonomy nodes", () => {
		assert.throws(() => getCategoryUrl("Embedded System/BSP & Build/Extra"));
		assert.throws(() => getCategoryUrl("Embedded System/Nonexistent"));
	});

	it("returns parent directory portions of a path", () => {
		assert.equal(getDir("/posts/hello-world/index.html"), "/posts/hello-world/");
		assert.equal(getDir("index.html"), "/");
	});
});
