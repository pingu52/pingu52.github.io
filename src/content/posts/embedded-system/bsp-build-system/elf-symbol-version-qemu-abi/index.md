---
title: "[Embedded Linux] OpenSSL 교체 후 ELF 심볼 버전과 QEMU로 ABI 검증하기"
published: 2026-11-25
description: "펌웨어의 OpenSSL 공유 라이브러리를 교체할 때 기존 실행 파일이 요구하는 심볼 버전을 readelf로 대조한다. AArch64 QEMU에서 같은 SONAME의 교체 실패를 재현하고 실제 libcrypto로 SHA-256을 계산한다."
image: "./elf-abi-cover.jpg"
tags: [Embedded Linux, OpenSSL, ELF, ABI, QEMU, Yocto]
category: "BSP & Build"
categoryPath:
  - "Embedded System"
  - "BSP & Build"
draft: false
lang: "ko"
---

rootfs의 OpenSSL을 교체한 뒤 `openssl version`이 잘 찍혔다. 그러면 다시 빌드하지 않은 웹 서버와 인증 프로그램도 그대로 배포해도 될까? 버전 명령은 CLI가 사용하는 코드 경로 하나만 실행한다. 다른 프로그램이 어떤 라이브러리와 함수에 연결되는지는 각 실행 파일에 기록돼 있다.

