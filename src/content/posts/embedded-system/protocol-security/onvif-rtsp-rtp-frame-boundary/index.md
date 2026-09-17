---
title: "[ONVIF] 04. RTSP 세션과 RTP frame 수신 경계 확인하기"
published: 2026-09-17
description: "PLAY 200 OK를 받았는데 왜 영상은 나오지 않을까요? 실제 JPEG multicast 시험 기록을 출발점으로 RTSP 세션, RTP 패킷 도착, 프레임 복원과 디코딩을 나누고 Wireshark와 FFmpeg로 실패 경계를 확인합니다."
image: ""
tags: [ONVIF, Network, IP Camera, RTSP, RTP, Wireshark, FFmpeg]
category: "Protocol & Security"
draft: false
---

안녕하세요, pingu52입니다.

[3편](/posts/embedded-system/protocol-security/onvif-device-media-stream-uri/)에서는 `GetStreamUri`로 스트림 URI를 얻었습니다. 이제 그 주소에 접속하면 영상이 나올 것 같지만, 실제 시험에서는 한 단계가 더 남아 있었습니다.

RTSP `DESCRIBE`, `SETUP`, `PLAY`는 모두 통과했습니다. `PLAY` 응답도 `200 OK`였습니다. 그런데 다음 단계에서 시험 도구가 센 프레임은 **0개**였습니다.

이때 바로 “UDP가 막혔다”거나 “인코더가 고장 났다”고 결론 내리면 조사할 범위를 잘못 잡을 수 있습니다. 성공 응답, 패킷 도착, 프레임 복원은 서로 다른 관측이기 때문입니다.

이번 글은 **마지막으로 확인한 성공과 아직 확인하지 못한 다음 단계 사이에 선을 긋는 방법**을 정리합니다.

:::note
2026년 9월 작업 세션에 보존된 시험 결과와 RTSP 응답 발췌를 바탕으로 작성했습니다. 해당 실패 실행의 패킷 캡처는 확보하지 못했으므로 패킷 손실 위치나 근본 원인을 확정하지 않습니다.

RTSP·SDP·패킷 예제는 설명용으로 새로 구성했고, 실제 장치 주소, 계정, 세션 식별자와 내부 경로는 사용하지 않았습니다.
:::

## 시리즈 구성

- [1편: ONVIF의 역할과 전체 구조 이해하기](/posts/embedded-system/protocol-security/onvif-introduction/)
- [2편: WS-Discovery로 같은 네트워크의 ONVIF 장치 찾기](/posts/embedded-system/protocol-security/onvif-ws-discovery/)
- [3편: Device/Media Service를 호출해 스트림 URI 얻기](/posts/embedded-system/protocol-security/onvif-device-media-stream-uri/)
- 4편: RTSP 세션과 RTP frame 수신 경계 확인하기 — 현재 글

## 1. 시험 결과가 알려 준 것과 알려 주지 않은 것

기록에 남은 실패는 **JPEG 영상의 RTP multicast/UDP 시험**입니다. 필요한 단계만 요약하면 다음과 같습니다.

```text
Media Service 주소 확인       PASS
Media Profile 조회            PASS
GetStreamUri                  PASS
RTSP DESCRIBE                 PASS
RTSP SETUP                    PASS
RTSP PLAY                     PASS  (응답: 200 OK)
100 frames / 최대 8000 ms 대기 FAIL  (수집: 0 frames)
```

이 결과로 확인할 수 있는 것은 “시험 도구의 프레임 수집 단계가 성공하지 못했다”는 사실입니다. **프레임 0개가 곧 네트워크 패킷 0개라는 뜻은 아닙니다.** 도구가 어떤 조건을 만족해야 프레임으로 집계하는지, 그 아래 계층에서 무엇을 받았는지는 별도 근거가 필요합니다.

| 관측 지점 | 성공을 확인하는 근거 | 아직 보장하지 않는 것 |
| --- | --- | --- |
| URI 획득 | `GetStreamUri` 성공 | RTSP 접속과 인증 |
| RTSP 제어 | 해당 세션의 `SETUP`, `PLAY` 성공 응답 | 미디어 패킷 도착 |
| 네트워크 수신 | 수신 측 캡처에 해당 스트림의 RTP 존재 | 애플리케이션 소켓까지 전달됨 |
| 프레임 복원 | depayloader가 완성한 codec 데이터 | 디코더의 정상 출력 |
| 디코딩·표시 | 디코더 출력과 실제 화면 확인 | 장시간 안정성, 다른 전송 방식의 정상 동작 |

