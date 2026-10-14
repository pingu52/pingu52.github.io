---
title: "[Yocto] rootfs 수정사항을 레시피로 관리하기"
published: 2026-10-14
description: "Yocto 보드에서 고친 설정과 서비스를 다음 rootfs 이미지에도 반영하려면 무엇을 남겨야 할까? do_install, systemd, packagegroup, IMAGE_INSTALL을 연결하는 예제로 설치와 패키징을 구분하고 설정 보존 범위를 확인한다."
image: "./yocto-rootfs-cover.png"
tags: [Yocto, BitBake, Embedded Linux, RootFS, systemd]
category: "BSP & Build"
categoryPath:
  - "Embedded System"
  - "BSP & Build"
draft: false
lang: "ko"
---

Yocto 보드에서 설정 파일을 고치고 서비스를 등록하면 당장은 원하는 대로 동작한다. 그런데 다음 rootfs 이미지를 만들면 보드에서 바꾼 내용은 들어 있지 않다. 변경을 빌드 입력에 남기지 않았기 때문이다.

다음 이미지에도 같은 구성을 넣으려면 **수정한 파일과 설치 규칙을 레이어에 남겨야 한다.** 파일을 복사하는 것에서 끝내지 않고 패키징과 이미지 포함까지 연결해야 한다.

메시지를 한 번 출력하는 작은 서비스로 그 경로를 따라가 보자. 기준은 **Yocto 6.0(Wrynose)** 공식 문서이며, 예제는 systemd를 쓰는 별도 실습 환경을 전제로 한다.

## 보드의 rootfs와 빌드 입력은 다르다

