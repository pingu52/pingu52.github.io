---
title: "[Hailo15] 01. Linux 6.18 커널 포팅: 링크 성공 뒤에 남은 작업"
published: 2026-10-11
description: "Hailo15의 Linux 6.18 커널 포팅에서 vmlinux 링크 성공 뒤 발견한 드라이버 누락을 정리했다. Kconfig와 SCMI·PWM 수정, Yocto의 Image·DTB·rootfs 빌드, 부팅 전 검증까지 구현 순서대로 살펴본다."
image: ""
tags: [Hailo15, Linux, Kernel, Driver, Yocto, Kconfig]
category: "BSP & Build"
draft: false
---

Hailo15의 기존 SDK 드라이버를 Linux 6.18 커널로 옮겼다. 처음에는 컴파일 오류를 하나씩 없애는 작업이었다. 디바이스 트리부터 PWM, DMA, I2C, DRM, SCMI 순서로 새 커널의 API에 맞추고 나니 `vmlinux` 링크가 성공했다.

그런데 빌드에 사용된 설정과 바이너리를 다시 확인하자 빠진 드라이버가 있었다. Hailo15 플랫폼 설정과 SCMI가 꺼져 있었고 준비해 둔 설정 fragment와 최종 `.config`도 일치하지 않았다. 링크 오류가 사라진 상태에서 어떤 코드가 실제로 빌드됐는지 확인하는 작업이 이어졌다.

이 글은 2026년 9월 21일부터 23일까지 진행한 커널 포팅과 부팅 준비를 다룬다. 대상 커널은 Linux 6.18.52다. 장치별 패치와 레지스터 설정은 생략하고 공개 커널 API, 설정, 빌드 산출물을 확인했던 순서를 정리했다.

## 1. 드라이버 API를 고쳐 vmlinux 링크까지 갔다

기존 드라이버를 새 커널 트리에 옮기면 헤더가 존재해도 이전과 같은 방법으로 사용할 수 없는 경우가 있다. 함수 인자가 달라지거나 구조체의 멤버가 없어지고 자원을 할당하는 방법도 바뀐다.

실제 수정은 아래 순서로 진행했다.

| 순서 | 수정한 부분 |
| --- | --- |
| 디바이스 트리 | dt-bindings 심볼을 맞추고 overlay 소스의 `.dtso` 확장자를 정리했다. |
| PWM·pinctrl | PWM 칩 할당을 `devm_pwmchip_alloc()` 방식으로 옮기고 pinctrl에 필요한 헤더를 추가했다. |
| DMA·SoC | DMA 드라이버와 SoC 코드에서 달라진 API를 맞췄다. |
| I2C·overlay | I2C 콜백과 `of_overlay_fdt_apply()` 호출을 새 시그니처에 맞췄다. |
| DRM | GEM CMA helper를 DMA helper로 옮기고 fbdev 연결과 드라이버 해제 콜백을 수정했다. |
| EDAC·GPIO·SCMI | 콜백과 선언을 정리한 뒤 SCMI의 Makefile 연결과 DRM Kconfig를 수정했다. |

