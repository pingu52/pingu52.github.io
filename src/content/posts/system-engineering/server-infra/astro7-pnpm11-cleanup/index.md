---
title: "Astro 7과 pnpm 11로 블로그 의존성 정리하기"
description: "FOSSA와 pnpm audit 이슈를 줄이기 위해 Astro 7, pnpm 11로 올리며 만난 문제들을 정리했습니다."
published: 2026-07-04 17:00:00
updated: 2026-07-04 17:00:00
draft: false
image: "./astro-logo.svg"
tags:
  - Astro
  - pnpm
  - FOSSA
  - Dependency
  - Troubleshooting
category: "Server & Infra"
---

이번 작업의 시작은 FOSSA였다. 처음에는 단순히 취약한 패키지를 몇 개 올리면 끝날 줄 알았는데, 막상 들여다보니 직접 의존성보다 transitive dependency가 훨씬 많았다.

`pnpm audit` 기준으로는 취약점을 모두 없앨 수 있었지만, FOSSA 화면에는 여전히 오래된 하위 의존성들이 남아 있었다. 특히 `ansi-regex`, `chalk`, `commander`, `cssnano`, `ejs`, `entities` 같은 패키지들이 계속 보였다.

그래서 이번에는 단순 override가 아니라, 블로그의 기반 프레임워크인 Astro를 7로 올리고 pnpm도 11로 올리는 방식으로 의존성 트리를 한 번 정리했다.

## 목표

- Astro 6 → Astro 7 업그레이드
- pnpm 10 → pnpm 11 업그레이드
- pnpm audit 취약점 0개 유지
- FOSSA transitive dependency 이슈 감소
- 기존 블로그 동작과 페이지 전환 효과 유지

다만 범위를 너무 넓히지는 않기로 했다. `@swup/astro`를 제거하면 FOSSA에 남아 있는 오래된 transitive dependency가 많이 줄어들 수 있지만, 현재 블로그의 페이지 전환 애니메이션이 바뀔 수 있다. 그래서 이번 PR에서는 `@swup/astro`는 유지하고, Astro 7과 pnpm 11 업그레이드까지만 처리했다.

브랜치는 다음처럼 따로 만들었다.

```bash
git checkout main
git pull
git checkout -b chore/upgrade-astro-7
```

## Astro 7로 올리기

먼저 Astro와 관련 패키지들을 업데이트했다.

```bash
pnpm up astro@latest \
  @astrojs/svelte@latest \
  @astrojs/rss@latest \
  @astrojs/sitemap@latest \
  @astrojs/check@latest \
  @astrojs/ts-plugin@latest
```

그리고 코드 하이라이팅, 수식, 이미지 처리 쪽 패키지도 같이 올렸다.

```bash
pnpm up @expressive-code/core@latest \
  @expressive-code/plugin-collapsible-sections@latest \
  @expressive-code/plugin-line-numbers@latest \
  astro-expressive-code@latest \
  katex@latest \
  sharp@latest \
  @tailwindcss/typography@latest
```

TypeScript는 `6.x`가 보였지만 이번 작업에서는 올리지 않았다. Astro 7과 pnpm 11만으로도 변경 범위가 충분히 컸고, TypeScript major update까지 같이 넣으면 문제 발생 지점을 분리하기 어려워진다.

## `@astrojs/markdown-remark` 명시 추가

Astro 7로 올리고 `pnpm check`를 실행하니 Markdown 설정 관련 에러가 나왔다.

```text
`markdown.remarkPlugins`, `markdown.rehypePlugins`, and `markdown.remarkRehype` run on the `unified` processor from `@astrojs/markdown-remark`, which is no longer installed by default now that Starlight is the default Markdown processor.
```

기존 `astro.config.mjs`에서는 다음과 같이 Markdown pipeline을 직접 구성하고 있었다.

```js
markdown: {
  remarkPlugins: [...],
  rehypePlugins: [...],
}
```

내 블로그는 `remark-math`, `rehype-katex`, `remark-directive`, `rehype-slug`, `rehype-autolink-headings` 등을 사용한다. 이걸 Astro 7의 새로운 방식으로 한 번에 바꾸면 범위가 커진다. 그래서 이번에는 기존 Markdown pipeline을 유지하는 방향으로 갔다.

```bash
pnpm add @astrojs/markdown-remark@latest
```

이렇게 하면 기존 `remarkPlugins`, `rehypePlugins` 설정은 계속 동작한다. 다만 Astro는 이 설정 방식이 deprecated라고 경고를 띄운다.

```text
[astro] `markdown.remarkPlugins`, `markdown.rehypePlugins`, and `markdown.remarkRehype` are deprecated.
```

