---
title: "[OSTEP] 33. Event-based Concurrency"
published: 2026-02-05 22:00:00
image: ""
description: "스레드 없이 병행성을 달성하는 이벤트 기반 프로그래밍의 원리(Event Loop, select/poll)와 장점, 그리고 비동기 I/O(AIO)와 수동 스택 관리의 어려움에 대해 다룹니다."
tags: [OS, Linux, OSTEP, Concurrency, EventLoop, Asynchronous]
category: "OS & Arch"
draft: false
---

안녕하세요, pingu52입니다.

지금까지는 병행성을 다루기 위해 **스레드(Thread)** 를 사용하는 방법을 중심으로 정리했습니다. 하지만 스레드는 경쟁 상태, 락 누락, 교착 상태 같은 문제를 동반하고, 무엇이 언제 실행될지에 대한 제어권도 대부분 OS 스케줄러에 있습니다.

이번 글에서는 스레드를 전혀 사용하지 않고 병행 서버를 구축하는 **이벤트 기반 병행성(Event-based Concurrency)** 을 다룹니다. Node.js 같은 현대적 프레임워크의 근간이 되는 C/UNIX 스타일 이벤트 루프를 기준으로 원리와 한계를 정리합니다.

---

## 1. 기본 아이디어: 이벤트 루프 (The Event Loop)

이벤트 기반 접근은 한 문장으로 요약됩니다.

- 이벤트가 발생할 때까지 기다린다
- 발생한 이벤트를 처리한다

가장 전형적인 이벤트 루프는 다음처럼 생깁니다.

```c
while (1) {
    events = getEvents();
    for (e in events)
        processEvent(e);
}
```

여기서 `processEvent()`가 처리하는 코드를 **이벤트 핸들러(event handler)**라고 부릅니다. 중요한 성질은 단일 이벤트 루프가 단일 스레드로 돌아가는 한, 동시에 실행되는 핸들러의 수는

$$H = 1$$

이라는 점입니다. 즉, 다음에 어떤 이벤트를 처리할지 결정하는 행위가 곧 **스케줄링**입니다. 스레드 기반 서버에서는 OS가 스케줄링을 결정하지만, 이벤트 기반 서버에서는 애플리케이션이 이벤트 처리 순서를 직접 제어합니다.

---

## 2. 이벤트 받기: select() / poll() API

서버는 어떻게 이벤트의 존재를 알까요. UNIX 계열 시스템은 대표적으로 `select()` 혹은 `poll()`을 제공합니다. 공통 목적은 다음입니다.

- 감시 중인 fd 집합에서
- 읽기 가능, 쓰기 가능, 예외 상태가 된 대상을 찾아
- 준비된 fd만 골라서 알려준다

`select()` 시그니처는 다음과 같습니다.

```c
int select(int nfds,
           fd_set *readfds,
           fd_set *writefds,
           fd_set *errorfds,
           struct timeval *timeout);
```

핵심 포인트는 두 가지입니다.

- **readfds / writefds**를 함께 다룰 수 있어, 입력 처리뿐 아니라 응답 전송 가능 여부까지 제어할 수 있습니다
- **timeout**으로 동작이 달라집니다
  - `NULL`: 준비된 fd가 생길 때까지 무기한 대기
  - `0`: 즉시 리턴하여 폴링 형태로 사용 가능

단순한 사용 예시는 다음 흐름입니다.

```c
fd_set readFDs;
FD_ZERO(&readFDs);
FD_SET(socket_fd, &readFDs);

int rc = select(maxFD + 1, &readFDs, NULL, NULL, NULL);
if (rc > 0 && FD_ISSET(socket_fd, &readFDs)) {
    processFD(socket_fd);
}
```

여기서 주의할 점은, 이벤트 기반 서버가 항상 논블로킹이라는 의미는 아닙니다. 보통 이벤트 루프는 `select()` 자체로는 대기할 수 있습니다. 대신 핸들러 내부에서 디스크 I/O 같은 **예측 불가능한 블로킹 호출**을 하지 않도록 설계하는 것이 핵심입니다.

---

## 3. 왜 단순해 보일까: 락이 필요 없는 구간

