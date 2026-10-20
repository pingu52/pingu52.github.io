---
title: "[Yocto] 커널 교체 시 확인할 빌드·배포 구성"
published: 2026-10-20
description: "Yocto에서 커널을 교체할 때는 레시피 버전뿐 아니라 소스 리비전, 최종 설정, DTB, 외부 모듈과 rootfs를 함께 확인해야 한다. provider 선택부터 배포 파일의 해시와 부트로더가 읽는 이미지까지 추적하고, 빌드 성공과 실제 보드 검증의 범위를 나누는 순서를 정리한다."
image: "./yocto-kernel-build-deploy-cover.png"
tags: [Yocto, BitBake, Linux, Kernel, BSP]
category: "BSP & Build"
categoryPath:
  - "Embedded System"
  - "BSP & Build"
draft: false
lang: "ko"
---

Yocto에서 커널 레시피를 바꾸고 빌드를 마쳤는데 보드는 예전 커널로 부팅할 수 있다. 새 커널이 올라와도 rootfs에는 이전 커널의 모듈만 남아 있을 수 있다. 빌드한 파일과 부트로더가 실제로 읽는 파일이 서로 다르면 생기는 일이다.

커널을 교체할 때는 **선택한 소스와 설정이 커널·DTB·모듈에 반영되고, 그 결과가 배포와 부팅까지 이어지는지** 따라가야 한다. 버전 문자열 하나로 이 연결을 모두 확인할 수는 없다.

이 글은 Yocto 6.0 공식 문서를 기준으로 빌드와 배포 경계를 살펴본다. 명령은 빌드 환경을 초기화한 셸에서 실행하며, `example-board`와 예제 파일명은 사용하는 BSP에 맞게 바꿔야 한다. 드라이버 API를 새 커널로 옮기는 작업은 [기존 커널 포팅 글](/posts/embedded-system/bsp-build-system/hailo15-linux-6-18-porting/)에서 따로 다뤘다.

## 커널과 함께 바뀌는 파일을 정한다

먼저 업데이트 단위에 무엇이 들어가는지 적는다. 커널을 별도 파티션에서 읽는 장비와 커널·DTB를 FIT 이미지에 묶는 장비는 교체할 파일이 다르다. rootfs 안의 `/boot`를 쓰는 구성도 있다.

| 대상 | 확인할 내용 |
| --- | --- |
| 커널 이미지 | 새 소스와 최종 설정으로 생성됐는지 |
| DTB·overlay | 보드와 새 드라이버가 요구하는 구성을 담았는지 |
| 외부 모듈 | 새 커널을 기준으로 다시 빌드했는지 |
| rootfs | 필요한 모듈 패키지와 펌웨어가 포함됐는지 |
| 부팅 설정 | 교체한 파일이나 이미지 구성을 실제로 선택하는지 |

rootfs까지 매번 통째로 교체해야 한다는 뜻은 아니다. 커널과 모듈을 별도 패키지로 업데이트할 수도 있다. 이때도 커널과 설치된 모듈을 맞춰야 하므로 업데이트 순서와 되돌릴 방법을 함께 정한다.

## 실제로 선택된 레시피와 소스를 확인한다