이후 별도 네트워크 환경에서는 해당 시험이 통과했다는 기록도 있습니다. 두 실행에서 네트워크 외의 조건이 같았는지 확인되지 않아, 이전 실패의 원인을 특정 스위치나 설정으로 확정할 수는 없습니다.

## 2. RTSP 세션이 성공했다는 말부터 정확히 하자

이 글은 **RTSP 1.0**을 기준으로 설명합니다. ONVIF Streaming 26.06은 세션 제어에 RFC 2326과 TCP를 사용하도록 정의합니다. RTP가 UDP로 전달되는 경우에도 이 RTSP 제어 연결은 TCP입니다. [ONVIF Streaming §5.2.2](https://www.onvif.org/specs/2606/ONVIF-Streaming-Spec-v2606.pdf)

RTSP 2.0은 RFC 7826으로 따로 정의됐으며, 기본적인 버전 협상 외에는 1.0과 하위 호환되지 않습니다. 최신 RFC라는 이유로 두 버전의 메시지 규칙을 섞으면 안 됩니다. [RFC 7826 §1](https://www.rfc-editor.org/rfc/rfc7826.html#section-1)

주요 요청의 역할은 다음과 같습니다.

| 요청 | 확인할 대상 |
| --- | --- |
| `DESCRIBE` | SDP에 실린 트랙과 codec 정보 |
| `SETUP` | 선택한 트랙의 전송 방식과 세션 |
| `PLAY` | 재생 시작 요청의 수락 |
| `TEARDOWN` | 사용한 세션의 해제 |

요청과 응답은 `CSeq`로 짝을 맞추고, `SETUP`에서 받은 `Session` 식별자는 후속 요청에 사용합니다. TCP 연결이 열렸다는 사실과 RTSP 세션이 준비됐다는 사실은 구분해야 합니다. [RFC 2326 §10, §12.17, §12.37](https://www.rfc-editor.org/rfc/rfc2326.html#section-10)

SOAP 인증이 끝났어도 RTSP 인증은 별개입니다. 첫 `401` 이후 인증 재요청이 성공했는지 확인해야 하며, 첫 응답 한 줄만 보고 실패로 분류하지 않습니다.

또한 `PLAY` 응답의 `RTP-Info`는 수신 패킷 목록이 아닙니다. 서버가 알려 준 sequence·timestamp 기준값이므로, 실제 수신 여부는 수신 측에서 확인해야 합니다. [RFC 2326 §12.33](https://www.rfc-editor.org/rfc/rfc2326.html#section-12.33)

## 3. SDP에서 무엇을 받을지 먼저 확인한다

다음은 **H.264 unicast를 설명하기 위한 SDP 발췌**입니다. 앞 절의 실제 JPEG multicast 시험 결과를 옮긴 것이 아닙니다.

```text
m=video 0 RTP/AVP 96
a=rtpmap:96 H264/90000
a=fmtp:96 packetization-mode=1
a=control:trackID=0
```

`m=`은 media 종류와 payload type을, `a=rtpmap`은 payload type과 codec·clock rate의 연결을 나타냅니다. 여기서 `90000`은 90,000 FPS가 아니라 RTP timestamp의 clock rate입니다. `96` 역시 H.264의 고정 번호가 아니므로 해당 SDP의 매핑을 확인해야 합니다. [RFC 4566 §5.14, §6](https://www.rfc-editor.org/rfc/rfc4566.html#section-5.14)

위처럼 RTSP로 포트를 협상하는 SDP의 `m=`에는 `0`이 올 수 있습니다. 이를 보고 UDP 목적지 포트를 0으로 정하지 말고 `SETUP` 결과를 확인합니다. [RFC 2326 부록 C.1.2](https://www.rfc-editor.org/rfc/rfc2326.html#appendix-C.1.2)

`a=control`이 상대 URI라면 기준 주소에 맞춰 해석합니다. 예를 들어 `Content-Base`가 `rtsp://192.0.2.10/live/`라면 위 트랙 주소는 `rtsp://192.0.2.10/live/trackID=0`입니다. 경로를 제품별 규칙으로 추측해서 붙이지 않습니다. `SETUP`의 트랙 URI와 aggregate `PLAY` URI도 항상 같지는 않습니다. [RFC 2326 부록 C.1.1](https://www.rfc-editor.org/rfc/rfc2326.html#appendix-C.1.1)

디버깅 메모에는 다음 항목을 함께 남기는 편이 좋습니다.

- 선택한 video 트랙과 해석된 control URI
- payload type, codec, `fmtp` 설정
- 그 트랙에 대해 실제로 성공한 `SETUP` 응답

다른 audio 트랙의 패킷을 받고도 “RTP는 정상”이라고 판단하는 실수를 줄일 수 있습니다.

## 4. SETUP 응답을 기준으로 수신 경로를 나눈다

`rtsp://` 주소만으로 미디어가 UDP인지 TCP인지 판단할 수 없습니다. 다음은 서로 다른 `SETUP` 응답의 **Transport 헤더 예제**입니다.

```text
# UDP unicast
Transport: RTP/AVP;unicast;client_port=50000-50001;server_port=60000-60001

# TCP interleaved
Transport: RTP/AVP/TCP;unicast;interleaved=0-1

# UDP multicast
Transport: RTP/AVP;multicast;destination=239.255.42.42;port=50000-50001;ttl=1
```

첫 예제는 클라이언트의 UDP 수신 포트, 두 번째는 RTSP TCP 연결 안의 채널, 세 번째는 multicast 그룹과 포트를 확인하는 경우입니다. **요청한 값뿐 아니라 서버가 선택해 응답한 값을 기록해야 합니다.** [RFC 2326 §12.39](https://www.rfc-editor.org/rfc/rfc2326.html#section-12.39)

### 4.1 UDP unicast: 제어 연결과 수신 소켓을 따로 본다

RTSP 응답을 받았더라도 미디어용 UDP 소켓의 bind 주소, 목적지 포트, 방화벽과 NAT 경로는 별도로 확인해야 합니다.

서버 쪽 송신 캡처와 클라이언트 쪽 수신 캡처를 비교하면 조사 범위를 줄일 수 있습니다. 단, 로컬 송신 캡처에 보였다는 사실만으로 상대 장비까지 전달됐다고 말할 수는 없습니다.

### 4.2 TCP interleaved: recv 한 번이 RTP 한 패킷은 아니다

이 방식은 같은 TCP byte stream 안에서 RTSP 메시지와 RTP/RTCP를 구분합니다. binary block 앞에는 `$`, 채널 번호, 2바이트 길이가 붙고 그 뒤에 RTP 또는 RTCP 데이터가 옵니다. [RFC 2326 §10.12](https://www.rfc-editor.org/rfc/rfc2326.html#section-10.12)

따라서 직접 클라이언트를 구현한다면 다음 상태를 처리해야 합니다.

- block 헤더의 일부만 읽힌 상태
- payload가 여러 번의 읽기로 나뉜 상태
- 여러 block이 한 번에 읽힌 상태
- RTSP 응답과 binary block이 이어서 들어온 상태

TCP에서 바이트를 읽었다는 로그만으로 RTP parsing까지 성공했다고 볼 수 없습니다. 수신 바이트 수와 완성된 RTP packet 수를 따로 세면 이 경계가 드러납니다.

### 4.3 UDP multicast: 그룹 가입과 수신 인터페이스까지 본다

multicast는 장치 IP로 향하는 unicast 경로만 확인해서는 부족합니다. IPv4의 그룹 membership은 IGMP로 알리며, 다중 NIC 환경에서는 어느 인터페이스에서 그룹에 가입했는지도 중요합니다. [RFC 2236 §2](https://www.rfc-editor.org/rfc/rfc2236.html#section-2)

확인할 것은 SDP·Transport의 그룹 주소와 포트, 클라이언트의 membership, 송신 인터페이스와 TTL, 그리고 스위치의 multicast 전달 상태입니다. ONVIF multicast SDP의 `c=`에는 유효한 multicast 주소가 있어야 합니다. [ONVIF Streaming §5.2.2.5](https://www.onvif.org/specs/2606/ONVIF-Streaming-Spec-v2606.pdf)

이 항목들은 이번 실패의 확정 원인이 아니라 **다음 캡처에서 확인할 후보**입니다. IGMP 패킷이 하나 보였다는 사실도 실제 미디어 전달을 보장하지 않습니다.

:::tip
TCP 성공·UDP 실패는 UDP 수신 경로를 더 볼 이유가 됩니다. 그러나 전송 방식을 바꾸면 서버 내부의 처리 경로도 달라질 수 있으므로, 그것만으로 방화벽 문제라고 확정하지는 않습니다.
:::

## 5. Wireshark에서 패킷 도착을 확인한다

가능하면 RTSP 접속 **이전부터** 수신에 사용한 인터페이스를 캡처합니다. 제어 협상까지 있어야 동적 포트와 payload type을 해석하기 쉽습니다. Wireshark가 RTP로 분류하지 않았다는 것과 패킷이 없다는 것은 다릅니다. [Wireshark Wiki — RTP](https://wiki.wireshark.org/RTP)

아래는 **display filter** 예제입니다. capture filter와 문법이 다릅니다.

```text
# RTSP 제어 흐름
rtsp

# RTP 또는 RTCP로 해석된 패킷
rtp || rtcp

# 아직 RTP로 해석되지 않은 경우: 협상된 UDP 포트부터 확인
udp.port == 50000 || udp.port == 50001

# multicast 예제: 그룹 목적지와 협상된 포트로 확인
ip.dst == 239.255.42.42 && (udp.port == 50000 || udp.port == 50001)

# interleaved 예제: 해당 RTSP 연결의 stream 번호로 바꿔 사용
tcp.stream eq 3
```

필터는 한 번에 하나씩 적용합니다. 예제의 포트·그룹·stream 번호는 실제 협상값으로 바꿔야 합니다. multicast의 목적지는 장치 IP가 아니라 그룹 주소이므로 `ip.dst == 장치_IP`만으로 수신 트래픽을 찾으면 놓칠 수 있습니다.

협상 내용을 확인한 뒤 필요하면 **Decode As**로 RTP 해석을 지정합니다. 임의의 UDP를 RTP로 강제 해석한 화면 자체를 증거로 삼지는 않습니다. RTP Streams와 Stream Analysis에서는 sequence, delta, jitter, 추정 손실 등을 볼 수 있지만, 캡처 누락도 함께 검토해야 합니다. [Wireshark RTP Streams·Stream Analysis](https://www.wireshark.org/docs/wsug_html_chunked/ChTelRTP.html)

RTP 헤더에서 먼저 비교할 값은 다음과 같습니다.

| 필드 | 확인할 내용 |
| --- | --- |
| SSRC | 조사 중인 스트림의 송신원인가? |
| Payload Type | SDP에서 선택한 codec과 맞는가? |
| Sequence Number | 빠짐·중복·순서 뒤바뀜이 있는가? |
| Timestamp | 같은 시점의 미디어 조각과 다음 시점을 구분할 수 있는가? |
| Marker | 해당 codec의 경계 규칙에 맞는가? |

sequence는 패킷 순서용이지 프레임 번호가 아닙니다. timestamp도 수신 시각이나 Unix 시간이 아니라 미디어 clock에 따른 값입니다. RTCP Sender Report는 RTP와 NTP 시간의 대응 등을 제공하지만, 그 존재만으로 영상 디코딩을 보장하지 않습니다. [RFC 3550 §5.1, §6.4.1](https://www.rfc-editor.org/rfc/rfc3550.html#section-5.1)

여기서 말하는 “도착”은 **그 캡처 지점에서 관찰했다**는 뜻입니다. 애플리케이션이 다른 포트나 인터페이스에 bind했다면 NIC에서 보인 패킷도 수신 콜백에는 오지 않을 수 있습니다.

## 6. RTP packet과 영상 frame은 같은 단위가 아니다

제목의 “RTP frame 수신”은 RTP로 운반된 영상 프레임을 받는 과정을 뜻합니다. RTP 자체가 모든 codec에 공통인 영상 프레임 형식을 정의하는 것은 아닙니다.

```text
수신 소켓
  → RTP packet 구분·순서 처리
  → codec payload 복원(depacketization)
  → 디코더 입력 구성
  → 디코딩된 영상 frame
  → 화면 표시
```

### 6.1 실제 시험의 JPEG: 조각이 완성됐는가

RTP/JPEG에서는 한 프레임이 여러 패킷으로 나뉠 수 있습니다. fragment offset, timestamp, marker와 필요한 JPEG 정보를 함께 확인해야 합니다. 마지막 패킷을 받았어도 앞쪽 조각이 빠졌다면 정상적인 프레임을 완성하지 못할 수 있습니다. [RFC 2435 §3.1, §4.3](https://www.rfc-editor.org/rfc/rfc2435.html#section-3.1)

다음은 개념 설명용 수신 목록입니다. 같은 SSRC·timestamp를 가진 한 프레임이 세 조각으로 나뉘었다고 가정합니다.

```text
seq=4100  timestamp=900000  offset=0     marker=0  수신
seq=4101  timestamp=900000  offset=1200  marker=0  관측되지 않음
seq=4102  timestamp=900000  offset=2400  marker=1  수신
```

RTP는 두 패킷을 관측했고 마지막 표시도 있지만, 빠진 구간의 데이터는 없습니다. 순서가 뒤바뀌어 늦게 도착하는지와 캡처 자체가 누락됐는지를 확인한 뒤 프레임 완성 여부를 판단해야 합니다.

JPEG의 quantization 정보 등 복원에 필요한 헤더도 확인 대상입니다. 여기까지 조사하지 않고 H.264용 SPS/PPS나 IDR부터 찾으면 다른 codec의 문제를 디버깅하게 됩니다.

### 6.2 H.264라면 NAL unit과 access unit까지 구분한다

H.264에서는 큰 NAL unit을 FU-A로 나누거나 여러 NAL unit을 STAP-A로 묶을 수 있습니다. 따라서 RTP packet 하나, NAL unit 하나, 영상 frame 하나를 일대일로 세면 안 됩니다. [RFC 6184 §5.6–5.8](https://www.rfc-editor.org/rfc/rfc6184.html#section-5.6)

H.264 RTP의 marker는 access unit의 마지막 패킷을 알리는 단서지만, 앞선 조각의 완전성이나 디코딩 성공 증명은 아닙니다. SPS/PPS 같은 parameter set과 참조 영상이 필요한 상태인지도 봐야 합니다. 중간에 접속한 경우에는 디코딩을 시작할 수 있는 지점, 예를 들어 IDR picture까지의 대기도 구분합니다. [RFC 6184 §5.1, §8.5](https://www.rfc-editor.org/rfc/rfc6184.html#section-5.1)

즉 “패킷은 있는데 프레임이 없다”면 네트워크만 계속 바꾸기보다 **수신 소켓 → payload 복원 → 디코더** 사이에서 어디까지 진행됐는지 확인하는 편이 낫습니다.

## 7. FFmpeg로 전송 방식과 디코딩을 나눠 시험한다

직접 만든 클라이언트와 별개로 같은 스트림을 읽어 보면 비교 기준이 생깁니다. FFmpeg RTSP demuxer의 `udp`, `tcp`, `udp_multicast`는 각각 다른 미디어 전송 경로를 선택합니다. [FFmpeg RTSP 문서](https://ffmpeg.org/ffmpeg-protocols.html#rtsp)

다음은 **Linux에서 인증 없는 격리 실습 스트림을 확인하는 예제**입니다. 문서용 주소를 그대로 실행하지 말고 본인이 관리하는 장치가 반환한 URI로 바꿉니다. 실제 운영 장치의 인증을 끄라는 의미는 아닙니다.

```bash
STREAM_URI='rtsp://192.0.2.10/live/'

# TCP interleaved: 30초 뒤 종료 요청, 출력 영상은 저장하지 않음
timeout --signal=INT --kill-after=5s 30s \
  ffmpeg -hide_banner -loglevel info \
  -rtsp_transport tcp -timeout 5000000 \
  -i "$STREAM_URI" \
  -map 0:v:0 -an -sn -dn -frames:v 100 -f null -
```

UDP unicast를 비교할 때는 입력 옵션의 `tcp`만 `udp`로 바꿉니다. multicast는 해당 profile·URI가 그 전송 방식을 지원하는지 먼저 확인하고 `udp_multicast`로 별도 실행합니다. 세 결과를 비교할 때는 codec, 해상도, profile, 네트워크와 시험 시간을 함께 기록합니다.

여기서 주의할 점은 다음과 같습니다.

- `-timeout 5000000`은 RTSP의 TCP socket I/O timeout이며 단위는 마이크로초입니다. 모든 단계의 전체 실행 시간을 제한하는 옵션은 아닙니다.
- 바깥의 GNU `timeout`은 30초 뒤 종료를 요청하고, 종료되지 않으면 추가 5초 뒤 강제 종료합니다. 제한에 걸린 종료 코드 `124`나 강제 종료의 `137`은 프레임 0개라는 뜻이 아니므로 로그와 함께 읽습니다.
- `-frames:v 100`은 출력 프레임 수의 상한입니다. 수신이 멈췄을 때 100개를 기다리는 작업이 자동으로 끝난다는 뜻은 아닙니다.
- `-c copy`를 쓰지 않으므로 디코딩 경로를 거칩니다. `frame=` 증가와 decode 오류를 함께 확인합니다. `-f null -`은 화면 표시를 시험하지는 않습니다.

옵션 의미는 [FFmpeg RTSP 입력 옵션](https://ffmpeg.org/ffmpeg-protocols.html#rtsp), [FFmpeg main options](https://ffmpeg.org/ffmpeg.html#Main-options), [GNU timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html)을 기준으로 합니다.

`ffprobe`가 codec 이름이나 해상도를 출력한 것만으로 지속적인 프레임 수신이 검증됐다고 보지는 않습니다. 그 정보가 SDP나 초기 데이터에서 확보됐을 수도 있기 때문입니다. 또한 위 명령이 100프레임을 처리해도 전체 ONVIF 적합성 시험을 대체하지는 않습니다.

:::note
작성 환경의 FFmpeg 6.1.1에서 위 RTSP transport와 timeout 옵션이 제공됨을 확인했습니다.
:::

## 8. 처음부터 안 오는 경우와 중간에 끊기는 경우

두 증상을 같은 “영상 안 나옴”으로 묶지 않는 것이 좋습니다.

처음부터 0프레임이라면 `SETUP` 결과, 송신 여부, 수신 인터페이스, payload 복원 순서로 봅니다. 반면 처음에는 나오다가 일정 시간 뒤 끊긴다면 **마지막 프레임 시각과 세션 만료 시각**을 비교할 이유가 생깁니다.

`Session` 응답에 `timeout`이 있다면 keep-alive가 그 안에 처리됐는지 확인합니다. ONVIF는 `TEARDOWN` 이외의 RTSP 요청을 keep-alive로 해석하도록 하며, unicast에서는 RTCP Receiver Report도 해당합니다. 지원 여부를 모른 채 `GET_PARAMETER` 하나를 모든 장치의 필수 방식으로 가정하지 않습니다. [ONVIF Streaming §5.2.2.2](https://www.onvif.org/specs/2606/ONVIF-Streaming-Spec-v2606.pdf)

RTSP session timeout은 `GetStreamUri` 응답 URI의 유효기간과 다른 값입니다. 끝난 세션 식별자를 재사용하는 문제도 “주소가 만료됐다”는 문제와 분리해야 합니다.

같은 과정이 반복되면 클라이언트 쪽에는 최소한 다음 시각과 개수를 남길 수 있습니다.

```text
PLAY 응답 시각
첫 RTP packet 수신 시각 / 누적 packet 수
첫 codec 데이터 복원 시각 / 복원 실패 수
첫 decoded frame 시각 / 누적 frame 수
마지막 frame 시각 / 마지막 keep-alive 응답 시각
```

이는 특정 도구의 기존 출력 형식이 아니라 **추가할 진단 로그의 예시**입니다. 한 줄의 `stream started`보다 어느 단계가 멈췄는지 보여 주는 데 유용합니다.

## 9. 실패 경계를 다음 행동으로 연결하기

| 마지막으로 확인한 사실 | 다음에 확보할 근거 |
| --- | --- |
| URI만 확보 | RTSP 인증, `DESCRIBE` 응답과 SDP |
| `DESCRIBE` 성공 | 트랙 control URI, `SETUP`의 Transport·Session |
| `PLAY` 성공, 수신 캡처에 RTP 없음 | 올바른 인터페이스·필터 여부, 송신 측 캡처, 협상된 경로 |
| NIC 캡처에 RTP 있음, 애플리케이션 packet 수 0 | 소켓 bind, multicast 가입, source 필터, 수신·parsing 로그 |
| RTP packet 수 증가, codec 데이터 복원 실패 | sequence gap, payload format, 조각 경계와 codec 설정 |
| codec 데이터 복원, decoded frame 없음 | 디코더 오류와 초기화·참조 데이터 |
| decoded frame 증가, 화면은 정지 | 렌더링, 출력 큐, timestamp 처리 |
| 처음에는 정상, 이후 중단 | keep-alive·timeout, 마지막 송수신 시각, 서버 작업 상태 |

각 행은 원인을 확정하는 표가 아니라 **다음 관측 위치를 고르는 표**입니다. 디코더가 손상된 데이터를 일부 복구할 수도 있고 캡처가 일부 패킷을 놓칠 수도 있으므로, 카운터 하나만으로 정상·비정상을 결정하지 않습니다.

서버 내부의 상태·객체 수명이 어긋나서 성공 응답 후 데이터가 나오지 않는 경우도 있습니다. 그 구현 측면은 별도 글인 [비동기 서버의 수명 관리](/posts/languages-tools/c-cpp/async-server-object-lifetime/)에서 다뤘습니다. 다만 그 사례의 원인을 이번 JPEG multicast 실패에 그대로 대입한 것은 아닙니다.

:::warning
패킷 캡처에는 인증 헤더, URI의 계정·query 값, Session 식별자뿐 아니라 실제 영상과 음성이 들어갈 수 있습니다. 공개 글에는 필요한 필드만 비식별화해 옮기고 원본 캡처를 그대로 첨부하지 마세요. 암호를 URI나 명령행에 직접 넣는 예제도 피해야 합니다.

RTSPS/TLS 또는 SRTP로 보호된 구간은 복호화 자료 없이 같은 수준으로 분석할 수 없으므로, 이 글의 평문 필터 결과를 그대로 적용하지 마세요.
:::

## 10. 정리

이번 기록에서 확인한 것은 **RTSP 제어 단계는 통과했지만 시험 도구의 프레임 수집은 실패했다**는 경계입니다. 패킷 캡처가 없는 상태에서는 그 사이의 어느 지점이 원인인지까지 단정할 수 없습니다.

조사할 때는 다음 순서를 유지하면 좋습니다.

1. SDP와 `SETUP` 응답으로 어떤 트랙을 어디서 받을지 확인합니다.
2. UDP unicast, TCP interleaved, UDP multicast를 나눠 수신 경로를 봅니다.
3. RTP packet 도착과 codec 데이터 복원, 디코딩을 따로 기록합니다.
4. 처음부터 안 오는 문제와 일정 시간 뒤 끊기는 문제를 구분합니다.

`200 OK`는 중요한 성공 신호입니다. 다만 영상 수신의 마지막 성공 신호는 아닙니다. **어디까지 성공했는지 정확히 말할 수 있어야, 다음에 볼 로그와 패킷도 정확해집니다.**

## 참고 자료

- [ONVIF Streaming Specification v26.06](https://www.onvif.org/specs/2606/ONVIF-Streaming-Spec-v2606.pdf)
- [RFC 2326 — RTSP 1.0](https://www.rfc-editor.org/rfc/rfc2326.html)
- [RFC 7826 — RTSP 2.0](https://www.rfc-editor.org/rfc/rfc7826.html)
- [RFC 4566 — SDP](https://www.rfc-editor.org/rfc/rfc4566.html)
- [RFC 3550 — RTP / RTCP](https://www.rfc-editor.org/rfc/rfc3550.html)
- [RFC 2435 — RTP Payload Format for JPEG](https://www.rfc-editor.org/rfc/rfc2435.html)
- [RFC 6184 — RTP Payload Format for H.264 Video](https://www.rfc-editor.org/rfc/rfc6184.html)
- [Wireshark — RTP Streams / Stream Analysis](https://www.wireshark.org/docs/wsug_html_chunked/ChTelRTP.html)
- [FFmpeg — RTSP](https://ffmpeg.org/ffmpeg-protocols.html#rtsp)