단일 CPU에서 단일 이벤트 루프로 이벤트를 처리한다면, 다음이 성립합니다.

- 한 번에 하나의 핸들러만 실행된다
- 핸들러 실행 중 다른 스레드가 끼어들지 않는다

이 조건에서는 공유 자료구조를 건드릴 때 락을 잡을 필요가 없습니다. 따라서 스레드 기반에서 흔한 동기화 버그들이 기본 형태에서는 사라집니다.

다만 이 단순함은 단일 루프, 단일 스레드라는 전제 위에 있습니다. 멀티 코어를 활용하려고 이벤트 루프를 여러 개로 늘리는 순간, 다시 임계 영역과 동기화 문제가 돌아옵니다.

---

## 4. 문제점 1: 블로킹 시스템 콜 (Blocking System Calls)

이벤트 기반 서버의 가장 중요한 규칙은 다음입니다.

- **이벤트 핸들러에서 블로킹 호출을 하지 말 것**

예를 들어 클라이언트 요청에 따라 디스크 파일을 읽어 응답해야 한다고 합시다. 핸들러가 `open()`이나 `read()`에서 디스크 I/O를 기다리며 블로킹되면, 이벤트 루프 전체가 멈춥니다. 그 동안 다른 요청은 들어와도 처리되지 않습니다.

---

## 4.1 해결책: 비동기 I/O (Asynchronous I/O)

이 문제를 해결하려면, I/O 요청을 발행하고 즉시 리턴하는 **비동기 I/O(AIO)**가 필요합니다. POSIX AIO 계열에서는 보통 `aiocb` 같은 제어 블록을 구성해 요청합니다.

```c
struct aiocb {
    int aio_fildes;      // file descriptor
    off_t aio_offset;    // file offset
    volatile void *aio_buf;
    size_t aio_nbytes;
};

int aio_read(struct aiocb *aiocbp);
int aio_error(const struct aiocb *aiocbp);
```

동작 흐름은 다음과 같습니다.

1. `aio_read()`로 비동기 읽기 요청을 발행하고 즉시 리턴
2. 나중에 `aio_error()`로 완료 여부를 확인
   - 완료: 0
   - 진행 중: `EINPROGRESS`

하지만 여기서 또 다른 현실 문제가 생깁니다.

- outstanding I/O가 수십, 수백 개면 각 요청을 계속 폴링하기가 괴롭다

그래서 일부 시스템은 시그널 같은 메커니즘으로 완료를 통지해 폴링 부담을 줄이기도 합니다. 또한 어떤 환경에서는 비동기 디스크 I/O가 충분히 제공되지 않아, 네트워크는 이벤트로 처리하되 디스크 I/O는 스레드 풀로 처리하는 하이브리드 접근을 택하기도 합니다.

---

## 5. 문제점 2: 상태 관리 (State Management)

이벤트 기반 프로그래밍이 스레드보다 코딩하기 어려운 두 번째 이유는 **상태(state) 관리**입니다. 스레드 기반 코드에서는 호출 스택이 자연스럽게 문맥을 저장합니다.

예를 들어 다음 코드는 스레드 기반에서는 너무 자연스럽습니다.

```c
int rc = read(fd, buffer, size);
rc = write(sd, buffer, size);
```

`read()`가 끝나면 곧바로 `write()`를 호출하면 됩니다. 이때 어떤 소켓 `sd`로 쓸지, 어떤 버퍼를 쓸지는 스레드 스택에 그대로 남아 있습니다.

하지만 이벤트 기반 시스템에서는 `read()`를 비동기로 요청하고 핸들러가 리턴해버립니다. 나중에 I/O 완료 이벤트가 왔을 때, 무엇을 이어서 해야 할지 정보를 잃지 않으려면 상태를 별도 구조에 저장해야 합니다. 이를 흔히 **수동 스택 관리(manual stack management)** 라고 부릅니다.

이를 해결하기 위해 자주 등장하는 개념이 **continuation**입니다. 핵심은 단순합니다.

- 다음에 이어서 해야 할 작업에 필요한 정보를 기록해 둔다
- 이벤트가 발생했을 때 그 정보를 찾아서 마무리 작업을 수행한다

