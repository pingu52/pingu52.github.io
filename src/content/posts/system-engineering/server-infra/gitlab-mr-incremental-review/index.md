---
title: "[GitLab CI] MR 증분 리뷰: 마지막 검토 SHA로 범위 정하기"
published: 2026-10-15
description: "GitLab CI에서 MR에 push할 때마다 전체를 다시 리뷰해야 할까? 마지막 검토 완료 SHA를 기준으로 증분 범위를 정하고, 실패한 검토를 다음 실행에 포함하는 방법을 정리한다. rebase 시 전체 검토로 돌아가는 조건과 인라인 댓글의 diff 좌표를 분리하는 이유도 살펴본다."
image: "./gitlab-mr-incremental-review-cover.png"
tags: [GitLab, CI/CD, Git, Code Review]
category: "Server & Infra"
categoryPath:
  - "System Engineering"
  - "Server & Infra"
draft: false
lang: "ko"
---

GitLab CI에서 MR(Merge Request) 자동 리뷰를 돌린다고 하자. 오타 하나를 고쳐 push했는데 MR 전체를 처음부터 다시 읽는다면, 이미 끝낸 검토에도 시간이 든다. 같은 지적이 다시 올라올 수도 있다.

GitLab MR 증분 리뷰를 붙이려면 비교 기준부터 정해야 한다. **마지막으로 검토를 끝낸 커밋 SHA를 저장하고, 그 이후의 변경을 다음 검토 대상으로 잡는다.** 중간 실행이 실패했다면 기준을 그대로 둔다. 다음 push에서 아직 읽지 못한 변경까지 함께 검토할 수 있다.

