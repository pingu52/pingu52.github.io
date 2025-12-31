#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const TAXONOMY_PATH = path.join(ROOT, "src/data/category-taxonomy.json");
const POSTS_BASE_DIR = path.join(ROOT, "src/contents/posts");

// depth=2 고정(요구사항)
const MAX_DEPTH = 2;

/* ------------------------ utils ------------------------ */

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function readJSON(p) {
  if (!fs.existsSync(p)) die(`파일이 없습니다: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function todayYMD() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function slugify(s) {
  const norm = s
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return norm || "category";
}

function slugifyFileName(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "new-post";
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

function validateDepth(slugPath) {
  if (slugPath.length > MAX_DEPTH) die(`depth 제한(${MAX_DEPTH}) 초과: ${slugPath.join("/")}`);
}

function splitPathStr(s) {
  return String(s)
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isUrlSafeSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function ensureSingleLevelDirName(dirNameRaw) {
  const dirName = String(dirNameRaw).trim().replace(/^\/+|\/+$/g, "");
  if (!dirName) return "";
  // 중첩 금지
  if (dirName.includes("/") || dirName.includes("\\"))
    die(`--dir는 중첩 폴더를 지원하지 않습니다. 예: --dir "2025-12-31" (입력: "${dirNameRaw}")`);
  // 간단한 안전성(원하면 더 강하게 가능)
  if (dirName.includes("..")) die(`--dir에 ".."는 사용할 수 없습니다. (입력: "${dirNameRaw}")`);
  return dirName;
}

function uniqueFilePath(dir, baseName, ext = ".md") {
  let candidate = path.join(dir, `${baseName}${ext}`);
  if (!fs.existsSync(candidate)) return candidate;

  for (let i = 2; i < 1000; i++) {
    candidate = path.join(dir, `${baseName}-${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  die(`파일명이 너무 많이 충돌합니다: ${baseName}${ext}`);
}

function openInVSCode(filePath) {
  const r = spawnSync("code", [filePath], { stdio: "inherit" });
  if (r.error) {
    console.warn(`--open 실패: 'code' 명령을 찾지 못했습니다. VS Code에서 Shell Command 설치 후 다시 시도하세요.`);
  }
}

/* ------------------------ traversal helpers ------------------------ */

function flattenAll(nodeArray, prefix = []) {
  const out = [];
  for (const n of nodeArray) {
    const next = [...prefix, n];
    out.push(next);
    if (Array.isArray(n.children) && n.children.length > 0) {
      out.push(...flattenAll(n.children, next));
    }
  }
  return out;
}

function flattenLeaves(nodeArray, prefix = []) {
  const out = [];
  for (const n of nodeArray) {
    const next = [...prefix, n];
    if (Array.isArray(n.children) && n.children.length > 0) {
      out.push(...flattenLeaves(n.children, next));
    } else {
      out.push(next);
    }
  }
  return out;
}

function nodePathToStrings(nodePath) {
  return {
    labels: nodePath.map((n) => n.label),
    slugs: nodePath.map((n) => n.slug),
  };
}

function findParentAndIndexBySlugPath(taxonomy, slugPath) {
  if (slugPath.length === 0) return null;

  let level = taxonomy;
  let parentArray = null;
  let idx = -1;
  let node = null;

  for (let i = 0; i < slugPath.length; i++) {
    const seg = slugPath[i];
    idx = level.findIndex((n) => n.slug === seg);
    if (idx === -1) return null;
    node = level[idx];
    parentArray = level;

    if (i < slugPath.length - 1) {
      node.children = node.children ?? [];
      level = node.children;
    }
  }
  return { parentArray, index: idx, node };
}

function findSlugPathByLabelPath(taxonomy, labelParts) {
  let level = taxonomy;
  const slugPath = [];

  for (const label of labelParts) {
    const node = level.find((n) => n.label === label) ?? null;
    if (!node) return null;
    slugPath.push(node.slug);
    level = node.children ?? [];
  }
  return slugPath;
}

/* ------------------------ taxonomy commands ------------------------ */

function cmdTaxonomyList(taxonomy) {
  const all = flattenAll(taxonomy).map((p) => nodePathToStrings(p));
  for (const item of all) {
    console.log(`${item.labels.join(" > ")}   (${item.slugs.join("/")})`);
  }
}

function cmdTaxonomyAdd(taxonomy, args) {
  const pathStr = args.path;
  if (!pathStr) die('필수: --path "OS/Linux" 또는 --path "Guides"');

  const labels = splitPathStr(pathStr);
  if (labels.length < 1) die("path가 비어있습니다.");
  if (labels.length > MAX_DEPTH) die(`depth 제한(${MAX_DEPTH}) 초과: ${labels.join("/")}`);

  const slugOverride = typeof args.slug === "string" ? splitPathStr(args.slug) : null;
  if (slugOverride && slugOverride.length !== labels.length) {
    die(`--slug segment 수가 --path와 다릅니다. path=${labels.length}, slug=${slugOverride.length}`);
  }

  let level = taxonomy;
  const slugPath = [];

  for (let depth = 0; depth < labels.length; depth++) {
    const label = labels[depth];
    const slug = (slugOverride?.[depth]) || slugify(label);

    validateDepth([...slugPath, slug]);

    let node = level.find((n) => n.slug === slug);
    if (!node) {
      node = { label, slug };
      if (depth < labels.length - 1) node.children = [];
      level.push(node);
      level.sort((a, b) => a.label.localeCompare(b.label, "en"));
    } else {
      if (node.label !== label) {
        console.warn(`경고: slug "${slug}"는 이미 label="${node.label}"로 존재합니다. 입력 label="${label}"`);
      }
    }

    slugPath.push(slug);
    if (depth < labels.length - 1) {
      node.children = node.children ?? [];
      level = node.children;
    }
  }

  console.log(`추가/확인 완료: ${labels.join(" > ")} (${slugPath.join("/")})`);
  return taxonomy;
}

async function cmdTaxonomyRm(taxonomy, args) {
  const labelPathStr = typeof args.path === "string" ? args.path : "";
  const slugPathStr = typeof args.slug === "string" ? args.slug : "";

  if (!labelPathStr && !slugPathStr) {
    die('필수: --path "OS/Linux" 또는 --slug "os/linux"');
  }

  let slugPath = null;
  if (slugPathStr) {
    slugPath = splitPathStr(slugPathStr);
  } else {
    const labelParts = splitPathStr(labelPathStr);
    slugPath = findSlugPathByLabelPath(taxonomy, labelParts);
    if (!slugPath) die(`삭제 대상(라벨 경로)을 찾지 못했습니다: ${labelParts.join(" > ")}`);
  }

  validateDepth(slugPath);

  const found = findParentAndIndexBySlugPath(taxonomy, slugPath);
  if (!found) die(`삭제 대상(슬러그 경로)을 찾지 못했습니다: ${slugPath.join("/")}`);

  const { parentArray, index, node } = found;

  const confirm = String(await prompt(`정말 삭제할까요? ${node.label} (${slugPath.join("/")}) [y/N]: `)).trim().toLowerCase();
  if (confirm !== "y" && confirm !== "yes") {
    console.log("취소되었습니다.");
    return taxonomy;
  }

  parentArray.splice(index, 1);
  console.log(`삭제 완료: ${node.label} (${slugPath.join("/")})`);
  return taxonomy;
}

async function cmdTaxonomyRename(taxonomy, args) {
  const labelPathStr = typeof args.path === "string" ? args.path : "";
  const slugPathStr = typeof args.slug === "string" ? args.slug : "";
  const newLabel = typeof args.label === "string" ? args.label : "";
  const newSlugRaw =
    typeof args.newslug === "string" ? args.newslug :
    (typeof args.slugto === "string" ? args.slugto : "");

  if (!labelPathStr && !slugPathStr) die('필수: --path "OS/Linux" 또는 --slug "os/linux"');
  if (!newLabel && !newSlugRaw) die('필수: --label "새라벨" 또는 --newslug "새-slug"');

  let slugPath = null;
  if (slugPathStr) {
    slugPath = splitPathStr(slugPathStr);
  } else {
    const labelParts = splitPathStr(labelPathStr);
    slugPath = findSlugPathByLabelPath(taxonomy, labelParts);
    if (!slugPath) die(`rename 대상(라벨 경로)을 찾지 못했습니다: ${labelParts.join(" > ")}`);
  }

  validateDepth(slugPath);

  const found = findParentAndIndexBySlugPath(taxonomy, slugPath);
  if (!found) die(`rename 대상(슬러그 경로)을 찾지 못했습니다: ${slugPath.join("/")}`);

  const { parentArray, index, node } = found;

  if (newSlugRaw) {
    const proposed = slugify(newSlugRaw);
    const dup = parentArray.some((n, i) => i !== index && n.slug === proposed);
    if (dup) die(`같은 레벨에 slug="${proposed}"가 이미 존재합니다. 다른 slug를 사용하세요.`);
    node.slug = proposed;
  }

  if (newLabel) node.label = newLabel;

  parentArray.sort((a, b) => a.label.localeCompare(b.label, "en"));

  console.log(`rename 완료: label="${node.label}" slug="${node.slug}"`);
  return taxonomy;
}

function cmdTaxonomyCheck(taxonomy) {
  const all = flattenAll(taxonomy);
  const leaves = flattenLeaves(taxonomy);

  const errors = [];
  const warnings = [];

  // depth check
  for (const p of all) {
    const { labels, slugs } = nodePathToStrings(p);
    if (slugs.length > MAX_DEPTH) {
      errors.push(`depth>${MAX_DEPTH}: ${labels.join(" > ")} (${slugs.join("/")})`);
    }
  }

  // slug URL-safe check (warning)
  for (const p of all) {
    const { labels, slugs } = nodePathToStrings(p);
    const last = slugs.at(-1);
    if (last && !isUrlSafeSlug(last)) {
      warnings.push(`slug가 URL-safe(kebab) 아님: ${labels.join(" > ")} (slug="${last}")`);
    }
  }

  // sibling slug duplicates (error)
  function checkSiblingDuplicates(nodes, parentLabels = []) {
    const seen = new Map();
    for (const n of nodes) {
      if (seen.has(n.slug)) {
        errors.push(`같은 레벨 slug 중복: ${[...parentLabels, n.label].join(" > ")} (slug="${n.slug}")`);
      } else {
        seen.set(n.slug, true);
      }
    }
    for (const n of nodes) {
      if (Array.isArray(n.children) && n.children.length > 0) {
        checkSiblingDuplicates(n.children, [...parentLabels, n.label]);
      }
    }
  }
  checkSiblingDuplicates(taxonomy);

  // leaf label duplicates (warning)
  const leafLabelSeen = new Map();
  for (const p of leaves) {
    const { labels, slugs } = nodePathToStrings(p);
    const leafLabel = labels.at(-1);
    const key = leafLabel;
    const existing = leafLabelSeen.get(key);
    if (!existing) leafLabelSeen.set(key, [`${labels.join(" > ")} (${slugs.join("/")})`]);
    else existing.push(`${labels.join(" > ")} (${slugs.join("/")})`);
  }
  for (const [label, arr] of leafLabelSeen.entries()) {
    if (arr.length > 1) {
      warnings.push(`leaf label 중복(매핑 충돌 가능): "${label}"\n  - ${arr.join("\n  - ")}`);
    }
  }

  // empty children arrays (warning)
  for (const p of all) {
    const { labels, slugs } = nodePathToStrings(p);
    const node = p.at(-1);
    if (node && "children" in node && Array.isArray(node.children) && node.children.length === 0) {
      warnings.push(`children가 빈 배열: ${labels.join(" > ")} (${slugs.join("/")}) (leaf로 두려면 children 제거 권장)`);
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ taxonomy check 통과");
    return;
  }

  if (errors.length > 0) {
    console.log("\n❌ Errors");
    for (const e of errors) console.log("- " + e);
  }

  if (warnings.length > 0) {
    console.log("\n⚠️ Warnings");
    for (const w of warnings) console.log("- " + w);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

/* ------------------------ post commands ------------------------ */

async function selectLeafCategory(taxonomy) {
  const leaves = flattenLeaves(taxonomy);
  const rows = leaves.map((p, i) => {
    const { labels, slugs } = nodePathToStrings(p);
    return `${String(i + 1).padStart(2, " ")}. ${labels.join(" > ")}   (${slugs.join("/")})`;
  });

  console.log("\n카테고리(leaf)를 선택하세요:");
  console.log(rows.join("\n"));
  const ans = String(await prompt("\n번호 입력: ")).trim();
  const n = Number(ans);

  if (!Number.isFinite(n) || n < 1 || n > leaves.length) return null;
  return leaves[n - 1];
}

function buildFrontmatter({ title, category, draft, published }) {
  const tags = [];
  return `---
title: "${title.replace(/"/g, '\\"')}"
published: ${published}
description: ""
draft: ${draft ? "true" : "false"}
tags: ${JSON.stringify(tags)}
category: "${category.replace(/"/g, '\\"')}"
---
`;
}

async function cmdNewPost(taxonomy, args) {
  // pnpm blog:post "제목" [--category "Linux" | "OS > Linux"] [--draft]
  //            [--dir "폴더명(1단계)"] [--date "YYYY-MM-DD"] [--open]

  const title = args._[0];
  if (!title) {
    die('Usage: pnpm blog:post "제목" [--category "라벨"] [--draft] [--dir "폴더"] [--date "YYYY-MM-DD"] [--open]');
  }

  const draft = !!args.draft;
  const doOpen = !!args.open;

  // published 날짜(기본: 오늘)
  const dateArg = typeof args.date === "string" ? args.date.trim() : "";
  const published = dateArg || todayYMD();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(published)) {
    die(`--date 형식이 올바르지 않습니다. 예: --date "2025-12-31" (현재: "${published}")`);
  }

  // leaf 카테고리 선택/검증
  const categoryArg = typeof args.category === "string" ? args.category : "";
  let chosenPath = null;

  if (categoryArg) {
    const leaves = flattenLeaves(taxonomy);
    chosenPath = leaves.find((p) => {
      const { labels } = nodePathToStrings(p);
      return labels.at(-1) === categoryArg || labels.join(" > ") === categoryArg;
    }) ?? null;

    if (!chosenPath) {
      die(`category "${categoryArg}" 를 leaf taxonomy에서 찾지 못했습니다. (pnpm blog:tax list 로 확인)`);
    }
  } else {
    chosenPath = await selectLeafCategory(taxonomy);
    if (!chosenPath) die("유효한 선택이 아닙니다.");
  }

  const { labels } = nodePathToStrings(chosenPath);
  const leafLabel = labels.at(-1);

  // 출력 디렉토리 결정(기본: posts root, 옵션: 1단계 하위 폴더)
  const dirArg = typeof args.dir === "string" ? ensureSingleLevelDirName(args.dir) : "";
  const outDir = dirArg ? path.join(POSTS_BASE_DIR, dirArg) : POSTS_BASE_DIR;
  ensureDir(outDir);

  // 파일명: 기본은 slug.md (충돌 시 -2, -3…)
  const fileBase = slugifyFileName(title);
  const filepath = uniqueFilePath(outDir, fileBase, ".md");

  const fm = buildFrontmatter({ title, category: leafLabel, draft, published });
  fs.writeFileSync(filepath, fm + "\n", "utf-8");

  console.log(`\n생성 완료: ${path.relative(ROOT, filepath)}`);
  console.log(`카테고리: ${labels.join(" > ")} (frontmatter: category="${leafLabel}")`);
  console.log(`published: ${published}\n`);

  if (doOpen) openInVSCode(filepath);
}

/* ------------------------ main ------------------------ */

async function main() {
  const args = parseArgs(process.argv);
  const [cmd, subcmd] = args._;

  if (!cmd) {
    console.log(`Usage:
  pnpm blog:tax list
  pnpm blog:tax add --path "OS/Linux" [--slug "os/linux"]
  pnpm blog:tax rm --path "OS/Linux" | --slug "os/linux"
  pnpm blog:tax rename --path "OS/Linux" --label "GNU/Linux" [--newslug "gnu-linux"]
  pnpm blog:tax check
  pnpm blog:post "제목" [--category "Linux" | "OS > Linux"] [--draft] [--dir "폴더"] [--date "YYYY-MM-DD"] [--open]
`);
    process.exit(0);
  }

  const taxonomy = readJSON(TAXONOMY_PATH);

  if (cmd === "tax") {
    if (subcmd === "list") return cmdTaxonomyList(taxonomy);
    if (subcmd === "add") {
      const updated = cmdTaxonomyAdd(taxonomy, args);
      writeJSON(TAXONOMY_PATH, updated);
      return;
    }
    if (subcmd === "rm") {
      const updated = await cmdTaxonomyRm(taxonomy, args);
      writeJSON(TAXONOMY_PATH, updated);
      return;
    }
    if (subcmd === "rename") {
      const updated = await cmdTaxonomyRename(taxonomy, args);
      writeJSON(TAXONOMY_PATH, updated);
      return;
    }
    if (subcmd === "check") return cmdTaxonomyCheck(taxonomy);

    die("Unknown tax subcommand. Use: list | add | rm | rename | check");
  }

  if (cmd === "post") {
    await cmdNewPost(taxonomy, args);
    return;
  }

  die("Unknown command. Use: tax | post");
}

main().catch((e) => die(String(e?.stack ?? e)));
