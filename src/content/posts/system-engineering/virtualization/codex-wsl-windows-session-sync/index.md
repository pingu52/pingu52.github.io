---
title: "WSL Codex CLI와 Windows 앱의 대화 기록 통합하기"
description: "WSL Codex CLI와 Windows ChatGPT/Codex 앱이 같은 CODEX_HOME을 사용하도록 구성하고, 기존 기록 병합과 SQLite 충돌, GUI 최근 목록 문제를 복구한 과정을 정리합니다."
published: 2026-07-26 02:30:00
updated: 2026-07-26 02:30:00
draft: false
tags:
  - Codex
  - ChatGPT
  - WSL2
  - Windows11
  - SQLite
  - Troubleshooting
category: "Virtualization"
---

Windows에서는 ChatGPT/Codex 앱을 사용하고, 실제 개발은 WSL의 Codex CLI로 진행하다 보니 한 가지 불편한 점이 생겼다.

**양쪽에서 작업한 대화 기록을 하나의 최근 목록으로 보고 싶었다.**

같은 OpenAI 계정으로 로그인했으니 자동으로 공유될 것 같았지만, 기본 상태에서는 그렇지 않았다. Windows 앱과 WSL CLI가 서로 다른 `.codex` 디렉터리를 사용하기 때문이다.

이번 글에서는 다음 과정을 실제로 진행하며 확인한 내용을 정리한다.

- Windows 앱의 Codex Agent를 WSL로 전환
- Windows와 WSL이 하나의 `CODEX_HOME` 사용
- 양쪽에 이미 존재하던 세션 기록 보존 및 병합
- SQLite migration checksum 충돌 복구
- CLI 세션이 Windows 앱의 최근 목록에 나타나지 않는 문제 해결
- GUI → CLI, CLI → GUI 방향별 동작 검증

:::warning
이 글의 기본 설정 방법은 OpenAI 공식 문서를 따른다. 하지만 기존 기록 병합과 SQLite 복구 부분은 당시 설치된 버전의 내부 저장 구조를 직접 확인해 처리한 내용이다.

Codex 내부 DB 스키마는 버전에 따라 달라질 수 있다. 앱과 CLI를 모두 종료하고 전체 백업을 만든 뒤 진행해야 하며, 테이블이나 파일 구성이 다르면 그대로 적용하면 안 된다.
:::

---

## 검증 환경

이번 작업을 진행한 환경은 다음과 같다.

| 구분 | 버전 |
| --- | --- |
| Windows | Windows 11 + WSL2 |
| WSL Codex CLI | `codex-cli 0.145.0` |
| Windows 앱 | `OpenAI.Codex 26.721.4979.0` |
| Windows 앱 번들 Codex | `0.146.0-alpha.3.1` |
| WSL 셸 | zsh |

CLI와 앱 번들 Codex의 버전이 완전히 같지 않았다는 점이 중요하다. 실제로 대화 데이터가 아니라 보조 DB의 migration checksum이 달라 한 차례 시작 오류가 발생했다.

---

## 먼저 알아둘 저장 구조

OpenAI 공식 문서에 따르면 Windows 앱의 Codex 홈은 다음 위치다.

```text
C:\Users\<WindowsUser>\.codex
```

WSL의 Codex CLI는 기본적으로 Linux 홈 아래를 사용한다.

```text
/home/<WslUser>/.codex
```

따라서 같은 계정으로 로그인했더라도 기본값에서는 설정, 인증 캐시, 세션 기록이 자동으로 공유되지 않는다.

`CODEX_HOME`에는 설정 파일만 있는 것이 아니다. 세션 JSONL, SQLite 상태 DB, 인증 정보, 로그와 캐시 등 Codex의 로컬 상태가 함께 들어간다.

이번 환경에서 확인한 주요 파일은 다음과 같았다.

```text
.codex/
├── config.toml
├── session_index.jsonl
├── sessions/
│   └── YYYY/MM/DD/rollout-*.jsonl
├── state_5.sqlite
├── logs_2.sqlite
├── goals_1.sqlite
├── memories_1.sqlite
└── sqlite/
    └── codex-dev.db
```

