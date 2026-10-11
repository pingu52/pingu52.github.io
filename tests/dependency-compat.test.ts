import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import type { Element, Root } from "hast";
import katex from "katex";
import rehypeKatex from "rehype-katex";

const require = createRequire(import.meta.url);

it("preserves nested code styles with the patched selector parser", async () => {
	const coreRequire = createRequire(require.resolve("@expressive-code/core"));
	const postcss = coreRequire("postcss");
	const nested = coreRequire("postcss-nested");
	const result = await postcss([nested]).process(
		'.prose { & :is(h1, h2)::before { content: "#"; } &:not(.disabled) { & .child + .child { margin: 1rem; } } }',
		{ from: undefined },
	);
	assert.equal(
		result.css,
		'.prose :is(h1, h2)::before { content: "#"; } .prose:not(.disabled) .child + .child { margin: 1rem; }',
	);
});

it("keeps common pseudo elements in typography selectors", () => {
	const {
		commonTrailingPseudos,
	} = require("@tailwindcss/typography/src/utils.js");
	assert.deepEqual(
		commonTrailingPseudos("h1::marker::before, h2::marker::before"),
		["::marker::before", "h1, h2"],
	);
	assert.deepEqual(commonTrailingPseudos("h1::before, h2::after"), [
		null,
		"h1::before, h2::after",
	]);
});

it("renders inline and display math with the imported KaTeX styles", () => {
	const rehypeRequire = createRequire(require.resolve("rehype-katex"));
	assert.equal(rehypeRequire("katex").version, katex.version);
	const css = readFileSync(require.resolve("katex/dist/katex.css"), "utf8");
	assert.ok(css.includes(".katex-base"));
	for (const display of [false, true]) {
		const tree: Root = {
			type: "root",
			children: [
				{
					type: "element",
					tagName: "code",
					properties: { className: [display ? "math-display" : "math-inline"] },
					children: [{ type: "text", value: String.raw`x^2 + \frac{1}{2}` }],
				},
			],
		};
		rehypeKatex()(tree, {
			message() {
				assert.fail("Math rendering failed");
			},
		} as Parameters<ReturnType<typeof rehypeKatex>>[1]);
		assert.deepEqual((tree.children[0] as Element).properties.className, [
			display ? "katex-display" : "katex",
		]);
		assert.match(JSON.stringify(tree), /"tagName":"math"/);
		assert.match(JSON.stringify(tree), /"katex-base"/);
	}
});
