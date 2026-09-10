---
title: "[Embedded Linux] 크로스 컴파일러만 설치하면 끝일까? SDK와 sysroot 이해하기"
published: 2026-09-07
description: "Yocto 기반 SDK에서 크로스 컴파일러, sysroot, 환경 설정 스크립트의 역할을 구분하고, 빌드한 ELF가 타깃 환경에 맞는지 확인하는 방법을 정리합니다."
image: ""
tags: [Embedded Linux, Cross Compilation, Yocto, SDK, GCC]
category: "BSP & Build"
draft: true
---

안녕하세요, pingu52입니다.

이전 OpenSTLinux 빌드 글에서는 환경을 초기화하고 이미지를 만드는 순서를 정리했습니다. 이번에는 애플리케이션 개발 쪽으로 범위를 좁혀, **PC에서 보드용 프로그램을 빌드할 때 SDK가 무엇을 맞춰주는지** 살펴보겠습니다.

ARM64 개발환경을 정리하면서 확인할 것이 컴파일러 버전만은 아니라는 점이 눈에 들어왔습니다. 환경 설정 스크립트가 선택한 컴파일러, 그 컴파일러가 참조하는 헤더와 라이브러리, 프로젝트가 실제로 사용하는 빌드 옵션을 함께 봐야 했습니다.

출발점은 간단한 질문입니다.

> ARM용 GCC를 설치했는데, 왜 보드용 SDK를 따로 적용해야 할까요?

:::note
2026년 8월 31일 작업 기록에는 GCC 11.5.0, `aarch64-poky-linux` 타깃 확인과 작은 시험 프로그램의 AArch64 ELF 생성 결과가 남아 있습니다. 실제 보드에서 그 프로그램을 실행한 결과는 없습니다.

아래 `hello.c`와 명령은 개념 설명을 위해 새로 구성한 예제이며, `/opt/example-sdk`는 문서용 경로입니다. x86-64 호스트에서 빌드·실행을 확인했고, 이 글 작성 환경에 해당 SDK가 없어 ARM64 빌드와 보드 실행은 확인하지 않았습니다.
:::

## 1. 컴파일러가 실행되는 곳과 결과물이 실행될 곳

이 글에서는 x86-64 Linux PC에서 빌드하고, AArch64 Linux 보드에서 실행하는 상황을 가정합니다. MCU의 bare-metal 프로그램이나 커널 모듈 빌드는 다루지 않습니다.

- **개발 호스트**: 편집기, `make`, 크로스 컴파일러를 실행하는 PC
- **타깃**: 만들어진 애플리케이션을 실행할 보드

크로스 컴파일러 자체는 PC에서 실행됩니다. 하지만 결과물은 PC가 아니라 타깃의 명령어 집합과 실행 환경을 대상으로 만들어집니다.

여기서 서로 다른 질문을 나눠야 합니다.

1. **어떤 CPU용 코드를 생성하는가?**
2. **어떤 시스템의 헤더와 라이브러리를 사용해 빌드하는가?**

첫 번째만 맞추면 충분할 것 같지만, 같은 AArch64라도 CPU 옵션, ABI, C 라이브러리와 필요한 라이브러리 버전이 다를 수 있습니다. ABI는 함수 호출 규약이나 데이터 배치처럼, 바이너리끼리 맞춰야 하는 약속입니다.

:::tip
이 글의 “개발 호스트”와 Autotools의 `--host`는 문맥이 다릅니다. 일반 애플리케이션을 크로스 빌드할 때 Autotools의 `--build`는 빌드하는 시스템, `--host`는 **그 애플리케이션이 실행될 시스템**을 뜻합니다.
:::

## 2. SDK는 컴파일러 하나가 아니라 함께 쓰는 개발환경

