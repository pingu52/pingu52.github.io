---
title: "[OSTEP] 43. Log-structured File Systems"
published: 2026-02-10 17:00:00
image: ""
description: "디스크 쓰기 성능을 극대화하기 위해 모든 업데이트를 로그 형태로 순차 기록하는 LFS의 설계 철학, 아이노드 맵(imap), 그리고 가비지 컬렉션(Cleaner) 메커니즘을 분석합니다."
tags: [OS, Linux, OSTEP, FileSystem, LFS, Log-structured]
category: "OS & Arch"
draft: false
---

안녕하세요, pingu52입니다.

이전 장에서 다룬 FFS(Fast File System)는 디스크의 물리적 구조를 고려해 지역성(Locality)을 살려 성능을 높였습니다. 하지만 90년대 초 버클리 연구진은 하드웨어 트렌드가 바뀌고 있다는 점에 주목했고, 완전히 다른 관점의 파일 시스템을 제안합니다.

디스크를 거대한 로그처럼 사용하여, 모든 쓰기를 큰 순차 쓰기로 바꾸는 **LFS(Log-structured File System)** 입니다.

이번 글에서는 LFS가 왜 등장했는지, 그리고 덮어쓰지 않는 설계에서 파일 위치가 계속 바뀌는데도 어떻게 데이터를 찾고, 쓰레기를 어떻게 회수하는지까지 연결해서 정리합니다.

---

## 1. 등장 배경: 기술 트렌드의 변화

LFS는 다음 관찰에서 출발합니다.

1. **메모리가 커지고 있다**
   메모리가 커질수록 더 많은 데이터가 캐시에 올라가고, 디스크 트래픽은 점점 쓰기 중심으로 바뀝니다. 따라서 파일 시스템 성능은 결국 쓰기 성능이 좌우하기 쉽습니다.

2. **순차 I/O와 랜덤 I/O의 격차**
   디스크 전송 대역폭은 증가했지만, seek와 회전 지연은 크게 좋아지지 않습니다. 따라서 랜덤 쓰기보다 순차 쓰기를 만드는 것이 훨씬 유리합니다.

3. **기존 파일 시스템의 common workload 성능 한계**
   FFS는 block group으로 가까이 모으더라도, 작은 파일 생성 같은 작업에서 inode, 비트맵, 디렉터리 블록 등 다수의 메타데이터를 갱신해야 합니다. 결국 많은 짧은 seek와 회전 지연이 발생해 peak sequential bandwidth에 한참 못 미칩니다.

4. **RAID-aware하지 않음**
   RAID-4/5 같은 parity 기반 RAID는 작은 쓰기에서 read-modify-write 문제가 발생합니다. 기존 파일 시스템은 이 최악 패턴을 회피하도록 설계되지 않았습니다.

요약하면 목표는 명확합니다.

- 쓰기를 가능한 한 **크고 연속적인 순차 쓰기**로 바꿔서, positioning 비용을 상각한다

---

## 2. 순차 쓰기: 덮어쓰지 않고 append-only로 기록한다

LFS는 기존 블록을 덮어쓰지 않습니다. 변경이 생기면 데이터 블록과 관련 메타데이터(inode 등)를 **디스크의 빈 공간 끝에 새로 기록**합니다.

하지만 여기서 중요한 디테일이 하나 있습니다.

### 2.1 순차 주소로 쓰는 것만으로는 부족하다

연속된 주소에 블록을 쓰더라도, 두 번의 작은 write 사이에 시간이 벌어지면 디스크가 회전해버립니다. 그 결과 다음 블록은 한 바퀴 가까이 기다린 뒤에야 기록될 수 있습니다.

즉, 성능을 얻으려면

- 순차 주소
- 그리고 **충분히 큰 contiguous write**

두 조건이 동시에 필요합니다.

### 2.2 세그먼트(segment)와 write buffering

LFS는 이를 위해 write buffering을 사용합니다.

- 작은 업데이트들을 메모리에 모아 둔다
- 충분히 쌓이면 큰 덩어리로 한 번에 디스크에 쓴다

이때 큰 덩어리를 **세그먼트(segment)** 라고 부릅니다. 실제 세그먼트는 보통 몇 MB 단위입니다.

---

## 3. 얼마나 버퍼링해야 하는가

세그먼트가 크면 클수록 positioning 오버헤드를 잘 상각하고 peak bandwidth에 가까워질 수 있습니다. 이를 간단한 모델로 유도할 수 있습니다.

- positioning 비용: $T_{\mathrm{position}}$
- peak 전송률: $R_{\mathrm{peak}}$
- 한 번에 쓰는 데이터 크기: $D$

$$
T_{\mathrm{write}} = T_{\mathrm{position}} + \frac{D}{R_{\mathrm{peak}}}
\tag{1}
$$

$$
R_{\mathrm{eff}} = \frac{D}{T_{\mathrm{position}} + \frac{D}{R_{\mathrm{peak}}}}
\tag{2}
$$

