# pingu52.github.io (Astro)

이 폴더는 GitHub Pages용 **Astro 기반 커스텀 블로그** 템플릿입니다.

## 로컬 실행
```bash
npm install
npm run dev
```

## 글 작성
- `src/content/posts/*.md` 에 Markdown 파일을 추가하세요.
- Frontmatter 예시:
```yaml
---
title: "제목"
description: "요약"
pubDate: 2025-12-18
tags: ["AWS", "Terraform"]
categories: ["Programming", "Cloud"]
thumbnail: "/images/thumbs/my.png"
popular: true
draft: false
---
```

## 배포 (GitHub Pages)
1) GitHub repo Settings → Pages → **Source = GitHub Actions**
2) `master` 브랜치에 push 하면 Actions가 자동 배포합니다.
