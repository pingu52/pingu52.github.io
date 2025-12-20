# Astro 업데이트 가이드 (A 방향: 업데이트만 고려)

이 문서는 **기능/구조 리팩토링은 최소화한 채** Astro(및 공식 integration) 버전만 업데이트하고 싶을 때의 절차를 정리한 것입니다.

## 1) 사전 체크

1. Node 버전 확인
   - `node -v`
   - 프로젝트의 `package.json`/`README` 또는 Astro 릴리스 노트에서 권장 Node 버전을 확인합니다.

2. 브랜치 분리
   - `main`(배포)과 분리된 브랜치에서 작업

## 2) 가장 안전한 업그레이드 방법

Astro는 **업그레이드 도구**를 제공합니다. pnpm 환경이면 아래가 가장 간단합니다.

```bash
pnpm dlx @astrojs/upgrade
```

- 위 명령은 Astro 및 **공식 integration** (예: @astrojs/svelte, @astrojs/tailwind, @astrojs/sitemap)을 최신으로 올리고, 필요한 마이그레이션 안내를 출력합니다.

## 3) 수동 업그레이드(필요한 경우)

업그레이드 도구가 실패하거나, 특정 버전으로 고정하고 싶을 때는 수동으로 올립니다.

```bash
# 예시 (버전은 상황에 따라)
pnpm add astro@latest @astrojs/svelte@latest @astrojs/tailwind@latest @astrojs/sitemap@latest
pnpm install
```

## 4) 빌드/배포 검증

```bash
pnpm build
pnpm preview
```

- 로컬에서 `preview`로 라우팅/검색/카테고리 페이지 등을 확인 후 푸시합니다.

## 5) 자주 발생하는 이슈

- **Content Collections / 라우팅 규칙 변경**: major 업그레이드에서 breaking change가 발생할 수 있습니다.
- **swup/head 업데이트**: 스크립트/헤드 업데이트 방식이 바뀌면 전환 시 head 반영을 확인하세요.

## 참고

- Astro 공식 문서: Upgrade Astro, Upgrade to v5 가이드
