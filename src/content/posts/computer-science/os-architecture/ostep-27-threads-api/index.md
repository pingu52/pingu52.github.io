---
title: "[OSTEP] 27. Interlude: Thread API"
published: 2026-02-03 08:00:00
image: "./images/27_1.png"
description: "POSIX 스레드(Pthreads) API의 핵심인 생성, 종료, 락, 조건 변수의 사용법과 주의사항을 상세히 정리합니다."
tags: [OS, Linux, OSTEP, Concurrency, Pthreads, API]
category: "OS & Arch"
draft: false
---

안녕하세요, pingu52입니다.

이전 장에서 스레드의 개념을 익혔다면, 이번 장에서는 운영체제가 제공하는 실제 인터페이스를 배울 차례입니다. 표준인 **POSIX Threads (Pthreads)** 라이브러리를 중심으로 스레드를 생성하고 제어하는 방법을 다룹니다.

---

## 1. 스레드 생성 (Thread Creation)

스레드 생성은 `pthread_create` 함수를 사용합니다.

```c
#include <pthread.h>

int pthread_create(pthread_t *thread,
                   const pthread_attr_t *attr,
                   void *(*start_routine)(void *),
                   void *arg);
```

이 함수는 4개의 인자를 받습니다.

1. `thread`: 생성된 스레드를 식별하는 `pthread_t`의 포인터입니다.
2. `attr`: 스레드 속성(우선순위, 스택 크기 등)을 지정합니다. 보통은 `NULL`을 써서 기본값을 사용합니다.
3. `start_routine`: 스레드가 실행을 시작할 함수입니다. 이 함수는 `void *` 인자를 받고 `void *`를 반환해야 합니다.
4. `arg`: 실행할 함수에 전달할 인자입니다.

**왜 `void *`를 쓸까요?**  
C에서 `void *`는 임의의 포인터 타입을 담을 수 있습니다. 따라서 다양한 타입의 인자를 전달하고, 결과도 포인터 형태로 유연하게 전달할 수 있도록 설계되어 있습니다. 다만 실제로는 호출자와 피호출자가 동일한 타입 규약을 공유해야 안전합니다.

---

## 2. 스레드 종료 대기 (Thread Completion)

스레드가 작업을 마칠 때까지 기다리려면 `pthread_join`을 사용합니다.

```c
int pthread_join(pthread_t thread, void **value_ptr);
```

1. `thread`: 기다릴 대상 스레드입니다.
2. `value_ptr`: 스레드의 반환 값을 받아올 포인터의 포인터입니다. 반환 값이 필요 없으면 `NULL`을 전달해도 됩니다.

**[주의] 스택 변수 반환 금지**  
스레드 함수 내에서 지역 변수(스택에 할당된 변수)의 주소를 반환하면 안 됩니다. 스레드가 종료되면 그 스택 프레임은 더 이상 유효하지 않으므로, 반환된 포인터는 잘못된 메모리를 가리키게 되어 치명적인 버그로 이어집니다. 값을 반환하려면 힙에 할당(`malloc`)하거나, 호출자가 소유한 메모리를 인자로 넘겨 그 공간에 결과를 기록하는 방식이 안전합니다.

---

## 3. 락 (Locks)

임계 영역을 보호하기 위해 **상호 배제(Mutual Exclusion)** 기능을 제공하는 락을 사용합니다. Pthreads에서는 이를 `Mutex`라고 부릅니다.

### 초기화와 사용

락은 사용 전에 반드시 초기화해야 합니다.

```c
// 정적 초기화
pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

// 동적 초기화 (실패 시 반환값 체크 필수)
#include <assert.h>

int rc = pthread_mutex_init(&lock, NULL);
assert(rc == 0);
```

사용법은 직관적입니다. 임계 영역 앞에서 락을 걸고(`lock`), 뒤에서 풉니다(`unlock`).

```c
pthread_mutex_lock(&lock);
x = x + 1; // 임계 영역
pthread_mutex_unlock(&lock);
```

만약 다른 스레드가 이미 락을 가지고 있다면, `pthread_mutex_lock`을 호출한 스레드는 락을 얻을 때까지 대기(Block)합니다.

---

## 4. 조건 변수 (Condition Variables)

스레드 간에 신호(Signal)를 주고받아야 할 때, 즉 특정 조건이 만족될 때까지 기다려야 하는 경우에 조건 변수를 사용합니다.

