---
title: "AWS KMS 펌웨어 서명과 C 검증기의 44바이트 입력 맞추기"
published: 2026-11-25
description: "펌웨어 서명에 쓸 44바이트 레코드를 만들고 AWS KMS의 RAW·DIGEST 입력을 비교한다. OpenSSL C 검증기로 엔디언, 이중 해시, 공개키가 달라졌을 때의 결과를 확인한다."
image: "./kms-signature-cover.jpg"
tags: [AWS KMS, Firmware, ECDSA, OpenSSL, Embedded Linux]
category: "Protocol & Security"
categoryPath:
  - "Embedded System"
  - "Protocol & Security"
draft: false
lang: "ko"
---

펌웨어 서명기를 AWS KMS로 옮길 때 확인하고 싶었던 건 장치 쪽 C 코드가 새 서명을 그대로 받아들일지였다. 양쪽 설정에 똑같이 ‘ECDSA, SHA-256’이라고 적어도 서명기가 파일 끝의 줄바꿈 하나를 빼거나 이미 계산한 해시를 한 번 더 해시하면 검증은 실패한다.

서명 대상이 어디서 달라지는지 보려고 작은 예제를 만들었다. 아래 예제에서 펌웨어 본문은 줄바꿈을 포함해 15바이트다. 서명기는 여기서 44바이트짜리 레코드를 만들고, 검증기는 받은 본문만으로 같은 레코드를 다시 만든다. 두 프로그램이 처음부터 같은 레코드 파일을 읽게 하면 직렬화 차이를 발견할 수 없다.

## 레코드의 8번째 바이트는 0이다

예제로 쓸 본문은 `hello firmware\n`이다. 마지막 두 글자처럼 보이는 `\n`은 실제로는 LF 한 바이트(`0a`)다. 이 글에서 정한 서명 레코드 `M`은 다음 세 필드를 순서대로 붙인 것이다.

| 오프셋 | 길이 | 필드 | 예제 값 |
| --- | ---: | --- | --- |
| 0–7 | 8 | 형식 식별자 | ASCII `FWDEMO1` 일곱 글자와 끝의 `00` |
| 8–11 | 4 | 본문 길이 | 부호 없는 32비트 빅엔디언 `00 00 00 0f` |
| 12–43 | 32 | 본문의 SHA-256 | `03 f4 36 eb … 0d 82` |

서명 값은 별도로 보관한다. 레코드에 들어가는 본문 해시는 32바이트다. 터미널에 보이는 64자리 16진수를 문자열로 복사하면 필드 길이부터 달라진다. C 구조체를 메모리 모양 그대로 저장하는 방법도 정수의 바이트 순서를 CPU에 맡기게 된다.

다음 코드는 서명기 쪽 입력을 만든다. 출력하는 `SHA256(M)`을 고정해 두면 공개키나 서명을 꺼내기 전에도 두 구현의 직렬화 결과부터 대조할 수 있다.

```python
from hashlib import sha256
from pathlib import Path

payload = b"hello firmware\n"
record = b"FWDEMO1\0" + len(payload).to_bytes(4, "big") + sha256(payload).digest()

Path("record.bin").write_bytes(record)
Path("record.sha256").write_bytes(sha256(record).digest())
print(len(record), sha256(record).hexdigest())
```

```text
44 cfab8d9c79ab1e014f38592d1af789249e76b65f3124a69a48fc27d282af346e
```

## KMS에 맡길 해시는 어느 쪽인가

KMS 키는 `KeyUsage=SIGN_VERIFY`인 `ECC_NIST_P256`을 쓰고, 서명 알고리즘은 `ECDSA_SHA_256`으로 고정한다. 이 조합에서 `MessageType`은 **레코드의 SHA-256을 누가 계산하는지** 정한다. 본문 해시는 어느 쪽이든 이미 레코드의 마지막 32바이트에 들어 있다. [AWS KMS 키 사양](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html) · [AWS KMS Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html)