peak 대비 $F$ 만큼의 효율을 얻고 싶다면 $R_{\mathrm{eff}} = F\cdot R_{\mathrm{peak}}$를 만족하도록 $D$를 잡으면 되고, 정리하면 다음이 됩니다.

$$
D = \frac{F}{1-F} \cdot R_{\mathrm{peak}} \cdot T_{\mathrm{position}}
\tag{6}
$$

이 식이 말하는 직관은 단순합니다.

- 원하는 효율 $F$가 1에 가까워질수록, 필요한 $D$는 급격히 커집니다
- 그래서 LFS는 KB 단위가 아니라 **MB 단위**로 버퍼링하는 설계를 택합니다

---

## 4. 문제: inode를 어떻게 찾는가

FFS에서는 inode table이 고정 위치에 있어서 i-number만 알면 inode 위치를 계산할 수 있었습니다.

하지만 LFS는 덮어쓰지 않습니다.
inode를 갱신할 때마다 inode는 로그 끝으로 이동하고, 최신 inode는 디스크 여기저기에 흩어집니다.

즉, i-number만으로는 inode를 찾을 수 없습니다.

---

## 5. 해결: indirection 계층, inode map(imap)

LFS는 i-number와 inode 사이에 **indirection** 계층을 하나 둡니다. 이것이 **inode map(imap)** 입니다.

- 입력: inode 번호
- 출력: 최신 inode의 디스크 주소

imap은 보통 배열처럼 구현할 수 있고, 엔트리 하나는 디스크 포인터 4바이트 정도로 생각할 수 있습니다. inode가 새 위치에 기록될 때마다 해당 inode 번호의 imap 엔트리도 함께 갱신됩니다.

여기서 또 중요한 디테일이 있습니다.

### 5.1 imap도 고정 위치에 두지 않는다

imap을 디스크의 고정된 위치에 두면, inode를 갱신할 때마다

- 로그 끝에 쓰기
- 다시 imap 고정 위치에 쓰기

가 되어 seek가 생기고 성능이 무너집니다.

그래서 LFS는 imap도 로그에 함께 씁니다.
구체적으로는 imap 전체가 아니라 **갱신된 조각(chunk)** 을 데이터 블록, inode와 함께 같은 세그먼트에 기록합니다.

---

## 6. 마지막 퍼즐: checkpoint region(CR)

imap 조각도 디스크 여기저기에 흩어지는데, 그럼 최신 imap 조각을 어디서 찾을까요?

파일 시스템은 반드시 시작점이 하나 필요합니다.
LFS는 이를 위해 디스크의 알려진 고정 위치에 **checkpoint region(CR)**을 둡니다.

- CR은 최신 imap 조각들의 주소들을 저장합니다
- CR은 자주 쓰면 seek를 유발하므로, 보통 수십 초 단위로 주기적으로만 갱신합니다

따라서 파일 접근 경로는 다음처럼 정리됩니다.

- CR 읽기
- imap 조각 위치 확인 및 imap 확보
- inode 위치 확인
- inode 읽기
- 데이터 블록 읽기

### 6.1 읽기 성능은 어떤가

처음에는 CR과 imap을 읽어야 하지만, imap은 메모리에 캐시될 수 있습니다.
imap이 캐시된 뒤에는 inode 번호로 inode 주소를 찾는 것은 메모리 lookup이 되고, 그 이후 데이터 읽기는 일반 UNIX 파일 시스템과 유사하게 진행됩니다.

---

## 7. 디렉터리와 recursive update problem

디렉터리는 전통적인 UNIX와 동일하게 (이름, inode 번호) 매핑의 집합입니다.

덮어쓰지 않는 파일 시스템에서는 inode 위치가 바뀔 때 디렉터리도 갱신해야 할 것처럼 보입니다.
그런데 디렉터리를 갱신하면 그 디렉터리의 inode도 바뀌고, 그러면 상위 디렉터리도 바뀌는 식으로 트리 전체로 파급되는 문제가 생깁니다.
이를 **recursive update problem**이라고 부릅니다.

LFS는 imap으로 이를 피합니다.

- 디렉터리는 이름을 inode 번호에만 매핑한다
- inode의 실제 위치 변화는 imap에서만 관리한다

즉, 디렉터리를 바꿀 필요 없이 imap만 갱신하면 됩니다.

---

## 8. 새로운 문제: garbage collection, Cleaner

LFS는 덮어쓰지 않기 때문에, 갱신이 반복되면 구버전 데이터와 구버전 inode가 디스크에 남습니다.
이들은 더 이상 참조되지 않는 **garbage**가 됩니다.

garbage를 회수하지 않으면 디스크는 결국 가득 차므로, LFS는 백그라운드에서 **Cleaner**가 공간을 회수합니다.

중요한 점은 Cleaner가 블록 단위로 땜빵하듯 free를 만들면 안 된다는 것입니다.
그렇게 하면 디스크에 작은 구멍만 남고, LFS는 더 이상 큰 연속 공간에 세그먼트를 쓰기 어렵게 되어 성능이 급락합니다.

