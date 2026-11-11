---
title: "[OP-TEE] REE FS와 RPMB의 보안 보장: 기밀성·무결성·롤백 방지"
published: 2026-11-11
description: "OP-TEE Secure Storage의 REE FS 단독·RPMB 직접 저장·결합 구성을 비교한다. 암호화와 롤백 방지의 차이, RPMB의 MAC·쓰기 카운터·nonce, 저장소 선택과 초기화 정책을 소스 코드 및 Python 예제로 살펴본다."
image: "./optee-ree-fs-rpmb-cover.jpg"
tags: [OP-TEE, TrustZone, RPMB, Secure Storage, Embedded Linux]
category: "Protocol & Security"
categoryPath:
  - "Embedded System"
  - "Protocol & Security"
draft: false
lang: "ko"
---

인증 실패 횟수를 암호화해서 저장했다고 하자. 공격자가 파일 내용을 읽거나 숫자를 고치지는 못한다. 대신 실패 횟수가 0이던 시점의 파일을 복사해 뒀다가 그대로 되돌린다. 과거에 정상적으로 만든 데이터라면 암호 검증도 통과할 수 있다.

OP-TEE Secure Storage를 검토할 때는 이런 **과거 상태의 복원까지 거부할 수 있는지**를 따로 확인해야 한다. REE FS와 RPMB의 차이도 여기서 드러난다. REE FS는 일반 파일시스템을 저장 공간으로 쓰고, RPMB는 인증된 접근과 재생 방지를 제공하는 저장 영역이다. OP-TEE는 두 방식을 결합할 수도 있다.

