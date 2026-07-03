---
title: "FOSSA dependency audit 대응과 Astro 6 마이그레이션"
published: 2026-07-04
updated: 2026-07-04
draft: false
description: "FOSSA와 pnpm audit에서 나온 의존성 이슈를 줄이기 위해 Astro 6 마이그레이션, content collection 수정, slug/image path 처리, pnpm overrides 적용 과정을 정리합니다."
image: "./astro.svg"
tags:
  - Astro
  - FOSSA
  - pnpm
  - Security
  - Dependency
  - TypeScript
  - Migration
category: "Server & Infra"
---

블로그에 FOSSA를 붙이고 나서 dependency 이슈가 꽤 많이 잡혔다.

처음에는 단순히 패키지 버전만 올리면 끝날 줄 알았는데, 실제로는 Astro 6 마이그레이션, content collection 구조 변경, slug 처리 방식 변경, 이미지 경로 문제까지 같이 따라왔다.

이번 글에서는 `pingu52.github.io` 블로그에서 FOSSA dependency 이슈를 줄이면서 겪은 과정을 정리한다.

## 문제 상황

FOSSA에서 확인한 이슈는 크게 두 종류였다.

```text
- 오래된 dependency
- vulnerability가 있는 transitive dependency
```

처음에는 FOSSA 화면에서 수십 개의 dependency issue가 보였고, 로컬에서도 `pnpm audit`을 돌리면 여러 취약점이 나왔다.

```bash
pnpm audit
```

이때 중요한 점은 모든 항목이 직접 설치한 패키지에서 나온 것은 아니라는 것이다.
대부분은 다음처럼 여러 단계 아래에 있는 transitive dependency에서 발생했다.

```text
@swup/astro
└─ @swup/parallel-plugin
   └─ @swup/plugin
      └─ microbundle
         └─ rollup-plugin-terser
            └─ serialize-javascript
```

즉, 단순히 `package.json`에 보이는 dependency만 업데이트한다고 바로 해결되는 구조가 아니었다.

## 1차 목표

이번 작업의 목표는 모든 FOSSA 항목을 한 번에 정리하는 것이 아니었다.

우선 main에 안전하게 들어갈 수 있는 1차 범위를 정했다.

```text
- pnpm audit 기준 취약점 제거
- Astro 6으로 dependency 업데이트
- Astro 6에서 깨지는 content API 수정
- build/check/type-check/lint 통과
- FOSSA에 남는 transitive/outdated 항목은 별도 PR로 분리
```

FOSSA UI에 남아 있는 transitive dependency 목록까지 한 번에 다 처리하려고 하면 PR 범위가 너무 커진다.
그래서 이번 PR에서는 로컬 audit과 빌드 안정화를 먼저 끝내고, 나머지 FOSSA 항목은 후속 브랜치에서 다루는 방향으로 잡았다.

## dependency 업데이트

먼저 주요 dependency를 최신 범위로 올렸다.

```json
{
  "dependencies": {
    "astro": "^6.4.8",
    "@astrojs/check": "^0.9.9",
    "@astrojs/rss": "^4.0.19",
    "@astrojs/svelte": "^7.2.5",
    "@tailwindcss/vite": "^4.3.2",
    "markdown-it": "^14.3.0",
    "svelte": "^5.56.4"
  }
}
```

업데이트 후에는 lockfile을 다시 생성했다.

```bash
pnpm install
```

이 단계에서 바로 빌드가 되지는 않았다.
Astro 6에서 content collection API가 바뀌었기 때문이다.

## Astro 6 content config 마이그레이션

기존에는 content collection 설정이 아래 위치에 있었다.

```text
src/content/config.ts
```

