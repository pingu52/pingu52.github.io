import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const pathAliases = [
	{ prefix: "@components/", target: "src/components/" },
	{ prefix: "@assets/", target: "src/assets/" },
	{ prefix: "@constants/", target: "src/constants/" },
	{ prefix: "@utils/", target: "src/utils/" },
	{ prefix: "@i18n/", target: "src/i18n/" },
	{ prefix: "@layouts/", target: "src/layouts/" },
	{ prefix: "@/", target: "src/" },
];

const exists = async (candidate) => {
	try {
		await access(candidate);
		return true;
	} catch {
		return false;
	}
};

const resolveWithExtensions = async (basePath) => {
	const candidates = [
		basePath,
		`${basePath}.ts`,
		`${basePath}.js`,
		path.join(basePath, "index.ts"),
		path.join(basePath, "index.js"),
	];

	for (const candidate of candidates) {
		if (await exists(candidate)) return candidate;
	}
	return null;
};

export async function resolve(specifier, context, next) {
	const isRelativeOrAbsolute =
		specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
	if (isRelativeOrAbsolute && path.extname(specifier) === "") {
		const parentUrl = context.parentURL ?? pathToFileURL(projectRoot).href;
		const parentPath = parentUrl.startsWith("file:")
			? fileURLToPath(parentUrl)
			: projectRoot;
		const basePath = path.resolve(path.dirname(parentPath), specifier);
		const resolved = await resolveWithExtensions(basePath);
		if (resolved) {
			return {
				url: pathToFileURL(resolved).href,
				shortCircuit: true,
			};
		}
	}

	if (specifier.startsWith("astro:")) {
		const stub = [
			'export const getCollection = () => { throw new Error("astro:content is not available in tests"); };',
			"export const defineCollection = () => {};",
			"export const reference = () => {};",
			"export const z = {};",
		].join("");
		return {
			url: `data:text/javascript,${stub}`,
			shortCircuit: true,
		};
	}

	const alias = pathAliases.find(({ prefix }) => specifier.startsWith(prefix));
	if (alias) {
		const relative = specifier.slice(alias.prefix.length);
		const resolvedPath = path.join(projectRoot, alias.target, relative);
		const resolved = await resolveWithExtensions(resolvedPath);
		if (resolved) {
			return {
				url: pathToFileURL(resolved).href,
				shortCircuit: true,
			};
		}
	}
	return next(specifier, context);
}

export async function load(url, context, next) {
	if (url.endsWith(".json")) {
		const jsonContent = await readFile(new URL(url), "utf8");
		return {
			format: "module",
			source: `export default ${jsonContent};`,
			shortCircuit: true,
		};
	}

	if (!url.endsWith(".ts")) {
		return next(url, context);
	}

	const source = await readFile(new URL(url));
	const { outputText } = ts.transpileModule(source.toString(), {
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			target: ts.ScriptTarget.ES2022,
			jsx: ts.JsxEmit.Preserve,
		},
		fileName: fileURLToPath(url),
	});

	return {
		format: "module",
		source: outputText,
		shortCircuit: true,
	};
}
