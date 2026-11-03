---
title: "[SquashFS] 압축 방식 선택과 읽기 비용 측정하기"
published: 2026-11-03
description: "SquashFS의 gzip·XZ·LZ4·Zstd 압축을 같은 입력으로 비교한다. 이미지 크기와 읽기·압축 해제 비용을 따로 기록하고, 캐시 조건과 커널 지원, Yocto IMAGE_FSTYPES까지 확인하는 재현 가능한 실습 절차를 정리한다."
image: "./squashfs-compression-cover.jpg"
tags: [SquashFS, Embedded Linux, Performance, RootFS, Yocto]
category: "BSP & Build"
categoryPath:
  - "Embedded System"
  - "BSP & Build"
draft: false
lang: "ko"
---

rootfs 이미지가 작아졌다고 부팅도 빨라지는 것은 아니다. 저장장치에서 읽을 바이트가 줄어도 압축을 푸는 CPU 비용이 커질 수 있다. 반대로 압축을 가볍게 하면 읽어야 할 데이터가 늘어날 수 있다.

**SquashFS 압축 방식은 이미지 크기와 실제 읽기 비용을 나눠 비교해야 한다.** 같은 입력 파일, 블록 크기, 실행 조건을 고정한 뒤 결과를 읽어야 무엇이 달라졌는지 알 수 있다.

여기서는 Linux의 `mksquashfs`와 `unsquashfs`로 재현 가능한 시험 이미지를 만든다. 예제는 WSL2에서 squashfs-tools 4.6.1, Python 3.11, GNU time으로 확인했다. 커널에 이미지를 마운트한 시험이나 실제 장비의 부팅 시간 측정은 아니다.

## SquashFS와 압축 알고리즘 이름을 구분한다