예를 들어 fd 기준으로 continuation을 찾아 소켓을 알아내는 식으로 구성할 수 있습니다.

```c
// 예시: fd -> continuation(=sd 등 필요한 상태) 매핑
// 완료 이벤트에서 fd로 조회한 뒤 write 수행
```

이 패턴이 늘어나면 핸들러가 조각나고, 제어 흐름이 복잡해져 유지보수 난이도가 올라갑니다.

---

## 6. 기타 어려움들

이벤트 기반 접근은 만능이 아닙니다. 책에서는 대표적으로 다음을 지적합니다.

1. **멀티 코어 확장성**
   - 단일 루프는 단일 스레드
   - 여러 CPU를 쓰려면 여러 핸들러를 병렬로 돌려야 하고, 다시 락 기반 동기화가 필요해집니다

2. **암시적 블로킹(implicit blocking)**
   - 페이지 폴트 같은 사건은 프로그래머가 직접 제어하기 어렵습니다
   - 핸들러가 페이지 폴트를 내면 프로세스가 블로킹되고 서버 진행이 멈출 수 있습니다

3. **API 의미 변화에 취약**
   - 어떤 라이브러리 루틴이 논블로킹에서 블로킹으로 바뀌면, 해당 핸들러 구조를 다시 쪼개야 합니다
   - 이벤트 기반에서는 블로킹이 치명적이므로 이런 변화에 계속 민감해야 합니다

4. **비동기 네트워크 I/O와 비동기 디스크 I/O의 비대칭**
   - 네트워크는 `select()`류로 다루기 쉬운 편이지만
   - 디스크는 AIO 호출을 별도로 조합해야 하는 경우가 많아 인터페이스가 깔끔하게 통일되지 않습니다

---

## 7. 요약

이벤트 기반 병행성은 스레드의 대안으로 다음을 제공합니다.

- 스케줄링 제어권을 애플리케이션이 더 많이 가진다
- 단일 루프 구조에서는 락이 필요 없어 동기화 버그가 줄어든다

대신 다음 비용을 치릅니다.

- 블로킹 호출을 피해야 하므로 비동기 I/O가 사실상 필수
- continuation 기반 상태 관리로 코드가 복잡해지고 유지보수가 어려워질 수 있다
- 멀티 코어 확장, 페이징 같은 시스템 요소와의 상호작용이 까다롭다

결국 스레드와 이벤트는 같은 병행성 문제를 푸는 서로 다른 접근이며, 워크로드와 구현 복잡도, 운영 환경을 함께 보고 선택해야 합니다.

---

## 8. 용어 정리

- `Event Loop (이벤트 루프)`: 이벤트를 기다리고, 준비된 이벤트를 하나씩 처리하는 루프.
- `Event Handler (이벤트 핸들러)`: 개별 이벤트를 처리하는 코드 조각. 단일 루프에서는 한 번에 하나만 실행됨.
- `select() / poll()`: 다중 fd를 감시해 읽기/쓰기 준비 상태를 알려주는 시스템 콜.
- `Blocking / Non-blocking`: 호출이 완료될 때까지 대기하면 블로킹, 바로 리턴하면 논블로킹.
- `Asynchronous I/O (AIO)`: I/O 요청을 발행하고 완료를 기다리지 않고 즉시 리턴하는 I/O 방식.
- `Continuation`: 나중에 계산을 재개하기 위해 필요한 상태 정보의 묶음.
- `Manual Stack Management`: 스레드 스택 대신 힙/테이블 등에 상태를 저장하고 이벤트 완료 시 복원하는 방식.

---

## Reference

- [Operating Systems: Three Easy Pieces - Chapter 33: Event-based Concurrency](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-events.pdf)
- [Advanced Programming in the UNIX Environment (Stevens, Rago)](https://www.oreilly.com/library/view/advanced-programming-in/0321637739/)
- [SEDA: An Architecture for Well-Conditioned, Scalable Internet Services](https://www.cs.berkeley.edu/~brewer/papers/seda-sosp01.pdf)
- [Flash: An Efficient and Portable Web Server](https://www.cs.princeton.edu/courses/archive/fall03/cos518/papers/flash-usenix99.pdf)