각 파일의 역할을 단순화하면 다음과 같다.

```text
sessions/rollout-*.jsonl ─┐
                          ├─ state_5.sqlite ── Codex CLI의 resume 목록
session_index.jsonl ──────┘
                                  │
                                  └─ sqlite/codex-dev.db
                                      └─ Windows 앱의 최근 목록
```

`state_5.sqlite`에 대화가 정상 등록되어 있어도 Windows 앱의 별도 최근 목록 카탈로그가 갱신되지 않으면 GUI에는 보이지 않을 수 있다.

---

## 1. Windows 앱의 Agent를 WSL로 변경

Windows ChatGPT/Codex 앱에서 다음과 같이 설정한다.

1. **Settings**를 연다.
2. Codex **Agent**를 Windows native에서 **WSL**로 변경한다.
3. 앱을 완전히 종료한 뒤 다시 실행한다.

공식 문서에도 Agent 변경은 앱을 재시작해야 적용된다고 설명되어 있다.

현재 환경에서는 설정 후 공유 `config.toml`에 다음 값이 기록된 것도 확인했다.

```toml
[desktop]
runCodexInWindowsSubsystemForLinux = true
```

이 값은 앱 설정 결과를 확인하는 용도로만 보고, 가능하면 `config.toml`을 직접 편집하기보다 앱의 Settings에서 전환하는 편이 낫다.

---

## 2. WSL에서 Windows의 `CODEX_HOME` 사용

Windows 앱이 이미 한 번 실행되어 `%USERPROFILE%\.codex`를 생성한 상태에서 WSL 경로를 확인한다.

```bash
ls -la /mnt/c/Users/<WindowsUser>/.codex
```

현재 셸에서만 시험하려면 다음과 같이 설정한다.

```bash
export CODEX_HOME=/mnt/c/Users/<WindowsUser>/.codex
```

zsh를 열 때마다 적용하려면 `~/.zshrc`에 추가한다.

```bash
echo 'export CODEX_HOME=/mnt/c/Users/<WindowsUser>/.codex' >> ~/.zshrc
source ~/.zshrc
```

적용 결과를 확인한다.

```bash
printenv CODEX_HOME
codex --version
```

새로 설치한 환경이고 한쪽에만 기록이 있다면 여기까지로 충분하다. 이후 Windows 앱과 WSL CLI는 같은 Codex 홈을 기준으로 세션을 읽는다.

:::important
양쪽 `.codex`에 이미 필요한 기록이 있다면 아직 `CODEX_HOME`을 영구 적용하지 않는다. 한쪽 디렉터리를 다른 쪽에 그대로 덮어쓰면 세션 파일과 SQLite 인덱스가 서로 어긋날 수 있다.
:::

---

## 3. 기존 Windows·WSL 기록을 모두 보존하기

이번 환경에는 통합 전에 다음 기록이 각각 존재했다.

| 위치 | rollout 파일 |
| --- | ---: |
| WSL `~/.codex` | 12개 |
| Windows `%USERPROFILE%\.codex` | 23개 |
| 병합 후 | 35개 |

병합 후 `state_5.sqlite`에도 35개 행이 등록되었다.

- 사용자 대화: 9개
- 내부 서브에이전트 세션: 26개

서브에이전트 기록도 데이터로는 보존하되, 일반 최근 목록에 사용자 대화처럼 노출되지 않도록 `thread_source`를 유지했다.

### 3.1 Codex 프로세스 완전 종료

먼저 WSL Codex CLI를 종료한다. Windows 앱은 창만 닫지 말고 시스템 트레이에서도 완전히 종료해야 한다.

PowerShell에서 남은 프로세스를 확인할 수 있다.

```powershell
Get-Process -Name ChatGPT -ErrorAction SilentlyContinue
```

결과가 남아 있으면 앱의 **Quit**을 사용하거나 작업 관리자에서 종료한다.

WSL에서도 관련 프로세스를 확인한다.

```bash
pgrep -af 'codex|app-server'
```