이번 PR에서는 이 경고를 해결하지 않았다. Markdown pipeline을 `unified({...})` 기반으로 옮기는 작업은 별도 PR로 분리하는 편이 낫다.

## Astro 7 빌드에서 터진 문법 오류

다음으로 `pnpm build`를 실행했을 때 이런 에러가 나왔다.

```text
[CompilerError] Unterminated regular expression
Location:
src/pages/posts/[...slug].astro:97:9
```

처음에는 정규식 문제처럼 보였지만, 실제 원인은 Astro 컴포넌트의 조건부 렌더링 문법이었다.

문제가 있던 코드는 이런 형태였다.

```astro
{licenseConfig.enable && <License title={entry.data.title} slug={getPostSlug(entry)} pubDate={entry.data.published} class="mb-6 rounded-xl license-container onload-animation" />
```

마지막에 `}`가 빠져 있었다. Astro 7 compiler가 이 부분을 더 엄격하게 파싱하면서 뒤쪽의 `</div>`를 이상하게 해석했고, 결과적으로 `Unterminated regular expression` 에러가 난 것이다.

수정 후 코드는 다음처럼 정리했다.

```astro
{
  licenseConfig.enable && (
    <License
      title={entry.data.title}
      slug={getPostSlug(entry)}
      pubDate={entry.data.published}
      class="mb-6 rounded-xl license-container onload-animation"
    />
  )
}
```

이미지 커버 조건부 렌더링도 같은 스타일로 정리했다.

```astro
{
  entry.data.image && (
    <ImageWrapper
      id="post-cover"
      src={entry.data.image}
      basePath={path.join("content/posts/", getPostContentDir(entry))}
      class="mb-8 rounded-xl banner-container onload-animation"
    />
  )
}
```

이런 식으로 괄호를 명시해두면 Astro parser가 훨씬 안정적으로 읽는다.

## pnpm 11로 올리기

Astro 7 업그레이드 이후 pnpm도 11로 올렸다.

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm -v
```

버전은 다음처럼 확인했다.

```text
11.9.0
```

그리고 `package.json`의 package manager도 변경했다.

```bash
pnpm pkg set packageManager=pnpm@11.9.0
```

## pnpm 설정 위치 변경

pnpm 11로 올리자 다음 경고가 나왔다.

```text
WARN The "pnpm" field in package.json is no longer read by pnpm.
The following keys were ignored: "pnpm.overrides", "pnpm.onlyBuiltDependencies".
```

기존에는 `package.json` 안에 이런 식으로 pnpm 설정을 넣어두었다.

```json
"pnpm": {
  "overrides": {
    "rollup-plugin-terser>serialize-javascript": "7.0.7",
    "astro>esbuild": "0.28.1"
  },
  "onlyBuiltDependencies": [
    "esbuild"
  ]
}
```

pnpm 11에서는 이 설정을 더 이상 읽지 않는다. 그래서 루트에 `pnpm-workspace.yaml`을 만들고 설정을 옮겼다.

```yaml
packages:
  - .

overrides:
  rollup-plugin-terser>serialize-javascript: 7.0.7

allowBuilds:
  esbuild: true