| KMS `MessageType` | `Sign.Message`에 넘길 바이트 | ECDSA가 서명할 다이제스트 |
| --- | --- | --- |
| `RAW` | `M` 전체, 44바이트 | KMS가 계산한 `SHA256(M)` |
| `DIGEST` | 호출자가 계산한 `SHA256(M)`, 32바이트 | 받은 32바이트 그대로 |

KMS `Sign`의 메시지 입력 한도는 4,096바이트다. 이 예제는 큰 펌웨어도 먼저 본문 해시로 요약해 44바이트 레코드에 넣으므로 `RAW`로 서명할 수 있다. 이미 레코드의 다이제스트를 준비한 서명기는 `DIGEST`를 명시한다. 그 32바이트를 `RAW`로 보내면 서명 대상은 `SHA256(SHA256(M))`가 된다. 길이가 32바이트인 원문도 유효하기 때문에 KMS는 이 실수를 입력 길이로 알아낼 수 없다. [AWS KMS Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html)

## 장치에서 본문을 다시 읽어 검증하기

장치는 신뢰하는 P-256 공개키를 미리 가지고 있다고 가정한다. KMS의 `GetPublicKey`가 돌려주는 공개키는 DER로 인코딩한 `SubjectPublicKeyInfo`다. `Sign`이 돌려주는 ECDSA 서명도 DER 인코딩이며, 두 정수 `r`과 `s`를 담아 길이가 달라질 수 있다. HTTP API나 AWS CLI의 JSON 출력에서는 두 바이너리 값 모두 Base64로 표시된다. C 검증기에 전달할 때는 사용한 인터페이스에 따라 Base64를 풀고, 실제 DER 서명 길이를 함께 넘긴다. [AWS KMS GetPublicKey](https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html) · [AWS KMS Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html)

검증기는 수신한 본문의 길이를 직접 세고 해시를 다시 계산한다. 아래는 로컬에서 컴파일한 OpenSSL 3 검증기의 두 함수다. `trusted_pub`는 검증기가 별도로 보관한 공개키다. 업데이트 파일 안에 든 키를 그대로 여기에 넘기면, 서명자가 릴리스 권한을 가진 키인지 판단할 근거가 사라진다.

```c
#include <stdint.h>
#include <string.h>
#include <openssl/evp.h>

enum { RECORD_SIZE = 44 };

int make_record(const unsigned char *payload, size_t len,
                unsigned char record[RECORD_SIZE])
{
    if (len > UINT32_MAX)
        return 0;
    memcpy(record, "FWDEMO1", 8);  /* 끝의 NUL도 포함 */
    record[8]  = (unsigned char)(len >> 24);
    record[9]  = (unsigned char)(len >> 16);
    record[10] = (unsigned char)(len >> 8);
    record[11] = (unsigned char)len;
    size_t digest_len = 0;
    return EVP_Q_digest(NULL, "SHA256", NULL, payload, len,
                        record + 12, &digest_len) == 1 && digest_len == 32;
}

int verify_record(EVP_PKEY *trusted_pub, const unsigned char record[RECORD_SIZE],
                  const unsigned char *der_sig, size_t sig_len)
{
    EVP_MD_CTX *ctx = EVP_MD_CTX_new();
    if (ctx == NULL)
        return 0;
    int ok = EVP_DigestVerifyInit(ctx, NULL, EVP_sha256(), NULL, trusted_pub) == 1
          && EVP_DigestVerify(ctx, der_sig, sig_len, record, RECORD_SIZE) == 1;
    EVP_MD_CTX_free(ctx);
    return ok;
}
```