:::warning
실행 중인 Codex는 rollout JSONL과 SQLite WAL을 계속 갱신할 수 있다. 활성 프로세스가 남아 있는 상태에서 복사하면 JSONL 마지막 레코드가 잘리거나 DB 본체와 WAL 시점이 달라질 수 있다.
:::

### 3.2 양쪽 전체 백업

Windows 쪽을 최종 공용 저장소로 정했다. 병합 전에는 양쪽 전체를 별도 경로에 복사했다.

```bash
WSL_CODEX_HOME="$HOME/.codex"
WIN_CODEX_HOME="/mnt/c/Users/<WindowsUser>/.codex"
BACKUP_ROOT="/mnt/c/Users/<WindowsUser>/.codex-merge-backups/$(date +%Y%m%dT%H%M%S%z)"

mkdir -p "$BACKUP_ROOT"
cp -a "$WSL_CODEX_HOME" "$BACKUP_ROOT/wsl-codex-home"
cp -a "$WIN_CODEX_HOME" "$BACKUP_ROOT/windows-codex-home"
```

이번 작업에서 생성된 실제 첫 백업도 `.codex-merge-backups/<timestamp>` 구조로 보존했다.

### 3.3 파일 복사가 아니라 세션 ID 기준으로 병합

단순히 `cp -a ~/.codex/* /mnt/c/.../.codex/`를 실행하지 않았다. 다음 순서로 별도의 병합 스크립트를 만들어 처리했다.

1. 양쪽 `sessions/`와 `archived_sessions/`의 `rollout-*.jsonl`을 탐색한다.
2. 각 JSONL의 `session_meta`에서 UUID를 읽는다.
3. 마지막 줄이 완전한 JSON 레코드인지 확인한다.
4. 동일 UUID가 있으면 파일 내용이 같은지 확인하고, 다르면 충돌로 중단한다.
5. Windows 쪽 상대 경로를 유지하며 누락된 rollout만 복사한다.
6. `session_index.jsonl`은 `id`와 `updated_at`을 기준으로 최신 이름을 보존한다.
7. Windows 쪽 `state_5.sqlite` 스키마를 기준으로 thread 행을 합친다.
8. `rollout_path`를 최종 Windows/WSL 공용 경로로 다시 기록한다.
9. 파일 UUID 집합과 DB UUID 집합이 정확히 일치하는지 검사한다.
10. `PRAGMA integrity_check`가 `ok`인지 확인한 뒤에만 실제 DB를 교체한다.

rollout 파일 수는 다음처럼 먼저 확인할 수 있다.

```bash
find "$WSL_CODEX_HOME/sessions" -type f -name 'rollout-*.jsonl' | wc -l
find "$WIN_CODEX_HOME/sessions" -type f -name 'rollout-*.jsonl' | wc -l
```

SQLite 자체 무결성은 Python 기본 모듈로 확인했다.

```bash
WIN_CODEX_HOME="/mnt/c/Users/<WindowsUser>/.codex" python3 -c '
import os
import sqlite3

path = os.path.join(os.environ["WIN_CODEX_HOME"], "state_5.sqlite")
connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
print("integrity:", connection.execute("PRAGMA integrity_check").fetchone()[0])
print("threads:", connection.execute("SELECT COUNT(*) FROM threads").fetchone()[0])
'
```

:::note
`sessions/*.jsonl`이 실제 대화 원본이고 `state_5.sqlite`는 이를 찾고 표시하기 위한 상태를 함께 가진다. 한쪽만 복사해서는 `codex resume`나 GUI 최근 목록이 기대대로 보이지 않을 수 있었다.
:::

---

## 4. `migration 1 was previously applied but has been modified`

병합 직후 WSL에서 Codex를 실행하자 다음 오류가 발생했다.

```text
Codex couldn't start because its local database appears to be damaged.

failed to migrate log DB at .../logs_2.sqlite:
migration 1 was previously applied but has been modified
```

메시지만 보면 `state_5.sqlite`와 대화 기록이 손상된 것처럼 보인다. 하지만 실제 확인 결과는 달랐다.

- `state_5.sqlite`: 무결성 `ok`
- rollout 파일: 35개
- thread 행: 35개
- 누락되거나 오래된 rollout 경로: 0개
- 충돌 지점: `logs_2.sqlite`의 migration checksum

