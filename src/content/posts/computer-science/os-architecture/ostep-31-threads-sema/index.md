---
title: "[OSTEP] 31. Semaphores"
published: 2026-02-05 15:00:00
image: "./images/31_1.png"
description: "락과 조건 변수를 대체할 수 있는 강력한 동기화 도구인 세마포어의 정의와 사용법을 다룹니다. 생산자/소비자, 읽기/쓰기 락, 식사하는 철학자 문제 등 다양한 병행성 문제의 해결책을 제시합니다."
tags: [OS, Linux, OSTEP, Concurrency, Semaphore]
category: "OS & Arch"
draft: false
---

안녕하세요, pingu52입니다.

이전 장들에서 우리는 락(Lock)과 조건 변수(Condition Variable)로 병행성 문제를 해결했습니다. 하지만 Edsger Dijkstra는 이 둘을 아우르는 단일 동기화 원시(primitive)인 **세마포어(Semaphore)** 를 제안했습니다.

이번 글에서는 세마포어의 정의를 정리하고, 이를 이용해 **상호 배제**, **순서 제어**, 그리고 고전적인 동기화 문제들을 어떻게 풀어내는지 살펴봅니다.

---

## 1. 세마포어의 정의

세마포어는 정수 값을 가진 객체이며, 오직 두 연산을 통해서만 조작됩니다.

- `sem_wait()`  (P 연산)
- `sem_post()`  (V 연산)

POSIX 세마포어의 기본 사용 형태는 다음과 같습니다.

```c
#include <semaphore.h>

sem_t s;
sem_init(&s, 0, 1);  // 3번째 인자가 초기 값
```

여기서 두 번째 인자 `pshared`는 `0`이면 같은 프로세스의 스레드 간 공유, `0`이 아니면 프로세스 간 공유를 의미합니다.

세마포어의 초기 값은 동작을 사실상 결정합니다. 앞으로의 예제에서 초기 값이 왜 중요한지 계속 확인하게 됩니다.

### 1.1 두 가지 핵심 연산

1. `sem_wait()`
   - 세마포어 값을 1 감소시킵니다.
   - 감소 결과가 0 미만이면, 호출 스레드는 더 진행할 수 없으므로 대기(sleep)합니다.

2. `sem_post()`
   - 세마포어 값을 1 증가시킵니다.
   - 대기 중인 스레드가 있다면 그중 하나를 깨웁니다(wake).

이 장에서 자주 쓰는 직관적인 모델은 다음과 같습니다.

- 세마포어의 내부 값 `S`가 0 이상이면 자원이 남아 있음
- `S < 0`이면 대기 중인 스레드가 존재하며, 그 수는 대략 `$|S|$`

$$S < 0 \Rightarrow \text{waiting threads} \approx |S|$$

실제 구현은 음수 값을 외부에 드러내지 않을 수 있지만, **의미를 이해하기 위한 모델**로는 유용합니다.

---

## 2. 이진 세마포어

세마포어를 락처럼 쓰려면 초기 값을 1로 두면 됩니다.

```c
sem_t m;
sem_init(&m, 0, 1);  // 초기값 1

sem_wait(&m);        // 락 획득
// 임계 영역 (Critical Section)
sem_post(&m);        // 락 해제
```

이렇게 0과 1 중심으로 동작하는 세마포어를 **이진 세마포어(binary semaphore)** 라고 부릅니다.

동작 흐름은 다음처럼 이해하면 됩니다.

- 스레드 A가 `wait`를 호출하면 `1 -> 0`이 되고 바로 진입합니다.
- 스레드 B가 뒤이어 `wait`를 호출하면 더 줄어들며 대기합니다.
- 스레드 A가 `post`를 호출하면 값이 증가하고, 대기 중인 스레드 하나가 깨어납니다.

---

## 3. 순서 제어용 세마포어

조건 변수에서 했던 join 패턴을 세마포어로 구현할 수 있습니다. 핵심은 초기 값을 0으로 두는 것입니다.

