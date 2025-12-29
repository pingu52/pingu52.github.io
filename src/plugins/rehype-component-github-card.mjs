/// <reference types="mdast" />
import { h } from "hastscript";
import { visit } from "unist-util-visit";

const repoCache = new Map();

async function fetchRepoData(repo) {
	if (repoCache.has(repo)) return repoCache.get(repo);

	try {
		const response = await fetch(`https://api.github.com/repos/${repo}`, {
			headers: {
				"User-Agent": "astro-github-card",
				Accept: "application/vnd.github+json",
			},
			referrerPolicy: "no-referrer",
		});

		if (!response.ok) {
			throw new Error(`GitHub API responded with ${response.status}`);
		}

		const data = await response.json();
		const repoData = {
			description:
				data.description?.replace(/:[a-zA-Z0-9_]+:/g, "") ||
				"Description not set",
			language: data.language || "",
			forks: data.forks ?? 0,
			stars: data.stargazers_count ?? 0,
			license: data.license?.spdx_id || "no-license",
			avatarUrl: data.owner?.avatar_url || "",
		};

		repoCache.set(repo, repoData);
		return repoData;
	} catch (error) {
		console.warn(`[GITHUB-CARD] Failed to prefetch ${repo}:`, error.message);
		repoCache.set(repo, null);
		return null;
	}
}

export function rehypeGithubCardPrefetch() {
	return async (tree) => {
		const repos = new Set();
		visit(tree, "element", (node) => {
			if (node.tagName === "github" && node.properties?.repo) {
				repos.add(node.properties.repo);
			}
		});

		await Promise.all(Array.from(repos).map((repo) => fetchRepoData(repo)));
	};
}

function formatCompactNumber(value) {
	return new Intl.NumberFormat("en-us", {
		notation: "compact",
		maximumFractionDigits: 1,
	})
		.format(value)
		.replaceAll("\u202f", "");
}

/**
 * Creates a GitHub Card component.
 *
 * @param {Object} properties - The properties of the component.
 * @param {string} properties.repo - The GitHub repository in the format "owner/repo".
 * @param {import('mdast').RootContent[]} children - The children elements of the component.
 * @returns {import('mdast').Parent} The created GitHub Card component.
 */
export function GithubCardComponent(properties, children) {
	if (Array.isArray(children) && children.length !== 0)
		return h("div", { class: "hidden" }, [
			'Invalid directive. ("github" directive must be leaf type "::github{repo="owner/repo"}")',
		]);

	if (!properties.repo || !properties.repo.includes("/"))
		return h(
			"div",
			{ class: "hidden" },
			'Invalid repository. ("repo" attributte must be in the format "owner/repo")',
		);

	const repo = properties.repo;
	const cardUuid = `GC${Math.random().toString(36).slice(-6)}`; // Collisions are not important
	const repoData = repoCache.get(repo);

	const nAvatar = h(`div#${cardUuid}-avatar`, {
		class: "gc-avatar",
		style: repoData?.avatarUrl
			? `background-image: url(${repoData.avatarUrl}); background-color: transparent;`
			: undefined,
	});
	const nLanguage = h(
		`span#${cardUuid}-language`,
		{ class: "gc-language" },
		repoData?.language || "",
	);

	const nTitle = h("div", { class: "gc-titlebar" }, [
		h("div", { class: "gc-titlebar-left" }, [
			h("div", { class: "gc-owner" }, [
				nAvatar,
				h("div", { class: "gc-user" }, repo.split("/")[0]),
			]),
			h("div", { class: "gc-divider" }, "/"),
			h("div", { class: "gc-repo" }, repo.split("/")[1]),
		]),
		h("div", { class: "github-logo" }),
	]);

	const nDescription = h(
		`div#${cardUuid}-description`,
		{ class: "gc-description" },
		repoData?.description || "Description not set",
	);

	const nStars = h(
		`div#${cardUuid}-stars`,
		{ class: "gc-stars" },
		repoData ? formatCompactNumber(repoData.stars) : "0",
	);
	const nForks = h(
		`div#${cardUuid}-forks`,
		{ class: "gc-forks" },
		repoData ? formatCompactNumber(repoData.forks) : "0",
	);
	const nLicense = h(
		`div#${cardUuid}-license`,
		{ class: "gc-license" },
		repoData?.license || "no-license",
	);

	return h(
		`a#${cardUuid}-card`,
		{
			class: `card-github no-styling${repoData ? "" : " fetch-error"}`,
			href: `https://github.com/${repo}`,
			target: "_blank",
			repo,
		},
		[
			nTitle,
			nDescription,
			h("div", { class: "gc-infobar" }, [nStars, nForks, nLicense, nLanguage]),
		],
	);
}
