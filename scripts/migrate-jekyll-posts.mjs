/**
 * Optional: migrate Jekyll _posts -> Astro content collection
 *
 * Usage:
 *   node scripts/migrate-jekyll-posts.mjs
 *
 * - Reads ./_posts/*.md and writes to ./src/content/posts/<slug>.md
 * - Converts Jekyll date prefix (YYYY-MM-DD-title.md) into filename "title.md"
 * - Ensures frontmatter has pubDate (uses date prefix if missing)
 */
import fs from "node:fs";
import path from "node:path";

const srcDir = path.resolve("_posts");
const dstDir = path.resolve("src/content/posts");

if (!fs.existsSync(srcDir)) {
  console.log("No _posts directory found. Skip.");
  process.exit(0);
}
fs.mkdirSync(dstDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".md") || f.endsWith(".markdown"));
for (const f of files) {
  const full = path.join(srcDir, f);
  const raw = fs.readFileSync(full, "utf-8");

  const m = /^(\d{4}-\d{2}-\d{2})-(.+?)\.(md|markdown)$/i.exec(f);
  const dateFromName = m?.[1];
  const slugFromName = m?.[2] ?? f.replace(/\.(md|markdown)$/i, "");

  // naive frontmatter detection
  let out = raw;
  if (raw.startsWith("---")) {
    // if pubDate missing, add it under frontmatter
    const fmEnd = raw.indexOf("\n---", 3);
    if (fmEnd !== -1) {
      const fm = raw.slice(0, fmEnd + 4);
      if (!/\npubDate\s*:/i.test(fm) && dateFromName) {
        const injected = fm.replace(/^---\n/, `---\npubDate: ${dateFromName}\n`);
        out = injected + raw.slice(fmEnd + 4);
      }
    }
  } else {
    // no frontmatter: add minimal
    if (dateFromName) {
      out = `---\ntitle: "${slugFromName}"\npubDate: ${dateFromName}\n---\n\n` + raw;
    } else {
      out = `---\ntitle: "${slugFromName}"\n---\n\n` + raw;
    }
  }

  const dst = path.join(dstDir, `${slugFromName}.md`);
  fs.writeFileSync(dst, out, "utf-8");
  console.log("migrated:", f, "->", path.relative(process.cwd(), dst));
}
