---
title: "[OSTEP] 29. Lock-based Concurrent Data Structures"
published: 2026-02-04 16:00:00
image: ""
description: "락을 사용하여 스레드 안전(Thread-safe)하면서도 고성능을 내는 자료구조를 만드는 방법을 다룹니다. 근사 카운터, 동시성 큐, 해시 테이블의 구현 전략을 살펴봅니다."
tags: [OS, Linux, OSTEP, Concurrency, DataStructure]
category: "OS & Arch"
draft: false
---

안녕하세요, pingu52입니다.

지난 장에서 락(Lock)의 기본 개념과 구현을 배웠습니다. 이번 장에서는 그 락을 사용해 **스레드 안전(Thread-safe)** 하면서도 **고성능**을 내는 자료구조를 어떻게 설계할지 살펴봅니다.

핵심 질문은 이것입니다.

**락을 추가하면서도 병렬 성능을 어떻게 유지할 수 있을까?**

---

## 1. 병행 카운터 (Concurrent Counters)

가장 단순한 자료구조인 카운터부터 시작합니다.

### 1.1 단순한 방식: 거대한 락 하나

가장 쉬운 방법은 카운터 전체를 하나의 락으로 보호하는 것입니다.

```c
void increment(counter_t *c) {
    Pthread_mutex_lock(&c->lock);
    c->value++;
    Pthread_mutex_unlock(&c->lock);
}
```

정확성은 보장되지만, **확장성(Scalability)** 은 매우 나쁩니다. 코어 수가 늘어도 성능이 좋아지기 어렵고, 오히려 락 경쟁 때문에 급격히 느려질 수 있습니다.

### 1.2 해결책: 근사 카운터 (Approximate Counter, Sloppy Counter)

확장성 문제를 완화하기 위해 **근사 카운터(approximate counter)** 를 소개합니다. 핵심은 하나의 논리적 카운터를 다음처럼 분해하는 것입니다.

- **로컬 카운터(Local Counters)**: CPU별로 따로 두는 카운터
- **글로벌 카운터(Global Counter)**: 전체 합을 대표하는 공유 카운터
- 락도 두 종류가 필요합니다  
  - CPU별 로컬 락  
  - 글로벌 락  

작동 원리는 다음과 같습니다.

1. 스레드는 **현재 실행 중인 CPU**의 로컬 카운터를 증가시킵니다.  
   같은 CPU에서 여러 스레드가 실행될 수 있으므로 로컬 카운터도 락으로 보호합니다.
2. 로컬 값이 임계값 `S`에 도달하면 글로벌 락을 잡고  
   - 글로벌 카운터에 로컬 값을 더한 뒤  
   - 로컬 값을 0으로 되돌립니다.

이때 생기는 트레이드오프가 핵심입니다.

- `S`가 작을수록 글로벌 값이 더 정확하지만, 글로벌 락을 자주 잡아 성능이 떨어집니다.
- `S`가 클수록 로컬 업데이트가 대부분이라 성능은 좋아지지만, 글로벌 값이 실제 값보다 늦게 따라갑니다.

글로벌 카운터의 지연은 최대 대략 **CPU 개수 × S** 정도까지 날 수 있습니다. 또한 모든 로컬 락과 글로벌 락을 특정 순서로 잡으면 정확한 값을 얻을 수는 있지만, 그 방식 자체가 확장성을 해칩니다.

---

## 2. 병행 연결 리스트 (Concurrent Linked Lists)

다음은 연결 리스트입니다. 여기서는 삭제 같은 연산은 생략하고, **삽입(insert)** 과 **조회(lookup)** 를 중심으로 정리합니다.

### 2.1 기본 접근: 단일 락

가장 표준적인 방식은 리스트 전체를 하나의 락으로 감싸는 것입니다.

여기서 중요한 포인트는 제어 흐름입니다. 단순 구현은 `malloc()` 실패 같은 희귀 경로에서 **반드시 unlock을 해줘야** 하며, 이런 예외 경로는 버그가 숨어들기 쉽습니다. 따라서 락 기반 코드에서는 반환 경로를 단순하게 유지하는 습관이 중요합니다.