Yocto 기반 SDK는 크게 **툴체인, 개발용 헤더·라이브러리, 환경 설정 스크립트**를 묶어 제공합니다. SDK의 툴체인과 sysroot는 대응하는 이미지의 빌드 설정을 바탕으로 구성됩니다. [Yocto SDK 구성 설명](https://docs.yoctoproject.org/4.0/sdk-manual/intro.html)

구조를 단순화하면 다음과 같습니다. 실제 디렉터리 이름은 SDK마다 다릅니다.

```text
/opt/example-sdk/
├── environment-setup-aarch64-poky-linux
└── sysroots/
    ├── x86_64-pokysdk-linux/        # PC에서 실행할 SDK 도구와 그 실행 환경
    └── aarch64-poky-linux/         # 타깃용 개발 파일
        ├── usr/include/           # 타깃 헤더
        ├── usr/lib/               # 타깃 라이브러리 등
        └── lib/                   # 타깃 런타임 관련 파일 등
```

두 sysroot의 역할을 혼동하지 않는 것이 중요합니다.

- **SDK 호스트용 sysroot**에는 PC에서 실행되는 개발 도구와 그 도구에 필요한 파일이 들어갑니다.
- **타깃용 sysroot**에는 보드용 프로그램을 빌드할 때 참조할 헤더와 라이브러리가 들어갑니다.

따라서 “SDK를 적용한다”는 것은 컴파일러 경로 하나를 추가하는 것보다 넓은 작업입니다. 서로 맞는 도구와 개발 파일을 선택해 빌드 환경을 구성하는 과정에 가깝습니다.

## 3. sysroot는 무엇을 바꾸는가?

GCC의 `--sysroot`는 시스템 헤더와 라이브러리를 찾을 때 사용할 **논리적인 루트 디렉터리**를 지정합니다. 예를 들어 기본 검색 경로가 `/usr/include`, `/usr/lib`인 경우, sysroot가 지정되면 그 아래의 대응 경로를 검색합니다. [GCC 디렉터리 검색 옵션](https://gcc.gnu.org/onlinedocs/gcc/Directory-Options.html)

```text
--sysroot=/opt/example-sdk/sysroots/aarch64-poky-linux

헤더:       /opt/example-sdk/sysroots/aarch64-poky-linux/usr/include
라이브러리: /opt/example-sdk/sysroots/aarch64-poky-linux/usr/lib
```

위 경로는 개념을 보여주기 위한 예시입니다. 실제 검색에는 툴체인 자체의 디렉터리, 아키텍처별 하위 경로와 추가 옵션도 관여합니다.

여기서 두 가지를 구분하면 이해하기 쉽습니다.

### 3.1 sysroot와 보드의 rootfs는 목적이 다릅니다

보드의 rootfs는 **프로그램을 실행하기 위한 파일시스템**입니다. 타깃 sysroot는 **그 환경에 맞는 프로그램을 빌드하기 위한 개발 파일 집합**입니다.

같은 이미지 구성을 기준으로 만들 수 있지만, 파일 목록이 완전히 같다는 뜻은 아닙니다. SDK에는 개발용 헤더와 링크용 파일이 필요하고, 운영용 이미지에는 그런 파일을 포함하지 않을 수 있습니다. Yocto도 SDK의 호스트용·타깃용 패키지 구성을 별도로 조정할 수 있게 합니다. [Standard SDK 구성 변경](https://docs.yoctoproject.org/4.0/sdk-manual/appendix-customizing-standard.html)

그래서 보드의 `/`를 그대로 복사했다고 곧바로 완전한 SDK가 되는 것은 아닙니다.

### 3.2 sysroot는 경로 격리 장치가 아닙니다

`--sysroot`는 `chroot`나 컨테이너처럼 프로세스의 파일 접근 범위를 제한하지 않습니다. 빌드 스크립트에 별도의 절대 경로가 있으면 호스트 파일이 끼어들 여지가 있습니다.

예를 들어 크로스 빌드의 헤더 오류를 해결하려고 `-I/usr/include`를 무작정 추가하면, 타깃 헤더 대신 PC의 헤더를 참조할 수 있습니다. 먼저 **빠진 파일이 타깃 sysroot에 있는지, 검색 경로가 왜 그곳을 보지 않는지** 확인하는 편이 좋습니다.

## 4. environment-setup은 현재 셸에 적용합니다

SDK 설치와 SDK 환경 적용은 별개입니다. Yocto Standard SDK는 설치된 `environment-setup-*` 파일을 읽어 개발환경을 설정하도록 안내합니다. [Standard SDK 사용 흐름](https://docs.yoctoproject.org/4.0/sdk-manual/using.html)

아래 명령은 **다른 SDK가 적용되지 않은 Bash 셸**에서 실행한다고 가정합니다. 파일 경로와 타깃 이름은 설치한 SDK에 맞게 바꿉니다.

```bash
source /opt/example-sdk/environment-setup-aarch64-poky-linux

printf 'CC=%s\n' "$CC"
printf 'SDKTARGETSYSROOT=%s\n' "$SDKTARGETSYSROOT"
```

`bash environment-setup-...`처럼 별도 프로세스로 실행하면, 그 프로세스에서 변경한 환경이 현재 터미널에 남지 않습니다. `source`는 현재 셸에 설정을 적용한다는 차이가 있습니다.

이후 확인할 대표 항목은 다음과 같습니다.

| 항목 | 확인할 내용 |
| --- | --- |
| `CC`, `CXX` | C/C++ 컴파일러와 SDK가 함께 지정한 옵션 |
| `SDKTARGETSYSROOT` | 타깃용 개발 파일이 위치한 경로 |
| `CPPFLAGS`, `CFLAGS`, `CXXFLAGS` | 전처리와 C/C++ 컴파일에 전달할 옵션 |
| `LDFLAGS` | 링크 단계에 전달할 옵션 |
| `PKG_CONFIG_SYSROOT_DIR`, `PKG_CONFIG_LIBDIR` | SDK가 `pkg-config`의 타깃 경로를 어떻게 설정했는지 |

변수 값은 SDK에 따라 다릅니다. 전부 같은 값을 기대하기보다, **다른 SDK나 호스트의 경로가 섞여 있지 않은지** 보는 것이 핵심입니다.

### 4.1 CC에는 실행 파일 이름 외의 옵션도 들어갑니다

Yocto SDK의 `CC`는 다음과 같은 형태일 수 있습니다. 이해를 위해 CPU·보안 관련 옵션은 생략했습니다.

```text
CC=aarch64-poky-linux-gcc --sysroot=/opt/example-sdk/sysroots/aarch64-poky-linux
```

따라서 컴파일러 이름만 꺼내 다시 호출하면 SDK가 붙인 옵션을 빠뜨릴 수 있습니다. 실제로 어떤 타깃과 sysroot를 쓰는지, 환경 설정 후 다음과 같이 확인합니다.

```bash
: "${CC:?SDK environment-setup을 먼저 적용하세요}"

$CC -dumpmachine
$CC -print-sysroot
```

`-dumpmachine`은 컴파일러의 타깃을, `-print-sysroot`는 해당 호출에서 사용하는 타깃 sysroot를 보여줍니다. 후자의 출력이 비어 있다면 sysroot가 지정되지 않은 구성일 수도 있으므로, 빈 출력만으로 모든 GCC 설치를 오류라고 판단하지는 않습니다. [GCC 진단 옵션](https://gcc.gnu.org/onlinedocs/gcc/Developer-Options.html)

:::note
아래 예제들은 Bash에서 신뢰할 수 있는 SDK가 제공한 `CC`와 플래그 문자열을 사용하는 방식입니다. `$CC`를 따옴표 없이 쓰는 것은 컴파일러와 옵션을 여러 인자로 전달하기 위해서입니다. 반대로 `"$CC"`는 전체 문자열을 실행 파일 이름 하나로 취급합니다.

공백이 포함된 설치 경로나 복잡한 따옴표가 필요한 옵션까지 다루는 범용 실행기는 아닙니다. 그런 구성은 SDK의 빌드 시스템 연동 방법을 따르는 편이 좋습니다.
:::

## 5. 작은 C 프로그램으로 빌드 경로 확인하기

전체 펌웨어를 빌드하기 전에, 표준 C 라이브러리를 쓰는 작은 프로그램으로 환경을 확인할 수 있습니다. 이 예제는 SDK로 애플리케이션을 직접 빌드하는 경우이며, BitBake로 전체 이미지를 다시 만드는 절차는 아닙니다.

SDK를 적용한 같은 셸에서 임시 작업 디렉터리를 만듭니다.

```bash
sdk_example_dir=$(mktemp -d)
cd "$sdk_example_dir"
```

편집기로 아래 내용을 `hello.c`에 저장합니다.

```c
#include <stdio.h>

int main(void)
{
    puts("Hello from the target application!");
    return 0;
}
```

그다음 SDK의 컴파일러와 플래그를 사용합니다.

```bash
$CC $CPPFLAGS $CFLAGS -Wall -Wextra hello.c $LDFLAGS -o hello-target
```

이 한 줄은 소스의 컴파일과 최종 링크를 함께 수행합니다. `stdio.h`를 읽는 단계와 `puts`를 제공하는 C 라이브러리를 링크하는 단계가 모두 포함됩니다.

따라서 `gcc --version`이 출력되는지만 보는 것보다, 타깃용 개발 파일을 사용하는 빌드 경로를 한 단계 더 확인할 수 있습니다. 이 작은 예제는 표준 C 라이브러리 경로만 점검하므로, 프로젝트가 쓰는 외부 라이브러리는 각각 확인해야 합니다.

## 6. 만들어진 파일을 실행하기 전에 읽어보기

빌드 명령이 성공했다면 결과물도 확인합니다. 아래 도구는 **호스트에서 ELF 파일의 정보를 읽는 것**이며, 타깃 프로그램을 실행하는 과정이 아닙니다.

```bash
file ./hello-target
readelf -h ./hello-target
readelf -lW ./hello-target
readelf -dW ./hello-target
```

GNU `readelf`의 `-h`는 ELF 헤더, `-l`은 프로그램 헤더, `-d`는 동적 섹션을 보여줍니다. [GNU Binutils readelf 문서](https://sourceware.org/binutils/docs/binutils/readelf.html)

### 6.1 아키텍처: 정말 AArch64 파일인가?

`file`의 아키텍처 설명과 ELF 헤더의 `Class`, `Data`, `Machine`을 확인합니다. AArch64 little-endian 예제에서 확인할 값은 다음과 같습니다. 실제 출력 전체를 옮긴 로그는 아닙니다.

```text
Class:   ELF64
Data:    2's complement, little endian
Machine: AArch64
```

여기서 x86-64가 나온다면 타깃용 결과물이 아닙니다. `CC`가 설정돼 있었는지뿐 아니라 **실제 컴파일 명령이 그 값을 사용했는지**를 확인해야 합니다.

### 6.2 인터프리터: 어느 로더로 시작하는가?

동적 링크된 실행 파일에서는 `readelf -lW`의 `INTERP` 항목도 확인합니다. AArch64 glibc 환경에서는 다음과 같은 경로가 나타날 수 있습니다.

```text
[Requesting program interpreter: /lib/ld-linux-aarch64.so.1]
```

이것은 개발 PC의 `/opt/example-sdk/...`가 아니라 **프로그램을 실행할 시스템에서 찾을 로더 경로**입니다. ELF 실행 시 커널은 `PT_INTERP`에 지정된 인터프리터를 사용하며, 그 파일이 없으면 실행 파일 자체가 존재해도 실행에 실패할 수 있습니다. [Linux execve 설명](https://man7.org/linux/man-pages/man2/execve.2.html)

이 경로는 모든 ARM 보드의 공통값이 아닙니다. 다른 libc를 사용하거나 정적으로 링크한 결과물은 다르게 해석해야 합니다.

### 6.3 라이브러리: 무엇을 요구하는가?

`readelf -dW`에서는 `NEEDED` 항목을 봅니다. glibc를 사용하는 이 예제라면 `libc.so.6` 같은 이름을 확인할 수 있습니다.

이 목록은 해당 ELF에 기록된 **직접 의존성**입니다. 라이브러리의 추가 의존성, 필요한 심볼 버전, 실행 중 동적으로 여는 라이브러리까지 모두 해결됐다는 증거는 아닙니다.

따라서 다음 세 문장은 같은 뜻이 아닙니다.

- ELF가 AArch64 형식이다.
- 대상 rootfs에 필요한 로더와 호환 라이브러리가 있다.
- 실제 보드에서 프로그램이 정상 동작한다.

이 글에서 호스트 측으로 확인하는 것은 첫 번째와, 두 번째를 점검하기 위한 정보까지입니다.

## 7. SDK를 적용했는데 Makefile이 다른 컴파일러를 쓴다면

환경을 적용했어도 Makefile이 다음처럼 컴파일러를 지정하면 문제가 달라집니다.

```makefile
# SDK의 환경 변수보다 이 값이 우선할 수 있습니다.
CC = gcc
```

일반적인 GNU Make 실행에서는 Makefile의 명시적 변수 할당이 환경에서 가져온 같은 이름의 변수보다 우선합니다. 명령행에서 `make CC=...`로 넘기는 경우도 별도로 봐야 합니다. Yocto 문서도 이 차이를 예제로 설명합니다. [SDK 환경 변수와 Makefile의 관계](https://docs.yoctoproject.org/4.0/sdk-manual/working-projects.html#makefile-based-projects)

앞서 만든 `hello.c`에 사용할 최소 Makefile은 다음처럼 구성할 수 있습니다. 명령행 앞의 들여쓰기는 **탭**입니다.

```makefile
.PHONY: all

all: hello-target

hello-target: hello.c
	$(CC) $(CPPFLAGS) $(CFLAGS) $< $(LDFLAGS) $(LDLIBS) -o $@
```

SDK가 제공한 `CC`를 파일 안에서 다시 덮어쓰지 않고 사용합니다. 앞 절에서 이미 `hello-target`을 만들었으므로, 이 작은 예제에서는 `-B`로 재빌드를 요청합니다.

```bash
: "${CC:?SDK environment-setup을 먼저 적용하세요}"
make -B
file ./hello-target
```

실제 프로젝트에서는 빌드 로그의 컴파일러·옵션을 보고, 이전 SDK로 만든 오브젝트나 설정 캐시가 남아 있는지도 확인해야 합니다. SDK만 바꾼다고 모든 빌드 시스템이 기존 산출물을 자동으로 다시 만드는 것은 아닙니다.

서로 다른 SDK를 한 셸에 계속 적용하는 것도 피하는 편이 좋습니다. SDK별로 작업 셸과 빌드 디렉터리를 구분하면 어떤 환경에서 만든 결과물인지 추적하기 쉬워집니다. 새 셸도 부모의 환경 변수를 상속하므로, 이미 적용된 SDK가 없는 환경에서 시작했는지 함께 확인합니다.

## 8. 작업 기록에서 확인한 범위

실제 개발환경 설정 기록과 위 설명용 예제를 섞지 않도록, 당시 확인한 내용을 정리하면 다음과 같습니다.

| 확인 항목 | 2026년 8월 31일 기록 |
| --- | --- |
| 컴파일러와 타깃 | GCC 11.5.0, `aarch64-poky-linux` 확인 |
| SDK 옵션 | `CC`에 타깃 sysroot와 추가 컴파일 옵션이 포함된 것 확인 |
| 작은 시험 프로그램 | `file` 출력에서 AArch64 little-endian 동적 링크 ELF 확인 |
| 실제 보드 실행 | 확인하지 않음 |

즉, **SDK를 적용해 타깃 형식의 실행 파일을 만드는 단계**는 기록으로 확인할 수 있습니다. 하지만 그 결과를 보드의 런타임 호환성 검증이나 전체 제품의 동작 검증으로 확대할 수는 없습니다.

특히 타깃용 파일을 x86-64 PC에서 바로 실행하는 것은 일반적인 네이티브 실행 경로가 아니라, 에뮬레이터에서 돌린 결과와도 구분해야 합니다.

## 9. 정리

크로스 컴파일 환경을 확인할 때는 다음 순서로 질문하면 정리가 됩니다.

1. **컴파일러**: 어떤 타깃을 대상으로 코드를 생성하는가?
2. **sysroot**: 어느 환경의 헤더와 라이브러리를 사용하는가?
3. **빌드 시스템**: SDK의 컴파일러와 옵션을 실제로 사용했는가?
4. **결과물**: ELF의 아키텍처와 런타임 요구사항은 무엇인가?
5. **실행 환경**: 그 요구사항을 만족하는 보드에서 동작하는가?

SDK는 앞의 조건들을 맞추기 위한 출발점입니다. 컴파일러가 실행된다는 것, 타깃용 파일이 만들어졌다는 것, 보드에서 동작한다는 것을 따로 확인하면 빌드 오류와 실행 오류를 구분하기도 쉬워집니다.

## 참고 자료

- [Yocto 4.0 — SDK 구성과 sysroot](https://docs.yoctoproject.org/4.0/sdk-manual/intro.html)
- [Yocto 4.0 — Standard SDK 사용](https://docs.yoctoproject.org/4.0/sdk-manual/using.html)
- [Yocto 4.0 — SDK Toolchain 직접 사용과 Makefile](https://docs.yoctoproject.org/4.0/sdk-manual/working-projects.html)
- [Yocto 4.0 — Standard SDK 패키지 구성](https://docs.yoctoproject.org/4.0/sdk-manual/appendix-customizing-standard.html)
- [GCC — Directory Options](https://gcc.gnu.org/onlinedocs/gcc/Directory-Options.html)
- [GCC — Developer Options](https://gcc.gnu.org/onlinedocs/gcc/Developer-Options.html)
- [GNU Binutils — readelf](https://sourceware.org/binutils/docs/binutils/readelf.html)
- [Linux man-pages — execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html)
