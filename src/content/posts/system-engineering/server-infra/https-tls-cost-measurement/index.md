---
title: "[TLS] HTTPS의 지연과 서버 CPU 사용량 측정하기"
published: 2026-10-25
description: "HTTPS 성능을 비교할 때는 TLS 핸드셰이크, 데이터 전송, 서버 CPU 시간을 나눠 봐야 한다. curl의 누적 시간값으로 구간별 지연을 계산하고 새 연결과 재사용 연결을 구분하는 방법, Linux 서버 CPU 사용량을 같은 부하 조건에서 기록하는 절차를 정리한다."
image: "./https-tls-cost-cover.jpg"
tags: [TLS, HTTPS, OpenSSL, Performance, Linux]
category: "Server & Infra"
categoryPath:
  - "System Engineering"
  - "Server & Infra"
draft: false
lang: "ko"
---

HTTPS를 켠 뒤 응답이 느려졌다고 하자. 암호화 연산이 무거운 걸까, 연결을 새로 맺는 시간이 긴 걸까? CPU 사용률만 보면 둘을 구분하기 어렵다. 요청이 늦어도 서버 CPU는 놀고 있을 수 있다.

**HTTPS 성능은 요청 지연, 전송량, 서버 CPU 시간을 함께 기록해야 비교할 수 있다.** 먼저 새 연결의 TLS 핸드셰이크와 연결을 유지한 뒤의 전송을 나눈다. 그다음 같은 요청을 처리하는 동안 서버가 CPU를 얼마나 썼는지 확인한다.

이 글에서는 curl과 OpenSSL로 측정 조건을 고정하고, Linux의 프로세스 CPU 시간을 읽는 방법을 다룬다. 예제 명령은 로컬 HTTP·HTTPS 시험 서버에서 확인했다. 특정 임베디드 장비의 성능이나 전용 암호화 엔진 사용 여부를 측정한 결과는 아니다.

## 알고리즘 속도와 HTTPS 응답 시간을 구분한다