```c
sem_t s;
sem_init(&s, 0, 0);  // 초기값 0

void *child(void *arg) {
    printf("child\n");
    sem_post(&s);    // 완료 신호
    return NULL;
}

int main() {
    pthread_t c;
    Pthread_create(&c, NULL, child, NULL);

    sem_wait(&s);    // 자식이 끝날 때까지 대기
    printf("parent: end\n");
    return 0;
}
```

여기서 보장하고 싶은 것은 이 불변식입니다.

- 부모가 출력하는 parent: end는 항상 child 출력 이후에 발생

즉, 실행 순서를 다음처럼 고정합니다.

$$child \prec parent$$

부모가 먼저 `wait`를 호출해도, 자식이 먼저 `post`를 호출해도 결과는 동일합니다. 초기값을 0으로 두면, 세마포어 값이 **완료 사실을 기록**해주기 때문입니다.

---

## 4. 생산자/소비자 문제

유한 버퍼 문제(Bounded Buffer Problem)를 세마포어로 풀어봅니다. 보통 3개의 세마포어를 둡니다.

- `empty`: 빈 슬롯 수, 초기값 `MAX`
- `full`: 채워진 슬롯 수, 초기값 `0`
- `mutex`: 버퍼 접근 상호 배제, 초기값 `1`

이때 버퍼 상태는 보통 다음 불변식을 만족합니다.

$$0 \le full \le MAX$$
$$0 \le empty \le MAX$$
$$full + empty = MAX$$

### 4.1 구현 예시

```c
void *producer(void *arg) {
    for (int i = 0; i < loops; i++) {
        sem_wait(&empty);   // 빈 공간 확보
        sem_wait(&mutex);   // 버퍼 상호 배제

        put(i);

        sem_post(&mutex);
        sem_post(&full);    // 채워짐 알림
    }
    return NULL;
}

void *consumer(void *arg) {
    for (int i = 0; i < loops; i++) {
        sem_wait(&full);    // 데이터 대기
        sem_wait(&mutex);   // 버퍼 상호 배제

        int tmp = get();

        sem_post(&mutex);
        sem_post(&empty);   // 빈 공간 알림

        printf("%d\n", tmp);
    }
    return NULL;
}
```

### 4.2 주의점: 교착 상태를 피하는 획득 순서

중요한 규칙은 락(`mutex`)을 먼저 잡고 조건(`empty/full`)을 기다리지 않는 것입니다.

- 생산자가 `mutex`를 잡은 채로 `empty`를 기다리면, 소비자는 `mutex`를 얻지 못해 `get()`을 못 합니다.
- 결국 둘 다 진행 불가능해져 **교착 상태(deadlock)** 로 이어집니다.

따라서 위 예제처럼 항상 다음 순서를 유지합니다.

- 생산자: `empty -> mutex`
- 소비자: `full -> mutex`

---

## 5. 읽기/쓰기 락

읽기/쓰기 락은 여러 스레드의 동시 읽기를 허용하지만, 쓰기는 배타적으로 수행하게 합니다.

핵심 아이디어는 다음과 같습니다.

- `readers`라는 공유 카운터로 현재 리더 수를 추적
- 첫 번째 리더가 들어올 때 `writelock`을 잠가 writer 진입을 막고
- 마지막 리더가 나갈 때 `writelock`을 해제

```c
typedef struct _rwlock_t {
    sem_t lock;       // readers 변수 보호
    sem_t writelock;  // writer 제어
    int  readers;     // 현재 리더 수
} rwlock_t;

void rwlock_acquire_readlock(rwlock_t *rw) {
    sem_wait(&rw->lock);
    rw->readers++;
    if (rw->readers == 1)         // 첫 리더가 writer를 막음
        sem_wait(&rw->writelock);
    sem_post(&rw->lock);
}

void rwlock_release_readlock(rwlock_t *rw) {
    sem_wait(&rw->lock);
    rw->readers--;
    if (rw->readers == 0)         // 마지막 리더가 writer를 풀어줌
        sem_post(&rw->writelock);
    sem_post(&rw->lock);
}
```