WSL CLI `0.145.0`과 Windows 앱 번들 `0.146.0-alpha.3.1`이 같은 버전 번호의 migration에 서로 다른 checksum을 가지고 있었다. 즉 물리적인 SQLite 손상이 아니라, 서로 다른 Codex 빌드가 생성한 보조 DB의 스키마 이력 충돌이었다.

### 4.1 migration checksum 확인

Codex의 SQLite DB에는 `_sqlx_migrations` 테이블이 있었다. 다음과 같이 버전과 checksum을 확인했다.

```bash
DB_PATH="/mnt/c/Users/<WindowsUser>/.codex/logs_2.sqlite" python3 -c '
import os
import sqlite3

database = os.environ["DB_PATH"]
connection = sqlite3.connect(
    f"file:{database}?mode=ro",
    uri=True,
)
print(connection.execute("PRAGMA integrity_check").fetchone()[0])
for row in connection.execute(
    "SELECT version, description, hex(checksum) "
    "FROM _sqlx_migrations ORDER BY version"
):
    print(row)
'
```

DB가 `ok`인데도 같은 migration version의 checksum이 실행 파일마다 다르다면, 대화 DB 복구보다 버전 호환성 문제를 먼저 의심해야 한다.

### 4.2 대화 DB는 유지하고 보조 DB만 재생성

임시 복제본에서 문제가 있는 보조 DB를 분리한 뒤 양쪽 Codex로 초기화 시험을 했다. 다음 DB를 새 스키마로 재생성했을 때 두 버전 모두 정상 시작했다.

```text
logs_2.sqlite
goals_1.sqlite
memories_1.sqlite
```

복구 전 데이터도 확인했다.

| DB | 보존한 데이터 |
| --- | ---: |
| `logs_2.sqlite` | 로그 2,025건 |
| `goals_1.sqlite` | 목표 0건 |
| `memories_1.sqlite` | 작업 및 결과 0건 |

대화가 들어 있는 `state_5.sqlite`와 rollout 파일은 수정하지 않았다.

:::caution
`goals_1.sqlite`나 `memories_1.sqlite`에 실제 데이터가 있다면 무조건 재생성하면 안 된다. 먼저 테이블과 행 수를 확인하고, 필요한 데이터를 별도로 보존하거나 동일 버전의 Codex로 마이그레이션해야 한다.
:::

앱과 CLI를 모두 종료하고 전체 백업까지 확보한 상태라면, 충돌한 보조 DB의 본체·WAL·SHM을 복구 폴더로 이동해 Codex가 다시 만들게 할 수 있다.

```bash
WIN_CODEX_HOME="/mnt/c/Users/<WindowsUser>/.codex"
RECOVERY_ROOT="/mnt/c/Users/<WindowsUser>/.codex-merge-backups/$(date +%Y%m%dT%H%M%S%z)/aux-db"

mkdir -p "$RECOVERY_ROOT"

for file in \
  "$WIN_CODEX_HOME"/logs_2.sqlite{,-wal,-shm} \
  "$WIN_CODEX_HOME"/goals_1.sqlite{,-wal,-shm} \
  "$WIN_CODEX_HOME"/memories_1.sqlite{,-wal,-shm}
do
  if [ -e "$file" ]; then
    mv "$file" "$RECOVERY_ROOT/"
  fi
done
```

그다음 공유 홈을 명시해 진단한다.

```bash
CODEX_HOME="$WIN_CODEX_HOME" codex doctor
```

이번 환경에서는 다음 검증을 모두 통과했다.

- WSL Codex `doctor overall OK`
- Windows 앱 번들 Codex `doctor overall OK`
- WSL TUI 시작 성공
- WSL 및 Windows 번들 app-server 초기화 성공
- rollout 35개 = thread 행 35개

---

## 5. CLI 기록은 정상인데 GUI 최근 목록에 안 보이는 문제

CLI 오류를 해결한 뒤 다음 문제가 남았다.

```bash
CODEX_HOME=/mnt/c/Users/<WindowsUser>/.codex codex resume --all
```