rootfs는 보드에서 `/`로 보이는 루트 파일시스템이다. Yocto 빌드에서는 이미지에 넣을 패키지를 선택하고 `do_rootfs`에서 루트 파일시스템을 구성한다. 실행 중인 보드의 파일을 자동으로 읽어 새 이미지를 만드는 방식은 아니다. [Yocto 이미지 생성 과정](https://docs.yoctoproject.org/6.0/overview-manual/concepts.html#image-generation)

우선 어디를 고쳤는지 확인하자. 같은 파일 수정이라도 위치에 따라 남길 방법이 다르다.

| 고친 위치 | 지금 달라지는 것 | 다음 빌드에 남길 방법 |
| --- | --- | --- |
| 실행 중인 보드의 `/etc` | 그 보드의 설정 | 기본 설정 파일과 설치 규칙을 레시피에 반영 |
| 레시피 작업 디렉터리의 파일 | 현재 작업 중인 파일 | 원본 소스나 레이어의 패치로 반영 |
| 생성된 rootfs 디렉터리 | 현재 생성물 | 해당 파일을 설치하는 레시피 수정 |
| 레이어에 등록한 소스와 설정 | 빌드 입력 | Git에 기록하고 이미지 포함 여부 확인 |

재부팅과 이미지 교체도 구분해야 한다. 쓰기 가능한 파일시스템에서 보드의 설정을 바꾸면 재부팅 뒤에도 남을 수 있다. 하지만 rootfs를 새 이미지로 교체할 때 그 변경이 보존되는지는 업데이트 방식과 저장 공간 구성에 달려 있다.

이번 목표는 **같은 레이어를 사용해 빌드하면 기본 파일과 서비스 구성이 다시 들어오는 것**이다. 사용자가 바꾼 설정을 펌웨어 업데이트 후에도 보존하는 문제는 뒤에서 따로 다룬다.

## 작은 실습 레이어 준비하기

이미 Yocto 빌드 환경을 초기화했고 현재 디렉터리가 빌드 디렉터리라고 가정한다. 빌드 환경 준비는 [STM32MP2 OpenSTLinux 빌드 가이드](/posts/embedded-system/bsp-build-system/openstlinux-stm32mp25-build/)에서 다뤘다.

새 레이어를 만들고 빌드에 등록한다.

```bash
bitbake-layers create-layer ../meta-rootfs-demo
bitbake-layers add-layer ../meta-rootfs-demo
bitbake-layers show-layers
```

Poky의 별도 실습 빌드에서는 `conf/local.conf`를 다음처럼 설정한다. 기존 `MACHINE` 설정이 있다면 중복으로 추가하지 말고 값을 바꾼다.

```text
MACHINE = "qemux86-64"
INIT_MANAGER = "systemd"
```

실제 BSP를 사용한다면 그 BSP의 `MACHINE`과 배포판 설정을 따른다. `INIT_MANAGER = "systemd"`는 init 시스템을 선택하는 설정이라 기존 제품 빌드에 예제용으로 덧붙일 값은 아니다. [Yocto init 시스템 선택](https://docs.yoctoproject.org/6.0/dev-manual/init-manager.html#using-systemd)

레이어에 추가할 파일은 다음과 같다. `create-layer`가 만든 `conf/layer.conf`는 그대로 사용한다.

```text
meta-rootfs-demo/
├── conf/
│   └── layer.conf
├── recipes-demo/
│   └── demo-runtime/
│       ├── demo-runtime_1.0.bb
│       └── files/
│           ├── demo-runtime
│           ├── demo-runtime.conf
│           └── demo-runtime.service
└── recipes-core/
    ├── packagegroups/
    │   └── packagegroup-demo.bb
    └── images/
        └── demo-image.bb
```

## 파일과 서비스를 레시피로 설치하기

먼저 `files/demo-runtime`에 셸 스크립트를 작성한다. 외부 프로그램 없이 환경 변수의 메시지만 출력한다.

```sh title="files/demo-runtime"
#!/bin/sh
# SPDX-License-Identifier: MIT
set -eu

: "${DEMO_MESSAGE:?DEMO_MESSAGE must be set}"
printf '%s\n' "$DEMO_MESSAGE"
```

`files/demo-runtime.conf`는 systemd가 읽을 환경 설정 파일이다.

```ini title="files/demo-runtime.conf"
DEMO_MESSAGE="hello from recipe"
```

서비스 파일은 표준 `/etc`와 `/usr/bin` 경로를 기준으로 작성한다.

```ini title="files/demo-runtime.service"
[Unit]
Description=Rootfs recipe demonstration

[Service]
Type=oneshot
EnvironmentFile=/etc/demo-runtime.conf
ExecStart=/usr/bin/demo-runtime
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

`Type=oneshot`이므로 메시지를 출력한 뒤 프로세스는 종료한다. `RemainAfterExit=yes`는 성공적으로 끝난 뒤에도 unit을 active 상태로 남기는 설정이다. 계속 실행되는 데몬을 만든 예제는 아니다. [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#Type=)

세 파일을 패키지로 만들 레시피를 작성한다.

```text title="demo-runtime_1.0.bb"
SUMMARY = "Configuration and service for the rootfs demo"
LICENSE = "MIT"
LIC_FILES_CHKSUM = "file://${COMMON_LICENSE_DIR}/MIT;md5=0835ade698e0bcf8506ecda2f7b4f302"

SRC_URI = "file://demo-runtime \
           file://demo-runtime.conf \
           file://demo-runtime.service"

S = "${UNPACKDIR}"

inherit allarch systemd features_check

REQUIRED_DISTRO_FEATURES = "systemd"

do_configure[noexec] = "1"
do_compile[noexec] = "1"

do_install() {
    install -d "${D}${bindir}"
    install -d "${D}${sysconfdir}"
    install -d "${D}${systemd_system_unitdir}"

    install -m 0755 "${S}/demo-runtime" "${D}${bindir}/demo-runtime"
    install -m 0644 "${S}/demo-runtime.conf" "${D}${sysconfdir}/demo-runtime.conf"
    install -m 0644 "${S}/demo-runtime.service" "${D}${systemd_system_unitdir}/demo-runtime.service"
}

FILES:${PN} += "${systemd_system_unitdir}/demo-runtime.service"
CONFFILES:${PN} += "${sysconfdir}/demo-runtime.conf"

SYSTEMD_SERVICE:${PN} = "demo-runtime.service"
SYSTEMD_AUTO_ENABLE:${PN} = "enable"
```

`SRC_URI`에 등록한 로컬 파일은 unpack 단계에서 빌드 작업 영역으로 들어온다. 이 예제는 Yocto 6.0의 `${UNPACKDIR}`를 소스 디렉터리 `${S}`로 사용한다. 오래된 예제의 `${WORKDIR}` 경로를 그대로 섞어 쓰면 버전에 따라 파일을 찾지 못할 수 있다. [UNPACKDIR와 S](https://docs.yoctoproject.org/6.0/ref-manual/variables.html#term-UNPACKDIR)

`do_install`은 `${D}` 아래에 파일을 설치한다. **`${D}`는 보드의 `/`가 아니라 패키징을 준비하는 빌드 호스트의 임시 디렉터리**다. 그 뒤 `do_package`가 파일을 패키지로 나눈다. `${D}`에서 파일을 찾았다고 최종 이미지에 들어갔다고 판단하면 한 단계를 건너뛴 셈이다. [Yocto do_install](https://docs.yoctoproject.org/6.0/ref-manual/tasks.html#do-install)

여기서는 스크립트와 설정만 설치하므로 `allarch`를 사용하고 컴파일은 생략한다. 보드 전용 바이너리를 설치하는 레시피에 이 설정을 그대로 가져오면 안 된다.

`systemd` 클래스는 서비스의 패키지 등록과 부팅 시 활성화를 처리한다. unit 파일을 복사한 뒤 `SYSTEMD_SERVICE`에 서비스 이름도 등록해야 한다. `features_check`는 systemd 기능이 없는 배포판에서 이 레시피가 사용되는 일을 막는다. [Yocto systemd 클래스](https://docs.yoctoproject.org/6.0/ref-manual/classes.html#systemd), [features_check 클래스](https://docs.yoctoproject.org/6.0/ref-manual/classes.html#features-check)

## 패키지를 이미지에 포함하기

레시피를 빌드하는 것과 이미지에 포함하는 것은 별개다.

```bash
bitbake demo-runtime
```

이 명령은 `demo-runtime`을 빌드한다. 다른 이미지가 이 패키지를 포함하도록 설정하지 않았다면 그 이미지의 rootfs는 달라지지 않는다.

패키지가 하나뿐이라면 이미지 레시피의 `IMAGE_INSTALL`에 직접 넣어도 된다. 실행환경에 필요한 패키지가 늘어나면 packagegroup으로 묶어 관리할 수 있다. 이 예제에도 그 연결을 보여 주려고 packagegroup을 둔다.

```text title="packagegroup-demo.bb"
SUMMARY = "Packages for the demo runtime environment"
LICENSE = "MIT"

inherit packagegroup

RDEPENDS:${PN} = "demo-runtime"
```

packagegroup은 파일을 직접 설치하는 앱이 아니라 설치할 패키지 묶음을 정의한다. 빌드할 때 필요한 레시피는 `DEPENDS`, 패키지를 설치할 때 필요한 패키지는 `RDEPENDS`로 구분한다. [Yocto DEPENDS와 RDEPENDS](https://docs.yoctoproject.org/6.0/ref-manual/variables.html#term-DEPENDS)

실습용 이미지 레시피는 `core-image-minimal`을 바탕으로 작성한다.

```text title="demo-image.bb"
require recipes-core/images/core-image-minimal.bb

SUMMARY = "Minimal image with the demo runtime environment"

IMAGE_INSTALL:append = " packagegroup-demo"
```

`:append`는 공백을 자동으로 붙이지 않으므로 문자열 맨 앞에 공백을 넣었다. 이제 이미지 레시피를 빌드하면 packagegroup을 따라 `demo-runtime`이 포함된다. [Yocto 이미지와 packagegroup 구성](https://docs.yoctoproject.org/6.0/dev-manual/customizing-images.html#customizing-images-using-custom-package-groups)

```bash
bitbake demo-image
```

파일이 이미지까지 들어가는 경로를 이어 보면 다음과 같다.

```text
레이어의 파일과 레시피
    → do_install: ${D}에 설치
    → do_package: demo-runtime 패키지
    → packagegroup-demo의 RDEPENDS
    → demo-image의 IMAGE_INSTALL
    → do_rootfs: 이미지용 rootfs 구성
```

## 설치, 패키징, rootfs를 차례로 확인하기

파일이 안 보이면 어느 단계에서 빠졌는지부터 확인하자. 캐시를 지워도 이미지에 넣지 않은 패키지가 생기지는 않는다.

먼저 레시피가 빌드에 등록됐는지 살펴본다.

```bash
bitbake-layers show-recipes demo-runtime
bitbake-getvar -r demo-runtime S
bitbake-getvar -r demo-runtime D
```

패키지를 빌드한 뒤 파일 목록을 확인한다.

```bash
bitbake demo-runtime
oe-pkgdata-util list-pkg-files demo-runtime
```

목록에서 스크립트와 설정 파일, unit 파일을 찾아보자. 빠진 파일이 있으면 `do_install`과 `FILES`를 확인한다. `FILES`는 패키지에 들어갈 경로를 정할 뿐 파일을 복사하지는 않는다. [Yocto 패키지 파일 목록 확인](https://docs.yoctoproject.org/6.0/dev-manual/debugging.html#viewing-package-information-with-oe-pkgdata-util)

이미지 빌드 뒤에는 실제 rootfs 디렉터리를 확인한다. 경로를 추측하는 대신 레시피 변수에서 읽는다.

```bash
demo_rootfs_dir="$(bitbake-getvar -r demo-image --value IMAGE_ROOTFS)"
demo_unit_dir="$(bitbake-getvar -r demo-runtime --value systemd_system_unitdir)"

ls -l "$demo_rootfs_dir/usr/bin/demo-runtime"
cat "$demo_rootfs_dir/etc/demo-runtime.conf"
ls -l "$demo_rootfs_dir$demo_unit_dir/demo-runtime.service"
```

`rm_work` 등 작업 디렉터리를 정리하는 설정을 사용하면 빌드 뒤 검사할 디렉터리가 남지 않을 수 있다. 그 경우 생성된 rootfs 아카이브와 이미지의 패키지 manifest도 함께 확인한다.

이미지에 파일이 있다는 것과 부팅 후 서비스가 성공하는 것도 다르다. 이미지를 부팅한 타깃에서는 다음을 확인한다.

```bash
systemctl is-enabled demo-runtime.service
systemctl status --no-pager demo-runtime.service
journalctl -b -u demo-runtime.service --no-pager
```

이 서비스에서 기대하는 상태는 `enabled`와 `active (exited)`다. 로그에는 `hello from recipe`가 나와야 한다. 실패했다면 환경 설정 파일을 읽었는지, `ExecStart` 경로와 스크립트 실행 권한이 맞는지부터 살펴보자.

## 기본 설정을 넣는 일과 사용자 설정을 보존하는 일

레시피의 `CONFFILES`는 패키지 관리자가 업데이트할 때 수정된 설정 파일을 다룰 수 있도록 표시하는 변수다. **새 rootfs 이미지로 파일시스템을 교체할 때 설정을 자동으로 복구해 주는 기능은 아니다.** [Yocto CONFFILES](https://docs.yoctoproject.org/6.0/ref-manual/variables.html#term-CONFFILES)

예제의 `/etc/demo-runtime.conf`는 이미지에 넣을 기본값이다. 장비에서 사용자가 바꾼 값을 펌웨어 업데이트 후에도 남겨야 한다면 저장 위치와 업데이트 절차를 별도로 정해야 한다.

설정 전용 파티션이나 별도로 유지하는 볼륨에 사용자 값을 두고 앱이 이미지의 기본값과 사용자 값을 구분해 읽도록 만들 수 있다. `/var` 아래에 저장한다고 저절로 보존되는 것도 아니다. 그 경로가 어느 파일시스템에 있고 업데이트 시 어떻게 처리되는지 확인해야 한다.

처음 부팅할 때 기본 설정을 만드는 방식이라면 기존 파일이 없을 때만 생성해야 한다. 매번 기본값으로 덮어쓰면 저장 공간을 분리해도 사용자 설정은 사라진다. 설정 형식이 바뀌는 업데이트에서는 기존 값을 어떻게 옮길지도 정해야 한다.

## 변경을 마칠 때 남길 것

보드에서 동작을 확인한 뒤에는 수정한 원본 파일과 레시피를 함께 Git에 남긴다. 작업 디렉터리나 deploy 디렉터리의 파일만 고쳐 놓으면 다른 빌드 환경에서 그 변경을 재현할 수 없다.

**레이어에 변경을 남기고 패키지와 이미지에 들어갔는지 확인한 뒤, 부팅 후 서비스 상태까지 살펴보자.** 스크립트가 한 번 실행됐다는 사실만으로 다음 이미지에도 같은 구성이 들어간다고 판단할 수는 없다.

예제의 셸 스크립트 실행과 `do_install`의 파일 설치 경로는 로컬 임시 디렉터리에서 확인했다. BitBake 전체 이미지 빌드와 QEMU 부팅 결과는 이 글에 포함하지 않았다.

### 함께 읽기

- [Yocto 프로젝트의 구성요소와 빌드 흐름](/posts/embedded-system/bsp-build-system/yocto-understanding/)
- [커스텀 레이어와 bbappend로 빌드 실패 관리하기](/posts/embedded-system/bsp-build-system/openstlinux-failures-meta-myboard/)
- [SDK와 sysroot 이해하기](/posts/embedded-system/bsp-build-system/cross-compilation-sdk-sysroot/)
- [Yocto와 systemd로 BSP I/O 데모 패키징하기](/posts/embedded-system/bsp-build-system/stm32-bsp-io-demo/)