```

여기서 중요한 점은 `onlyBuiltDependencies`가 아니라 `allowBuilds`를 써야 한다는 것이다.

## minimum release age 정책에 걸린 경우

pnpm 11에서 `pnpm install`을 하니 처음에는 supply-chain policy 에러가 났다.

```text
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION]
11 lockfile entries failed verification
```

`@clack/*`, `shiki`, `@shikijs/*`, `p-queue` 같은 패키지가 너무 최근에 publish되어 minimum release age 정책에 걸린 것이다.

이 경우에는 lockfile을 다시 정리하고 설치했다.

```bash
pnpm clean --lockfile
pnpm install
```

이후에는 다음처럼 통과했다.

```bash
✓ Lockfile passes supply-chain policies
Done in 2.6s using pnpm v11.9.0
```

이 정책은 귀찮아 보이지만, supply-chain 공격을 줄이기 위한 장치다. 그래서 바로 우회하기보다는 lockfile을 새로 풀거나 시간이 지난 뒤 다시 설치하는 쪽이 더 안전하다.

## esbuild build script 승인

다음으로는 이런 에러가 나왔다.

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.1
```

pnpm 11에서는 dependency의 build script 실행을 더 명시적으로 관리한다. `esbuild`는 설치 후 바이너리 준비 과정이 필요하므로 허용해야 한다.

그래서 `pnpm-workspace.yaml`에 다음 설정을 추가했다.

```yaml
allowBuilds:
  esbuild: true
```

이후 다시 설치하면 정상적으로 통과했다.

```bash
pnpm install
```

## 취약 버전 확인

이번 작업에서 특히 확인한 패키지는 `serialize-javascript`와 `esbuild`였다. 이전에는 audit에서 이 둘이 문제로 남았었다.

확인은 `pnpm why`로 했다.

```bash
pnpm why serialize-javascript
pnpm why esbuild
```

결과는 다음과 같았다.

```text
serialize-javascript@7.0.7
```

```text
esbuild@0.28.1
```

기존 취약 범위는 다음과 같았다.

```text
serialize-javascript <= 7.0.2
esbuild >=0.27.3 <0.28.1
```

따라서 현재 설치된 버전은 둘 다 patched version이다.

최종적으로 audit도 통과했다.

```bash
pnpm audit
```

```text
No known vulnerabilities found
```

## 왜 `@swup/astro`는 유지했나

FOSSA에서 보이는 오래된 transitive dependency를 따라가보면 상당수가 `@swup/astro` 쪽에서 온다.

대표적으로 이런 경로가 있었다.

```text
@swup/astro
└─ @swup/parallel-plugin
   └─ @swup/plugin
      └─ microbundle
         ├─ rollup-plugin-postcss
         ├─ cssnano
         ├─ ejs
         ├─ chalk
         └─ rollup-plugin-terser
```

즉 `chalk`, `cssnano`, `ejs`, `commander`, `rollup-plugin-terser` 같은 오래된 패키지가 `swup → microbundle` 체인에서 들어온다.

처음에는 `@swup/astro`를 제거하고 Astro의 내장 View Transitions로 대체하는 것도 고려했다. 하지만 그렇게 하면 현재 블로그의 페이지 전환 애니메이션 느낌이 바뀔 수 있다.

이번 PR의 목적은 Astro 7과 pnpm 11 업그레이드였기 때문에, UX에 영향을 줄 수 있는 swup 제거는 하지 않았다.

정리하면 다음과 같다.

이번 PR에서 한 것:

- Astro 7 업그레이드
- pnpm 11 업그레이드
- audit 취약점 0개 유지
- pnpm 설정 이전
- Astro 7 compiler 대응

이번 PR에서 하지 않은 것:

- @swup/astro 제거
- Astro ClientRouter 전환
- FOSSA transitive dependency 전체 제거
- TypeScript 6 업그레이드

## 최종 검증

마지막으로 아래 명령들을 모두 실행했다.

```bash
pnpm lint:ci
pnpm check
pnpm type-check
pnpm build
pnpm audit
```

그리고 패키지 경로도 확인했다.

```bash
pnpm why rollup-plugin-terser
pnpm why serialize-javascript
pnpm why esbuild
```

`rollup-plugin-terser`는 여전히 `@swup/astro` 체인 아래에 남아 있다.

```text
rollup-plugin-terser@7.0.2
└─ microbundle@0.15.1
   └─ @swup/plugin@3.0.1
      └─ @swup/astro@1.8.0
```

하지만 `serialize-javascript`는 patched version으로 올라갔다.

```text
serialize-javascript@7.0.7
```

`esbuild`도 patched version이다.

```text
esbuild@0.28.1
```

## 정리

이번 작업에서 가장 크게 느낀 점은 dependency cleanup은 단순히 `pnpm up`만으로 끝나지 않는다는 것이다.

`pnpm audit`은 보안 취약점 중심으로 보고, FOSSA는 outdated transitive dependency까지 더 넓게 보여준다. 그래서 audit이 0이어도 FOSSA에는 이슈가 남을 수 있다.

그리고 transitive dependency를 줄이려면 결국 부모 패키지를 봐야 한다.

```bash
pnpm why chalk
pnpm why cssnano
pnpm why ejs
pnpm why commander
```

이런 식으로 실제 경로를 따라가보면 문제가 어느 패키지 체인에서 나오는지 보인다. 이번에는 많은 경로가 `@swup/astro → microbundle`로 이어졌다.

다만 dependency cleanup보다 중요한 것은 변경 범위를 잘 자르는 것이다. `@swup/astro`를 제거하면 dependency tree는 더 깨끗해질 수 있지만, 페이지 전환 UX가 바뀐다. 그래서 이번에는 Astro 7과 pnpm 11까지만 처리하고, swup 제거 여부는 나중에 별도 작업으로 남겨두었다.

결과적으로 현재 상태는 다음과 같다.

- Astro 7 적용 완료
- pnpm 11 적용 완료
- pnpm audit 취약점 0개
- 기존 페이지 전환 유지
- FOSSA에 남은 swup 계열 transitive dependency는 별도 검토 대상으로 분리

이 정도면 이번 PR의 경계는 꽤 깔끔하게 잡힌 것 같다.