이 명령에서는 병합된 대화가 보였지만 Windows 앱의 좌측 **최근** 목록에는 나타나지 않았다.

원인을 비교해 보니 CLI 세션은 공용 `state_5.sqlite`에 정상 등록되어 있었지만, Windows 앱의 파생 카탈로그에는 없었다.

```text
공용 대화 상태:
  %USERPROFILE%\.codex\state_5.sqlite

Windows 앱 최근 목록 카탈로그:
  %USERPROFILE%\.codex\sqlite\codex-dev.db
```

당시 `codex-dev.db`의 `local_thread_catalog`에는 Windows 앱이 알고 있는 최근 대화만 들어 있었다.

### 5.1 먼저 앱을 완전히 재시작

CLI에서 새 세션을 만든 시점에 Windows 앱이 이미 실행 중이라면 외부 프로세스가 만든 세션을 실시간으로 받지 못할 수 있었다.

먼저 다음 순서로 확인한다.

1. Windows 앱을 시스템 트레이까지 완전히 종료한다.
2. `Get-Process -Name ChatGPT` 결과가 없는지 확인한다.
3. 앱을 다시 실행한다.

이 작업만으로 목록이 갱신되면 별도 DB 작업은 필요 없다.

### 5.2 파생 카탈로그 재색인

앱을 재시작해도 나타나지 않아 마지막으로 최근 목록 카탈로그를 재색인했다.

이번에 작성한 복구 스크립트는 다음 순서로만 동작하도록 만들었다.

1. `state_5.sqlite`를 읽기 전용으로 연다.
2. 보관되지 않았고 내용이 있는 `cli`, `vscode` 사용자 thread만 선택한다.
3. `session_index.jsonl`의 최신 이름을 표시 제목으로 사용한다.
4. `codex-dev.db`를 SQLite backup API로 먼저 백업한다.
5. 기존 local catalog 행을 `missing_candidate=1`로 표시한다.
6. 현재 thread를 `host_id='local'` 기준으로 upsert한다.
7. sync watermark와 catalog revision을 갱신한다.
8. `PRAGMA quick_check`와 활성 행 수를 확인한다.

실제 복구 결과는 다음과 같았다.

```text
displayable_threads=10
quick_check=ok
active_count=10
```

CLI에서 만든 테스트 세션도 카탈로그에서 확인되었다.

```text
source_kind=cli
display_title=연동연동
cwd=/home/<WslUser>/work
missing_candidate=0
```

:::warning
`sqlite/codex-dev.db`는 Windows 앱의 내부 파생 데이터다. 앱이 실행 중일 때 수정하면 안 되며, `local_thread_catalog` 스키마가 이 글과 다르면 재색인 작업을 중단해야 한다.
:::

---

## 6. 양방향 동작 확인

최종적으로 두 개의 테스트 세션을 만들었다.

- Windows 앱 생성: `연동테스트 실행`
- WSL CLI 생성: `연동연동`

확인 결과는 다음과 같았다.

| 생성 위치 | WSL CLI `resume --all` | 실행 중인 Windows 앱 최근 목록 |
| --- | --- | --- |
| Windows 앱 | 바로 표시됨 | 바로 표시됨 |
| WSL CLI | 바로 표시됨 | 실시간으로는 표시되지 않음 |

GUI에서 만든 세션은 공용 상태 DB에 바로 기록되어 CLI에서도 확인할 수 있었다.

반대 방향은 CLI 세션 자체는 정상 저장되지만, 이미 실행 중인 Windows 앱의 최근 목록 카탈로그가 즉시 갱신되지 않았다. 앱 완전 재시작을 먼저 시도하고, 그래도 안 보일 때 파생 카탈로그를 백업 후 재색인해야 했다.

이 동작은 위 검증 버전에서 직접 관찰한 결과이며, 공식 문서가 GUI 최근 목록의 내부 갱신 시점을 보장하는 것은 아니다. 앱 업데이트 후에는 다시 확인할 필요가 있다.

---

## 7. 최종 점검 명령

### 공용 홈 확인

```bash
printenv CODEX_HOME
```

예상 결과:

