---
title: "[Embedded Linux] A/B 시험 부팅과 롤백 인덱스 확정 시점"
published: 2026-11-25
description: "A/B 업데이트에서 새 슬롯의 첫 부팅과 롤백 인덱스 갱신 사이에 어떤 복구 경로가 남는지 살펴본다. Android Verified Boot의 성공 표시 순서를 따라가며, 재부팅 시점별로 이전 슬롯이 부팅 조건을 만족하는지 Python으로 확인한다."
image: "./ab-rollback-cover.jpg"
tags: [Embedded Linux, OTA, A/B Update, Verified Boot, Bootloader]
category: "BSP & Build"
categoryPath:
  - "Embedded System"
  - "BSP & Build"
draft: false
lang: "ko"
---

A 슬롯에서 동작하던 장비에 업데이트를 설치하고 B로 재부팅했다고 하자. 새 커널은 올라왔지만 사용자 공간에서 데이터 파티션을 마운트하지 못했다. 이때 A는 디스크에 그대로 있다. 그런데 B를 처음 고르는 순간 부트로더가 허용할 최소 보안 버전까지 올렸다면, A를 다시 골라도 부팅 검증에서 막힌다.

Android의 A/B 부팅 절차는 이런 경우를 고려해 순서를 정해 둔다. **새 슬롯에 부팅 성공을 먼저 기록하고, 그 슬롯의 롤백 인덱스로 장치의 하한을 올리는 일은 그 뒤에 한다.** 두 기록 사이에서 재부팅하면 어떤 차이가 생기는지 보자. [AOSP의 A/B 부팅 절차](https://source.android.com/docs/security/features/verifiedboot/boot-flow#flow-for-a-b-devices)

## 서명한 예전 이미지도 하한에서 걸린다

Android Verified Boot(AVB)에서 서명 검증은 장치가 신뢰하는 키로 VBMeta를 서명했는지 확인한다. 그 메타데이터에 담긴 해시나 해시 트리의 루트는 파티션 내용을 검사하는 기준이 된다. 예전에 같은 키로 서명한 정상 이미지도 이 검사를 통과할 수 있다. 어느 시점의 이미지까지 허용할지는 별도의 값인 `rollback_index`로 결정한다. [AVB의 VBMeta와 롤백 보호](https://android.googlesource.com/platform/external/avb/+/6f4de31814296d4ab315c497c33483ef3e2eac8d/README.md#rollback-protection)

장치는 변조 여부를 감지할 수 있는 저장소에 인덱스 하한을 보관한다. 검증을 강제하는 잠긴 장치에서는 이미지가 사용하는 각 위치 `n`에 대해 `rollback_index[n] >= stored_rollback_index[n]`을 만족해야 한다. 아래 예제는 한 위치만 다룬다. A의 인덱스와 장치 하한은 7이고, B에는 인덱스 8인 이미지가 들어 있다.

여기서 7과 8은 릴리스 번호가 아니다. 두 릴리스가 인덱스 7을 공유하면 배포 날짜가 더 이른 이미지도 하한 7을 통과한다. 반대로 하한이 8이 되면 인덱스 7인 이미지는 서명이 유효하고 버전 문자열이 아무리 높아도 이 검사에서 탈락한다. 따라서 특정 보안 수정 이전의 릴리스를 차단하려면, 수정본을 만들 때 어느 인덱스를 올릴지부터 정해야 한다.

## B를 선택한 시점과 A로 돌아갈 수 없는 시점

Legacy A/B에서 `active`는 다음 부팅에서 우선 시도할 슬롯을 뜻한다. 새 슬롯을 활성화하면 부트로더는 제한된 횟수만큼 부팅을 시도한다. 그 사이 시스템이 Boot Control HAL의 `markBootSuccessful()`을 호출해 현재 슬롯의 성공을 기록한다. 성공을 기록하지 못하고 시도 횟수를 소진하면 부트로더는 다른 부팅 가능 슬롯을 찾는다. 아래 표에서 A는 앞서 부팅에 성공했고 두 이미지의 서명과 무결성은 정상이라고 가정한다. [AOSP의 슬롯 상태와 업데이트 수명 주기](https://source.android.com/docs/core/ota/ab#life-of-an-a-b-update)

| 재부팅 직전까지 끝난 작업 | B의 성공 표시 | 저장된 하한 | 재부팅 후 A(인덱스 7)의 상태 |
| --- | --- | ---: | --- |
| B 설치 후 다음 부팅 대상으로 선택 | 없음 | 7 | 하한을 통과한다. B의 시험 부팅을 시작한다. |
| B의 커널은 시작했지만 기동 검사에 실패 | 없음 | 7 | B의 시도 횟수를 소진하면 A가 복귀 후보가 된다. |
| B의 기동 검사 통과 후 성공 표시 저장 | 있음 | 7 | A도 아직 하한을 통과한다. 다음에 검증한 B로 하한을 올릴 수 있다. |
| B의 검증된 인덱스 8을 하한으로 저장 | 있음 | 8 | A는 하한에서 탈락한다. 슬롯 우선순위를 바꿔도 결과는 같다. |

두 번째 행에서 B의 성공을 판정할 근거는 장비마다 다르다. 예를 들어 데이터 파티션이 필요한 장비라면 해당 마운트가 성공하고 주 서비스가 데이터를 읽을 때까지 기다릴 수 있다. 데몬이 시작됐다는 로그만 보고 성공을 기록하면 곧 처리해야 할 마운트 오류를 놓칠 수 있다. 서비스가 요청을 받을 준비가 됐음을 알리는 방법은 [systemd의 기동 순서와 준비 상태](/posts/system-engineering/server-infra/systemd-ordering-readiness-watchdog/)에서 다뤘다.

세 번째 행에서는 성공 표시가 저장된 뒤 하한을 쓰기 전에 전원이 끊겼다고 가정한다. 다음 부팅에서 B의 성공 표시를 읽고 B를 다시 검증하면 하한 갱신을 재시도할 수 있다. 네 번째 행까지 끝났다면 복구 정책도 달라진다. B가 나중에 고장 날 경우를 대비하려면 새 하한에서 검증을 통과하는 복구 이미지나 슬롯이 필요하다. A의 파일이 온전히 남아 있다는 사실만으로 복구를 보장할 수 없기 때문이다.

이 순서는 Android처럼 새 업데이트가 시험 부팅에 실패하면 복귀하는 정책을 따른다. 성공 확정 뒤에도 이전 슬롯으로 돌아갈 수 있어야 하는 제품에는 다른 선택지가 있다. AVB 문서는 이 경우 모든 부팅 가능 슬롯이 통과할 수 있는 범위에서 하한을 최대한 높이는 방법을 설명한다. 위 예에서 A까지 유지하려면 하한은 7에 머문다. 그러면 다른 인덱스 7 이미지도 하한 검사만으로는 차단할 수 없다. [AVB의 저장된 롤백 인덱스 갱신 정책](https://android.googlesource.com/platform/external/avb/+/6f4de31814296d4ab315c497c33483ef3e2eac8d/README.md#updating-stored-rollback-indexes)

## 재부팅 경계를 Python으로 확인하기

아래 코드는 A와 B의 이미지 검증이 끝났다고 가정하고, 재부팅을 건너 남는 두 값만 다룬다. `successful`은 B의 성공 표시이고 `floor`는 장치에 기록한 하한이다. 기동 검사에 실패한 경우와 성공 표시 직후 재부팅한 경우를 각각 확인한다.

```python
from dataclasses import dataclass, replace


@dataclass(frozen=True)
class State:
    successful: bool
    floor: int


def update_floor(state, verified_index):
    if state.successful and verified_index > state.floor:
        return replace(state, floor=verified_index)
    return state


a_index, b_index = 7, 8
trial = State(successful=False, floor=7)

# 시험 부팅에 실패했다. 다음 부팅이 하한 갱신을 시도해도 A가 남는다.
after_failure = update_floor(trial, b_index)
assert after_failure == trial
assert a_index >= after_failure.floor

# B가 기동 검사를 통과했다. 성공 표시만 저장한 지점에서 재부팅한다.
confirmed = replace(trial, successful=True)
assert a_index >= confirmed.floor

# 재부팅 후 검증한 B의 인덱스를 저장한다. 이제 A는 하한에 걸린다.
committed = update_floor(confirmed, b_index)
assert a_index < committed.floor == b_index
assert update_floor(committed, b_index) == committed
```

이 모델에서 성공 표시 직후에는 A가 조건을 만족했고, 하한을 8로 갱신하고 같은 작업을 반복해도 값은 8이었다. 모델은 각각의 쓰기가 끝난 지점에서만 실행을 끊는다. 저장 도중 전원이 꺼져 기록이 일부만 남는 경우나 여러 인덱스를 갱신하다 중단되는 경우는 보드의 저장 방식에 달려 있다. 실제 전원 차단 시험에서는 **다시 읽힌 성공 표시, 위치별 하한, 부트로더가 선택한 슬롯**을 함께 기록해야 어느 쓰기까지 살아남았는지 판단할 수 있다.