이 방식은 읽기 비중이 높을 때 성능을 높여주지만, 리더가 계속 유입되면 writer가 영원히 기다릴 수 있는 **기아(starvation)** 문제가 생길 수 있습니다.

---

## 6. 식사하는 철학자 문제

5명의 철학자가 원탁에 앉아 있고, 양옆의 포크 2개를 모두 집어야 식사할 수 있다는 고전 문제입니다.

교착 상태는 다음 상황에서 발생합니다.

- 모든 철학자가 동시에 왼쪽 포크를 집음
- 각자 오른쪽 포크가 풀리길 기다림
- 순환 대기(circular wait)가 성립하여 진행이 멈춤

### 6.1 해결책: 순환 대기 깨기

한 명만 포크를 집는 순서를 바꾸면 순환 대기를 깰 수 있습니다. 예를 들어 마지막 철학자만 오른쪽 포크를 먼저 집게 합니다.

```c
void get_forks(int p) {
    if (p == 4) {
        sem_wait(&forks[right(p)]);
        sem_wait(&forks[left(p)]);
    } else {
        sem_wait(&forks[left(p)]);
        sem_wait(&forks[right(p)]);
    }
}
```

의존성 그래프에서 한 방향만 뒤집어 cycle을 끊는 전형적인 접근입니다.

---

## 7. 스레드 조절

세마포어의 초기 값을 `N`으로 설정하면, 특정 구역에 동시에 들어갈 수 있는 스레드 수를 `N`개로 제한할 수 있습니다. 이를 **throttling**이라고 합니다.

- 메모리 집약적 작업이 동시에 과도하게 실행되는 것을 방지
- 외부 자원(소켓, 디스크 요청 등) 폭주를 제어

```c
sem_t throttle;
sem_init(&throttle, 0, N);

sem_wait(&throttle);
// 제한하고 싶은 구역
sem_post(&throttle);
```

---

## 8. 요약

세마포어는 락과 조건 변수의 기능을 모두 수행할 수 있는 강력하고 유연한 동기화 도구입니다.

- 핵심은 **초기 값 설정**
  - 락: `1`
  - 순서 제어: `0`
  - 스레드 조절: `N`
- 생산자/소비자, 읽기/쓰기 락, 식사하는 철학자 등 고전 문제를 비교적 간결하게 풀어낼 수 있습니다.
- 단, 잘못된 획득 순서나 과도한 깨움은 쉽게 교착 상태나 성능 문제로 이어질 수 있으므로, 항상 **불변식과 획득 순서**를 먼저 세워두는 습관이 중요합니다.

---

## 9. 용어 정리

- `Semaphore`: 정수 값을 가지며 `wait`와 `post` 연산으로 조작되는 동기화 객체.
- `Binary Semaphore`: 값이 0 또는 1 중심으로 동작하며 락과 동일한 역할을 하는 세마포어.
- `Counting Semaphore`: 임의의 정수 값을 가지며 자원의 개수를 세거나 동시 진입 수를 제한할 때 사용됨.
- `Producer/Consumer Problem`: 유한 버퍼를 두고 생산자와 소비자가 데이터를 주고받는 문제.
- `Reader-Writer Lock`: 여러 읽기 작업을 동시에 허용하고 쓰기 작업은 배타적으로 수행하는 락.
- `Dining Philosophers Problem`: 한정된 자원을 두고 경쟁할 때 발생 가능한 교착 상태를 다루는 고전 문제.
- `Throttling`: 동시에 실행되는 스레드의 수를 제한하여 시스템 자원을 보호하는 기법.

---

## Reference

- [Operating Systems: Three Easy Pieces - Chapter 31: Semaphores](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-sema.pdf)