`EVP_DigestVerify()`에는 두 서명 방식 모두 **44바이트 원문**을 넣는다. `EVP_DigestVerifyInit()`에서 SHA-256을 지정했으므로 함수가 레코드 해시를 계산한다. KMS에서 `DIGEST`를 썼다는 이유로 이 함수에도 32바이트 다이제스트를 넘기면 검증 쪽에서 한 번 더 해시하게 된다. 이 예제는 반환값이 `1`일 때만 서명을 수락한다. [OpenSSL EVP_DigestVerifyInit](https://docs.openssl.org/3.0/man3/EVP_DigestVerifyInit/)

## 서명을 두 방식으로 만들어 같은 C 코드에 넣은 결과

OpenSSL 3.0.13에서 임시 P-256 키를 만들었다. 첫 번째 명령은 원문을 해시해 서명하고, 두 번째 명령은 이미 계산한 다이제스트를 서명한다. 세 번째 명령은 같은 다이제스트를 한 번 더 해시한 경우다. `pkeyutl -sign`은 여기처럼 `-rawin` 없이 실행하면 입력을 계산이 끝난 다이제스트로 취급한다. [OpenSSL pkeyutl](https://docs.openssl.org/3.0/man1/openssl-pkeyutl/)

```sh
# 테스트용 키 생성
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out a.pem
openssl pkey -in a.pem -pubout -out a.pub

# 세 가지 서명 입력
openssl dgst -sha256 -sign a.pem -out raw.sig record.bin
openssl pkeyutl -sign -inkey a.pem -pkeyopt digest:sha256 \
  -in record.sha256 -out digest.sig
openssl dgst -sha256 -sign a.pem -out double.sig record.sha256

# 같은 공개키와 원문으로 검증기를 대조할 때
openssl dgst -sha256 -verify a.pub -signature digest.sig record.bin
```

| 서명기와 검증기에 넣은 입력 | C 검증 결과 |
| --- | --- |
| 원문 레코드 서명(`raw.sig`), 원래 본문과 공개키 | 수락 |
| 다이제스트 직접 서명(`digest.sig`), 같은 본문과 공개키 | 수락 |
| `raw.sig` 그대로, 본문 첫 글자만 `h`에서 `H`로 변경 | 거부 |
| `raw.sig` 그대로, 본문 끝의 LF 제거 | 거부 |
| 서명기만 길이를 `0f 00 00 00`으로 기록 | 거부 |
| 레코드 다이제스트를 한 번 더 해시한 서명(`double.sig`) | 거부 |
| `raw.sig` 그대로, 다른 P-256 공개키로 검증 | 거부 |

두 번째 행에서 비교할 값은 C 검증기의 반환값이다. ECDSA 서명은 같은 키와 메시지로 만들어도 서명 때 쓰는 일회성 값에 따라 바이트가 달라질 수 있다. 반면 고정한 예제의 `SHA256(M)`은 언제 계산해도 위의 `cfab8d9c…`여야 한다.

이 표는 호스트에서 임시 키와 OpenSSL로 실행한 결과다. KMS 호출과 보드 부팅은 시험 범위에서 제외했다. 실제 연동 중에 서명이 거부되면 양쪽에서 `M`의 길이와 해시를 먼저 비교할 수 있다. 그 값이 같다면 `MessageType`, 신뢰하는 공개키, JSON에서 꺼낸 DER 서명과 그 길이를 차례로 좁혀 보면 된다.

마지막으로 이 레코드가 보증하는 범위도 44바이트에 적힌 그대로다. 같은 키를 쓰는 두 보드 가운데 어디에 설치할지, 이전 버전 설치를 허용할지는 이 예제만으로 판단할 수 없다. 장치가 호환 모델이나 릴리스 버전을 근거로 설치를 결정한다면 그 값도 서명할 레코드에 포함하고, 검증을 마친 뒤 장치의 설치 정책과 대조해야 한다. 이전 슬롯이 새 버전 하한을 통과하는 조건은 [A/B 시험 부팅과 롤백 인덱스 확정 시점](/posts/embedded-system/bsp-build-system/ab-trial-boot-rollback-index/)에서 다뤘다.
