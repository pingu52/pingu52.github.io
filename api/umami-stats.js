const DEFAULT_UMAMI_BASE_URL = "https://cloud.umami.is";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

function readEnv(...names) {
	for (const name of names) {
		const value = process.env[name];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function firstQueryValue(value) {
	return Array.isArray(value) ? value[0] : value;
}

function parseDays(value) {
	const raw = firstQueryValue(value);
	const parsed = Number(raw ?? 1);
	if (!Number.isFinite(parsed) || parsed < 1) return 1;
	return Math.min(Math.floor(parsed), MAX_RANGE_DAYS);
}

function normalizeUmamiBaseUrl(value) {
	const raw = (value || DEFAULT_UMAMI_BASE_URL).replace(/\/+$/, "");
	try {
		const url = new URL(raw);
		if (url.hostname === "analytics.umami.is") {
			url.hostname = "cloud.umami.is";
		}
		url.search = "";
		url.hash = "";
		return url.toString().replace(/\/+$/, "");
	} catch {
		return DEFAULT_UMAMI_BASE_URL;
	}
}

function parseShareSource(value) {
	if (!value) return { shareId: undefined, baseUrl: undefined };
	const raw = value.trim();
	try {
		const url = new URL(raw);
		const parts = url.pathname.split("/").filter(Boolean);
		const shareIndex = parts.indexOf("share");
		const shareId = shareIndex >= 0 ? parts[shareIndex + 1] : parts.at(-1);
		const basePathParts = shareIndex >= 0 ? parts.slice(0, shareIndex) : [];
		const basePath = basePathParts.length > 0 ? `/${basePathParts.join("/")}` : "";

		return {
			shareId,
			baseUrl: normalizeUmamiBaseUrl(`${url.origin}${basePath}`),
		};
	} catch {
		return {
			shareId: raw.replace(/^\/+|\/+$/g, ""),
			baseUrl: undefined,
		};
	}
}

function getKstDateParts(date) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Seoul",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function startOfKstDayMs(date) {
	const { year, month, day } = getKstDateParts(date);
	return Date.parse(`${year}-${month}-${day}T00:00:00+09:00`);
}

function buildUrl(baseUrl, pathname, params = {}) {
	const url = new URL(`${baseUrl.replace(/\/+$/, "")}${pathname}`);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
	}
	return url;
}

function toNumber(value, fallback = 0) {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function visitorCount(data) {
	return toNumber(data?.visits ?? data?.visitors ?? data?.pageviews, 0);
}

async function fetchJson(url, headers = {}) {
	const response = await fetch(url, { headers });
	const text = await response.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = { raw: text };
	}
	if (!response.ok) {
		const message = data?.error?.message || data?.message || response.statusText;
		throw new Error(`Umami API ${response.status}: ${message}`);
	}
	return data;
}

function sendJson(response, statusCode, body, cacheControl) {
	if (cacheControl) response.setHeader("Cache-Control", cacheControl);
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	response.statusCode = statusCode;
	response.end(JSON.stringify(body));
}

function safeErrorMessage(error) {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]");
}

async function buildShareClient(request) {
	const queryShareSource = firstQueryValue(request.query?.share || request.query?.shareId);
	const envShareSource = readEnv("PUBLIC_UMAMI_SHARE_ID", "UMAMI_SHARE_ID", "PUBLIC_UMAMI_SHARE_SLUG", "UMAMI_SHARE_SLUG");
	const shareSource = queryShareSource || envShareSource;
	const parsedShare = parseShareSource(shareSource);
	const queryBaseUrl = firstQueryValue(request.query?.baseUrl);
	const envBaseUrl = readEnv("PUBLIC_UMAMI_BASE_URL", "UMAMI_BASE_URL");
	const shareId = parsedShare.shareId;
	const baseUrl = normalizeUmamiBaseUrl(queryBaseUrl || parsedShare.baseUrl || envBaseUrl);

	if (!shareId) {
		const error = new Error("MISSING_SHARE_ID");
		error.statusCode = 500;
		throw error;
	}

	const shareUrl = buildUrl(baseUrl, `/api/share/${encodeURIComponent(shareId)}`);
	const share = await fetchJson(shareUrl, {
		Accept: "application/json",
	});

	if (!share?.websiteId || !share?.token) {
		const error = new Error("INVALID_SHARE_RESPONSE");
		error.statusCode = 502;
		throw error;
	}

	return {
		baseUrl,
		websiteId: share.websiteId,
		headers: {
			Accept: "application/json",
			["x-umami-" + "share-token"]: share.token,
			["x-umami-" + "share-context"]: "1",
		},
	};
}

export default async function handler(request, response) {
	if (request.method !== "GET" && request.method !== "HEAD") {
		response.setHeader("Allow", "GET, HEAD");
		return sendJson(response, 405, { error: "Method not allowed" });
	}

	try {
		const days = parseDays(request.query?.days);
		const now = Date.now();
		const recentStartAt = startOfKstDayMs(new Date(now - (days - 1) * ONE_DAY_MS));
		const client = await buildShareClient(request);

		const recentStatsUrl = buildUrl(client.baseUrl, `/api/websites/${client.websiteId}/stats`, {
			startAt: recentStartAt,
			endAt: now,
		});
		const dateRangeUrl = buildUrl(client.baseUrl, `/api/websites/${client.websiteId}/daterange`);

		const [recentStats, dateRange] = await Promise.all([
			fetchJson(recentStatsUrl, client.headers),
			fetchJson(dateRangeUrl, client.headers).catch(() => null),
		]);

		const totalStartAt = Number.isFinite(Date.parse(dateRange?.startDate))
			? Date.parse(dateRange.startDate)
			: 0;
		const totalStatsUrl = buildUrl(client.baseUrl, `/api/websites/${client.websiteId}/stats`, {
			startAt: totalStartAt,
			endAt: now,
		});
		const totalStats = await fetchJson(totalStatsUrl, client.headers);

		return sendJson(
			response,
			200,
			{
				recent: visitorCount(recentStats),
				total: visitorCount(totalStats),
				days,
				updatedAt: new Date(now).toISOString(),
			},
			"public, s-maxage=300, stale-while-revalidate=600",
		);
	} catch (error) {
		console.error("[umami-stats]", error);
		return sendJson(response, error?.statusCode || 502, {
			error: "Failed to fetch Umami stats.",
			message: safeErrorMessage(error),
		});
	}
}