Astro 6에서는 프로젝트 루트의 `src/content.config.ts` 형태를 사용해야 했다.
그래서 collection 설정을 새 파일로 옮기고, loader 기반으로 다시 정의했다.

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postsCollection = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.{md,mdx}",
    base: "./src/content/posts",
  }),
  schema: z.object({
    title: z.string(),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().optional().default(false),
    description: z.string().optional().default(""),
    image: z.string().optional().default(""),
    tags: z.array(z.string()).optional().default([]),
    category: z.string().optional().nullable().default(""),
    categoryPath: z.array(z.string()).optional().default([]),
    lang: z.string().optional().default(""),

    prevTitle: z.string().optional().default(""),
    prevSlug: z.string().optional().default(""),
    nextTitle: z.string().optional().default(""),
    nextSlug: z.string().optional().default(""),
  }),
});

const specCollection = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.{md,mdx}",
    base: "./src/content/spec",
  }),
  schema: z.looseObject({}),
});

export const collections = {
  posts: postsCollection,
  spec: specCollection,
};
```

여기서 `spec` collection도 중요했다.
`about.astro`에서 `getEntry("spec", "about")`을 사용하고 있었기 때문에, `spec` collection이 Markdown 파일을 읽지 못하면 `/about` 페이지 빌드가 실패했다.

## `entry.slug` 제거 대응

Astro content entry에서 기존에 사용하던 `entry.slug` 접근이 더 이상 그대로 맞지 않았다.
그래서 post의 slug를 직접 계산하는 helper를 만들었다.

```ts
import { type CollectionEntry, getCollection } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

export function getPostSlug(post: Pick<PostEntry, "id">): string {
  return post.id.replace(/\/index$/, "").replace(/\.(md|mdx)$/, "");
}
```

이후 기존 코드의 `entry.slug` 사용을 아래처럼 바꿨다.

```ts
getPostSlug(entry)
```

예를 들면 RSS 생성 코드에서는 다음처럼 사용한다.

```ts
const posts = attachPrevNext(sortPostsByPublishedDesc(await getAllPosts()));

return rss({
  title: siteConfig.title,
  description: siteConfig.subtitle,
  site: context.site ?? siteConfig.site,
  items: posts.map((post) => ({
    title: post.data.title,
    pubDate: post.data.published,
    description: post.data.description || "",
    link: url(`/posts/${getPostSlug(post)}/`),
  })),
});
```

## `entry.render()` 변경

기존에는 content entry에서 직접 `entry.render()`를 호출했다.

```ts
const { Content, headings } = await entry.render();
```

Astro 6에서는 `render`를 import해서 사용하도록 수정했다.

```ts
import { render } from "astro:content";