### 2.2 개선: 락 범위 최소화 + 단일 반환 경로

실전에서 바로 적용하기 좋은 개선은 두 가지입니다.

- insert에서 `malloc()`은 스레드 안전하다고 가정하고 **락 밖에서 수행**해서 임계 영역을 줄입니다.
- lookup은 성공과 실패가 같은 경로로 빠져나가도록 만들어 **락 해제 누락 위험을 줄입니다**.

```c
// Insert: malloc은 락 밖에서, 공유 리스트 갱신만 락으로 보호
int List_Insert(list_t *L, int key) {
    node_t *new = malloc(sizeof(node_t));
    if (new == NULL) return -1;
    new->key = key;

    Pthread_mutex_lock(&L->lock);
    new->next = L->head;
    L->head = new;
    Pthread_mutex_unlock(&L->lock);
    return 0;
}

// Lookup: 단일 반환 경로로 정리
int List_Lookup(list_t *L, int key) {
    int rv = -1;
    Pthread_mutex_lock(&L->lock);
    node_t *curr = L->head;
    while (curr) {
        if (curr->key == key) { rv = 0; break; }
        curr = curr->next;
    }
    Pthread_mutex_unlock(&L->lock);
    return rv;
}
```

### 2.3 확장성 시도: Hand-over-hand locking

리스트의 병렬성을 높이기 위한 대표 기법이 **hand-over-hand locking(lock coupling)** 입니다. 노드마다 락을 두고, 순회할 때 다음 노드 락을 잡은 뒤 현재 노드 락을 푸는 방식입니다.

이론적으로는 동시 순회가 가능해 보이지만, 실제로는 노드마다 락을 잡고 푸는 오버헤드가 커서 단일 락 방식보다 느린 경우가 많습니다. 필요하다면 일정 노드마다 락을 잡는 하이브리드도 아이디어로 생각해볼 수 있습니다.

---

## 3. 병행 큐 (Concurrent Queues)

큐는 큰 락 하나로도 만들 수 있지만, 락 분할로 동시성을 높인 설계가 널리 알려져 있습니다.

### 3.1 마이클-스콧 큐의 핵심 아이디어

Michael and Scott이 제안한 큐는 다음을 사용합니다.

1. **두 개의 락**  
   - `Enqueue`는 `Tail` 락만 잡습니다.  
   - `Dequeue`는 `Head` 락만 잡습니다.  
   - 따라서 삽입과 삭제가 서로 다른 락을 사용해 동시 수행될 수 있습니다.  

2. **더미 노드(Dummy Node)**  
   - 초기화 시 빈 노드를 하나 만들어 `head`와 `tail`이 같은 노드를 가리키게 둡니다.  
   - 이 더미 노드가 경계 조건을 단순화해서 head와 tail 작업을 분리할 수 있게 해줍니다.  

```c
void Queue_Enqueue(queue_t *q, int value) {
    node_t *tmp = malloc(sizeof(node_t));
    tmp->value = value;
    tmp->next = NULL;

    Pthread_mutex_lock(&q->tail_lock);
    q->tail->next = tmp;
    q->tail = tmp;
    Pthread_mutex_unlock(&q->tail_lock);
}

int Queue_Dequeue(queue_t *q, int *value) {
    Pthread_mutex_lock(&q->head_lock);
    node_t *tmp = q->head;
    node_t *new_head = tmp->next;
    if (new_head == NULL) {
        Pthread_mutex_unlock(&q->head_lock);
        return -1; // empty
    }
    *value = new_head->value;
    q->head = new_head;
    Pthread_mutex_unlock(&q->head_lock);
    free(tmp); // 이전 더미 또는 소비된 헤드 정리
    return 0;
}
```

