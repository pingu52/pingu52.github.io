---
title: "[OSTEP] 30. Condition Variables"
published: 2026-02-04 22:00:00
image: ""
description: "락만으로는 해결하기 어려운 대기 문제를 풀기 위한 조건 변수의 개념과 올바른 사용법(wait, signal, broadcast)을 정리합니다"
tags: [OS, Linux, OSTEP, Concurrency, Synchronization]
category: "OS & Arch"
draft: false
---

안녕하세요, pingu52입니다.

지금까지는 병행 프로그래밍의 핵심 도구인 락(Lock)을 중심으로 봤습니다. 락은 **상호 배제(Mutual Exclusion)** 를 제공하지만, 스레드가 특정 **조건(predicate)** 이 만족될 때까지 기다려야 하는 상황에서는 락만으로는 충분하지 않습니다. 이때 필요한 것이 스레드를 **재우고(sleep)**, 조건이 만족되면 **깨우는(wake)** 메커니즘입니다.

이번 글에서는 스레드 간 대기(wait)와 신호(signal)를 위한 **조건 변수(Condition Variable)** 를 정리합니다.

---

## 1. 조건 변수의 개념

스레드는 실행을 계속하기 전에 어떤 조건이 참인지 확인해야 할 때가 많습니다. 예를 들어 부모 스레드가 자식 스레드의 작업 완료를 기다리는 join 같은 경우입니다. 단순히 공유 변수를 계속 확인하며 도는 스핀(spin)은 CPU 시간을 낭비하고, 설계가 잘못되면 영원히 기다리는 버그로 이어질 수 있습니다.

조건 변수는 이런 상황에서 다음을 가능하게 합니다.

- **wait()**: 조건이 만족되지 않으면 스레드가 스스로 잠들어(condition wait queue로) 대기합니다.
- **signal() / broadcast()**: 다른 스레드가 상태를 바꾼 뒤, 대기 중인 스레드 하나(signal) 또는 모두(broadcast)를 깨웁니다.

중요한 관점은 이것입니다.

- 조건 변수는 조건 그 자체가 아니라, **조건을 기다리는 스레드들이 모이는 큐** 입니다.
- 진짜 조건은 `done == 1`, `count > 0`, `bytesLeft >= size` 같은 **공유 상태 변수 + 불리언 표현식** 입니다.

### 1.1 주요 인터페이스

POSIX 스레드(Pthreads)에서 자주 쓰는 인터페이스는 다음과 같습니다.

```c
int pthread_cond_wait(pthread_cond_t *c, pthread_mutex_t *m);
int pthread_cond_signal(pthread_cond_t *c);
int pthread_cond_broadcast(pthread_cond_t *c);
```

여기서 핵심은 `pthread_cond_wait()`가 **mutex를 함께 받는다는 점**입니다.

- `wait()`는 mutex가 **잠긴 상태**에서 호출되어야 합니다.
- `wait()`는 내부에서 **mutex 해제 + 대기열 진입 + 잠들기**를 한 덩어리로 처리합니다.
- 깨어난 뒤에는 **mutex를 다시 획득한 상태**로 리턴합니다.

이 동작 덕분에, 잠들기 직전에 신호를 놓치는 종류의 경쟁 조건을 피할 수 있습니다.

---

## 2. 부모-자식 스레드 대기 (Join 문제)

`pthread_join()`은 이미 존재하지만, 이 절은 join을 조건 변수로 직접 구현하며 올바른 사용 패턴을 익히는 데 목적이 있습니다.

### 2.1 올바른 구현 패턴

조건 변수를 사용할 때는 항상 다음 3개를 함께 둡니다.

- **상태 변수(state variable)**: 예: `done`
- **mutex**: 상태 변수 접근을 보호
- **condition variable**: 조건이 만족될 때까지 잠들기/깨우기

부모 스레드(대기):

```c
Pthread_mutex_lock(&m);
while (done == 0)
    Pthread_cond_wait(&c, &m);
Pthread_mutex_unlock(&m);
```

자식 스레드(상태 변경 + 신호):

```c
Pthread_mutex_lock(&m);
done = 1;
Pthread_cond_signal(&c);
Pthread_mutex_unlock(&m);
```

### 2.2 핵심 규칙

1. **상태 변수는 필수**
   - `signal()`만으로는 충분하지 않습니다.
   - 자식이 먼저 실행되어 `signal()`을 했는데 그때 아무도 wait 중이 아니라면, 이후 부모는 `wait()`에서 영원히 잠들 수 있습니다. 상태 변수는 그 사실(done)을 기록합니다.

2. **락은 필수**
   - 부모가 `done == 0`을 확인한 직후 `wait()`로 들어가기 전에 자식이 끼어들어 `done = 1; signal()`을 수행하면, 부모는 신호를 놓치고 영원히 잠드는 레이스가 발생할 수 있습니다.
   - `wait()`의 동작(락 해제와 잠들기의 결합)과 락으로 보호된 상태 변수 접근이 이 문제를 막습니다.

3. **조건 확인은 while**
   - 깨어났다고 해서 조건이 참이라는 보장은 없습니다.
   - 따라서 `if`가 아니라 **while로 조건을 재확인**합니다.

추가로 실전 팁을 하나만 덧붙이면, `signal()`도 가능하면 락을 잡은 상태에서 호출하는 습관이 안전합니다. 상태 변수를 바꾼 뒤 같은 락을 잡은 채로 `signal()` 하면, 신호와 상태 변화의 관계를 읽기 쉬워지고 실수를 줄일 수 있습니다.

---

## 3. 생산자/소비자 문제 (Producer/Consumer, Bounded Buffer)