하나의 함수 이름만 바꿔서 끝나는 수정도 있었지만 PWM처럼 할당 방식까지 바뀌는 부분도 있었다. 기존 코드는 드라이버의 구조체 안에 `pwm_chip`을 두고 있었다. 이 코드를 새 할당 API와 private data 접근 방식에 맞게 정리했다. [Linux 6.18 PWM API 선언](https://github.com/torvalds/linux/blob/v6.18/include/linux/pwm.h)

콜백 변경도 구분해서 봤다. Linux 6.18의 `platform_driver`에서 `probe`는 여전히 `int`를 반환하고 `remove`는 `void`다. 콜백이 바뀌었다는 설명만 보고 둘을 같은 방식으로 고치면 초기화 실패를 반환하던 경로까지 잘못 바꾸게 된다. 대상 커널의 헤더에서 각 콜백의 타입을 확인했다. [Linux 6.18 platform_driver 정의](https://github.com/torvalds/linux/blob/v6.18/include/linux/platform_device.h)

SCMI 쪽은 선언을 추가한 뒤에도 링크 단계의 연결을 손봐야 했다. 구현 파일이 트리에 있어도 Makefile에서 필요한 오브젝트를 묶지 않으면 참조한 함수의 정의를 찾지 못한다. DRM도 새 helper에 맞춰 Kconfig를 수정했다.

이 수정들을 거쳐 `vmlinux`가 만들어졌다. 다음에는 설정해 둔 드라이버가 모두 들어갔는지 확인했다.

## 2. 빌드가 성공했는데 필요한 드라이버가 빠져 있었다

처음 링크 성공을 확인한 빌드에서는 DRM과 DMA 관련 심볼을 찾을 수 있었다. 하지만 SCMI, PWM, pinctrl 등은 포함됐다고 확인할 수 없었다.

최종 `.config`를 보니 다음 두 항목이 꺼져 있었다. 아래는 당시 설정에서 해당 항목만 추린 것이다.

```text
# CONFIG_ARCH_HAILO15 is not set
# CONFIG_ARM_SCMI_PROTOCOL is not set
```

`CONFIG_ARCH_HAILO15`는 Hailo15 플랫폼 코드가 빌드되는 조건에 연결된다. 공개 SDK에도 같은 플랫폼 설정이 있다. `CONFIG_ARM_SCMI_PROTOCOL`은 SCMI 코어를 선택하는 설정이다. 이 조건들이 꺼진 상태에서는 해당 경로의 코드가 빌드 대상에서 빠질 수 있다. [Hailo SDK의 플랫폼 Kconfig](https://github.com/hailo-ai/linux-yocto-hailo/blob/1.12.1/arch/arm64/Kconfig.platforms)

빌드 성공 여부는 현재 선택된 설정을 기준으로 판단한다. **필요한 드라이버가 설정에서 빠져 있으면 그 코드의 컴파일 오류도 드러나지 않는다.**

준비해 둔 fragment와 실제 `.config`를 대조하니 16개 항목이 달랐다. fragment에 `=y`를 적어 둔 것으로 확인을 끝낼 수 없었다. 설정 생성 단계에서 어떤 값으로 정리됐는지 확인해야 했다.

Kconfig 옵션에는 `depends on` 같은 의존 조건이 있다. 상위 메뉴의 조건도 하위 옵션에 적용된다. 요청한 옵션이 최종 설정에 남지 않았다면 옵션 이름과 의존 조건을 함께 살펴야 한다. `select`를 추가해 강제로 켜는 방식도 주의가 필요하다. `select`는 대상 옵션의 의존 조건을 검사하지 않고 값을 올릴 수 있다. [Linux Kconfig 의존 관계 설명](https://docs.kernel.org/6.18/kbuild/kconfig-language.html)

여기서부터 설정 확인을 빌드 순서에 넣었다. 기준 설정을 적용하고 `.config`를 생성한 뒤 차이를 확인했다. 그 결과를 확인한 다음 커널과 모듈을 빌드했다.

다음은 두 개의 전체 설정 파일을 비교하는 설명용 명령이다. 커널 소스 루트에서 실행하며 `config.expected`는 기준 설정, `build/.config`는 출력 디렉터리의 최종 설정을 뜻한다.

```bash
scripts/diffconfig config.expected build/.config
```

`scripts/diffconfig`는 변경 항목을 살펴보는 데 쓸 수 있다. fragment에 지정한 항목만 대조할 때는 별도 비교가 필요하다. 이번 작업에서는 `y`와 `m`, 비활성화 상태, 숫자·문자열 값까지 비교하도록 검사를 추가했다. [Linux 설정 비교 방법](https://docs.kernel.org/6.18/kbuild/kconfig.html)

## 3. 최종 설정을 맞추고 모듈을 빌드했다

Hailo15 플랫폼과 SCMI 등 필요한 옵션을 맞춘 뒤 커널을 다시 빌드했다. 이어서 모듈로 선택한 코드도 빌드했다.

모듈 빌드에서도 추가 수정이 나왔다. PHY 드라이버의 `remove` 콜백, USB gadget에서 사용하는 타이머 API와 파일 속성 변경 호출을 맞추고 필요한 공통 헤더를 정리했다. 이때 타이머 관련 코드는 `from_timer()`와 `del_timer_sync()`를 대상 커널의 `timer_container_of()`와 `timer_delete_sync()`에 맞췄다. `vmlinux` 링크 후에도 모듈로 선택된 코드의 빌드가 남아 있었다. [Linux 6.18 타이머 API](https://github.com/torvalds/linux/blob/v6.18/include/linux/timer.h)

## 4. Yocto에서 Image·DTB·모듈과 rootfs를 만들었다

드라이버와 설정을 맞춘 다음에는 Yocto 빌드에 연결했다. 커널 레시피에서 개발 중인 소스 트리를 `externalsrc`로 가리키고 검증할 설정을 레이어에 넣었다. configure 단계에서 이 설정을 적용해 개발 트리의 `.config` 상태가 그대로 빌드 입력을 결정하지 않도록 했다.

이 레시피는 `kernel`과 `externalsrc` 클래스를 사용하는 구성이다. Yocto의 일반적인 `linux-yocto` 레시피와 태스크가 같다고 가정하지 않았다. 이번에는 생성된 `.config`를 별도로 대조했다. `kernel_configcheck` 태스크를 제공하는 구성에서는 요청한 설정이 최종 설정에서 빠졌는지 검사하는 기능도 사용할 수 있다. [Yocto 커널 설정 검증](https://docs.yoctoproject.org/5.2.4/kernel-dev/common.html#validating-configuration)

빌드 산출물은 용도에 따라 확인했다.

- **`vmlinux`**: ELF 파일에서 필요한 드라이버 심볼을 확인했다.
- **`Image`**: ARM64 부팅 이미지 형식을 확인했다.
- **DTB**: 타깃 보드의 장치 연결 정보와 드라이버 매칭 정보를 확인했다.
- **모듈**: 모듈 아카이브에 필요한 `.ko` 파일이 들어갔는지 확인했다.
- **rootfs**: init과 UART 로그인 서비스, 해당 커널의 모듈이 포함됐는지 확인했다.

처음 링크 성공 시점에는 `arch/arm64/boot/Image`가 없었다. ARM64의 부팅 인터페이스는 `Image`의 헤더와 디바이스 트리 전달 조건 등을 정하고 있다. 그래서 ELF 파일 생성과 보드에 전달할 이미지 준비를 각각 확인했다. [Linux 6.18 ARM64 부팅 조건](https://docs.kernel.org/6.18/arch/arm64/booting.html)

아래는 산출물 확인에 사용하는 설명용 명령이다. 크로스 빌드와 binutils 설정이 준비된 환경을 가정한다. `build/`는 문서용 출력 경로이며 실제 Yocto 커널 빌드 디렉터리로 바꿔야 한다.

```bash
file build/vmlinux build/arch/arm64/boot/Image
aarch64-linux-gnu-nm --defined-only build/vmlinux > kernel-symbols.txt
```

심볼 이름이 몇 개 나오는지만 세는 방식으로는 드라이버 포함 여부를 판단하기 어려웠다. 확인할 드라이버마다 대표 심볼을 정해 검사했고 모듈은 별도 아카이브 목록에서 확인했다. 심볼이 존재한다는 결과도 해당 드라이버가 실제 장치에서 초기화됐다는 결과와 구분했다.

rootfs는 `core-image-minimal`을 기준으로 ext4 이미지와 압축 아카이브, 패키지 manifest를 만들었다. 커널 모듈은 아카이브뿐 아니라 rootfs와 manifest에도 포함됐는지 대조했다. 커널 버전이 맞는 모듈이 부팅 후 파일시스템에 있어야 사용할 수 있기 때문이다.

빌드 트리의 `Image`·DTB와 배포 디렉터리의 파일도 대조했다. 배포 파일을 확인한 뒤에는 해시를 남겼다. 나중에 보드에 전달한 파일이 어느 빌드의 결과물인지 확인할 수 있도록 한 것이다.

## 5. SCMI·PWM을 다시 검토하고 부팅 경로를 채웠다

커널과 rootfs를 만든 뒤에는 드라이버 연결과 오류 처리를 다시 살폈다.

### SCMI 식별자와 PWM 등록 실패 처리

설정이 맞더라도 드라이버와 장치의 연결은 별도로 확인해야 했다. SCMI에서는 드라이버가 등록하는 프로토콜 식별자가 디바이스 트리와 펌웨어에서 사용하는 값에 맞는지 확인했다. 이식 중 식별자 선언이 기존 값과 달라진 부분을 수정했다.

SCMI는 시스템 펌웨어와 통신해 클록이나 reset 같은 기능을 다루는 인터페이스다. 이 단계에서는 코어 설정, 벤더 프로토콜 등록, 디바이스 트리의 연결 정보를 함께 봤다. 바이너리에 등록 함수가 들어갔는지도 확인했다. 실제 펌웨어와의 통신은 이후 보드에서 확인할 항목으로 남겼다.

PWM에서는 오류 처리 누락을 발견했다. 칩 할당을 새 API로 바꾸면서 등록 실패 경로에서 클록을 정리하는 코드가 빠져 있었다.

흐름을 단순하게 표현하면 이렇다.

```text
클록 획득
  → 클록 활성화
  → PWM 칩 등록
      성공: 드라이버 초기화 계속
      실패: 활성화한 클록 정리 후 오류 반환
```

`devm_pwmchip_alloc()`은 PWM 칩을 할당하고 장치의 자원 관리에 해제 동작을 등록한다. 이 함수가 별도로 활성화한 클록까지 정리해 주지는 않는다. `clk_prepare_enable()` 뒤에 `pwmchip_add()`가 실패하면 활성화했던 클록도 정리해야 한다. 해당 경로에 `clk_disable_unprepare()`를 복원했다. [Linux 6.18 devm_pwmchip_alloc 구현](https://github.com/torvalds/linux/blob/v6.18/drivers/pwm/core.c)

컴파일과 링크는 이런 실패 경로의 누락을 알려주지 않는다. 할당 API를 바꾼 부분에서는 초기화 성공 경로와 실패 경로를 다시 따라갔다.

### Mailbox와 SD/eMMC 드라이버

이미지와 rootfs가 만들어진 뒤에도 부팅에 필요한 드라이버를 확인했다. 이 단계에서 PL320 mailbox 연결과 Hailo SD/eMMC 드라이버를 추가로 이식했다.

SCMI는 설정에서 고른 transport와 디바이스 트리의 통신 경로가 맞아야 한다. 이번 보드의 mailbox 전송 구성을 확인하면서 mailbox 드라이버, SCMI 연결, 클록과 reset 경로를 함께 봤다.

SD/eMMC는 rootfs를 읽는 경로라 먼저 필요했다. UART 콘솔과 타이머, 저장매체 드라이버, 클록·reset, ext4처럼 부팅 중 사용하는 기능은 최종 설정에서 built-in으로 포함됐는지 검사했다.

여기서 `y`와 `m`의 차이가 드러난다. 별도 initramfs에서 필요한 모듈을 먼저 공급하는 구성이 없다면, rootfs 안에 있는 모듈에 의존해 그 rootfs를 읽을 수는 없다. 그래서 초기 부팅에 필요한 경로를 built-in으로 준비했다. 모든 드라이버를 일괄적으로 `y`로 바꾸지는 않았다.

디바이스 트리에서는 SD/eMMC 노드의 상태, 클록 입력, PHY 설정과 DMA 메모리 풀을 확인했다. 보드 변형에 따른 overlay도 적용한 뒤 저장매체 노드가 활성화되는지 검사했다. DTB 파일이 생성됐다는 결과만으로 부팅에 사용할 구성을 확인할 수 없었다.

검증 스크립트에는 최종 설정 대조, 개별 심볼, 드라이버 매칭 정보, DT 속성, 모듈·rootfs 포함 여부를 넣었다. ext4 이미지는 읽기 전용 파일시스템 검사로 확인했고 압축 파일의 무결성도 검사했다.

## 6. 이 단계에서 확인한 결과

2026년 9월 23일에는 커널과 rootfs 재빌드가 성공했고 산출물에 대한 85개 정적 검사도 통과했다. 처음 링크 성공 때 빠져 있던 설정과 드라이버를 채우고 ARM64 `Image`, DTB, 모듈, rootfs를 확인한 상태였다.

이 시점에는 새 커널의 실제 보드 부팅, SCMI 통신, SD/eMMC 실매체 I/O를 아직 확인하지 않았다. ISP·DSP의 전체 API 이식과 영상 동작도 이 글에서 다룬 단계에 포함되지 않는다. U-Boot가 사용하는 FIT 구성과 서명 조건은 보드 부팅 단계에서 따로 확인할 일이었다.

이후 작업에서는 실제 보드의 Linux 6.18.52 부팅과 영상 스트림까지 확인했다. 그 과정은 별도 글에서 UART로 부팅 상태를 확인한 순서부터 이어갈 예정이다.

이번 단계에서 빌드 성공을 판단하는 방법이 바뀌었다. `vmlinux`가 만들어지면 최종 설정을 확인하고 필요한 드라이버가 포함됐는지 대조했다. 그다음 배포할 이미지와 rootfs를 확인했다. 부팅 준비까지 확인 범위를 넓히자 링크 오류를 고치는 동안 보이지 않던 누락을 찾을 수 있었다.

### 함께 읽기

- [Yocto 프로젝트 이해하기](/posts/embedded-system/bsp-build-system/yocto-understanding/)
- [크로스 컴파일러만 설치하면 끝일까? SDK와 sysroot 이해하기](/posts/embedded-system/bsp-build-system/cross-compilation-sdk-sysroot/)