const { Content, headings } = await render(entry);
```

이 변경은 post page뿐 아니라 card에서 frontmatter를 렌더링하던 부분에도 적용했다.

## 이미지 경로 문제

가장 헷갈렸던 부분은 이미지 경로였다.

블로그 글 구조가 전부 같은 방식이 아니었기 때문이다.

```text
src/content/posts/computer-science/os-architecture/ostep-45-file-integrity/index.md
src/content/posts/problem-solving/boj/10773.md
```

첫 번째는 폴더 기반 post이고, 두 번째는 flat markdown post이다.

이때 단순히 `entry.id` 기준으로 parent directory를 계산하면 folder-based post에서는 맞지만, flat post에서는 이미지 경로가 어긋날 수 있다.

그래서 `filePath`를 우선 사용해서 실제 markdown 파일의 위치를 기준으로 base path를 계산했다.

```ts
export function getPostContentDir(
  post: Pick<PostEntry, "id" | "filePath">,
): string {
  const normalizedFilePath = post.filePath?.replace(/\\/g, "/");

  if (normalizedFilePath) {
    const marker = "src/content/posts/";
    const relativePath = normalizedFilePath.includes(marker)
      ? normalizedFilePath.slice(
          normalizedFilePath.indexOf(marker) + marker.length,
        )
      : normalizedFilePath.replace(/^.*content\/posts\//, "");

    const lastSlash = relativePath.lastIndexOf("/");
    return lastSlash >= 0 ? relativePath.slice(0, lastSlash + 1) : "";
  }

  return `${post.id.replace(/\/index$/, "").replace(/\.(md|mdx)$/, "")}/`;
}
```

그리고 post page와 post card에서 이미지 wrapper에 넘기는 base path를 바꿨다.

```astro
<ImageWrapper
  src={entry.data.image}
  basePath={path.join("content/posts/", getPostContentDir(entry))}
/>
```

이렇게 하니 `index.md` 기반 글과 `boj/*.md` 기반 글 모두에서 이미지 경로를 안정적으로 찾을 수 있었다.

## ImageWrapper 방어 코드

이미지 import가 실패하면 빌드가 바로 터지는 문제도 있었다.

기존에는 dynamic import 대상이 없을 때도 그대로 호출하려고 해서 다음과 같은 에러가 났다.

```text
TypeError: file is not a function
```

그래서 이미지 파일을 찾지 못한 경우에는 빌드를 죽이지 않고 warning만 남기도록 바꿨다.

```ts
const file = files[normalizedPath];

if (!file) {
  console.warn(
    `\n[WARN] Image file not found: ${normalizedPath.replace("../../", "src/")}`,
  );
} else {
  img = await file();
}
```

이미지가 필수인 글이라면 warning을 보고 고치면 되고, 임시로 이미지가 비어 있는 글 때문에 전체 빌드가 막히지는 않게 된다.

## 남은 audit 2개 처리

업데이트 후 `pnpm audit` 결과는 마지막에 두 개만 남았다.

```text
serialize-javascript <= 7.0.2
esbuild >= 0.27.3 < 0.28.1
```

둘 다 직접 dependency라기보다 하위 dependency 경로에서 들어온 항목이었다.

그래서 `pnpm.overrides`를 사용했다.

```json
{
  "pnpm": {
    "overrides": {
      "rollup-plugin-terser>serialize-javascript": "7.0.3",
      "astro>esbuild": "0.28.1"
    },
    "onlyBuiltDependencies": [
      "esbuild"
    ]
  }
}
```

여기서 한 번 실수한 부분이 있었다.

```json
"rollup-plugin-tenser>serialize-javascript": "7.0.3"
```

처음에는 `terser`를 `tenser`로 잘못 적었다.
이러면 override가 적용되지 않는다.

정확한 이름은 아래처럼 `terser`다.

```json
"rollup-plugin-terser>serialize-javascript": "7.0.3"
```

수정 후 다시 설치하고 audit을 확인했다.

```bash
pnpm install
pnpm audit
```

## type-check 이슈

중간에 `type-check`도 한 번 막혔다.

기존 script는 다음과 같았다.

```json
{
  "scripts": {
    "type-check": "tsc --noEmit --isolatedDeclarations"
  }
}
```

`--isolatedDeclarations`는 export되는 값의 타입을 매우 엄격하게 요구한다.
문제는 `src/content.config.ts`가 Astro의 schema inference에 의존한다는 점이었다.

`postsCollection`에 억지로 넓은 타입을 붙이면 `post.data`가 전부 `unknown`으로 무너졌다.

그래서 이 프로젝트에서는 `--isolatedDeclarations`를 제거하는 쪽으로 정리했다.
블로그는 library가 아니라 Astro app이고, 현재 script도 `--noEmit`이라 선언 파일을 만들지 않는다.

```json
{
  "scripts": {
    "type-check": "tsc -p tsconfig.typecheck.json --noEmit"
  }
}
```

그리고 별도 tsconfig를 만들었다.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "isolatedDeclarations": false
  },
  "exclude": [
    "dist",
    "node_modules"
  ]
}
```

이렇게 하면 Astro content schema inference는 유지하면서 일반 TypeScript 검사는 계속 돌릴 수 있다.

## 테스트 stub 문제

마지막으로 `pnpm test`에서 한 번 더 막혔다.

실제 `src/utils/post-utils.ts`에는 `getPostSlug`를 export했는데, 테스트에서는 계속 이런 에러가 났다.

```text
The requested module '@utils/post-utils' does not provide an export named 'getPostSlug'
```

확인해보니 테스트 loader가 실제 파일이 아니라 stub을 보고 있었다.

```text
tests/ts-loader.mjs
└─ @utils/post-utils -> tests/stubs/post-utils.ts
```

그래서 실제 코드가 아니라 `tests/stubs/post-utils.ts`에 export를 추가해야 했다.

```ts
export function getPostSlug(post: { id: string }): string {
  return post.id.replace(/\/index$/, "").replace(/\.(md|mdx)$/, "");
}
```

필요하면 이미지 경로 helper도 stub에 같이 맞춰준다.

```ts
export function getPostContentDir(post: {
  id: string;
  filePath?: string;
}): string {
  const normalizedFilePath = post.filePath?.replace(/\\/g, "/");

  if (normalizedFilePath) {
    const marker = "src/content/posts/";
    const relativePath = normalizedFilePath.includes(marker)
      ? normalizedFilePath.slice(
          normalizedFilePath.indexOf(marker) + marker.length,
        )
      : normalizedFilePath.replace(/^.*content\/posts\//, "");

    const lastSlash = relativePath.lastIndexOf("/");
    return lastSlash >= 0 ? relativePath.slice(0, lastSlash + 1) : "";
  }

  return `${post.id.replace(/\/index$/, "").replace(/\.(md|mdx)$/, "")}/`;
}
```

이 문제는 테스트 자체가 틀렸다기보다, production code 변경을 stub이 따라오지 못한 경우였다.
그래서 테스트를 삭제하기보다는 stub을 수정하는 쪽이 맞았다.

## 최종 검증

마지막에는 아래 명령들을 순서대로 확인했다.

```bash
pnpm lint:ci
pnpm check
pnpm type-check
pnpm build
pnpm audit
pnpm test
```

이번 작업에서 중요한 것은 `pnpm audit`만 보는 것이 아니었다.
Dependency를 올리면서 프레임워크 API까지 같이 바뀌었기 때문에, build와 content rendering까지 같이 확인해야 했다.

## PR 범위 분리

FOSSA 화면에는 여전히 transitive dependency 항목이 남을 수 있다.
특히 `ansi-regex`, `brace-expansion`, `commander`, `cssnano`처럼 여러 하위 패키지에서 끌려오는 항목은 단순 override로 밀어붙이면 lockfile이 너무 많이 흔들릴 수 있다.

그래서 이번 PR은 다음 범위로 제한했다.

```text
- Astro 6 migration
- local audit cleanup
- build/check/type-check/lint/test 안정화
```

그리고 FOSSA UI에 남은 dependency 목록은 별도 브랜치에서 처리하기로 했다.

```bash
git checkout main
git pull
git checkout -b chore/fossa-transitive-cleanup
```

이렇게 나누면 1차 PR은 안전하게 리뷰할 수 있고, 2차 PR에서는 FOSSA 항목만 집중해서 볼 수 있다.

## 정리

이번 작업은 단순한 dependency update가 아니었다.

```text
dependency update
→ Astro 6 migration
→ content collection 수정
→ slug/image path 수정
→ pnpm overrides
→ type-check script 조정
→ test stub 수정
```

처음에는 FOSSA 이슈를 줄이는 것이 목적이었지만, 실제로는 블로그 빌드 파이프라인 전체를 한 번 점검하는 작업이 되었다.

특히 기억할 점은 세 가지다.

```text
1. transitive vulnerability는 override 경로를 정확히 써야 한다.
2. Astro content config는 schema inference를 해치면 post.data 타입이 unknown이 된다.
3. 테스트가 alias/stub을 쓰고 있다면 실제 코드 export만 고쳐서는 부족하다.
```

이번 PR을 main에 먼저 넣고, FOSSA에 남은 transitive/outdated 항목은 후속 PR에서 따로 정리할 예정이다.
