import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  // astro.config.mjs의 site 값을 기반으로 절대 URL 생성
  const sitemapUrl = new URL("sitemap-index.xml", site!).href;

  const robotsTxt = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${sitemapUrl}`,
    "",
  ].join("\n");

  return new Response(robotsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};