이 큐는 실무에서도 자주 쓰이지만, 큐가 비었을 때 기다리거나 큐가 꽉 찼을 때 막는 동작까지 포함하려면 락만으로는 부족합니다. 그 연결고리가 다음 장의 조건 변수입니다.

---

## 4. 병행 해시 테이블 (Concurrent Hash Table)

해시 테이블은 구조적으로 락 분할이 쉬워 병행성을 끌어올리기 좋은 자료구조입니다.

### 4.1 버킷별 락으로 분할

전체 테이블에 락 하나를 거는 대신, **버킷(각 연결 리스트)마다 락을 둡니다.**

```c
int Hash_Insert(hash_t *H, int key) {
    return List_Insert(&H->lists[key % BUCKETS], key);
}

int Hash_Lookup(hash_t *H, int key) {
    return List_Lookup(&H->lists[key % BUCKETS], key);
}
```

서로 다른 버킷으로 해시되는 작업들은 락을 공유하지 않기 때문에, 동시 업데이트에서도 좋은 확장성을 보입니다.

단, 여기서의 해시 테이블은 **리사이즈를 하지 않는 단순 형태**입니다. 리사이즈까지 지원하려면 재해싱과 버킷 교체, 그리고 그 과정에서의 동기화 설계가 추가로 필요합니다.

---

## 5. 요약 (Summary)

이 장의 메시지는 단순히 락을 더 많이 쪼개자는 이야기가 아닙니다. 특히 다음 교훈이 실전에서 중요합니다.

- **락과 제어 흐름을 조심하라**  
  return, error path, 예외 경로에서 unlock 누락이 매우 흔한 버그가 됩니다.  
  가능한 한 락 획득과 해제 지점을 줄이고, 단일 반환 경로 같은 구조화를 고려합니다.

- **동시성이 많다고 항상 더 빠르지 않다**  
  hand-over-hand locking처럼 동시성은 늘었지만 락 오버헤드가 더 크면 성능이 나빠질 수 있습니다.  
  결국 두 설계를 구현해 측정하는 것이 확실합니다.

- **조기 최적화를 피하라**  
  처음에는 큰 락 하나로 올바르게 만들고, 성능 문제가 실제로 드러났을 때만 세분화합니다.

자료구조별 패턴은 다음처럼 정리할 수 있습니다.

- **카운터**: 로컬 카운터 + 글로벌 카운터, 임계값 S로 정확성과 성능을 조절
- **리스트**: 단일 락이 기본, 임계 영역 최소화와 제어 흐름 단순화가 실전에서 중요
- **큐**: head/tail 락 분리 + 더미 노드로 경계 조건 단순화
- **해시 테이블**: 버킷별 락 분할로 높은 확장성 확보

다음 장에서는 큐나 버퍼가 비었을 때 스레드를 재우고 깨우는 **조건 변수(Condition Variable)** 를 다룹니다.

---

## 6. 용어 정리

- `Thread-safe`: 멀티 스레드 환경에서 안전하게 동작하는 성질.
- `Approximate Counter, Sloppy Counter`: 로컬 카운터를 두어 락 경쟁을 줄이고, 주기적으로 글로벌 카운터에 반영하는 기법.
- `Threshold S`: 로컬에서 글로벌로 옮기는 기준. 정확성과 성능의 트레이드오프를 만든다.
- `Hand-over-hand locking, lock coupling`: 리스트 순회 시 다음 노드 락을 잡고 현재 노드 락을 푸는 방식.
- `Coarse-grained Lock`: 자료구조 전체를 큰 락 하나로 보호하는 방식. 구현이 쉽지만 병렬성이 낮다.
- `Fine-grained Lock`: 자료구조를 잘게 쪼개 여러 락으로 보호하는 방식. 병렬성은 높지만 오버헤드와 복잡성이 증가할 수 있다.
- `Dummy Node`: 큐에서 경계 조건을 단순화하기 위해 사용하는 초기 노드.

---

## Reference

- [Operating Systems: Three Easy Pieces - Chapter 29: Lock-based Concurrent Data Structures](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-locks-usage.pdf)