따라서 Cleaner는 **segment 단위**로 동작합니다.

- 오래된 세그먼트 M개를 읽고
- live block만 골라
- N개의 새 세그먼트로 압축해 다시 쓰고 (N < M)
- 기존 M 세그먼트를 통째로 free로 만든다

---

## 9. 메커니즘: 블록이 live인지 어떻게 판단하는가

LFS는 각 세그먼트의 앞부분에 **segment summary block**을 둡니다.
여기에 각 블록이

- 어느 inode 번호에 속하는지
- 파일의 몇 번째 블록 오프셋인지

를 기록합니다.

블록 D가 디스크 주소 A에 있을 때, liveness 판정은 다음 아이디어입니다.

- summary에서 inode 번호 N과 오프셋 T를 얻는다
- imap으로 N의 최신 inode 위치를 찾고 inode를 읽는다
- inode가 가리키는 T번째 블록 주소가 A와 같으면 live
- 다르면 이미 더 최신 버전이 있으므로 garbage

추가로 LFS는 truncation이나 delete 같은 경우를 빠르게 처리하기 위해 inode 버전 번호를 활용해 비교만으로 단축하는 최적화도 사용합니다.

---

## 10. 정책: 언제 무엇을 청소할 것인가

Cleaner의 또 다른 축은 정책입니다.

- 언제 청소할지
  - 주기적으로
  - 유휴 시간에
  - 또는 디스크가 거의 찼을 때

- 어떤 세그먼트를 선택할지
  - 원 논문은 hot/cold 세그먼트 분리를 제안합니다
  - hot은 계속 덮어써져서 시간이 지나면 더 많은 블록이 dead가 되므로, 너무 빨리 청소하면 손해가 큽니다
  - cold는 상대적으로 안정적이어서, dead가 생기면 일찍 청소하는 편이 효율적일 수 있습니다

---

## 11. 크래시 복구

LFS에서도 쓰기 도중 크래시는 발생합니다.
크래시는 크게 두 경우에 문제가 됩니다.

- 세그먼트를 쓰는 도중 크래시
- CR을 갱신하는 도중 크래시

### 11.1 CR 원자성 확보: CR을 2개 둔다

CR 갱신이 중간에 깨지면 시작점이 망가질 수 있습니다.
그래서 LFS는 CR을 디스크 양 끝에 2개 두고 번갈아 갱신합니다.
또한 timestamp를 이용한 헤더와 꼬리 블록으로 일관성을 검사해, 가장 최신이면서 일관된 CR을 선택합니다.

### 11.2 roll-forward: 마지막 checkpoint 이후를 복구한다

CR은 수십 초마다만 갱신되므로, 단순히 마지막 CR로 돌아가면 그 사이의 업데이트가 통째로 사라집니다.

이를 줄이기 위해 LFS는 roll-forward를 수행합니다.

- 마지막 일관된 CR로부터 로그 끝을 찾고
- 그 이후 세그먼트들을 순차적으로 훑으며
- 유효한 업데이트를 재구성해 반영합니다

---

## 12. 요약

- **핵심 철학**: 모든 업데이트를 append-only로 기록해 쓰기를 큰 순차 쓰기로 만든다
- **segment와 write buffering**: 큰 contiguous write를 만들기 위한 메커니즘
- **imap**: 움직이는 inode를 추적하기 위한 indirection 계층
- **CR**: 최신 imap 조각을 찾기 위한 고정 시작점
- **Cleaner**: segment 단위로 live block만 재배치해 큰 연속 free 공간을 만든다
- **liveness 판정**: segment summary block과 imap, inode를 이용해 주소 일치로 판단한다
- **crash recovery**: 2개의 CR과 roll-forward로 일관성과 최신성 사이를 절충한다

LFS의 아이디어는 copy-on-write 계열 파일 시스템과 스토리지 계층 전반에 영향을 남겼고, 오늘날에도 큰 쓰기와 공간 회수라는 문제는 여전히 유효합니다.

---

## 13. 용어 정리

- `Log-structured`: 덮어쓰기를 피하고 로그 append로 상태를 갱신하는 설계
- `Segment`: 큰 순차 쓰기를 만들기 위한 기록 단위
- `Imap (Inode Map)`: inode 번호에서 최신 inode 디스크 주소로의 매핑
- `Checkpoint Region (CR)`: 최신 imap 조각 주소들을 저장하는 고정 시작점
- `Cleaner`: live block만 재배치하고 segment 단위로 공간을 회수하는 백그라운드 작업
- `Segment Summary Block`: 각 블록의 inode 번호와 오프셋을 기록해 liveness 판단을 돕는 메타데이터
- `Roll-forward`: 마지막 checkpoint 이후 로그를 스캔해 유효한 업데이트를 복구하는 기법

---

## Reference

- [Operating Systems: Three Easy Pieces - Chapter 43: Log-structured File Systems](https://pages.cs.wisc.edu/~remzi/OSTEP/file-lfs.pdf)