```c
int pthread_cond_wait(pthread_cond_t *cond, pthread_mutex_t *mutex);
int pthread_cond_signal(pthread_cond_t *cond);
```

### 올바른 사용 패턴

조건 변수는 반드시 **락(Mutex)과 함께** 사용해야 합니다.

**대기하는 스레드 (Waiting Thread)**

```c
pthread_mutex_lock(&lock);
while (ready == 0) { // 반드시 while 루프 사용
    pthread_cond_wait(&cond, &lock);
}
pthread_mutex_unlock(&lock);
```

**신호를 보내는 스레드 (Signaling Thread)**

```c
pthread_mutex_lock(&lock);
ready = 1;
pthread_cond_signal(&cond);
pthread_mutex_unlock(&lock);
```

**핵심 포인트**

1. `pthread_cond_wait()`는 호출 시점에 보유 중이던 **락을 원자적으로 해제**하고 잠듭니다. 깨어날 때는 다시 **락을 획득한 상태로** 반환합니다.
2. 대기 조건(`ready == 0`) 검사는 `if`가 아닌 **`while`** 로 해야 합니다. 깨어난 뒤 조건이 여전히 만족되지 않았을 수도 있고, 명시적인 신호 없이 깨어나는 spurious wakeup이 발생할 수도 있기 때문입니다.

---

## 5. 컴파일 방법

Pthreads 라이브러리를 사용하는 코드를 컴파일할 때는 `-pthread` 플래그를 추가합니다. 이 플래그는 링크 옵션뿐 아니라 스레드 관련 컴파일 옵션도 함께 설정해 주는 방식이라 보통 권장됩니다.

```bash
gcc -o main main.c -Wall -pthread
```

---

## 6. API 사용 가이드라인

책에서 제시하는 멀티 스레드 프로그래밍의 조언입니다.

- **단순하게 유지하라 (Keep it simple)**: 락과 조건 변수의 상호작용이 복잡해질수록 버그가 급격히 늘어납니다.
- **반환 값을 확인하라**: API 호출 실패는 언제든 일어날 수 있으니, 실패 시 경로를 명확히 처리해야 합니다.
- **스택 변수 주의**: 스레드 간에 로컬 변수(스택) 포인터를 오래 보관하거나 반환하지 마세요.
- **조건 변수 사용**: 단순 플래그를 바쁜 대기(spin)로 폴링하기보다는, 조건 변수를 사용해 효율적이고 안전하게 대기/깨움을 구현합니다.

---

## 7. 요약 (Summary)

이번 장은 운영체제가 제공하는 스레드 인터페이스의 실체를 확인했습니다.

- **생성 및 종료 대기**: `pthread_create`, `pthread_join`
- **락(Lock)**: `pthread_mutex_lock`, `pthread_mutex_unlock`을 통한 상호 배제
- **조건 변수**: `pthread_cond_wait`, `pthread_cond_signal`을 통한 순서 제어 및 대기

이 API들은 간단해 보이지만, while 루프로 조건을 재확인한다거나, 스택 포인터를 반환하지 않는다 같은 디테일을 놓치면 치명적인 오류로 이어집니다. 다음 장부터는 이 도구들을 이용해 실제로 락과 조건 변수를 어떻게 구현하고 활용하는지 더 깊이 있게 다룹니다.

---

## 8. 용어 정리

- `POSIX Threads (Pthreads)`: UNIX 계열 시스템의 표준 스레드 API 라이브러리.
- `Mutex (Mutual Exclusion)`: 임계 영역에 오직 하나의 스레드만 접근하도록 통제하는 락 객체.
- `Condition Variable`: 특정 조건이 만족될 때까지 스레드를 대기시키고(Wait), 조건이 만족되면 깨우는(Signal) 동기화 객체.
- `Spurious Wakeup`: 조건 변수 대기 중 명시적인 신호가 없었음에도 스레드가 깨어나는 현상. while 루프로 조건을 재확인해 방어해야 합니다.
- `Thread-safe`: 멀티 스레드 환경에서 동시에 호출되어도 올바르게 동작하는 코드나 라이브러리의 성질.

---

## Reference

- [Operating Systems: Three Easy Pieces - Chapter 27: Thread API](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-api.pdf)
