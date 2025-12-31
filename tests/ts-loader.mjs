import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();

const virtualModules = new Map([
	["astro:content", path.resolve(projectRoot, "tests/stubs/astro-content.ts")],
	["@utils/post-utils", path.resolve(projectRoot, "tests/stubs/post-utils.ts")],
]);

const aliasMap = [
	{ prefix: "@/", target: path.resolve(projectRoot, "src") },
	{ prefix: "@utils/", target: path.resolve(projectRoot, "src/utils") },
	{ prefix: "@i18n/", target: path.resolve(projectRoot, "src/i18n") },
	{ prefix: "@constants/", target: path.resolve(projectRoot, "src/constants") },
	{ prefix: "@components/", target: path.resolve(projectRoot, "src/components") },
	{ prefix: "@layouts/", target: path.resolve(projectRoot, "src/layouts") },
	{ prefix: "@assets/", target: path.resolve(projectRoot, "src/assets") },
];

const compilerOptions = {
	module: ts.ModuleKind.ESNext,
	target: ts.ScriptTarget.ES2020,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	resolveJsonModule: true,
	esModuleInterop: true,
	allowImportingTsExtensions: true,
	verbatimModuleSyntax: true,
};

const tryExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];

const isAliasMatch = (specifier) =>
	aliasMap.find((entry) => specifier === entry.prefix.slice(0, -1));

function resolveAlias(specifier) {
	for (const entry of aliasMap) {
		if (specifier.startsWith(entry.prefix)) {
			const remainder = specifier.slice(entry.prefix.length);
			return path.join(entry.target, remainder);
		}
	}

	const exact = isAliasMatch(specifier);
	if (exact) {
		return exact.target;
	}

	return null;
}

function resolveWithExtensions(basePath) {
	for (const ext of tryExtensions) {
		const candidate = basePath.endsWith(ext) ? basePath : `${basePath}${ext}`;
		if (ts.sys.fileExists(candidate)) {
			return candidate;
		}
	}
	return null;
}

export async function resolve(specifier, context, nextResolve) {
	if (virtualModules.has(specifier)) {
		return {
			url: pathToFileURL(virtualModules.get(specifier)).href,
			shortCircuit: true,
		};
	}

	const aliasPath = resolveAlias(specifier);
	if (aliasPath) {
		const resolved = resolveWithExtensions(aliasPath);
		if (resolved) {
			return {
				url: pathToFileURL(resolved).href,
				shortCircuit: true,
			};
		}
	}

	const isRelative =
		specifier.startsWith("./") ||
		specifier.startsWith("../") ||
		specifier.startsWith("/");
	if (isRelative && !path.extname(specifier)) {
		const parentDir = context.parentURL
			? path.dirname(fileURLToPath(context.parentURL))
			: projectRoot;
		const absolute = specifier.startsWith("/")
			? path.resolve(projectRoot, specifier.slice(1))
			: path.resolve(parentDir, specifier);
		const resolved = resolveWithExtensions(absolute);
		if (resolved) {
			return {
				url: pathToFileURL(resolved).href,
				shortCircuit: true,
			};
		}
	}

	return nextResolve(specifier, context);
}

function transpileTs(source, fileName) {
	const { outputText } = ts.transpileModule(source, {
		fileName,
		compilerOptions,
	});

	// Ensure import.meta.env is always available for utilities that depend on Astro/Vite env vars.
	const envBootstrap =
		'import.meta.env = Object.assign({ BASE_URL: "/" }, import.meta.env || {});\n';
	return envBootstrap + outputText;
}

export async function load(url, context, nextLoad) {
	if (url.endsWith(".ts") || url.endsWith(".tsx")) {
		const source = await fs.readFile(fileURLToPath(url), "utf8");
		return {
			format: "module",
			source: transpileTs(source, url),
			shortCircuit: true,
		};
	}

	if (url.endsWith(".json")) {
		const source = await fs.readFile(fileURLToPath(url), "utf8");
		return {
			format: "module",
			source: `export default ${source};`,
			shortCircuit: true,
		};
	}

	return nextLoad(url, context);
}