OpenSSL 3.x의 마이너·패치 릴리스는 기존 공개 ABI와의 호환을 유지하는 것이 원칙이다. 이 호환성에는 방향이 있다. 예전 앱을 새 라이브러리에서 실행하는 경우와, 새 SDK에서 추가된 함수를 호출하도록 빌드한 앱을 예전 이미지에 넣는 경우는 조건이 다르다. 패키징 도중 이전 라이브러리가 남아도 파일 이름은 똑같이 `libcrypto.so.3`일 수 있다. [OpenSSL 릴리스 버전 정책](https://openssl-library.org/policies/general/versioning-policy/)

여기서는 **배포할 실행 파일을 고정하고 로더가 실제로 고른 라이브러리에서 그 파일의 요구 심볼을 해석하는지** 확인한다. ELF의 아키텍처와 sysroot를 처음 맞추는 과정은 [크로스 컴파일러와 SDK·sysroot](/posts/embedded-system/bsp-build-system/cross-compilation-sdk-sysroot/)에서 다뤘다.

## libcrypto.so.3 다음에 볼 값

OpenSSL의 `EVP_Q_digest()`를 호출하는 AArch64 실행 파일을 만들어 확인했다. 이 파일의 동적 섹션과 심볼 테이블에서 필요한 항목만 추리면 다음과 같다.

| 읽은 대상 | `readelf` 출력에서 확인한 값 | 뜻 |
| --- | --- | --- |
| 실행 파일의 `DT_NEEDED` | `libcrypto.so.3` | 로더가 찾아야 하는 공유 라이브러리 이름 |
| 실행 파일의 동적 심볼 | `UND EVP_Q_digest@OPENSSL_3.0.0` | 실행 시 다른 객체에서 해석해야 하는 함수와 버전 |
| 선택한 라이브러리의 동적 심볼 | `EVP_Q_digest@@OPENSSL_3.0.0` | 이 라이브러리가 제공하는 해당 함수의 기본 버전 |

실제로 사용한 라이브러리의 릴리스는 **OpenSSL 3.2.4**였다. 심볼 옆에 적힌 `OPENSSL_3.0.0`은 함수가 속한 ABI 버전 노드다. 동일한 노드를 유지하면 새 릴리스도 오래된 소비자의 요구를 충족할 수 있다. `@@`는 공유 라이브러리를 링크할 때 버전을 따로 지정하지 않은 참조에 선택되는 기본 정의를 표시한다. [GNU ld의 심볼 버전 규칙](https://sourceware.org/binutils/docs/ld/VERSION.html)

비교할 때는 다음 세 줄을 나란히 읽는다. `app`은 배포할 실행 파일이고 `libcrypto`는 **그 앱을 실행할 때 선택할 파일**의 경로다. `readelf -VW`의 `Version needs`에는 버전 요구가 어느 라이브러리에 연결되는지도 나온다. [GNU readelf 문서](https://sourceware.org/binutils/docs/binutils/readelf.html)

```bash
readelf -dW "$app"                        # NEEDED, RUNPATH 또는 RPATH
readelf -VW "$app"                        # Version needs
readelf --dyn-syms --wide "$libcrypto"    # 제공하는 심볼과 버전
```

## SONAME과 함수가 같아도 교체가 실패하는 예제

빈 디렉터리에서 아래 Bash 예제를 실행한다. GNU ld와 glibc를 사용하는 Linux 환경이 기준이다. 작은 공유 라이브러리 두 개에 같은 함수와 같은 SONAME을 주고 **버전 노드 이름만** 바꾼다. OpenSSL 릴리스 간 결함을 재현하는 실험이 아니라 어떤 ELF 정보가 로더의 판단을 바꾸는지 보기 위한 대조군이다.

```bash
compiler=(cc)
mkdir -p original replacement

cat > codec.c <<'C'
int codec_level(void) { return 7; }
C

cat > app.c <<'C'
#include <stdio.h>
int codec_level(void);
int main(void) {
    printf("level=%d\n", codec_level());
    return 0;
}
C

printf '%s\n' 'CODEC_1 { global: codec_level; local: *; };' > original/exports.map
printf '%s\n' 'CODEC_2 { global: codec_level; local: *; };' > replacement/exports.map

for v in original replacement; do
    "${compiler[@]}" -fPIC -shared codec.c -Wl,-soname,libcodec.so.1 \
        -Wl,--version-script="$v/exports.map" -o "$v/libcodec.so.1"
done
"${compiler[@]}" app.c -Loriginal -l:libcodec.so.1 -o app
```

`app`은 한 번만 빌드했다. `-Loriginal`은 링크할 때의 검색 디렉터리다. 실행할 때도 반드시 그 디렉터리를 사용한다는 뜻은 아니다. x86-64 Linux에서 실행 시 검색 경로만 바꿔 다음 결과를 얻었다.

```bash
LD_LIBRARY_PATH="$PWD/original" LD_BIND_NOW=1 ./app
# level=7
LD_LIBRARY_PATH="$PWD/replacement" LD_BIND_NOW=1 ./app
# version `CODEC_1' not found (required by ./app)
```

두 번째 명령의 실패는 의도한 결과다. `readelf --dyn-syms --wide`로 보면 실행 파일은 `codec_level@CODEC_1`을 요구한다. 교체본의 `codec_level@@CODEC_2`에는 같은 C 함수가 들어 있고 반환값도 7이지만, 로더가 요구받은 버전의 정의가 없다. 이 경우에는 시작 시 버전 요구를 검사하므로 `LD_BIND_NOW`를 빼도 실패한다. 즉시 바인딩은 별도로, 평소 첫 호출 때까지 미뤄지는 함수 재배치까지 시작 시점에 검사하려고 켰다. [glibc 로더의 검색 순서와 LD_BIND_NOW](https://man7.org/linux/man-pages/man8/ld.so.8.html)

## AArch64 실행 파일에 타깃 로더 연결하기

같은 예제를 새 작업 디렉터리에서 다시 빌드한다. 위 빌드 블록의 `compiler=(cc)` 한 줄을 타깃 SDK의 컴파일러와 옵션으로 바꾼다. 예를 들어 sysroot를 명시해야 하는 SDK라면 `compiler=(aarch64-linux-gnu-gcc "--sysroot=$SDK_SYSROOT")`처럼 지정한다.

실행에는 `ROOTFS`를 준비한다. 타깃용 glibc 로더와 libc가 들어 있으며 `readelf -lW ./app`의 interpreter 경로를 그 루트 아래에서 열 수 있어야 한다. 검사 순서는 다음과 같다.

```bash
readelf -hW ./app | grep Machine
readelf -lW ./app | grep interpreter

qemu-aarch64 -L "$ROOTFS" -E LD_BIND_NOW=1 \
    -E LD_LIBRARY_PATH="$PWD/original" ./app
qemu-aarch64 -L "$ROOTFS" -E LD_BIND_NOW=1 \
    -E LD_LIBRARY_PATH="$PWD/replacement" ./app
```

AArch64 GCC 13.3.0과 QEMU 8.2.7로 실행해 원본은 `level=7`, 교체본은 `CODEC_1` 누락으로 종료되는 것을 확인했다. QEMU의 `-L`은 타깃 ELF 인터프리터 경로에 적용할 접두 경로이며, `-E`는 실행할 프로그램의 환경 변수를 설정한다. user-mode QEMU는 호스트 커널로 시스템 호출을 전달한다. 전체 보드나 파일시스템 격리를 재현하는 방식은 아니다. [QEMU user-mode 문서](https://www.qemu.org/docs/master/user/main.html)

예제에서는 두 라이브러리를 번갈아 선택하려고 `LD_LIBRARY_PATH`를 일부러 지정했다. **출하 이미지 검사에서는 서비스의 평소 검색 경로를 먼저 그대로 사용해야 한다.** SDK 라이브러리 경로를 앞에 추가하면 이미지에서 빠진 파일이 SDK 경로로 채워진다. 타깃 glibc 로더의 `--list`로 선택 경로를 확인하고, 필요한 경우 게스트에 `LD_DEBUG=libs,versions`를 지정해 탐색·버전 검사 기록을 본다. [glibc 동적 로더 실행](https://sourceware.org/glibc/manual/latest/html_node/Dynamic-Linker-Invocation.html)

## 실제 OpenSSL 함수 호출까지 확인하기

동적 링크에 성공한 뒤에는 앱이 쓰는 기능을 하나 골라 결과까지 검사한다. 예를 들어 `EVP_Q_digest()`로 `abc`의 SHA-256을 계산하면 `libcrypto.so.3`의 함수 호출과 그 환경에서 SHA-256 구현을 가져오는 경로를 함께 지난다. [OpenSSL EVP 다이제스트 API](https://docs.openssl.org/3.2/man3/EVP_DigestInit/)

```c
#include <openssl/evp.h>
#include <stdio.h>

int main(void) {
    unsigned char out[EVP_MAX_MD_SIZE];
    size_t n = 0;
    if (EVP_Q_digest(NULL, "SHA256", NULL, "abc", 3, out, &n) != 1)
        return 1;
    for (size_t i = 0; i < n; ++i)
        printf("%02x", out[i]);
    putchar('\n');
    return 0;
}
```

위 코드를 `digest.c`로 저장한다. OpenSSL 개발 헤더와 링크용 `libcrypto`가 있는 타깃 SDK에서 빌드한 뒤 타깃 라이브러리로 실행한다.

```bash
"${compiler[@]}" digest.c -lcrypto -o digest
readelf -dW ./digest | grep NEEDED
readelf --dyn-syms --wide ./digest | grep EVP_Q_digest
qemu-aarch64 -L "$ROOTFS" -E LD_BIND_NOW=1 ./digest
```

QEMU에서 AArch64용 OpenSSL 3.2.4를 선택해 실행한 결과다.

```text
ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
```

해시가 맞아도 애플리케이션이 나중에 설정 파일을 읽고 여는 provider 모듈은 별도다. 제품이 특정 provider와 속성 쿼리를 요구한다면 그 설정에서 필요한 알고리즘을 가져와 실제 연산을 수행해야 한다. TLS 클라이언트라면 신뢰 체인과 호스트 이름을 확인하는 핸드셰이크가 다음 시험이다. [OpenSSL provider 구조](https://docs.openssl.org/3.0/man7/provider/)

## 플러그인 단독 검사에서 생기는 오판

rootfs의 모든 `.so`에서 `UND`가 한 건이라도 나오면 실패로 처리하는 검사는 라이브러리 교체의 영향을 가리기 쉽다. 동적 심볼 테이블의 `UND`는 외부에서 정의를 찾으라는 표시다. 예를 들어 확장 모듈이 호스트 프로그램의 로그 함수를 호출하는 구조라면 그 정의는 호스트의 동적 심볼 테이블에 있을 수 있다. 모듈만 따로 검사하면 실제로 로드될 때의 탐색 범위가 빠진다. [dlopen의 심볼 해석 규칙](https://man7.org/linux/man-pages/man3/dlopen.3.html)

교체 전후 이미지를 대조할 때는 다음처럼 결과를 남기는 편이 읽기 쉽다.

| 관찰 | 다음 판정 |
| --- | --- |
| 같은 실행 파일이 이전 이미지에서 성공하고 새 이미지에서 `version ... not found`로 실패 | 새로 선택된 라이브러리 경로와 해당 파일의 버전 정의를 대조한다. |
| 두 이미지 모두 플러그인 단독 검사에서 같은 심볼을 찾지 못함 | 호스트 프로그램에서 플러그인을 실제로 열고 그 기능을 호출한 결과를 비교한다. |
| 두 이미지 모두 즉시 바인딩 성공, 특정 알고리즘만 실패 | provider 설정과 모듈·알고리즘 조회 결과를 비교한다. |
| QEMU에서 정상, 보드 서비스에서만 실패 | 서비스 계정의 파일 접근 권한, 커널 정책, 장치 의존 기능을 같은 조건으로 확인한다. |

릴리스 기록에는 소비자 ELF와 공급 라이브러리의 해시, 로더가 선택한 경로, 이전·새 이미지의 결과를 함께 남긴다. **동일한 소비자**로 시험해야 앱 재빌드 효과와 라이브러리 교체 효과를 구분할 수 있다. 이 글에서 직접 확인한 범위는 두 아키텍처에서의 심볼 버전 불일치와 AArch64 QEMU에서의 SHA-256 계산까지다. 보드 서비스의 기동과 장치별 TLS 동작은 별도의 판정 항목이다.