SquashFS는 압축된 읽기 전용 파일시스템이다. gzip·XZ·LZ4·Zstd 등은 그 안의 데이터를 압축하는 알고리즘이다. 파일 이름의 확장자만 바꿔서는 알고리즘이 달라지지 않는다. [Linux SquashFS 문서](https://docs.kernel.org/filesystems/squashfs.html)

`mksquashfs`는 `-comp`로 알고리즘을 선택한다. 이 실습에서 사용한 도구의 기본값은 gzip이다. 따라서 XZ를 선택한 명령에서 옵션을 빼는 것과 무압축 이미지를 만드는 것은 다르다. 설치한 도구가 지원하는 알고리즘과 기본값부터 확인한다.

```bash
mksquashfs -version
unsquashfs -version
mksquashfs -help
```

Yocto의 출력 형식 이름에도 같은 구분이 들어간다. 확인한 OpenEmbedded 메타데이터에서는 `squashfs-xz`가 XZ를, `squashfs-lz4`가 LZ4를, **`squashfs-zst`가 Zstd**를 지정한다. `squashfs-zstd`라고 추측해서 쓰지 말고 사용 중인 브랜치의 정의를 확인한다. [image_types.bbclass](https://github.com/openembedded/openembedded-core/blob/master/meta/classes-recipe/image_types.bbclass)

## 같은 조건에서 비교할 항목을 정한다

| 항목 | 고정하거나 기록할 값 |
| --- | --- |
| 입력 파일 | 파일 목록·내용·권한·확장 속성 |
| 도구 | mksquashfs·unsquashfs 버전과 빌드 옵션 |
| 압축 설정 | 알고리즘·레벨·블록 크기·작업 스레드 수 |
| 출력 크기 | 이미지 파일의 실제 바이트 수 |
| 읽기 작업 | 같은 파일을 같은 순서로 읽는 명령 |
| 시간·자원 | 경과 시간·사용자/시스템 CPU 시간·최대 RSS |
| 캐시 | 첫 접근인지 반복 접근인지와 실행 순서 |

서로 다른 알고리즘의 압축 레벨 숫자가 같다고 같은 작업량인 것은 아니다. 우선 각 알고리즘의 기본 압축 설정으로 비교하고, 레벨을 조정하는 실험은 따로 한다. 아래에서는 블록 크기를 128 KiB, 작업 프로세서 수를 1로 고정한다. [mksquashfs 사용법](https://github.com/plougher/squashfs-tools/blob/master/Documentation/4.7.5/USAGE-MKSQUASHFS.md)

## 반복 데이터와 압축하기 어려운 데이터를 함께 준비한다

운영 rootfs 대신 합성 파일 세 개로 시작한다. 반복 문자열만 넣으면 실제 이미지보다 압축이 쉬운 시험이 된다. 반대로 난수만 넣으면 압축할 수 있는 코드와 설정 파일의 특성이 사라진다.

새 실습 디렉터리를 만들고 다음 내용을 `make-corpus.py`로 저장한다. 생성기는 같은 seed를 사용하며, 난수 파일은 보안용 난수가 아닌 시험용 데이터다.

```bash
lab_dir=$(mktemp -d -t squashfs-lab.XXXXXX)
cd "$lab_dir"
printf '%s\n' "$lab_dir"
```

```python title="make-corpus.py"
from pathlib import Path
import random

root = Path("source")
(root / "etc").mkdir(parents=True, exist_ok=True)
(root / "data").mkdir(exist_ok=True)
(root / "etc/demo.conf").write_text("mode=demo\ninterval=1000\n")
line = b"sensor=demo timestamp=0 state=ready value=1234\n"
size = 32 * 1024 * 1024
(root / "data/repeated.log").write_bytes((line * (size // len(line) + 1))[:size])
(root / "data/noise.bin").write_bytes(random.Random(20261103).randbytes(size))
```

```bash
python3 make-corpus.py
find source -type f -printf '%P %s bytes\n'
```

32 MiB 반복 데이터와 32 MiB 난수 데이터에 작은 설정 파일을 더한 입력이다. 실제 제품의 코드·모델·미디어 파일 비율을 대표하는 자료는 아니다. Python 버전을 바꿔 시험한다면 seed만 믿지 말고 생성한 입력 파일의 해시도 비교한다.

## 네 가지 이미지를 만들고 추출 결과부터 검증한다

아래 내용을 `benchmark-squashfs.sh`로 저장한다. `mksquashfs`, `unsquashfs`, GNU time, `diff`, `stat`가 필요하다. 앞에서 만든 새 실습 디렉터리에서 실행한다.

```bash title="benchmark-squashfs.sh"
#!/usr/bin/env bash
set -euo pipefail

mkdir -p images results
printf 'algorithm,image_bytes\n' > results/images.csv
for algorithm in gzip xz lz4 zstd; do
    mksquashfs source "images/rootfs.$algorithm.sqfs" \
        -comp "$algorithm" -b 131072 -processors 1 \
        -mkfs-time 0 -all-time 0 -all-root -noappend -no-progress \
        > "results/build-$algorithm.log"
    unsquashfs -s "images/rootfs.$algorithm.sqfs" > "results/info-$algorithm.txt"
    printf '%s,%s\n' "$algorithm" "$(stat -c %s "images/rootfs.$algorithm.sqfs")" \
        >> results/images.csv
    unsquashfs -processors 1 -no-progress -d "results/extracted-$algorithm" \
        "images/rootfs.$algorithm.sqfs" > "results/extract-$algorithm.log"
    diff -r source "results/extracted-$algorithm"
done

printf 'round,algorithm,elapsed_s,user_s,system_s,max_rss_kib\n' > results/read.csv
for round in 1 2 3; do
    for algorithm in gzip xz lz4 zstd; do
        /usr/bin/time -a -o results/read.csv \
            -f "$round,$algorithm,%e,%U,%S,%M" \
            unsquashfs -processors 1 -cat "images/rootfs.$algorithm.sqfs" \
            data/repeated.log data/noise.bin > /dev/null
    done
done
```

```bash
bash benchmark-squashfs.sh
cat results/images.csv
cat results/read.csv
```

`-noappend`는 이전 이미지에 내용을 이어 붙이지 않도록 한다. 다만 기존 출력 파일을 보호하는 옵션은 아니므로 새 실습 디렉터리에서 실행한다. 추출 디렉터리도 이전 실행 결과와 섞지 않는다.

`-mkfs-time 0`과 `-all-time 0`은 시험 이미지의 시각 정보를 고정한다. `-all-root`는 이 합성 입력의 소유자를 통일한다. 실제 rootfs에는 서비스별 UID/GID나 file capability가 필요할 수 있으므로 이 옵션 조합을 그대로 제품 이미지 생성 규칙에 덮어쓰지 않는다.

이미지마다 `unsquashfs -s` 결과를 남겨 알고리즘과 블록 크기를 확인하고, 추출한 파일을 원본과 `diff -r`로 비교한다. 이 비교는 파일 내용과 디렉터리 구성을 확인하는 단계다. UID/GID·권한·xattr까지 같은지 판정하는 검사는 아니다. [unsquashfs 사용법](https://github.com/plougher/squashfs-tools/blob/master/Documentation/4.7.5/USAGE-UNSQUASHFS.md)

같은 합성 입력과 위 명령으로 로컬에서 확인한 이미지 크기는 다음과 같다. 파일시스템 메타데이터도 포함한 출력 파일 크기다.

| 알고리즘 | 이미지 크기(바이트) |
| --- | ---: |
| gzip | 33,673,216 |
| XZ | 33,607,680 |
| LZ4 | 33,701,888 |
| Zstd | 33,574,912 |

이 입력에서는 Zstd 이미지가 가장 작았다. 실제 rootfs에서도 같은 순서라고 볼 수는 없다. 입력의 절반이 압축하기 어려운 난수이고, 도구 버전·옵션·파일 메타데이터가 달라지면 크기도 달라질 수 있다.

## 경과 시간과 CPU 시간을 따로 읽는다

CSV의 시간값은 초 단위다. Linux GNU time의 최대 RSS 값은 KiB 단위로 기록한다. [GNU time 출력 형식](https://www.gnu.org/software/time/manual/time.html)

| 열 | 읽는 기준 |
| --- | --- |
| `elapsed_s` | 프로세스 실행부터 종료까지의 경과 시간 |
| `user_s` | 사용자 공간에서 사용한 CPU 시간 |
| `system_s` | 커널 공간에서 사용한 CPU 시간 |
| `max_rss_kib` | 그 명령 프로세스의 최대 상주 메모리 크기 |

경과 시간에는 읽기와 압축 해제뿐 아니라 프로세스 시작·종료와 실행 대기도 들어간다. CPU 시간만으로 저장장치 대기 시간을 설명할 수는 없다. 앞선 [HTTPS 지연과 서버 CPU 측정 글](/posts/system-engineering/server-infra/https-tls-cost-measurement/)과 마찬가지로, 벽시계 시간과 CPU 시간을 분리해서 본다.

파일이 작거나 호스트가 빠르면 `0.00`이 나올 수도 있다. 비용이 없다는 뜻이 아니라 출력 정밀도로 구분하기 어려운 값이다. 입력이나 반복 작업량을 늘리고, 차이가 계속 작다면 그 환경에서는 유의미한 순위를 정하지 않는다.

이 명령은 파일 두 개를 끝까지 읽고 결과를 `/dev/null`에 버린다. **커널 SquashFS의 랜덤 접근이나 앱 실행 시간을 측정한 것은 아니다.** 전체 추출 후 같은 이미지를 반복해서 읽으므로 호스트 캐시에 데이터가 남아 있는 조건도 포함된다.

## 반복 읽기 결과를 부팅 성능으로 바꾸지 않는다

여기까지는 사용자 공간 도구로 비교 절차를 시험한 것이다. 장비에 넣을 압축 방식을 고를 때는 실제 작업을 별도로 측정한다.

- 같은 저장장치와 클럭·부하 조건에서 비교한다.
- 첫 접근과 반복 접근을 구분한다. 캐시 상태가 다른 표본을 섞지 않는다.
- 알고리즘 실행 순서를 번갈아 바꿔 순서에 따른 영향을 확인한다.
- 실제 앱이 읽는 파일 목록과 접근 패턴으로 시험한다.
- 여러 번 재부팅해 부팅 단계별 시간과 앱의 준비 완료 시각을 기록한다.

전역 캐시를 비우면 다른 작업에도 영향을 준다. 공유 개발 PC에서 캐시를 지우는 명령을 반복하기보다, 별도 시험 장비와 정해진 재부팅 절차로 첫 접근 조건을 맞추는 편이 낫다.

부팅 완료의 기준도 정해야 한다. 커널이 rootfs를 마운트한 시각, 로그인할 수 있는 시각, 앱이 요청을 받을 수 있는 시각은 다르다. 앱의 준비 완료를 systemd에 알리는 방법은 [서비스 시작 순서·준비 완료·watchdog 구분하기](/posts/system-engineering/server-infra/systemd-ordering-readiness-watchdog/)에서 설명한다.

## Yocto 출력 형식과 커널 지원을 함께 확인한다

사용하는 브랜치가 해당 형식을 제공한다면 이미지 설정에서 다음처럼 여러 SquashFS 결과물을 만들 수 있다.

```text
IMAGE_FSTYPES += "squashfs-xz squashfs-lz4 squashfs-zst"
```

실제 빌드에 적용된 값도 확인한다. 아래의 `demo-image`는 사용하는 이미지 레시피 이름으로 바꾼다.

```bash
bitbake -e demo-image | grep '^IMAGE_FSTYPES='
```

이 글에서는 위 Yocto 이미지 빌드를 실행하지 않았다. 사용 중인 BSP의 이미지 클래스, 추가 압축 옵션, 펌웨어 패키징 단계가 출력 형식을 변경할 수 있으므로 해당 브랜치의 `image_types.bbclass`와 최종 빌드 로그를 확인해야 한다.

호스트가 이미지를 만들 수 있어도 타깃 커널에 그 압축 해제 기능이 없으면 읽지 못한다. 실제 커널 설정에서 `CONFIG_SQUASHFS`와 사용하는 알고리즘의 `CONFIG_SQUASHFS_XZ`, `CONFIG_SQUASHFS_LZ4`, `CONFIG_SQUASHFS_ZSTD` 등을 확인한다. 루트 파일시스템을 읽는 데 필요한 기능이 언제 사용 가능해지는지도 부팅 구성과 함께 본다. [SquashFS 커널 설정](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/fs/squashfs/Kconfig)

파일시스템 이미지가 생성된 뒤에는 업데이트 도구가 요구하는 헤더·서명·파티션 용량까지 별도 확인해야 한다. 일반 `.sqfs` 파일을 장비의 펌웨어 업데이트 파일로 간주하지 않는다. 커널·DTB·모듈과 부트로더 선택을 대조하는 절차는 [Yocto 커널 교체 시 확인할 빌드·배포 구성](/posts/embedded-system/bsp-build-system/yocto-kernel-build-deploy/)에서 이어서 볼 수 있다.

## 확인한 범위

같은 합성 입력으로 네 종류의 이미지를 만들고 추출 결과가 원본과 같은지 확인했다. 이어서 동일한 파일 두 개를 읽는 명령을 알고리즘마다 세 번 실행해 CSV 기록까지 확인했다.

이 결과로 특정 보드에서 XZ·LZ4·Zstd 중 무엇이 가장 빠르다고 결론 내리지는 않는다. 최종 선택에는 실제 rootfs의 파일 구성, 저장장치, CPU, 커널 압축 해제 경로, 앱의 접근 패턴이 필요하다. 작은 이미지가 필요한지, 첫 응답이 빨라야 하는지부터 정하고 그 작업을 측정하자.

## 함께 읽기

- [Yocto rootfs 수정사항을 레시피로 관리하기](/posts/embedded-system/bsp-build-system/yocto-rootfs-recipes/)
- [Yocto 커널 교체 시 확인할 빌드·배포 구성](/posts/embedded-system/bsp-build-system/yocto-kernel-build-deploy/)
- [Linux SquashFS 문서](https://docs.kernel.org/filesystems/squashfs.html)
