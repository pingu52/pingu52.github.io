import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import type { Element, Root } from "hast";
import katex from "katex";
import rehypeKatex from "rehype-katex";
import sanitizeHtml from "sanitize-html";

const require = createRequire(import.meta.url);

it("discards all noscript content after an implied ancestor close", () => {
	const options = {
		allowedTags: ["div", "img"],
		allowedAttributes: { img: ["src"] },
		nonTextTags: ["script", "style", "textarea", "option", "noscript"],
	};
	assert.equal(
		sanitizeHtml(
			'<div><noscript></div><img src="https://example.com/tracker.gif"></noscript>',
			options,
		),
		"<div></div>",
	);
	assert.equal(
		sanitizeHtml(
			'<div><img src="https://example.com/image.png"></div>',
			options,
		),
		'<div><img src="https://example.com/image.png" /></div>',
	);
});

it("resolves Stylus brace imports through the updated glob API", (t) => {
	const dir = mkdtempSync(join(tmpdir(), "stylus-compat-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	mkdirSync(join(dir, "partials"));
	writeFileSync(join(dir, "partials", "a.styl"), ".first\n  color red\n");
	writeFileSync(join(dir, "partials", "b.styl"), ".second\n  color blue\n");
	const css = require("stylus").render('@import "partials/{a,b}.styl"', {
		filename: join(dir, "entry.styl"),
	});
	assert.match(css, /\.first\s*\{\s*color: #f00;/);
	assert.match(css, /\.second\s*\{\s*color: #00f;/);
});

it("generates PostCSS input identifiers through the updated Nanoid API", () => {
	const coreRequire = createRequire(require.resolve("@expressive-code/core"));
	const postcss = coreRequire("postcss");
	const input = postcss.parse("a { color: red }").source.input;
	assert.match(input.id, /^<input css [\w-]{6}>$/);
	assert.equal(input.css, "a { color: red }");
});

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
