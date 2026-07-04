# Pingu52 Blog (Astro 7 + Tailwind v4)

![Node.js >= 20](https://img.shields.io/badge/node.js-%3E%3D20-5FA04E.svg?logo=node.js) ![pnpm 11.9.0](https://img.shields.io/badge/pnpm-11.9.0-F69220.svg?logo=pnpm) ![Astro 7.0.6](https://img.shields.io/badge/astro-7.0.6-BC52EE.svg?logo=astro) ![Tailwind 4.3.2](https://img.shields.io/badge/tailwindcss-4.3.2-06B6D4.svg?logo=tailwindcss)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fpingu52%2Fpingu52.github.io.svg?type=small)](https://app.fossa.com/projects/git%2Bgithub.com%2Fpingu52%2Fpingu52.github.io?ref=badge_small)

개인 기술 블로그입니다. **Astro 7** 기반의 정적 사이트로 빌드되며, **Tailwind CSS v4**를 사용해 라이트/다크 테마, 카드형 포스트 목록, 마크다운 타이포그래피, 코드블록 스타일을 구성합니다.

- Live: https://pingu52.vercel.app/
- Preview/Service: https://pingu52.vercel.app/
- Repo: https://github.com/pingu52/pingu52.github.io

---

## ✨ 주요 기능

- **Astro 7** 정적 빌드(`output: static`) 기반 블로그
- **pnpm 11.9.0** 기반 패키지 관리
- **Tailwind CSS v4** + `@tailwindcss/vite` 기반 스타일 구성
- **Svelte integration**: 일부 위젯/상호작용 컴포넌트에 사용
- **페이지 전환 애니메이션**: `@swup/astro`
  - 기존 UX 유지를 위해 Astro 7 업그레이드 이후에도 유지합니다.
- **검색**: Pagefind
  - `pnpm build` 시 `astro build && pagefind --site dist` 실행
- **RSS / Sitemap / robots.txt**
- **Markdown 확장**
  - KaTeX 수식: `remark-math` + `rehype-katex`
  - Admonition: `remark-github-admonitions-to-directives` + `rehype-components`
  - GitHub 카드: `<github ... />` 컴포넌트 렌더링
  - Expressive Code: 코드블록 라인 번호, 접기, 언어 배지, 커스텀 복사 버튼
- **계층형 카테고리 / 태그 / 아카이브**
- **방문자 카운터**: Umami 또는 GoatCounter 기반

---

## 🚀 Getting Started

### 요구 사항

- Node.js **20+** 권장
- pnpm **11.9.0**

이 레포는 `packageManager`로 pnpm 버전을 고정합니다.

```json
"packageManager": "pnpm@11.9.0"
```

Corepack을 사용하는 경우:

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm -v
```

### 로컬 실행

```bash
pnpm install
pnpm dev
```

기본 개발 서버: `http://localhost:4321`

### 프로덕션 빌드

```bash
pnpm build
pnpm preview
```

---

## ✅ 검증 명령

변경 후 아래 명령으로 기본 검증을 수행합니다.

```bash
pnpm lint:ci
pnpm check
pnpm type-check
pnpm build
pnpm audit
```

테스트가 필요한 경우:

```bash
pnpm test
```

주요 스크립트는 `package.json`에 정의되어 있습니다.

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | Astro 개발 서버 실행 |
| `pnpm build` | 정적 빌드 후 Pagefind 인덱스 생성 |
| `pnpm preview` | 빌드 결과 미리보기 |
| `pnpm check` | Astro 타입/구성 검사 |
| `pnpm type-check` | TypeScript 검사 |
| `pnpm lint:ci` | Biome 검사 |
| `pnpm lint` | Biome 검사 및 자동 수정 |
| `pnpm test` | Node test runner 기반 테스트 실행 |

---

## 📦 pnpm 11 설정

pnpm 11에서는 `package.json`의 `"pnpm"` 필드 대신 `pnpm-workspace.yaml`에서 pnpm 전용 설정을 관리합니다.

현재 레포의 `pnpm-workspace.yaml`은 다음 역할을 합니다.

```yaml
packages:
  - .

overrides:
  rollup-plugin-terser>serialize-javascript: 7.0.7

allowBuilds:
  esbuild: true
```

- `overrides`: transitive dependency 중 보안 패치 버전을 강제합니다.
- `allowBuilds`: pnpm 11의 build script 승인 정책에 따라 `esbuild`의 install/build script를 명시적으로 허용합니다.
- pnpm 11의 supply-chain policy에 의해 너무 최근 publish된 패키지가 잠시 차단될 수 있습니다. 이 경우 lockfile을 확인한 뒤 재설치하거나 시간이 지난 후 다시 설치합니다.

---

## 📝 새 글 작성

포스트는 `src/content/posts/` 아래에 위치합니다.

### 스크립트로 생성

```bash
# 기본: 카테고리 leaf 선택 프롬프트가 뜹니다
pnpm new-post "my-first-post"

# 옵션 예시
pnpm new-post "my-first-post" -- --category "Linux" --open
pnpm new-post "my-first-post" -- --dir "2026-01-01" --draft
pnpm new-post "my-first-post" -- --date "2026-01-01"
```

`pnpm blog:post` / `pnpm blog:tax`도 같은 블로그 CLI를 사용합니다.

```bash
pnpm blog:tax list
pnpm blog:post "my-first-post"
```

생성된 파일을 열어 frontmatter를 채우면 됩니다.

### Frontmatter 예시

```yaml
---
title: My First Post
published: 2026-01-01
updated: 2026-01-02 # 선택
description: ""
image: ""
tags: []
category: "Linux" # leaf label, 선택
categoryPath: ["OS", "Linux"] # 선택, 권장
draft: false
lang: ""
---
```

---

## 🧭 라우팅/페이지

- 홈 피드: `src/pages/[...page].astro`
- 포스트 상세: `src/pages/posts/[...slug].astro`
- 아카이브: `src/pages/archive.astro`
- 카테고리 피드: `src/pages/category/[...path].astro`
- 태그 피드: `src/pages/tag/[tag]/[...page].astro`
- RSS: `src/pages/rss.xml.ts`
- About: `src/pages/about.astro`

포스트 slug는 Astro content entry의 `id`를 기반으로 계산합니다. 폴더 기반 포스트(`index.md`)와 단일 Markdown 파일 포스트를 함께 지원합니다.

---

## 🔢 방문자 카운터 (Umami/GoatCounter)

사이드바 태그 위젯 아래에 방문자 수를 표기할 수 있도록 Umami 혹은 GoatCounter 기반 카운터를 추가했습니다.
최근 N일 방문자와 누적 방문자를 함께 보여줍니다.

1. `.env` 또는 배포 환경 변수에 `PUBLIC_ANALYTICS_PROVIDER`를 설정합니다.
   - `umami` 또는 `goatcounter` 값을 사용합니다.
2. Umami 사용 시
   - 기본 호출 경로는 `/api/umami-stats`입니다.
   - `PUBLIC_UMAMI_SHARE_ID`에 Umami 공개 share 링크의 slug 또는 전체 share URL을 설정합니다.
   - `PUBLIC_UMAMI_BASE_URL`(선택): Umami 호스트 URL. 기본값은 Umami Cloud입니다.
   - 방문자 수는 공개 share 페이지 기반으로 조회합니다.
3. GoatCounter 사용 시
   - `PUBLIC_GOATCOUNTER_HOST` 또는 `PUBLIC_GOATCOUNTER_CODE` 중 하나를 지정합니다.
   - 예: `PUBLIC_GOATCOUNTER_HOST=https://example.goatcounter.com` 또는 `PUBLIC_GOATCOUNTER_CODE=example`
   - `PUBLIC_GOATCOUNTER_PATH`(선택): 카운트할 경로. 기본값은 `/`입니다.

사이드바 위젯은 항상 표시되며, 환경 변수가 설정되지 않은 경우 설정되지 않은 상태를 안내합니다.

---

## 🎨 스타일/테마 구조

- Tailwind 엔트리: `src/styles/tailwind-base.css`
  - `@import "tailwindcss";`
  - `@custom-variant dark (&:where(.dark, .dark *));`
  - `@plugin "@tailwindcss/typography";`
- 메인 스타일 합성: `src/styles/main.css`
- 마크다운 스타일: `src/styles/markdown.css`
- 코드블록/플러그인 스타일: `src/styles/expressive-code.css`

---

## 🧩 Markdown / Code Block Pipeline

Astro 7 업그레이드 이후에도 기존 remark/rehype 파이프라인을 유지하기 위해 `@astrojs/markdown-remark`를 명시 의존성으로 추가했습니다.

현재 사용 중인 주요 플러그인:

- `remark-math`
- `rehype-katex`
- `remark-directive`
- `remark-github-admonitions-to-directives`
- `remark-sectionize`
- `rehype-slug`
- `rehype-autolink-headings`
- `rehype-components`
- `astro-expressive-code`

Astro 7에서는 기존 `markdown.remarkPlugins` / `markdown.rehypePlugins` 설정에 deprecation warning이 표시될 수 있습니다. 동작에는 문제가 없지만, 추후 `unified({...})` 기반 설정으로 분리할 수 있습니다.

---

## 🚢 배포

GitHub Pages 배포는 `.github/workflows/deploy.yml`로 자동화되어 있습니다.

`main` 브랜치 push 시:

- `withastro/action`으로 빌드/아티팩트 업로드
- `actions/deploy-pages`로 GitHub Pages 배포

---

## 🛠 최근 정리 내용

- Astro 7로 업그레이드했습니다.
- pnpm 11.9.0으로 package manager를 고정했습니다.
- pnpm 전용 설정을 `package.json`에서 `pnpm-workspace.yaml`로 이동했습니다.
- `serialize-javascript` transitive dependency를 patched 버전으로 강제했습니다.
- pnpm 11 build approval 정책에 맞춰 `esbuild` build script를 명시적으로 허용했습니다.
- 기존 페이지 전환 UX 보존을 위해 `@swup/astro`는 유지했습니다.
- Astro 7 compiler에서 드러난 조건부 렌더링 문법 문제를 정리했습니다.

---

## 📄 License

레포의 `LICENSE`를 따릅니다.
