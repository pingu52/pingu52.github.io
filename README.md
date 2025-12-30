# Pingu52 Blog (Astro + Tailwind v4)

![Node.js >= 20](https://img.shields.io/badge/node.js-%3E%3D20-5FA04E.svg?logo=node.js) ![pnpm 10.26.1](https://img.shields.io/badge/pnpm-10.26.1-F69220.svg?logo=pnpm) ![Astro 5.16.6](https://img.shields.io/badge/astro-5.16.6-BC52EE.svg?logo=astro) ![Tailwind 4.1.18](https://img.shields.io/badge/tailwindcss-4.1.18-06B6D4.svg?logo=tailwindcss)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fpingu52%2Fpingu52.github.io.svg?type=small)](https://app.fossa.com/projects/git%2Bgithub.com%2Fpingu52%2Fpingu52.github.io?ref=badge_small)

개인 블로그입니다. **Astro 5** 기반의 정적 사이트로 빌드되며, **Tailwind CSS v4**를 사용해 테마(라이트/다크), 배너, 타이포그래피를 구성했습니다.


- Live: https://pingu52.github.io/
- Repo: https://github.com/pingu52/pingu52.github.io



---

## ✨ 주요 기능

- **Astro(^5.16.6)** 정적 빌드(`output: static`) 기반 블로그
- **Tailwind CSS(^4.1.18)** + `@tailwindcss/vite` (v4 방식)
- **라이트/다크 모드**(class 기반 토글)
- **페이지 전환 애니메이션**: `@swup/astro`
- **검색**: Pagefind (`pnpm build` 시 `pagefind --site dist`)
- **RSS / Sitemap / robots.txt**
- **Markdown 확장**
  - KaTeX 수식(`remark-math` + `rehype-katex`)
  - Admonition(노트/팁/경고 등): `remark-github-admonitions-to-directives` + `rehype-components`
  - GitHub 카드: `<github ... />` 컴포넌트 렌더링
  - Expressive Code: 코드블록 라인 번호/접기 등

---

## 🚀 Getting Started

### 요구 사항
- Node.js **20+** 권장 (GitHub Actions는 Node **24** 사용)
- pnpm (레포는 `pnpm@10.26.1` 사용)

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

## 📝 새 글 작성

포스트는 `src/content/posts/` 아래에 위치합니다.

### 스크립트로 생성
```bash
pnpm new-post "my-first-post"
```

생성된 파일을 열어 frontmatter를 채우면 됩니다.

### Frontmatter 예시
```yaml
---
title: My First Post
published: 2025-12-21
description: ""
image: ""
tags: []
category: ""
draft: false
lang: ""
---
```

---

## 🧭 라우팅/페이지

- 홈 피드: `src/pages/[...page].astro`
- 포스트 상세: `src/pages/posts/[...slug].astro`
- 아카이브: `src/pages/archive.astro`
- 카테고리 피드(홈과 동일한 카드형): `src/pages/category/[category]/[...page].astro`
- 태그 피드(홈과 동일한 카드형): `src/pages/tag/[tag]/[...page].astro`
- About: `src/pages/about.astro`

---

## 🔢 방문자 카운터 (Umami/GoatCounter)

사이드바 태그 위젯 아래에 방문자 수를 표기할 수 있도록 Umami 혹은 GoatCounter 기반 카운터를 추가했습니다.
오늘/최근 N일/누적 방문자를 모두 보여주며, GoatCounter 조회 시에는 `yyyy-mm-dd` 형식으로 날짜를 전달해 정확도를 높였습니다.

1. `.env` (또는 배포 환경 변수)에 `PUBLIC_ANALYTICS_PROVIDER`를 설정합니다.  
   - `umami` 또는 `goatcounter` 값을 사용합니다.
2. Umami 사용 시
   - `PUBLIC_UMAMI_SHARE_ID`: 공개 대시보드(share 링크)의 ID
   - `PUBLIC_UMAMI_BASE_URL`(선택): Umami 호스트 URL. 기본값 `https://analytics.umami.is`
   - `PUBLIC_VISITOR_COUNT_DAYS`(선택): 집계 기간(일 단위, 기본 30일)
3. GoatCounter 사용 시
   - `PUBLIC_GOATCOUNTER_HOST` 또는 `PUBLIC_GOATCOUNTER_CODE` 중 하나를 지정  
     (예: `PUBLIC_GOATCOUNTER_HOST=https://example.goatcounter.com` 또는 `PUBLIC_GOATCOUNTER_CODE=example`)
   - `PUBLIC_GOATCOUNTER_PATH`(선택): 카운트할 경로. 기본 `/`
   - 페이지에 페이지뷰 카운트를 표시하려면 원하는 위치에 `<div data-goatcounter-visit-count></div>`를 추가하면 됩니다.  
     레이아웃 스크립트가 `count.js` 로드를 감지한 뒤 `goatcounter.visit_count`를 호출해 해당 요소(없을 경우 `<body>`)에 값을 삽입합니다.

환경 변수가 올바르게 지정되면 사이드바에 방문자 수 카드가 나타납니다.

---

## 🎨 스타일/테마 구조

- Tailwind 엔트리: `src/styles/tailwind-base.css`
  - `@import "tailwindcss";`
  - `@custom-variant dark (&:where(.dark, .dark *));`
  - `@plugin "@tailwindcss/typography";`
- 메인 스타일 합성: `src/styles/main.css` (각 CSS를 `@import`로 묶음)
- 마크다운 스타일: `src/styles/markdown.css` (Tailwind v4에서는 `@reference`로 유틸 참조)
- 코드블록/플러그인 스타일: `src/styles/expressive-code.css`

---

## 🚢 배포

GitHub Pages 배포는 `.github/workflows/deploy.yml`로 자동화되어 있습니다.

- `main` 브랜치 push 시:
  - `withastro/action@v5`로 빌드/아티팩트 업로드
  - `actions/deploy-pages@v4`로 Pages 배포

---
<!-- 
## 📚 Docs (DeepWiki 스타일)

프로젝트 내부 구조/설정/마크다운 확장/배포/트러블슈팅을 `docs/wiki/`에 정리했습니다.

- 시작: `docs/wiki/index.md`

--- 

-->

## 📄 License

레포의 `LICENSE`를 따릅니다.