`openssl speed`는 암호 알고리즘의 연산 성능을 재는 명령이다. 다음 예제는 AES-128-GCM을 지정한 버퍼 크기에서 시험한다. `-elapsed`를 넣으면 처리량 계산의 기준으로 경과 시간을 사용한다. [OpenSSL speed 문서](https://docs.openssl.org/3.0/man1/openssl-speed/)

```bash
openssl speed -elapsed -seconds 1 -bytes 16384 -aead -evp aes-128-gcm
```

이 결과만으로 HTTPS 요청이 몇 ms 걸린다고 말할 수는 없다. 실제 서비스에는 TCP 연결, 인증서 검증, TLS 협상, HTTP 처리와 데이터 전송이 들어간다. 서버가 암호화 외의 작업으로 바빠질 수도 있다.

| 확인할 것 | 측정 조건 | 결과를 읽는 기준 |
| --- | --- | --- |
| 새 연결의 지연 | 요청마다 새 TCP·TLS 연결 | 연결과 핸드셰이크 구간 |
| 연결 유지 후 전송 | 같은 연결로 같은 본문 요청 | 성공한 바이트 수와 전송 시간 |
| 서버 CPU 비용 | 같은 요청률·본문·측정 시간 | CPU 시간, 성공 건수, 바이트 수 |
| 알고리즘 연산 성능 | 라이브러리·알고리즘·버퍼 고정 | `openssl speed` 처리량 |

처음에는 단일 연결로 시작하자. 동시 연결 수까지 바꾸면 암호화 비용과 서버의 스케줄링·대기열 변화가 한꺼번에 섞인다.

## 같은 본문을 주는 시험 서버를 준비한다

아래 명령은 본인이 관리하는 시험 서버가 다음 조건을 만족한다고 가정한다.

- HTTP는 `127.0.0.1:8080`, HTTPS는 `127.0.0.1:8443`에서 같은 `payload.bin`을 제공한다.
- 본문 크기는 정확히 1 MiB(1,048,576바이트)이고, 두 응답의 SHA-256이 같다.
- HTTPS 인증서의 SAN에 `bench.test`가 있고, 이를 신뢰할 인증서 파일은 `lab-ca.pem`이다.
- HTTP/1.1과 TLS 1.3을 지원한다. 연결 재사용 예제에는 HTTP keep-alive도 필요하다.

`bench.test`는 예제용 이름이다. 실제 시험에서는 호스트 이름·주소·포트·신뢰 인증서를 준비한 서버에 맞춘다. 예제는 curl 8.5.0(OpenSSL 백엔드), OpenSSL 3.0.13, Python 3.11에서 실행했다.

인증서 검증을 끄면 시험 조건도 달라진다. `-k` 대신 `--cacert`로 시험용 신뢰 인증서를 지정한다. `--resolve`는 접속 주소를 고정하면서 URL의 호스트 이름을 인증서 검증과 SNI에 사용하게 한다. [curl 인증서 검증](https://curl.se/docs/sslcerts.html), [curl 명령 옵션](https://curl.se/docs/manpage.html)

측정 전에 실제 본문을 한 번씩 저장해 비교한다.

```bash
curl --noproxy '*' --fail --silent --show-error \
  --resolve bench.test:8080:127.0.0.1 \
  --output http-body.bin http://bench.test:8080/payload.bin

curl --noproxy '*' --fail --silent --show-error --cacert lab-ca.pem \
  --resolve bench.test:8443:127.0.0.1 \
  --output https-body.bin https://bench.test:8443/payload.bin

wc -c http-body.bin https-body.bin
sha256sum http-body.bin https-body.bin
```

상태 코드가 같아도 로그인 페이지나 오류 안내문을 받았을 수 있다. 본문까지 같아야 비교를 시작할 수 있다. 예제에서는 프록시를 거치지 않도록 `--noproxy '*'`를 넣고, 리다이렉트 자동 추적과 재시도도 사용하지 않는다.

## curl의 시간값은 시작점부터 누적된다

curl의 `time_connect`와 `time_appconnect`는 각각 TCP 연결과 TLS 핸드셰이크를 끝낸 시점까지의 누적 시간이다. 두 값을 더하면 TCP 연결까지 걸린 시간을 중복해서 센다. [libcurl 핸드셰이크 시간 정의](https://curl.se/libcurl/c/CURLINFO_APPCONNECT_TIME.html)

```text
요청 시작 ── 이름 확인 ── TCP 연결 ── TLS 협상 ── 첫 응답 바이트 ── 완료
                      time_connect
                                  time_appconnect
                                                  time_starttransfer
                                                                  time_total
```

직접 연결한 단일 HTTPS 요청에서는 다음 차이를 구해 볼 수 있다.

```text
TLS 연결 구간(ms)       = (time_appconnect - time_connect) × 1000
TLS 완료 후 첫 응답(ms) = (time_starttransfer - time_appconnect) × 1000
첫 바이트 이후(ms)     = (time_total - time_starttransfer) × 1000
```

첫 번째 값에도 네트워크 왕복과 인증서 처리 등이 들어간다. 서버의 암호 연산 시간만 잰 값은 아니다. 두 번째 값에는 요청 전송과 서버 처리·네트워크 대기가, 마지막 값에는 남은 응답 수신과 클라이언트 처리가 섞인다.

이 계산은 **새로 맺은 HTTPS 연결**에만 적용한다. HTTP에는 TLS 구간이 없고, 재사용 연결에서는 새 핸드셰이크가 생기지 않는다. 프록시나 리다이렉트가 끼어 있는 요청도 따로 다룬다.

## 새 연결을 반복해 지연 분포를 남긴다

다음 스크립트를 `sample-batch.sh`로 저장한다. 실행마다 30개 요청을 보내며, 요청 하나마다 curl 프로세스를 새로 띄운다. 이전 연결이나 TLS 세션을 다음 프로세스에 넘기지 않는 조건이다.

```bash title="sample-batch.sh"
#!/usr/bin/env bash
set -euo pipefail

scheme=${1:?http 또는 https를 지정하세요}
case "$scheme" in
    http) port=8080 ;;
    https) port=8443 ;;
    *) printf 'http 또는 https만 사용할 수 있습니다.\n' >&2; exit 2 ;;
esac

for ((i = 0; i < 30; i++)); do
    curl --noproxy '*' --http1.1 --fail --silent --show-error \
        --connect-timeout 3 --max-time 15 \
        --tlsv1.3 --tls-max 1.3 --cacert lab-ca.pem \
        --resolve "bench.test:${port}:127.0.0.1" \
        --output /dev/null --write-out '%{json}\n' \
        "${scheme}://bench.test:${port}/payload.bin"
done
```

```bash
bash sample-batch.sh http > http-new.jsonl
bash sample-batch.sh https > https-new.jsonl
```

HTTP에서는 TLS 관련 옵션이 적용되지 않는다. HTTPS에서는 TLS 버전도 고정한다. 서버가 다른 버전만 지원한다면 양쪽의 지원 범위를 확인한 뒤 시험 조건을 바꾼다.

실패한 요청이 나오면 스크립트가 중단된다. 일부만 모인 파일을 정상적인 30회 측정으로 취급하면 안 된다. JSON에는 응답 코드·다운로드 바이트·새 연결 수와 시간값이 함께 남는다.

다음 코드는 HTTPS 표본만 요약한다. 응답 상태와 크기가 예상과 다르면 먼저 원인을 확인하도록 중단한다.

```python title="summarize-https.py"
import json
import math
import statistics
from pathlib import Path

rows = [json.loads(line) for line in Path("https-new.jsonl").read_text().splitlines()]
if len(rows) != 30:
    raise SystemExit("성공 여부를 확인할 표본 30개가 필요합니다")

values = []
for row in rows:
    if not (
        row["exitcode"] == 0
        and row["http_code"] == 200
        and row["size_download"] == 1048576
        and row["num_connects"] == 1
        and row["ssl_verify_result"] == 0
    ):
        raise SystemExit("응답·본문 크기·연결·인증서 결과를 확인하세요")
    tcp, tls = row["time_connect"], row["time_appconnect"]
    first, total = row["time_starttransfer"], row["time_total"]
    if not 0 <= tcp <= tls <= first <= total:
        raise SystemExit("새 HTTPS 연결의 시간값인지 확인하세요")
    values.append((tls - tcp) * 1000)

ordered = sorted(values)
print(json.dumps({
    "n": len(values),
    "tls_ms_median": statistics.median(values),
    "tls_ms_p90": ordered[math.ceil(0.9 * len(values)) - 1],
    "tls_ms_max": max(values),
}, indent=2))
```

```bash
python3 summarize-https.py
```

여기서 p90은 작은 값부터 정렬한 30개 중 27번째 값이다. 30개는 명령과 조건을 확인하기 위한 작은 표본이다. 성능 결론을 내릴 때는 충분한 표본과 여러 측정 회차를 남긴다. 평균 하나보다 중앙값·p90·최댓값을 같이 보면 간헐적으로 오래 걸린 요청도 드러난다.

서버가 이미 데워진 상태인지도 맞춘다. 워밍업 요청을 별도로 보내고, HTTP와 HTTPS의 측정 순서를 번갈아 실행한다. 같은 호스트라도 백그라운드 작업과 CPU 주파수 변화에 따라 결과가 달라질 수 있다.

## 연결 재사용은 별도 케이스로 측정한다

요청마다 새 curl을 실행하는 조건은 연결을 오래 유지하는 서비스와 다르다. 같은 프로세스 안에서는 curl의 연결 풀이 앞서 만든 연결을 재사용할 수 있다. 다음 예제는 하나의 curl에서 같은 URL을 두 번 요청한다. [curl 연결 재사용](https://everything.curl.dev/transfers/conn/reuse.html)

```bash
curl --noproxy '*' --http1.1 --fail --silent --show-error \
  --connect-timeout 3 --max-time 15 \
  --tlsv1.3 --tls-max 1.3 --cacert lab-ca.pem \
  --resolve bench.test:8443:127.0.0.1 \
  --write-out '%{json}\n' \
  --output /dev/null https://bench.test:8443/payload.bin \
  --output /dev/null https://bench.test:8443/payload.bin
```

`num_connects`는 그 전송에서 새로 만든 연결 수다. 첫 요청이 `1`, 두 번째가 `0`이면 두 번째 요청에서 새 연결을 만들지 않았다는 뜻이다. 서버가 연결을 닫으면 두 번째도 `1`일 수 있으므로 실제 출력을 확인한다. [libcurl 연결 수 정의](https://curl.se/libcurl/c/CURLINFO_NUM_CONNECTS.html)

같은 TCP 연결의 재사용과, 새 TCP 연결에서 이전 TLS 세션을 재개하는 것은 서로 다른 시험이다. 둘을 한 표에 묶으면 어느 조건에서 비용이 줄었는지 알기 어렵다.

## 서버 CPU 시간은 서버에서 읽는다

먼저 TLS를 종료하는 프로세스가 어디에 있는지 확인한다. 앞단 프록시가 HTTPS를 처리한다면 뒤쪽 애플리케이션의 PID만 재서는 TLS 처리 비용을 볼 수 없다. 서비스 전체 비용을 비교할 때는 함께 동작하는 프로세스의 범위도 맞춘다.

서버 CPU 사용량은 서버에서 읽어야 한다. `/proc/<pid>/stat`에는 사용자 모드와 커널 모드 CPU 시간이 tick 단위로 쌓인다. 측정 전후 차이를 `SC_CLK_TCK`로 나누면 CPU 시간(초)을 얻는다. [Linux proc_pid_stat 문서](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html)

```text
사용한 CPU 시간(s) = Δ(utime + stime) / SC_CLK_TCK
코어 하나 기준 CPU(%) = 사용한 CPU 시간 / 실제 경과 시간 × 100
```

예를 들어 10초 동안 CPU 시간 2초를 썼다면 이 기준으로 20%다. 여러 코어를 쓰는 프로세스는 100%를 넘을 수 있다. 장비 전체 CPU를 100%로 두는 지표와 구분해서 적는다.

다음 스크립트는 **서버에서 실행하는 단일 프로세스용 계측 예제**다. PID가 재사용됐거나 프로세스가 종료되면 실패로 끝낸다.

```python title="cpu-window.py"
import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("pid", type=int)
parser.add_argument("seconds", type=float)
args = parser.parse_args()
if args.pid <= 0 or not math.isfinite(args.seconds) or args.seconds <= 0:
    parser.error("양수 PID와 측정 시간을 지정하세요")

def snapshot():
    raw = Path(f"/proc/{args.pid}/stat").read_text()
    fields = raw.rsplit(")", 1)[1].split()
    if fields[0] in {"Z", "X", "x"}:
        raise ValueError("대상 프로세스가 종료됐습니다")
    return int(fields[11]) + int(fields[12]), fields[19]

try:
    ticks0, started0 = snapshot()
    begin = time.monotonic()
    print("CPU 측정 시작", flush=True, file=sys.stderr)
    time.sleep(args.seconds)
    ticks1, started1 = snapshot()
    elapsed = time.monotonic() - begin
    if started0 != started1 or ticks1 < ticks0:
        raise ValueError("측정 중 프로세스가 바뀌었습니다")
    cpu_s = (ticks1 - ticks0) / os.sysconf("SC_CLK_TCK")
except (OSError, ValueError, IndexError) as error:
    raise SystemExit(f"CPU 계측 실패: {error}")

print(json.dumps({
    "elapsed_s": elapsed,
    "cpu_s": cpu_s,
    "cpu_pct_one_core": 100 * cpu_s / elapsed,
}, indent=2))
```

```bash
# SERVER_PID는 서버에서 확인한 대상 프로세스의 PID다.
python3 cpu-window.py "$SERVER_PID" 10
```

이 예제는 10초짜리 측정 창을 연다. 그동안 클라이언트에서 정해 둔 요청률로 부하를 유지하고, 같은 창에 속하는 성공 건수와 바이트 수를 기록한다. 앞의 30회 배치가 1초 만에 끝났는데 10초 CPU 비율과 곧바로 짝지으면 나머지 9초의 유휴 시간까지 섞인다. 짧은 배치를 비교하려면 시작·종료 시점도 맞춰야 한다.

CPU tick의 분해능보다 짧은 시험에서는 0이 나올 수 있다. 이때 “암호화 비용 없음”이라고 해석하지 말고 측정 시간을 늘린다. 부하를 주지 않은 상태의 CPU 시간도 함께 남긴다.

nginx처럼 여러 worker가 요청을 처리한다면 master PID 하나로 서비스를 대표할 수 없다. 단일 PID 예제 대신 서비스 전체 cgroup의 CPU 시간을 읽는 쪽이 맞다. cgroup v2의 `cpu.stat`에는 하위 cgroup을 포함한 프로세스들의 `usage_usec`가 있다. 전후 차이를 1,000,000으로 나누면 초 단위가 된다. [커널 cgroup v2 CPU 통계](https://docs.kernel.org/admin-guide/cgroup-v2.html#cpu-interface-files)

같은 측정 구간에서 다음 값을 함께 남기면 조건이 다른 시험을 알아보기 쉽다.

| 항목 | 기록할 값 |
| --- | --- |
| 요청 조건 | 본문 크기·해시, 요청률, 동시 연결 수, TLS 버전 |
| 연결 조건 | 새 연결·재사용·TLS 세션 재개 구분 |
| 처리 결과 | 성공·실패 건수, 성공 응답의 총 바이트 |
| CPU | 측정 대상 PID 또는 cgroup, 경과 시간, CPU 시간 |
| 서비스 비용 | `CPU ms / 성공 요청 수`, `CPU ms / 전송 MiB` |

표의 CPU ms는 CPU 시간(초)에 1,000을 곱한 값이다. 전송 MiB는 같은 구간의 성공 응답 바이트를 1,048,576으로 나눠 구한다.

요청률을 같게 맞춰도 성공률이 달라질 수 있다. 본문을 덜 보내고 CPU도 적게 쓴 서버를 더 효율적이라고 평가하면 안 된다. 이 수치는 HTTP 처리와 메모리 복사 등을 포함한 **서비스 비용**이다. HTTPS와 HTTP의 차이를 전부 암호 연산에 돌릴 수도 없다.

## 성능 수치와 하드웨어 가속 증거는 따로 남긴다

CPU가 적게 들었다는 이유만으로 전용 SoC 암호화 엔진을 썼다고 판단하지 않는다. CPU의 암호 명령어, TLS 라이브러리의 구현, 세션 재사용과 외부 장치 사용은 각각 확인해야 한다.

`/proc/crypto`에 알고리즘이 보이는 것은 커널 Crypto API 쪽 정보를 확인한 것이다. 실제 HTTPS 서비스가 그 경로를 호출했는지는 별도 증거가 필요하다. [Linux Crypto API 구조](https://www.kernel.org/doc/html/latest/crypto/architecture.html)

서비스가 링크한 TLS 라이브러리와 설정을 먼저 확인한다. 전용 엔진 사용을 주장하려면 해당 서비스의 호출 경로와 연결되는 provider·드라이버·장치 카운터 같은 증거도 남겨야 한다. 추적이나 디버그 로깅은 성능에 영향을 줄 수 있으므로 시간 측정과 분리한다. 근거가 없다면 가속 여부는 미확인으로 적는다.

## 로컬 예제로 확인한 범위

공개용 예제는 같은 본문을 주는 로컬 HTTP·HTTPS 서버에서 실행했다. 30개씩의 새 연결 요청, JSON 시간값 계산과 연결 재사용을 확인했다. 인증서 검증 실패와 잘못된 HTTP 응답을 정상 표본으로 받지 않는지도 검사했다. CPU 예제는 유휴·부하 프로세스와 종료된 PID를 대상으로 확인했다.

클라이언트와 서버가 같은 호스트의 loopback을 쓰는 시험이므로 명령의 동작과 계산을 확인하는 용도다. 실제 장비 간 네트워크 성능, RTSPS 스트리밍, 전용 하드웨어 가속은 이 검증에 포함하지 않는다.

측정 결과를 남길 때는 **어떤 연결로, 얼마나 같은 일을 시켰고, 어느 서버 프로세스가 CPU를 얼마나 썼는가**를 함께 적자. 그 조건이 있어야 다음 측정과 비교할 수 있다.

## 함께 읽기

- [ONVIF 스트림의 RTSP 세션과 RTP frame 수신 경계 확인하기](/posts/embedded-system/protocol-security/onvif-rtsp-rtp-frame-boundary/)
- [Yocto rootfs에 서비스와 설정을 레시피로 설치하기](/posts/embedded-system/bsp-build-system/yocto-rootfs-recipes/)