```text
/mnt/c/Users/<WindowsUser>/.codex
```

### Codex 진단

```bash
codex doctor
```

### 전체 작업 디렉터리의 세션 확인

```bash
codex resume --all
```

`codex resume`만 실행하면 현재 작업 디렉터리를 기준으로 목록이 필터링될 수 있다. 다른 디렉터리에서 만들었던 세션까지 확인하려면 `--all`을 사용한다.

### 세션 파일과 DB 행 수 비교

```bash
WIN_CODEX_HOME="/mnt/c/Users/<WindowsUser>/.codex" python3 -c '
import os
import sqlite3
from pathlib import Path

home = Path(os.environ["WIN_CODEX_HOME"])
files = list((home / "sessions").rglob("rollout-*.jsonl"))
state_path = home / "state_5.sqlite"
connection = sqlite3.connect(
    f"file:{state_path}?mode=ro",
    uri=True,
)
rows = connection.execute("SELECT COUNT(*) FROM threads").fetchone()[0]
integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]

print("rollout files:", len(files))
print("thread rows:", rows)
print("integrity:", integrity)
'
```

파일 수와 행 수가 같다는 사실만으로 모든 메타데이터가 완벽하다고 단정할 수는 없지만, 누락 여부를 빠르게 찾는 1차 검사로는 유용하다.

---

## 운영하면서 지킬 규칙

이번 작업 이후에는 다음 원칙을 지키기로 했다.

1. Windows 앱과 WSL CLI가 같은 `CODEX_HOME`을 사용한다.
2. Codex 앱 또는 CLI를 업데이트한 뒤에는 `codex doctor`를 먼저 실행한다.
3. DB 관련 오류가 나면 `sessions/`와 `state_5.sqlite`부터 삭제하지 않는다.
4. SQLite 본체만 복사하지 않고 `-wal`, `-shm`과 실행 중인 프로세스를 함께 확인한다.
5. 복구 전에는 전체 `.codex`와 SQLite 일관 백업을 모두 남긴다.
6. CLI 세션이 GUI에 바로 안 보이면 Windows 앱 완전 재시작부터 시도한다.
7. 내부 DB 재색인은 마지막 수단으로 사용한다.

또한 Windows 쪽 Codex 홈에는 인증 정보도 포함될 수 있다. 공용 PC나 보호되지 않은 Windows 계정에서는 이 방식을 사용하지 않는 편이 좋다.

---

## 마무리

최종 구성의 핵심은 간단하다.

```bash
export CODEX_HOME=/mnt/c/Users/<WindowsUser>/.codex
```

그리고 Windows 앱의 Agent를 WSL로 바꾼다.

하지만 양쪽에 기존 기록이 이미 있다면 단순히 디렉터리를 덮어쓰는 것으로 끝나지 않는다. 세션 JSONL, 상태 DB, 보조 DB의 migration 이력, Windows 앱의 최근 목록 카탈로그를 서로 다른 계층으로 보고 확인해야 했다.

이번 사례에서 가장 중요했던 점은 **대화 원본과 파생 상태를 구분한 것**이었다.

- 대화 원본: `sessions/rollout-*.jsonl`
- 공용 thread 상태: `state_5.sqlite`
- 버전 충돌이 난 보조 상태: `logs_2.sqlite`, `goals_1.sqlite`, `memories_1.sqlite`
- GUI 최근 목록 파생 카탈로그: `sqlite/codex-dev.db`

이 구분 덕분에 실제 대화 35개를 모두 보존한 채 CLI 시작 오류와 GUI 최근 목록 문제를 각각 따로 해결할 수 있었다.

---

## 참고 자료

- [OpenAI 공식 문서: ChatGPT desktop app for Windows](https://learn.chatgpt.com/docs/windows/windows-app)
- [OpenAI 공식 문서: Share config, auth, and sessions with WSL](https://learn.chatgpt.com/docs/windows/windows-app#share-config-auth-and-sessions-with-wsl)
- [OpenAI 공식 문서: Codex environment variables](https://learn.chatgpt.com/docs/config-file/environment-variables)
- [OpenAI 공식 문서: Codex config and state locations](https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations)