여러 생산자가 버퍼에 넣고, 여러 소비자가 버퍼에서 꺼내는 대표 문제입니다. 버퍼가 비어 있거나 가득 찼을 때는 적절히 잠들어야 하므로 락만으로는 해결할 수 없습니다.

### 3.1 Mesa semantics와 while 루프

대부분의 시스템에서 `signal()`은 단지 **상태가 바뀌었을 수 있다는 힌트**입니다. 깨어난 스레드가 곧바로 실행된다는 보장도 없고, 실행될 때 조건이 여전히 참이라는 보장도 없습니다(Mesa semantics).

따라서 다음이 항상 안전한 규칙입니다.

```c
while (count == 0)                 // if가 아니라 while
    Pthread_cond_wait(&fill, &mutex);
```

또한 구현과 스케줄링 세부에 따라 신호 없이도 깨어나는 **spurious wakeup**이 있을 수 있으므로, while 재확인은 방어적으로도 필요합니다.

### 3.2 단일 조건 변수로는 부족한 이유

버퍼가 비었음과 가득 참은 서로 다른 조건입니다. 그런데 단일 조건 변수 하나로 관리하면, 소비자가 `signal()` 했을 때 **다른 소비자**를 깨우는 식의 잘못된 깨움이 가능해집니다. 깨어난 스레드는 조건을 만족하지 못해 다시 잠들고, 운이 나쁘면 모두가 잠드는 상태로 빠질 수 있습니다.

### 3.3 해결책: 두 개의 조건 변수

따라서 보통 다음처럼 조건 변수를 2개 둡니다.

- `empty`: 생산자가 기다리는 조건(버퍼에 빈 칸이 생김)
- `fill`: 소비자가 기다리는 조건(버퍼에 데이터가 생김)

단일 슬롯(1-entry) 버퍼의 올바른 구조는 다음과 같습니다.

```c
// Producer
Pthread_mutex_lock(&mutex);
while (count == 1)                 // 가득 찼으면 대기
    Pthread_cond_wait(&empty, &mutex);

put(i);                            // count, buffer 상태 변경
Pthread_cond_signal(&fill);        // 소비자 깨우기
Pthread_mutex_unlock(&mutex);
```

```c
// Consumer
Pthread_mutex_lock(&mutex);
while (count == 0)                 // 비었으면 대기
    Pthread_cond_wait(&fill, &mutex);

tmp = get();                       // count, buffer 상태 변경
Pthread_cond_signal(&empty);       // 생산자 깨우기
Pthread_mutex_unlock(&mutex);
```

여러 슬롯(MAX) 버퍼로 일반화하면 조건만 `count == MAX` / `count == 0`으로 바뀝니다.

---

## 4. 포함 조건 (Covering Conditions)

누구를 깨워야 할지 정확히 결정하기 어려운 상황이 있습니다. 예를 들어 메모리 할당기에서:

- A: `allocate(100)` 대기
- B: `allocate(10)` 대기
- C: `free(50)` 호출 후 `signal()` 한 번

이때 `signal()`이 A를 깨우면 A는 다시 잠들고, 실제로 진행 가능한 B는 계속 잠들 수 있습니다.

### 4.1 해결책: broadcast

이 경우는 `signal()` 대신 `pthread_cond_broadcast()`를 사용합니다.

- `broadcast`는 대기 중인 모든 스레드를 깨웁니다.
- 각 스레드는 깨어난 뒤 락을 획득하고 조건을 재확인합니다.
- 실행 가능한 스레드만 진행하고, 나머지는 다시 잠듭니다.

이런 패턴을 포함 조건(covering condition)이라고 부릅니다. 불필요한 깨움이 생길 수 있지만, 어떤 스레드를 깨워야 하는지 정보가 부족한 상황에서는 가장 보수적이면서 올바른 해결책이 됩니다.

---

## 5. 요약

조건 변수는 락과 함께 병행 프로그래밍의 필수 도구입니다.

1. 조건 변수는 조건을 기다리는 스레드를 재우고 깨우기 위한 큐입니다. 조건은 상태 변수와 그에 대한 불리언 표현식입니다.
2. `wait()`와 `signal()`은 상태 변수를 보호하는 동일한 mutex로 묶어 다루는 것이 안전합니다.
3. `wait()`는 반드시 **while**로 감싸 조건을 재확인해야 합니다(Mesa semantics + spurious wakeup).
4. 생산자/소비자 문제에서는 보통 `empty`/`fill`처럼 **서로 다른 조건을 서로 다른 CV로 분리**해야 안전합니다.
5. 누구를 깨워야 할지 모호한 포함 조건 상황에서는 **broadcast**가 가장 단순하고 안전한 선택입니다.

---

## 6. 용어 정리

- `Condition Variable (조건 변수)`: 스레드가 특정 조건이 참이 될 때까지 대기(sleep)할 수 있게 해주는 동기화 객체.
- `Wait`: 락을 해제하고 스레드를 잠재우는 연산. 깨어날 때 다시 락을 획득함.
- `Signal`: 대기 중인 스레드 중 하나를 깨우는 연산.
- `Broadcast`: 대기 중인 모든 스레드를 깨우는 연산.
- `Mesa Semantics`: Signal은 힌트에 가깝고, 깨어난 스레드가 실행될 때 조건이 여전히 참이라는 보장은 없다는 의미.
- `Spurious Wakeup (허위 기상)`: 신호가 없는데도 스레드가 깨어나는 현상. `while` 루프로 방어해야 함.
- `Covering Condition (포함 조건)`: 어떤 스레드를 깨워야 할지 모를 때, 모든 스레드를 깨워 스스로 조건을 확인하게 하는 기법.

---

## Reference

- [Operating Systems: Three Easy Pieces - Chapter 30: Condition Variables](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-cv.pdf)
