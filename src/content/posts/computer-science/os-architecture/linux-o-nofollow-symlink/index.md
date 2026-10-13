---
title: "[Linux] O_NOFOLLOW는 어디까지 심볼릭 링크를 막을까?"
published: 2026-10-13
description: "작은 C 예제로 O_NOFOLLOW가 마지막 경로 요소만 검사하는 동작을 확인하고 openat2의 RESOLVE_NO_SYMLINKS와 O_PATH 조합의 차이를 살펴봅니다."
image: "./nofollow-cover.png"
tags: [Linux, C, FileSystem, System Call, Security]
category: "OS & Arch"
draft: false
---

Linux에서 `open()`에 `O_NOFOLLOW`를 붙이면 **경로의 마지막 요소가 심볼릭 링크일 때** 파일 열기를 거부한다. 중간 디렉터리가 링크라면 그대로 따라간다.

예를 들어 `shortcut/file.txt`에서 `shortcut`이 링크여도 마지막 요소인 `file.txt`가 일반 파일이면 열릴 수 있다. 옵션 이름만 보고 경로 전체의 링크를 막는다고 생각하기 쉬운 부분이다. [Linux open(2), O_NOFOLLOW](https://man7.org/linux/man-pages/man2/open.2.html)

이 차이를 임시 디렉터리와 작은 C 프로그램으로 확인해 보자.

## 마지막 경로 요소는 어디인가

아래처럼 파일 하나와 링크 두 개를 만든다고 가정한다.

```text
작업 디렉터리/
├── data/
│   └── plain.txt
├── file-link -> data/plain.txt
└── dir-link  -> data
```

`O_RDONLY | O_NOFOLLOW`로 열면 결과는 다음과 같다. 표의 경로에는 끝에 `/`를 붙이지 않았다.

| 여는 경로 | 마지막 요소 | 결과 |
| --- | --- | --- |
| `data/plain.txt` | 일반 파일 `plain.txt` | 성공 |
| `file-link` | 파일을 가리키는 링크 | 실패, `ELOOP` |
| `dir-link/plain.txt` | 일반 파일 `plain.txt` | 성공, 중간의 `dir-link`를 따라감 |
| `dir-link` | 디렉터리를 가리키는 링크 | 실패, `ELOOP` |

파일 링크인지 디렉터리 링크인지보다 **그 링크가 열려는 경로의 어느 위치에 있는지**가 중요하다. `dir-link` 자체를 열 때는 마지막 요소지만 `dir-link/plain.txt`에서는 중간 요소다.

끝에 `/`가 붙은 경로는 디렉터리로 해석해야 한다는 추가 규칙이 적용된다. 위 표를 `dir-link/`에 그대로 대입해서는 안 된다. [Linux path_resolution(7), Trailing slashes](https://man7.org/linux/man-pages/man7/path_resolution.7.html)

## C 프로그램으로 직접 열어보기

새 임시 디렉터리에서 예제를 준비한다.

```bash
nofollow_demo_dir=$(mktemp -d)
cd "$nofollow_demo_dir"

mkdir data
printf 'example\n' > data/plain.txt
ln -s data/plain.txt file-link
ln -s data dir-link
```

아래 코드를 같은 디렉터리의 `nofollow-demo.c`로 저장한다. 프로그램은 파일을 읽거나 수정하지 않고 지정한 옵션으로 열리는지만 확인한다.

```c
#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

int main(int argc, char **argv)
{
    if (argc != 2) {
        fprintf(stderr, "usage: %s PATH\n", argv[0]);
        return 2;
    }

    int fd = open(argv[1], O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (fd == -1) {
        perror("open");
        return 1;
    }

    if (close(fd) == -1) {
        perror("close");
        return 1;
    }

    puts("open succeeded");
    return 0;
}
```

컴파일한 뒤 세 경로를 차례로 열어본다.

```bash
cc -std=c11 -Wall -Wextra -Werror nofollow-demo.c -o nofollow-demo

./nofollow-demo data/plain.txt
./nofollow-demo file-link
./nofollow-demo dir-link/plain.txt
```

확인한 출력은 다음과 같다. 가운데 명령은 종료 코드 `1`로 실패한다.

```text
open succeeded
open: Too many levels of symbolic links
open succeeded
```

두 번째 메시지는 `ELOOP`의 문자열 표현이다. 링크를 반복해서 따라가 한도에 도달한 경우에도 같은 오류가 발생하므로 메시지만 보고 실제 링크 순환이 있다고 단정할 수는 없다. 여기서는 `file-link` 하나를 마지막 요소에서 거부한 결과다.

세 번째 호출은 성공했다. `O_NOFOLLOW`가 있어도 `dir-link`를 따라가 `data/plain.txt`를 연다. 경로 중간에 링크가 없다는 보장은 얻지 못했다.

## 링크를 미리 검사하면 충분할까

`lstat()`으로 링크인지 확인한 뒤 `open()`을 호출하는 방법도 떠올릴 수 있다. 하지만 다른 프로세스가 경로를 바꿀 수 있는 환경에서는 검사와 열기 사이에 대상이 교체될 수 있다. 검사 시점과 사용 시점이 다른 **TOCTOU(Time of Check to Time of Use)** 문제다.

`realpath()`로 링크를 먼저 해석해도 반환된 문자열을 나중에 열 때까지 디렉터리 구성이 유지된다는 보장은 없다. 파일을 여는 순간 적용할 제약은 해당 열기 연산에 전달하는 편이 낫다.

`openat()`은 디렉터리 파일 디스크립터를 기준으로 상대 경로를 연다. 이미 열어 둔 디렉터리를 기준점으로 삼는 데 유용하지만 `openat()`에 `O_NOFOLLOW`를 붙여도 마지막 요소만 검사한다. [Linux open(2), Rationale for openat()](https://man7.org/linux/man-pages/man2/open.2.html)

## 경로 전체의 링크를 거부하려면

Linux 5.6부터 제공하는 `openat2()`에는 경로를 해석하는 방법을 지정하는 `resolve` 필드가 있다. `RESOLVE_NO_SYMLINKS`는 중간 디렉터리를 포함해 경로 해석 중 심볼릭 링크를 따라가는 일을 막는다. [Linux openat2(2)](https://man7.org/linux/man-pages/man2/openat2.2.html)

같은 작업 디렉터리에 아래 코드를 `openat2-demo.c`로 저장한다. Linux 시스템 콜을 직접 호출하므로 Linux 헤더와 `SYS_openat2` 정의가 있는 개발환경이 필요하다.

```c
#define _GNU_SOURCE
#include <fcntl.h>
#include <linux/openat2.h>
#include <stdio.h>
#include <sys/syscall.h>
#include <unistd.h>

int main(int argc, char **argv)
{
    if (argc != 2) {
        fprintf(stderr, "usage: %s PATH\n", argv[0]);
        return 2;
    }

    struct open_how how = {
        .flags = O_RDONLY | O_CLOEXEC,
        .resolve = RESOLVE_NO_SYMLINKS,
    };

    int fd = (int)syscall(SYS_openat2, AT_FDCWD,
                         argv[1], &how, sizeof(how));
    if (fd == -1) {
        perror("openat2");
        return 1;
    }

    if (close(fd) == -1) {
        perror("close");
        return 1;
    }

    puts("openat2 succeeded");
    return 0;
}
```

```bash
cc -std=c11 -Wall -Wextra -Werror openat2-demo.c -o openat2-demo

./openat2-demo data/plain.txt
./openat2-demo file-link
./openat2-demo dir-link/plain.txt
```

이번에는 중간 디렉터리가 링크인 세 번째 경로도 실패한다.

```text
openat2 succeeded
openat2: Too many levels of symbolic links
openat2: Too many levels of symbolic links
```

`RESOLVE_NO_SYMLINKS`는 링크 해석을 제한하는 옵션이다. 이것만으로 특정 디렉터리 안에서만 접근하도록 가두지는 않는다. 디렉터리 범위까지 제한해야 한다면 신뢰할 수 있는 디렉터리 fd를 기준으로 `RESOLVE_BENEATH` 같은 별도 제약을 검토해야 한다. 여기서는 링크 처리의 차이만 확인했다.

지원하지 않는 커널이나 시스템 콜을 제한한 실행 환경에서는 `openat2()`가 실패할 수 있다. 이때 단순히 `open()`으로 재시도하면 경로 전체의 링크를 거부한다는 조건을 잃는다.

## O_PATH를 함께 쓰는 경우는 다르다

지금까지는 내용을 읽을 수 있는 fd를 얻는 `O_RDONLY` 기준이었다. `O_PATH | O_NOFOLLOW` 조합에서는 마지막 요소가 심볼릭 링크여도 링크 자체를 가리키는 fd를 얻을 수 있다.

이 fd로 `fstat()`을 호출하면 링크 자체의 정보를 확인할 수 있다. 대신 `read()`처럼 파일 내용을 읽는 연산은 `EBADF`로 실패한다. 앞의 두 C 예제에는 `O_PATH`를 사용하지 않았다. [Linux open(2), O_PATH](https://man7.org/linux/man-pages/man2/open.2.html)

옵션을 고를 때는 어느 동작이 필요한지부터 구분하면 된다.

| 필요한 동작 | 확인할 API·옵션 |
| --- | --- |
| 마지막 요소가 링크이면 읽기용 열기 거부 | `open()` + `O_RDONLY \| O_NOFOLLOW` |
| 중간 요소까지 링크 해석 거부 | `openat2()` + `RESOLVE_NO_SYMLINKS` |
| 마지막 요소인 링크 자체의 정보 확인 | `O_PATH \| O_NOFOLLOW` + `fstat()` |
| 특정 디렉터리 범위를 벗어나는 경로 거부 | 기준 디렉터리 fd + `RESOLVE_BENEATH` 등 |

링크를 거부하는 것과 일반 파일만 허용하는 것도 별개다. 파일 형식 제한이 필요하면 열린 fd에 `fstat()`을 적용하는 등 그 조건을 따로 확인해야 한다.

:::note
두 C 예제는 x86-64 Linux(WSL2), GCC 13.3.0에서 컴파일하고 실행했다. 일반 파일, 마지막 요소의 링크, 중간 디렉터리의 링크에 대한 결과를 확인했으며 `O_PATH` fd의 링크 정보 조회와 읽기 거부도 별도로 확인했다.

예제 파일은 직접 만든 임시 디렉터리에만 두었다. 커널의 파일 접근 격리 전체를 검증하는 프로그램은 아니다.
:::

파일·디렉터리와 fd의 기본 개념은 [Files and Directories 글](/posts/computer-science/os-architecture/ostep-39-file-intro/)에서 이어서 볼 수 있다.