이 글은 2026년 11월 11일 확인한 공개 OP-TEE OS 소스 [`23727cbae2c6`](https://github.com/OP-TEE/optee_os/tree/23727cbae2c63f7a8e22494318ab8c990d0e10d3)를 기준으로 설명한다. 보안 속성을 비교하기 위한 분석이며, 실제 eMMC에 키를 기록하거나 저장소 롤백·전원 차단을 시험한 결과는 아니다. 뒤의 Python 예제는 인증과 최신 상태 검증의 차이만 재현한다.

## 먼저 공격자가 바꿀 수 있는 영역을 정한다

REE는 Rich Execution Environment로, 여기서는 Linux가 실행되는 Normal World를 뜻한다. TA(Trusted Application)는 Secure World에서 동작하고 OP-TEE의 저장 API를 호출한다.

다음 조건을 놓고 저장소를 비교한다.

- 공격자는 Linux 파일을 읽고 바꾸거나, 과거 파일시스템 스냅샷으로 복구할 수 있다.
- Linux 커널과 `tee-supplicant`를 신뢰하지 않는다. 저장 요청을 지연하거나 버릴 수도 있다.
- OP-TEE 코어·TA·Secure World 메모리와 장치 고유 비밀키는 보호된다.
- 하드웨어 RPMB의 인증키와 내부 카운터를 공격자가 임의로 바꾸지는 못한다.

이 조건에서 기밀성은 저장된 내용을 읽지 못하게 하는 속성이다. 무결성은 허가 없이 바꾼 내용을 받아들이지 않는 속성이고, 롤백 방지는 이미 갱신된 상태를 과거의 유효한 상태로 되돌리지 못하게 하는 속성이다. 여기서 최신성은 마지막으로 정상 확정한 상태와의 관계를 뜻한다. 벽시계가 몇 시인지는 기준이 아니다.

공격자가 I/O 자체를 막을 수 있으므로 가용성까지 보장할 수는 없다. 저장소가 손상을 발견해 열기를 거부하는 것과, 데이터를 복구해 서비스를 계속하는 것은 별도 문제다.

## 세 가지 구성을 나눠 비교한다

아래 표는 안전한 키 관리와 정상적인 하드웨어 RPMB를 전제로 한다. 결합 구성은 이미 초기화한 저장소의 상태를 보호하고, 임의 초기화는 허용하지 않는 조건이다.

| 비교 항목 | REE FS 단독 | RPMB FS 직접 저장 | REE FS + RPMB 상태 해시 |
| --- | --- | --- | --- |
| 객체 데이터 위치 | Linux 파일시스템 | RPMB 영역 | Linux 파일시스템 |
| 객체 데이터의 기밀성 | OP-TEE 암호화 | OP-TEE 암호화 | OP-TEE 암호화 |
| 허가 없는 내용 변경 | 인증·해시 검증으로 탐지 | RPMB 인증과 OP-TEE 저장 계층으로 검사 | REE FS 검증과 RPMB 상태 해시 대조 |
| 과거의 정상 상태 복원 | 단독으로는 방지하지 못함 | RPMB의 인증·재생 방지에 의존 | RPMB에 남은 현재 상태 해시와 불일치 |
| Linux가 I/O를 차단 | 서비스 실패 가능 | 서비스 실패 가능 | 서비스 실패 가능 |
| 추가 설계 부담 | 롤백을 허용할 수 있는지 판단 | 용량·쓰기 비용·키 프로비저닝 | 두 저장 영역의 정합성·초기화 정책 |

REE FS가 Linux 파일을 쓴다는 이유로 평문 저장소가 되는 것은 아니다. 반대로 `CFG_RPMB_FS=y`가 있다는 이유만으로 모든 객체 데이터가 RPMB에 저장되는 것도 아니다. 저장소 선택과 결합 설정을 함께 봐야 한다.

## REE FS는 파일 내용과 해시 트리를 함께 보호한다

일반적인 REE FS 경로에서 TA의 저장 요청은 OP-TEE 코어를 거쳐 `tee-supplicant`로 전달된다. Linux는 실제 파일 I/O를 맡고, 암호화와 검증은 Secure World에서 처리한다. 기본 저장 경로는 `/data/tee/`이며, 객체 목록을 관리하는 파일은 `dirf.db`다. [OP-TEE Secure Storage 구조](https://optee.readthedocs.io/en/latest/architecture/secure_storage.html)

키 관리에는 장치 단위 SSK(Secure Storage Key), TA 단위 TSK(TA Storage Key), 파일 단위 FEK(File Encryption Key)가 쓰인다. TA의 UUID는 TSK 파생에 참여하고, FEK는 보호된 형태로 저장한다. 정확한 HUK 파생 방식과 호환 옵션은 플랫폼에 따라 확인해야 한다. [키 관리 구현](https://github.com/OP-TEE/optee_os/blob/23727cbae2c63f7a8e22494318ab8c990d0e10d3/core/tee/tee_fs_key_manager.c)

REE FS는 인증된 메타데이터와 해시 트리로 블록 변경을 검사한다. 갱신 중 기존 상태를 바로 덮지 않는 방식도 사용한다. 이 구조는 일부 블록만 바꾸거나 서로 다른 시점의 블록을 섞는 공격을 다루는 데 필요하다. [해시 트리 구현](https://github.com/OP-TEE/optee_os/blob/23727cbae2c63f7a8e22494318ab8c990d0e10d3/core/tee/fs_htree.c)

그런데 공격자가 객체와 메타데이터를 포함한 **서로 일치하는 과거 스냅샷 전체**를 복원하면 상황이 달라진다.

```text
시점 A: 실패 횟수 0 → 객체·목록·검증 메타데이터를 함께 보관
시점 B: 실패 횟수 5 → 저장 완료
시점 C: REE 저장 영역 전체를 시점 A로 복원하고 다시 시작

복원된 데이터: 과거에 정상적으로 생성됨
복원된 검증 정보: 그 데이터와 일치함
별도로 보호된 현재 상태: 없음
```

파일 안에 세대 번호를 추가해도 번호까지 함께 되돌릴 수 있다면 같은 문제가 남는다. 검증자가 “마지막으로 확정한 상태는 B였다”는 정보를 공격자가 복원할 수 없는 곳에 기억해야 한다.

## RPMB는 인증키·쓰기 카운터·nonce를 사용한다

RPMB는 Replay Protected Memory Block의 약자다. 여기서는 OP-TEE의 eMMC RPMB 경로를 설명한다. RPMB 인증키는 OP-TEE의 파일 암호화 키와 역할이 다르다. RPMB 자체가 전송 데이터의 기밀성을 제공하는 것은 아니며, OP-TEE의 RPMB FS가 객체 데이터를 암호화한다. [RPMB 저장소와 암호화](https://optee.readthedocs.io/en/latest/architecture/secure_storage.html#rpmb-secure-storage)

세 요소를 구분하면 프로토콜을 읽기 편하다.

| 요소 | 확인하는 것 |
| --- | --- |
| MAC | 요청·응답의 인증 대상 필드가 올바른 키로 인증됐는지 |
| 쓰기 카운터 | 과거의 인증된 쓰기 요청이 다시 사용되는지 |
| 읽기 요청의 nonce | 받은 응답이 이번 읽기 요청에 대응하는지 |

인증된 쓰기에는 장치의 현재 쓰기 카운터가 관여한다. 쓰기를 성공하면 장치가 카운터를 증가시키므로, 이전 카운터로 만든 쓰기 요청을 그대로 재전송할 수 없다.

읽기는 매번 쓰기 카운터를 증가시키는 방식이 아니다. 요청에 nonce를 넣고 응답의 nonce와 MAC을 검증해, Normal World가 과거의 정상 읽기 응답을 재사용하는 것을 막는다. 확인한 OP-TEE 구현도 응답 종류·주소·카운터·nonce·MAC을 요청에 맞게 검사한다. [RPMB 응답 검증 구현](https://github.com/OP-TEE/optee_os/blob/23727cbae2c63f7a8e22494318ab8c990d0e10d3/core/tee/tee_rpmb_fs.c#L887)

따라서 Linux가 통신을 중계하더라도 검증을 통과할 응답을 마음대로 만들 수는 없다. 다만 요청을 버리거나 응답을 보내지 않을 수는 있다. 통신 경로를 이용한다는 것과 그 경로가 반환한 데이터를 신뢰한다는 것을 나눠 봐야 한다.

RPMB 카운터를 앱 객체의 버전 번호와 동일시해서도 안 된다. 객체 한 번 갱신에 여러 저장 요청이 필요할 수 있고 다른 객체의 쓰기도 같은 장치 카운터에 영향을 준다. 앱이 관리하는 `generation=5`와 장치의 쓰기 카운터는 서로 다른 값이다.

정상 권한을 가진 TA가 과거의 값을 새로운 쓰기 요청으로 저장하면 RPMB 입장에서는 유효한 갱신이다. “실패 횟수를 줄여도 되는가” 같은 업무 규칙은 TA가 판단해야 한다. RPMB는 그 값의 의미까지 검사하지 않는다.

## REE FS 데이터는 그대로 두고 상태 해시를 RPMB에 보관한다

용량이 큰 객체를 모두 RPMB에 넣지 않고, REE FS 상태를 대표하는 해시만 RPMB에 둘 수 있다. 확인한 소스에서는 `CFG_REE_FS_INTEGRITY_RPMB`가 이 경로를 제어한다.

```text
Linux 파일시스템                         하드웨어 RPMB

객체 데이터 ─┐
객체 데이터 ─┼─ dirf.db의 현재 상태 ──→ dirfile.db.hash
객체 데이터 ─┘                         (보호된 기준 해시)

REE 파일을 과거 상태로 복원
  → 과거 dirf.db의 상태와 RPMB의 기준 해시가 불일치
  → 과거 상태를 현재 저장소로 받아들이지 않음
```

여기서 `dirfile.db.hash`는 개별 앱 파일의 단순 체크섬을 모은 목록이 아니다. REE FS 디렉터리 상태를 검증하는 기준이다. `open_dirh()`는 RPMB에서 읽은 해시로 REE 디렉터리를 열고, `commit_dirh_writes()`는 디렉터리 변경을 반영한 뒤 새 해시를 RPMB에 기록한다. [REE FS의 상태 해시 처리](https://github.com/OP-TEE/optee_os/blob/23727cbae2c63f7a8e22494318ab8c990d0e10d3/core/tee/tee_ree_fs.c#L552)

그래서 REE 데이터의 백업만 복원해서는 보안 저장소가 정상 복구됐다고 볼 수 없다. RPMB에는 더 새로운 상태가 남아 있을 수 있다. 저장소 검증 오류가 났다는 이유로 기준 해시를 지우면, 원래 막으려던 상태 변경을 복구 기능이 허용하게 된다. 공장 초기화는 누가 요청할 수 있고 어떤 데이터를 폐기할지부터 따로 설계해야 한다.

## 빌드 옵션과 storage ID를 함께 확인한다

다음은 결합 구성을 읽기 위한 설정 예다. 보드별 드라이버와 키 프로비저닝을 대신하는 완성된 빌드 명령은 아니다.

```makefile
CFG_REE_FS=y
CFG_RPMB_FS=y
CFG_REE_FS_INTEGRITY_RPMB=y
CFG_REE_FS_ALLOW_RESET=n
CFG_RPMB_TESTKEY=n
```

확인한 `mk/config.mk`에서 `CFG_REE_FS_INTEGRITY_RPMB`의 기본값은 `CFG_RPMB_FS`를 따른다. 플랫폼 설정이나 빌드 인자로 달라질 수 있으므로, 기본값만 읽지 말고 실제 빌드에 적용된 값을 확인해야 한다. [저장소 설정 정의](https://github.com/OP-TEE/optee_os/blob/23727cbae2c63f7a8e22494318ab8c990d0e10d3/mk/config.mk#L157)

TA가 넘기는 storage ID도 확인한다.

| storage ID | 확인한 구현의 선택 |
| --- | --- |
| `TEE_STORAGE_PRIVATE` | REE FS가 빌드돼 있으면 REE FS, 없으면 RPMB FS |
| `TEE_STORAGE_PRIVATE_REE` | REE FS를 명시적으로 선택하는 OP-TEE 확장 |
| `TEE_STORAGE_PRIVATE_RPMB` | RPMB FS를 명시적으로 선택하는 OP-TEE 확장 |

두 저장소를 모두 켠 빌드에서 `TEE_STORAGE_PRIVATE`를 썼다면 객체 본문은 REE FS에 저장된다. RPMB 상태 해시 보호를 받는지는 결합 설정에 달려 있다. REE FS 열기에 실패했다고 자동으로 RPMB FS에 재시도하는 선택 규칙도 아니다. [storage ID 분기](https://github.com/OP-TEE/optee_os/blob/23727cbae2c63f7a8e22494318ab8c990d0e10d3/core/include/tee/tee_fs.h#L106)

storage ID를 바꾸는 것만으로 기존 객체가 이동하지는 않는다. 기존 저장소에서 읽은 뒤 새 저장소에 쓰고 검증하는 이관 절차가 필요하다.

`CFG_REE_FS_ALLOW_RESET`은 버전별 의미도 읽어야 한다. 이 글의 기준 소스는 REE 목록이 사라진 경우 빈 저장소로 초기화하는 경로를 제어하며, 초기화할 때 REE에 둔 TA·서브키의 최소 허용 버전도 잃을 수 있다고 설명한다. 이를 위한 별도 `CFG_TA_VERSION_DB_RPMB` 옵션도 있다. 예전 문서의 경고를 모든 버전에 그대로 적용하기보다, 사용하는 버전의 초기화 코드와 보호할 상태를 함께 검토하는 편이 정확하다. [초기화와 버전 DB 설정](https://github.com/OP-TEE/optee_os/blob/23727cbae2c63f7a8e22494318ab8c990d0e10d3/mk/config.mk#L405)

## HMAC이 유효해도 과거 데이터일 수 있다

다음 코드는 표준 Python 라이브러리만 사용한다. 메시지와 HMAC을 함께 과거 상태로 되돌리면 인증을 통과하지만, 별도로 보관한 현재 해시와는 맞지 않는다는 점을 확인한다.

암호화·TEE 격리·RPMB 프로토콜·전원 차단 복구는 구현하지 않았다. `trusted_hash`는 공격자가 되돌릴 수 없는 기준이라고 가정한 메모리 변수다. 실제 실행 환경에서는 이 변수도 메모리에 있을 뿐이므로 RPMB의 보호를 대신하지 못한다.

```python
import hashlib
import hmac
import secrets

key = secrets.token_bytes(32)
old = b"generation=1;failed_attempts=0"
current = b"generation=2;failed_attempts=5"

old_mac = hmac.digest(key, old, "sha256")
current_mac = hmac.digest(key, current, "sha256")
trusted_hash = hashlib.sha256(current).digest()

cases = [
    ("current", current, current_mac, True, True),
    ("tampered", current.replace(b"=5", b"=0"), current_mac, False, False),
    ("rollback", old, old_mac, True, False),
]

for name, data, mac, expected_auth, expected_latest in cases:
    authenticated = hmac.compare_digest(hmac.digest(key, data, "sha256"), mac)
    latest = authenticated and hmac.compare_digest(
        hashlib.sha256(data).digest(), trusted_hash
    )
    assert (authenticated, latest) == (expected_auth, expected_latest)
    print(f"{name}: authenticated={authenticated}, latest={latest}")
```

실행하면 다음 결과가 나온다.

```text
current: authenticated=True, latest=True
tampered: authenticated=False, latest=False
rollback: authenticated=True, latest=False
```

마지막 줄에서 HMAC 검증은 성공한다. 공격자가 MAC을 위조한 적이 없기 때문이다. 별도 기준 없이 메시지의 인증만 검사했다면 이 과거 상태를 받아들였을 것이다. 기준 해시까지 같은 스냅샷 안에 넣으면 다시 함께 되돌릴 수 있으므로 문제가 해결되지 않는다.

## 롤백 보호가 있어도 별도로 설계할 부분

### 객체 하나의 저장과 업무 전체의 완료는 다르다

인증서 객체와 “현재 사용 중인 인증서 ID”를 각각 저장한다고 하자. 새 인증서를 저장한 직후 전원이 끊기면 참조 ID는 이전 값을 가리킬 수 있다. 두 저장 호출이 각각 안전해도 업무 전체가 하나의 트랜잭션이 되지는 않는다.

어떤 상태까지 완료로 볼지와 재시작 후 어떻게 수렴시킬지를 정해야 한다. 객체와 참조 관계의 일관성은 [ONVIF AdvancedSecurity의 KeyStore 설계](/posts/embedded-system/protocol-security/onvif-advancedsecurity-keystore-foundation/)에서도 다뤘다.

### 키의 수명과 데이터의 수명을 함께 관리한다

장치 고유 비밀키에서 저장소 키를 파생한다면 그 비밀키의 변경은 기존 데이터의 복호화에 영향을 준다. RPMB 인증키의 프로비저닝도 별도 절차다. eMMC RPMB 인증키는 한 번 기록하는 키이므로, 개발용 키와 양산 키를 가볍게 교체하는 모델로 접근하면 안 된다. [RPMB 키 프로비저닝](https://optee.readthedocs.io/en/latest/architecture/secure_storage.html#security-considerations)

개발용 고정 키, 안전하지 않은 HUK 구현, 소프트웨어 RPMB 에뮬레이터로 API 동작을 확인한 결과는 하드웨어 보안 보장의 증거가 되지 않는다. 파일을 다른 장치에서 읽지 못한다는 결론도 실제 키 파생과 장치 결합을 확인한 뒤 내려야 한다.

### 저장소 롤백 방지와 펌웨어 다운그레이드 방지는 다르다

저장소를 검증하는 코드 자체가 오래된 취약 버전으로 돌아갈 수 있다면 저장 계층만으로 전체 시스템을 보호할 수 없다. OP-TEE·TA의 신뢰성, Secure Boot, 버전 정책도 함께 검토해야 한다. 저장소 안의 버전 DB가 보호된다는 사실만으로 부트로더부터 rootfs까지 모든 이미지의 다운그레이드가 금지되는 것은 아니다.

## 실제 장치에서는 실패 조건을 나눠 시험한다

읽기·쓰기 성공만 확인하면 세 구성의 차이가 잘 드러나지 않는다. 다음은 독립된 시험 장비에서 확인할 항목이다. 아래 결과는 이 글에서 수행한 실장비 측정값이 아니라 설계에 맞춰 판정할 기준이다.

| 시험 | 관찰할 결과 |
| --- | --- |
| 정상 저장 뒤 재부팅 | 같은 객체를 같은 내용으로 읽을 수 있는지 |
| REE 객체의 일부 블록 변경 | 손상된 내용을 반환하지 않고 실패하는지 |
| REE 전체를 일관된 과거 스냅샷으로 복원 | 단독 구성의 한계를 확인하고, 결합 구성은 RPMB 기준과 불일치를 탐지하는지 |
| 과거 RPMB 읽기 응답 재전송 | 현재 요청의 nonce·MAC 검사에서 받아들이지 않는지 |
| 과거의 인증된 RPMB 쓰기 요청 재전송 | 현재 쓰기 카운터와 맞지 않는 요청이 거부되는지 |
| REE 데이터만 삭제하고 RPMB 유지 | 초기화 정책에 따른 실패·복구 경로로 가는지, 임의로 새 신원을 만들지 않는지 |
| 저장 중 단계별 전원 차단 | 재부팅 후 허용한 이전·새 상태로 돌아오거나 명시적으로 실패하는지 |
| `tee-supplicant` 중단·I/O 실패 | 평문 저장이나 검증 생략 같은 우회 경로 없이 실패하는지 |

전원 차단 시험에서는 성공한 쓰기의 유실 여부와 애플리케이션이 완료 응답을 보낸 시점도 기록해야 한다. 검증 오류를 내는 것은 과거 상태를 받아들이는 것과 다르지만, 제품에서 요구하는 복구 가능성을 만족하는지는 별도로 판단해야 한다.

성능도 “RPMB를 켰다”는 조건 하나로 비교하기 어렵다. 직접 저장은 객체 데이터까지 RPMB에 쓰고, 결합 구성은 REE의 객체 갱신에 RPMB 상태 해시 갱신이 더해진다. 객체 크기·갱신 횟수·캐시 조건을 고정하고 지연과 쓰기 횟수를 측정해야 한다.

저장소를 선택할 때는 먼저 **이 데이터가 과거 값으로 돌아가도 되는지**를 묻는 편이 좋다. 이전 설정으로 돌아가는 것을 허용하는 데이터와, 인증 실패 횟수·폐기한 키의 상태처럼 되돌리면 정책이 무너지는 데이터는 요구사항이 다르다. 그다음 객체가 실제로 어디에 저장되는지, 현재 상태의 기준을 어디에 보관하는지, 초기화가 그 기준을 지워도 되는지를 따라가면 된다.