커널 레시피가 여러 개라면 `PREFERRED_PROVIDER_virtual/kernel`로 사용할 provider를 고른다. 같은 레시피의 여러 버전 중에서는 `PREFERRED_VERSION_<레시피 이름>`으로 선호 버전을 지정한다. provider와 레시피 버전을 각각 정하는 셈이다. [Yocto provider·버전 선택](https://docs.yoctoproject.org/6.0/ref-manual/variables.html#term-PREFERRED_PROVIDER)

`linux-example`이라는 레시피가 존재한다고 가정한 설정 예제다. 아래 두 줄만 추가한다고 해당 커널 소스나 보드 지원이 생기지는 않는다.

```text title="머신 설정의 커널 선택 예제"
PREFERRED_PROVIDER_virtual/kernel = "linux-example"
PREFERRED_VERSION_linux-example = "6.12%"
```

설정 파일을 고친 뒤에는 BitBake가 실제로 고른 레시피를 확인한다.

```bash
bitbake-layers show-layers
bitbake-layers show-recipes 'linux-*'
bitbake-layers show-appends

bitbake -e virtual/kernel > kernel.env
grep -E '^(MACHINE|PN|PV|SRCREV|S|B|KERNEL_DEVICETREE|KERNEL_IMAGETYPE|DEPLOY_DIR_IMAGE)=' kernel.env
```

`PN`은 선택된 레시피 이름이고 `PV`는 레시피의 버전이다. `SRCREV`는 Git 같은 SCM에서 가져올 소스 리비전을 지정한다. 여러 Git 소스를 이름으로 나눠 가져오는 레시피라면 `SRCREV_<이름>`과 `SRCREV_FORMAT`도 확인해야 한다. tarball이나 사전 빌드 커널을 사용하는 레시피는 `SRCREV` 대신 소스 파일과 체크섬을 추적한다. [Yocto SRCREV](https://docs.yoctoproject.org/6.0/ref-manual/variables.html#term-SRCREV)

**레시피의 `PV`와 보드의 `uname -r`은 별개의 값이다.** 실제 커널 release에는 local version 등이 붙을 수 있다. 소스 빌드 커널이라면 빌드 뒤 `B` 디렉터리의 `include/config/kernel.release`와 보드의 값을 대조한다. [Linux 커널 release 생성 규칙](https://github.com/torvalds/linux/blob/v6.12/Makefile)

`kernel.env`는 확인용 출력이다. 셸 환경 파일처럼 `source`하지 않는다. `.bbappend`가 보이지 않으면 레이어 등록과 파일명 매칭부터 확인하고, 최종값이 예상과 다르면 `bitbake -e`의 변수 변경 이력을 따라간다. [Yocto 레시피 확장](https://docs.yoctoproject.org/6.0/dev-manual/layers.html#appending-other-layers-metadata-with-your-layer)

## 최종 설정과 DTB를 함께 확인한다

커널을 바꾸면 이전 fragment에 적은 옵션이 최종 `.config`에 그대로 남지 않을 수 있다. 옵션 이름이 바뀌거나 의존 조건을 충족하지 못할 수도 있다. 레이어의 fragment뿐 아니라 configure 뒤의 결과를 대조한다.

`kernel_configcheck`를 제공하는 레시피에서는 다음 순서로 태스크와 설정을 확인할 수 있다. 모든 벤더 커널이 이 태스크를 제공하는 것은 아니므로 목록을 먼저 본다.

```bash
bitbake -c listtasks virtual/kernel
bitbake -c configure virtual/kernel

# 태스크가 제공되는 레시피에서 실행한다.
bitbake -c kernel_configcheck virtual/kernel
```

검사 경고에는 요청했지만 최종 `.config`에 반영되지 않은 항목 등이 나온다. 태스크가 없다면 생성된 설정을 직접 비교한다. 초기 rootfs를 읽는 저장장치와 파일시스템 드라이버도 이때 확인한다. initramfs에서 필요한 모듈을 먼저 공급하지 않는 구성이라면, rootfs 안의 모듈에 의존해 그 rootfs를 읽을 수는 없다. [Yocto 커널 설정 검증](https://docs.yoctoproject.org/6.0/kernel-dev/common.html#validating-configuration), [Linux initramfs 설명](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html)

DTB도 파일 생성 여부에서 끝내지 않는다. 보드 모델, 루트 저장장치의 연결, 드라이버의 `compatible`과 필요한 속성, 사용하는 overlay를 확인한다. `KERNEL_DEVICETREE`는 커널 레시피에서 생성할 DTB를 지정하는 변수다. BSP가 별도 devicetree 레시피나 사전 빌드 파일을 쓴다면 그 경로도 따로 확인한다. [Yocto KERNEL_DEVICETREE](https://docs.yoctoproject.org/6.0/ref-manual/variables.html#term-KERNEL_DEVICETREE)

기존 DTB를 새 커널에서 계속 쓸 수 있는 경우도 있다. 다만 벤더 드라이버와 함께 전달받은 DTB라면 새 소스의 binding과 맞는지 확인해야 한다. 파일을 같은 디렉터리에 복사했다는 이유만으로 호환된다고 판단하지 않는다.

## 외부 모듈을 다시 빌드하고 이미지에 포함한다

기존 `.ko` 파일을 새 커널의 모듈 디렉터리에 복사하는 것으로 교체를 끝내면 안 된다. 외부 모듈은 새 커널의 설정과 빌드 결과를 사용해 다시 빌드한다. Yocto에서는 `module` 클래스를 사용하는 레시피로 이 경로를 연결할 수 있다. [Yocto module 클래스](https://docs.yoctoproject.org/6.0/ref-manual/classes.html#module)

`CONFIG_MODVERSIONS`를 켠 커널은 모듈이 사용하는 exported symbol의 CRC도 검사한다. `modules_prepare`만으로 필요한 `Module.symvers`가 만들어지는 것은 아니다. 외부 모듈에 필요한 커널 빌드 결과가 준비돼 있어야 한다. [Linux 외부 모듈 빌드](https://docs.kernel.org/kbuild/modules.html)

그다음에는 모듈이 rootfs에 설치되는지 확인한다. **모듈 빌드 성공과 모듈 패키지의 이미지 포함은 다른 단계다.** 필요한 `kernel-module-*` 패키지가 선택됐는지 이미지 manifest와 생성된 rootfs에서 대조한다. 모듈과 함께 쓰는 펌웨어 파일도 확인한다.

```bash
bitbake virtual/kernel

# 사용하는 외부 모듈 레시피가 있다면 함께 빌드한다.
# 아래 이미지는 예시이며 실제 배포 이미지 레시피로 바꾼다.
bitbake core-image-minimal
```

이미지의 패키지 의존성에 모듈 레시피가 제대로 연결돼 있다면 이미지 빌드 과정에서 필요한 작업이 이어진다. 반대로 수동 빌드만 해 두고 이미지에 넣지 않으면 모듈이 빠질 수 있다. 패키지 포함 경로는 [rootfs를 레시피로 관리하는 글](/posts/embedded-system/bsp-build-system/yocto-rootfs-recipes/)에서 다룬 설치·패키징 흐름과 같다.

## 배포 파일을 복사한 뒤 해시를 남긴다

`tmp/deploy/images/<MACHINE>`의 파일을 확인할 때는 심볼릭 링크의 실제 대상도 본다. 고정된 이름의 링크가 빌드 때마다 다른 파일을 가리킬 수 있다. 커널 링크는 새 파일을 가리키는데 배포용 rootfs나 FIT 이미지는 예전 그대로일 수도 있다.

배포 후보는 새 디렉터리에 모아 둔다. 아래는 ARM64의 `Image`, DTB 하나, ext4 rootfs를 개별 배포하는 설명용 예제다. 경로와 파일명은 실제 `DEPLOY_DIR_IMAGE`의 출력에 맞춰 바꾼다.

```bash title="stage-release.sh"
#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$PWD/tmp/deploy/images/example-board"
release_dir=$(mktemp -d "$PWD/kernel-release.XXXXXX")

cp -L -- "$deploy_dir/Image" "$release_dir/Image"
cp -L -- "$deploy_dir/example-board.dtb" "$release_dir/board.dtb"
cp -L -- "$deploy_dir/core-image-minimal-example-board.rootfs.ext4" \
    "$release_dir/rootfs.ext4"

(
    cd "$release_dir"
    sha256sum Image board.dtb rootfs.ext4 > SHA256SUMS
    sha256sum -c SHA256SUMS
)

printf '배포 후보: %s\n' "$release_dir"
```

`cp -L`은 링크 자체 대신 링크가 가리키는 내용을 복사한다. 따라서 원래 deploy 디렉터리의 링크가 나중에 바뀌어도 복사본은 유지된다. 단, **빌드가 파일을 갱신하는 동안 복사하지 않는다.** 관련 빌드가 끝난 뒤 파일을 모으고, 그 복사본을 배포에 사용한다. [GNU cp의 링크 처리 구현](https://github.com/coreutils/coreutils/blob/master/src/cp.c)

`SHA256SUMS`로는 복사한 뒤 파일이 달라졌는지 확인한다. 커널과 DTB, rootfs가 서로 맞는지는 앞 단계에서 따로 확인해야 한다. BSP 레이어의 커밋, 선택한 소스 리비전, 최종 커널 release와 필요한 설정을 함께 남겨야 어느 빌드의 파일인지 설명할 수 있다.

해시 목록도 같은 디렉터리에 두는 이 예제는 배포 파일의 서명이나 진위를 보장하지 않는다. 제품에서 서명 검증을 사용한다면 기존 이미지 생성·서명 절차를 그대로 거친다.

## 부트로더가 선택하는 이미지까지 추적한다

파일을 바꾼 위치와 부트로더가 읽는 위치를 대조한다. SD 카드의 `/boot`를 수정했어도 부트로더는 eMMC의 다른 파티션을 읽을 수 있다. A/B 슬롯이 있는 장비에서는 현재 선택한 슬롯도 대조한다.

FIT 이미지를 사용한다면 커널과 DTB를 따로 확인하는 데서 끝내지 않는다. FIT 안에 들어간 각 이미지와 선택한 configuration, 서명 검증 조건을 확인한다. U-Boot의 configuration은 사용할 kernel과 FDT 등을 연결한다. [U-Boot FIT 이미지 구성](https://docs.u-boot.org/en/latest/usage/fit/howto.html)

부팅 이미지가 FIT인 경우 호스트에서는 다음처럼 목록을 볼 수 있다. 이 명령은 이미지 내용을 표시하며 실제 부트로더의 선택과 서명 검증을 대신하지 않는다.

```bash
dumpimage -l firmware.itb
```

rootfs를 지정하는 커널 명령행도 확인한다. 커널은 새 이미지인데 `root=`가 예전 rootfs를 가리키면 사용자 공간과 모듈은 이전 구성으로 남을 수 있다. 배포 후보에 모은 파일과 부트로더 설정, 최종 업데이트 패키지의 내용을 함께 대조한다.

## 부팅 뒤에는 release와 필요한 기능을 대조한다

다음 명령은 모듈을 사용하는 Linux 보드에서 확인할 항목이다. `example_driver`는 실제로 필요한 모듈 이름으로 바꾼다.

```bash
uname -r
cat /proc/cmdline
ls -ld "/lib/modules/$(uname -r)"
modinfo -F filename example_driver
modinfo -F vermagic example_driver
```

`uname -r`은 실행 중인 커널의 release다. 빌드 때 남겨 둔 값과 비교하고, 필요한 모듈이 그 커널에 맞는 경로에서 조회되는지 확인한다. `vermagic`이 같더라도 symbol CRC, 모듈 서명과 실제 로딩 성공까지 보장하지는 않는다. 서명 강제 구성에서는 새 커널이 신뢰하는 키로 모듈도 서명돼 있어야 한다. [Linux 모듈 서명](https://docs.kernel.org/admin-guide/module-signing.html)

마지막은 기능 확인이다. UART 로그인까지 성공했다면 저장장치 접근, 네트워크, 필요한 주변장치와 펌웨어 로드, 재부팅 후 같은 구성으로 돌아오는지 순서대로 확인한다. 부팅 성공만으로 외부 모듈이나 모든 장치가 동작한다고 기록하지 않는다.

| 단계 | 확인할 결과 |
| --- | --- |
| 입력 선택 | 의도한 레시피·소스·설정이 선택됨 |
| 산출물 생성 | 커널·DTB·모듈과 필요한 rootfs가 만들어짐 |
| 배포 구성 | 전달한 파일과 부팅 설정이 대응함 |
| 보드 실행 | 예상 release로 부팅하고 필요한 기능이 동작함 |

이 글에서는 배포 후보를 복사하고 해시를 확인하는 예제를 독립된 파일로 실행했다. 링크 대상 변경과 복사본 변조도 구분해 확인했다. BitBake 전체 빌드, 실제 장비의 플래시·부팅·모듈 로딩은 이번 예제에서 실행하지 않았다.

커널 교체 기록에는 버전 번호와 함께 **무엇을 빌드했고, 어떤 파일을 배포했으며, 보드에서 어디까지 확인했는지**를 남기면 된다. 다음 교체에서 문제가 생겼을 때 이 기록으로 이전 구성과 달라진 부분을 찾는다.

## 함께 읽기

- [커널 포팅에서 링크 성공 뒤에 남은 작업](/posts/embedded-system/bsp-build-system/hailo15-linux-6-18-porting/)
- [Yocto rootfs 수정사항을 레시피로 관리하기](/posts/embedded-system/bsp-build-system/yocto-rootfs-recipes/)
- [SDK와 sysroot 이해하기](/posts/embedded-system/bsp-build-system/cross-compilation-sdk-sysroot/)
