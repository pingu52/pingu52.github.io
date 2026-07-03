const DEFAULT_API_BASE_URL = "https://api.umami.is/v1";
const DEFAULT_WEBSITE_ID = "dd7b43b0-3d7a-4adf-8347-42fc439e4913";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

function readEnv(...names) {
	for (const name of names) {
		const value = process.env[name];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function parseDays(value) {
	const raw = Array.isArray(value) ? value[0] : value;
	const parsed = Number(raw ?? 1);
	if (!Number.isFinite(parsed) || parsed < 1) return 1;
	return Math.min(Math.floor(parsed), MAX_RANGE_DAYS);
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
	return toNumber(data?.visitors ?? data?.visits ?? data?.pageviews, 0);
}

async function fetchJson(url, headers) {
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

export default async function handler(request, response) {
	if (request.method !== "GET" && request.method !== "HEAD") {
		response.setHeader("Allow", "GET, HEAD");
		return sendJson(response, 405, { error: "Method not allowed" });
	}

	const apiKey = readEnv("UMAMI_API_KEY");
	const websiteId = readEnv("UMAMI_WEBSITE_ID", "PUBLIC_UMAMI_WEBSITE_ID") || DEFAULT_WEBSITE_ID;
	const apiBaseUrl = readEnv("UMAMI_API_BASE_URL", "UMAMI_API_CLIENT_ENDPOINT") || DEFAULT_API_BASE_URL;

	if (!apiKey) {
		return sendJson(response, 500, {
			error: "Missing UMAMI_API_KEY in server environment variables.",
		});
	}

	try {
		const days = parseDays(request.query?.days);
		const now = Date.now();
		const recentStartAt = startOfKstDayMs(new Date(now - (days - 1) * ONE_DAY_MS));
		const headers = {
			Accept: "application/json",
			"x-umami-api-key": apiKey,
		};

		const recentStatsUrl = buildUrl(apiBaseUrl, `/websites/${websiteId}/stats`, {
			startAt: recentStartAt,
			endAt: now,
		});
		const dateRangeUrl = buildUrl(apiBaseUrl, `/websites/${websiteId}/daterange`);

		const [recentStats, dateRange] = await Promise.all([
			fetchJson(recentStatsUrl, headers),
			fetchJson(dateRangeUrl, headers).catch(() => null),
		]);

		const totalStartAt = Number.isFinite(Date.parse(dateRange?.startDate))
			? Date.parse(dateRange.startDate)
			: 0;
		const totalStatsUrl = buildUrl(apiBaseUrl, `/websites/${websiteId}/stats`, {
			startAt: totalStartAt,
			endAt: now,
		});
		const totalStats = await fetchJson(totalStatsUrl, headers);

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
		return sendJson(response, 502, { error: "Failed to fetch Umami stats." });
	}
}