이 글에서는 일반 MR 파이프라인인 `detached` 유형을 기준으로 범위 선택 방법을 설명한다. merged results 파이프라인은 소스와 대상 브랜치를 합친 임시 커밋을 검사하므로, 같은 방식으로 `CI_COMMIT_SHA`를 소스 브랜치의 head라고 가정하면 안 된다. [GitLab merged results 파이프라인](https://docs.gitlab.com/ci/pipelines/merged_results_pipelines/)

## MR에서 이전 push SHA를 바로 쓸 수 있을까?

변수 이름만 보면 `CI_COMMIT_BEFORE_SHA`가 적당해 보인다. 하지만 GitLab 문서상 MR 파이프라인에서는 이 값이 전부 0인 SHA로 채워진다.

`CI_MERGE_REQUEST_DIFF_BASE_SHA`는 MR diff의 시작점이다. 이 값만 매번 사용하면 MR 전체 변경을 계속 검토하게 된다. **GitLab의 diff 기준과 우리 리뷰가 어디까지 끝났는지는 따로 관리해야 한다.** [GitLab 사전 정의 변수](https://docs.gitlab.com/ci/variables/predefined_variables/)

검토의 끝점은 `CI_COMMIT_SHA`다. 앞에서 정한 detached MR 파이프라인에서는 소스 브랜치의 검토 head로 쓴다.

| 값 | 나타내는 것 | 이 글에서의 용도 |
| --- | --- | --- |
| 현재 head | 이번에 검사할 커밋 | 검토의 끝점 |
| MR diff base | MR 전체 변경의 시작점 | 전체 검토의 기준 |
| 이전 push 변수 | MR에서는 0으로 채워짐 | 증분 기준으로 쓰지 않음 |
| 완료 기록 | 마지막으로 검토를 끝낸 커밋 | 증분 검토의 기준 |

완료 기록을 담는 `last_reviewed_sha`는 이 글에서 정한 저장 필드다. GitLab이 기본으로 제공하는 변수가 아니다.

## 실패한 실행에서는 체크포인트를 옮기지 않는다

커밋이 `A → B → C` 순서로 쌓였다고 하자. A의 리뷰는 끝났지만 B의 리뷰 도중 오류가 났다. 이때 C를 push하면 어디서부터 검토해야 할까?

```text
커밋:          A -------- B -------- C
리뷰 결과:     완료        실패        다음 실행
체크포인트:    A           A

C의 검토 범위: A..C
```

B의 리뷰가 실패했는데도 기준을 B로 바꾸면 다음 실행은 `B..C`만 읽는다. B에서 처음 추가된 변경은 검토하지 않은 채 지나갈 수 있다. A를 유지해야 `A..C`에 그 변경이 포함된다.

| 실행 결과 | 체크포인트 | 다음 실행에서 할 일 |
| --- | --- | --- |
| 정해 둔 범위의 검토 완료, 결과 저장 완료 | 검토한 head로 이동 | 그 이후 변경 검토 |
| 오류·시간 초과·취소·일부 파일만 검토 | 이전 값 유지 | 미완료 범위까지 다시 검토 |
| 검토와 결과 저장 완료, 댓글 게시 실패 | 검토한 head로 이동 | 저장된 결과의 게시를 별도로 재시도 |
| 지적 사항을 남기고 검토 완료 | 검토한 head로 이동 | 미해결 지적 상태는 별도로 유지 |

여기서 완료는 **지적 사항이 0개**라는 뜻이 아니다. 요청한 범위를 끝까지 읽었고 그 결과를 다시 꺼내 쓸 수 있게 저장했다는 뜻이다. 지적이 있으면 머지를 막는 정책과 검토 완료 기록은 구분한다.

댓글을 올리는 데 실패한 경우에도 저장된 결과가 있어야 검토를 반복하지 않고 게시만 재시도할 수 있다. 결과 저장까지 실패했다면 완료로 기록하지 않는다.

## 저장한 SHA를 믿기 전에 확인할 것

체크포인트는 최소한 프로젝트와 MR 단위로 나눠 저장한다. MR 번호는 프로젝트 안에서만 고유하므로 `!12` 같은 번호만 키로 쓰면 서로 다른 프로젝트의 기록이 섞일 수 있다.

기록을 다시 쓰기 전에는 대상 프로젝트·브랜치, MR diff base, 리뷰 규칙 버전도 비교한다. 이 글에서는 하나라도 달라지면 전체를 다시 검토하도록 정한다. GitLab이 대신 판단해 주는 조건은 아니다.

그다음은 커밋 관계다. 저장한 SHA가 현재 head의 조상이어야 그 뒤에 이어진 변경만 추릴 수 있다. Git의 `merge-base --is-ancestor`는 이 관계가 맞으면 0, 아니면 1을 반환한다. [Git merge-base 문서](https://git-scm.com/docs/git-merge-base)

```bash title="review-base.sh"
#!/usr/bin/env bash
set -euo pipefail

: "${MR_BASE:?MR diff base가 필요합니다}"
: "${REVIEW_HEAD:?검토할 head가 필요합니다}"

mr_base=$(git rev-parse --verify --end-of-options "${MR_BASE}^{commit}")
head=$(git rev-parse --verify --end-of-options "${REVIEW_HEAD}^{commit}")

if ! git merge-base --is-ancestor "$mr_base" "$head"; then
    printf 'MR base와 head의 이력을 먼저 확인하세요.\n' >&2
    exit 1
fi

base=$mr_base
if [[ ${FULL_REVIEW:-0} != 1 && -n ${LAST_REVIEWED_SHA:-} ]]; then
    if last=$(git rev-parse --verify --end-of-options \
        "${LAST_REVIEWED_SHA}^{commit}" 2>/dev/null); then
        if git merge-base --is-ancestor "$mr_base" "$last" &&
            git merge-base --is-ancestor "$last" "$head"; then
            base=$last
        fi
    fi
fi

printf '%s\n' "$base"
```

이 스크립트는 **비교 시작 SHA만 고른다.** 호출하는 쪽에서 저장 기록의 프로젝트·MR·대상 브랜치·규칙 버전·diff base가 현재 값과 일치하는지 확인한 뒤 `LAST_REVIEWED_SHA`를 넘겨야 한다. 기록이 없거나 문맥이 달라졌다면 이 변수는 비운다.

detached MR 작업 안에서는 다음처럼 호출할 수 있다. `LAST_REVIEWED_SHA`는 앞 단계에서 검증한 기록을 읽어 넣었다고 가정한다.

```bash
export MR_BASE="$CI_MERGE_REQUEST_DIFF_BASE_SHA"
export REVIEW_HEAD="$CI_COMMIT_SHA"

review_base=$(bash review-base.sh)
git diff --name-status -z --no-renames "$review_base" "$REVIEW_HEAD" --
```

`MR_BASE`와 head는 반드시 로컬에 존재해야 한다. shallow clone 때문에 필요한 커밋을 못 찾으면 먼저 해당 이력을 fetch한다. 저장된 체크포인트만 복구하지 못한 경우에는 MR 전체 검토로 돌아갈 수 있다. MR base조차 없는데 오류를 무시하고 빈 diff를 성공 처리하면 안 된다.

rebase나 force push 뒤에도 저장된 SHA가 현재 head의 조상인지 다시 확인한다. 관계가 끊겼다면 전체 범위를 선택한다. `FULL_REVIEW=1`로 실행하면 기록이 유효해도 전체 검토를 강제한다.

## 증분 파일 목록과 검토할 문맥을 구분한다

범위를 줄인다고 새로 바뀐 몇 줄만 읽어야 하는 것은 아니다. `A..C`에서 달라진 파일을 추린 다음, 그 파일의 현재 MR 변경과 주변 함수·호출부를 함께 읽는 방식으로 시작할 수 있다.

예를 들어 B에서 함수 인자를 바꾸고 C에서 호출부를 고쳤다면 두 변경을 함께 봐야 한다. 삭제한 파일이나 이전 변경을 되돌린 파일도 확인 대상이다. 현재 MR diff에서 사라졌다는 이유만으로 그 파일의 이전 지적을 계속 남겨 두면 안 된다.

자동 처리용 파일 목록에는 `-z`를 사용한다. 공백이나 줄바꿈이 들어간 파일명도 NUL 구분자로 나눌 수 있다. 예제에서는 이름 변경을 삭제와 추가로 나눠 받도록 `--no-renames`도 지정했다. 이 목록을 읽는 쪽에서도 두 상태를 모두 처리해야 한다. [Git diff 문서](https://git-scm.com/docs/git-diff)

공통 헤더나 빌드 설정이 바뀌면 영향이 수정 파일 밖으로 퍼질 수 있다. 이런 변경을 전체 재검토 조건으로 둘지, 관련 호출부까지 범위를 넓힐지도 함께 정한다. 파일 목록을 줄였을 때도 이런 문맥이 검토에 들어가는지 확인해야 한다.

## 인라인 댓글에는 MR diff의 좌표를 사용한다

리뷰 도구의 비교 base를 바꿨다면 댓글 게시 코드도 확인해야 한다. GitLab의 diff 댓글은 `base_sha`, `start_sha`, `head_sha`와 파일·줄 위치를 사용한다. 공식 예제도 MR diff 버전 응답에서 얻은 SHA를 게시 요청에 넣는다. [GitLab Discussions API](https://docs.gitlab.com/api/discussions/#create-a-new-thread-in-the-merge-request-diff)

검토 범위가 `A..C`라고 해서 댓글의 `base_sha`를 A로 바꾸면 안 된다. **리뷰 범위와 댓글이 붙을 MR diff 버전을 각각 보관한다.**

```text
review_range
  base: 마지막 검토 완료 SHA 또는 전체 검토 base
  head: 이번에 검토한 소스 head

mr_diff_position
  base_sha:  선택한 MR diff 버전의 base_commit_sha
  start_sha: 선택한 MR diff 버전의 start_commit_sha
  head_sha:  선택한 MR diff 버전의 head_commit_sha
```

게시할 때는 검토한 head와 대응하는 diff 버전인지 확인하고 파일·줄 번호를 그 버전에 맞춘다. 검토 도중 새 push가 들어왔다면 새 diff의 줄 번호에 이전 결과를 그대로 붙이지 않는다. 최신 head를 다시 확인해 재검토로 넘기거나, 검토한 커밋을 적은 요약 댓글로 남길 수 있다.

## 이전 결과를 어디에 저장할까?

소규모 구성에서는 완료 기록과 리뷰 결과를 job artifact로 저장할 수 있다. 이때 MR 파이프라인의 artifact를 조회할 ref는 소스 브랜치 이름이 아니라 `refs/merge-requests/:iid/head`다. [GitLab Job Artifacts API](https://docs.gitlab.com/api/job_artifacts/#using-branch-names-with-merge-request-pipelines)

다만 최신 성공 파이프라인을 찾았다고 그 안의 리뷰가 끝났다고 판단하지는 않는다. 파일 안의 완료 상태, 검토 head, MR 식별자와 규칙 버전을 확인한다. artifact가 만료됐거나 기록을 읽지 못하면 전체 검토로 돌아간다. 리뷰가 끝났어도 지적 사항 때문에 뒤의 머지 검사 작업이 실패할 수 있다. 이 구성에서는 전체 파이프라인의 성공 여부만으로 기록을 찾으면 완료된 리뷰를 놓친다.

작업이 겹쳐 실행될 때도 기록이 뒤로 가지 않아야 한다. C의 리뷰가 먼저 끝난 뒤 늦게 끝난 B의 작업이 체크포인트를 덮어쓰면 기준이 뒤로 간다. GitLab의 `resource_group`으로 같은 MR의 작업 실행을 직렬화할 수 있지만, 기본 처리 모드는 실행 순서를 보장하지 않는다. 게시와 저장 직전에 현재 head를 다시 확인하고 오래된 작업이 최신 기록을 덮어쓰지 못하게 해야 한다. [GitLab resource group](https://docs.gitlab.com/ci/resource_groups/)

체크포인트 쓰기 권한도 리뷰 결과를 저장하는 작업에 한정한다. MR에서 수정할 수 있는 파일의 SHA나 성공 표시를 그대로 신뢰해서는 안 된다. 외부 기여 MR에 쓰기 토큰을 노출하지 않도록 실행 권한을 구성하는 일은 별도 전제다.

## 로컬 예제로 확인한 범위

위 `review-base.sh`를 독립된 Git 저장소에서 실행해 다음 경우를 확인했다.

| 입력 상태 | 선택할 비교 base |
| --- | --- |
| 이전 완료 기록이 없음 | MR diff base |
| A 완료 뒤 B 실패, 현재 head는 C | A |
| C까지 검토 완료, 현재 head도 C | C, 새 파일 변경 없음 |
| 현재 이력에 없는 이전 체크포인트 | MR diff base |
| 존재하지 않는 저장 SHA | MR diff base |
| `FULL_REVIEW=1` | MR diff base |
| MR base나 head가 잘못됨 | 오류로 중단 |

B에서 추가한 파일이 C의 증분 목록에도 남는지, 삭제와 공백·줄바꿈이 있는 파일명을 처리할 수 있는지도 확인했다. 이 검증은 로컬 Git의 범위 선택과 파일 목록까지다. GitLab Runner에서 artifact를 이어받거나 실제 MR에 인라인 댓글을 게시하는 과정까지 실행한 예제는 아니다.

체크포인트에는 **어느 커밋까지 검토를 끝냈는가**를 남긴다. 실패한 실행에서 이 값을 유지하는 것부터 시작하면 된다. 그다음에 파일 범위를 줄이고 댓글 게시를 연결하자.

## 함께 읽기

- [FOSSA 정리와 Astro 마이그레이션 과정에서 CI 확인하기](/posts/system-engineering/server-infra/fossa-astro6-migration/)
