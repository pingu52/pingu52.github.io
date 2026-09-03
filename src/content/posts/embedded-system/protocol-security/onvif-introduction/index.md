---
title: "[ONVIF] 01. ONVIF란? IP 카메라 표준의 구조 이해하기"
published: 2026-08-18
description: "ONVIF가 해결하려는 문제와 Device/Client, WS-Discovery, SOAP, RTSP/RTP, ONVIF Profile의 관계를 공식 문서 기준으로 정리합니다."
image: ""
tags: [ONVIF, Network, IP Camera, WS-Discovery, SOAP, RTSP]
category: "Protocol & Security"
draft: false
---

안녕하세요, pingu52입니다.

IP 카메라를 공부하다 보면 ONVIF와 RTSP가 거의 항상 함께 등장합니다. 처음에는 둘 다 영상을 가져오기 위한 프로토콜처럼 보이지만, 실제 역할은 다릅니다.

- ONVIF는 서로 다른 제조사의 IP 기반 보안 장치와 클라이언트가 연동하기 위한 **인터페이스 표준 모음**입니다.
- RTSP는 스트리밍 세션을 제어하기 위한 프로토콜입니다.
- 실제 영상·음성·메타데이터는 주로 RTP를 통해 전달됩니다.

이번 글에서는 실습에 들어가기 전에 ONVIF가 무엇을 표준화하는지, 카메라를 발견한 뒤 스트림을 받기까지 어떤 기술이 연결되는지 정리합니다.

:::note
이 글은 ONVIF 공식 문서를 읽고 정리한 개념편입니다. 아직 실제 장치 호출이나 패킷 캡처로 검증한 내용은 포함하지 않았습니다. 예제 메시지와 장치별 차이는 후속 실습편에서 직접 확인할 예정입니다.
:::

## 시리즈 구성

- 1편: ONVIF의 역할과 전체 구조 이해하기 — 현재 글
- [2편: WS-Discovery로 같은 네트워크의 ONVIF 장치 찾기](/posts/embedded-system/protocol-security/onvif-ws-discovery/)
- [3편: Device/Media Service를 호출해 스트림 URI 얻기](/posts/embedded-system/protocol-security/onvif-device-media-stream-uri/)
- 4편: RTSP 세션과 RTP frame 수신 경계 확인하기

## 1. ONVIF가 필요한 이유

IP 카메라와 VMS(Video Management System), NVR(Network Video Recorder)이 모두 같은 제조사의 제품이라면 제조사가 제공하는 전용 API만으로도 연동할 수 있습니다.

문제는 서로 다른 제조사의 제품을 함께 사용하려고 할 때 발생합니다.

- 카메라를 네트워크에서 찾는 방법
- 제조사와 모델, 지원 기능을 조회하는 방법
- 영상 해상도와 인코더 설정을 확인하는 방법
- 스트림 주소를 얻는 방법
- PTZ(Pan/Tilt/Zoom)를 제어하는 방법
- 움직임 감지와 같은 이벤트를 받는 방법

이 인터페이스가 제조사마다 전부 다르면 VMS나 NVR은 제조사별 코드를 따로 구현해야 합니다. ONVIF는 IP 기반 물리 보안 제품 사이의 통신 인터페이스를 표준화해 이 문제를 줄입니다.

ONVIF는 2008년 Axis Communications, Bosch Security Systems, Sony Corporation이 설립한 포럼입니다. 현재 범위는 네트워크 비디오뿐 아니라 출입 통제와 분석 메타데이터 등으로 확장되어 있습니다.

여기서 중요한 점은 ONVIF가 특정 카메라 제품이나 하나의 프로그램 이름이 아니라는 것입니다. ONVIF는 표준을 만들고, 그 표준을 구현한 Device와 Client가 공통된 방식으로 통신할 수 있도록 인터페이스를 정의합니다.

## 2. ONVIF가 표준화하는 것과 하지 않는 것

ONVIF는 네트워크 경계에서 Device와 Client가 주고받는 요청, 응답, 데이터 형식을 정의합니다.

| 구분 | 내용 |
| --- | --- |
| ONVIF가 정의하는 것 | 장치 발견, 장치 정보와 기능 조회, 미디어 설정, 스트림 URI 조회, PTZ, 이벤트, 녹화 검색과 제어 등의 네트워크 인터페이스 |
| ONVIF가 재사용하는 것 | XML, SOAP, WSDL, HTTP, WS-Discovery, RTSP, RTP 등 기존 표준 |
| ONVIF가 보장하지 않는 것 | 화질과 성능 같은 제품 품질, 모든 제조사 확장 기능, 설치 환경 전체의 보안성 |

따라서 제품 설명에 ONVIF가 적혀 있다고 해서 모든 ONVIF 기능을 제공한다는 뜻은 아닙니다. 어떤 **ONVIF Profile**을 지원하는지와 필요한 기능이 해당 Profile의 필수 또는 조건부 항목에 포함되는지까지 확인해야 합니다.

:::warning
ONVIF 적합성은 상호 운용을 위한 인터페이스 범위를 의미합니다. 제품의 화질, 안정성, 보안 수준까지 인증한다는 의미는 아닙니다.
:::

## 3. Device와 Client

ONVIF 통신은 크게 Device와 Client의 관계로 볼 수 있습니다.

- **Device**: ONVIF Service를 제공하는 쪽입니다. IP 카메라나 비디오 인코더가 대표적입니다.
- **Client**: Device의 Service를 호출하는 쪽입니다. VMS, NVR, 관리 프로그램 등이 해당합니다.

ONVIF Core Specification에서는 Device를 Service Provider, Client를 Service Requester로 설명합니다. 즉, Client가 정해진 형식으로 요청하면 Device가 자신의 정보와 기능, 설정값을 응답하는 구조입니다.

이 구조에서 장치 관리의 진입점은 Device Service입니다. 현재 Core Specification에서 Device Service의 고정 경로는 다음과 같습니다.

```text
/onvif/device_service
```

실제로는 WS-Discovery 응답이나 사전에 알고 있는 주소를 통해 scheme, IP, port를 포함한 전체 endpoint를 얻은 뒤 접근합니다.

```text
http://<device-address>:<port>/onvif/device_service
```

Device Service에서는 장치 정보, 네트워크와 시스템 설정을 다루고 `GetServices`나 `GetCapabilities` 같은 연산으로 장치가 제공하는 다른 Service를 확인할 수 있습니다.

## 4. 하나의 프로토콜이 아니라 여러 표준의 조합

ONVIF를 이해하기 어려운 이유 중 하나는 통신 과정 전체가 하나의 프로토콜로 끝나지 않기 때문입니다.

| 기술 | ONVIF에서의 주요 역할 |
| --- | --- |
| WS-Discovery | 네트워크에서 Device와 Service endpoint 발견 |
| XML | 요청과 응답 데이터 표현 |
| SOAP | 구조화된 Web Service 메시지 전달 |
| WSDL | Service가 제공하는 연산과 메시지 형식 기술 |
| HTTP/HTTPS | 장치 관리와 미디어 설정 메시지의 전송 기반 |
| RTSP | 스트리밍 세션 설정과 재생 제어 |
| RTP/RTCP | 영상·음성·메타데이터 전송과 제어 정보 교환 |

Core Specification은 장치 발견, 장치 관리, 이벤트 프레임워크를 정의합니다. 미디어 설정, PTZ, Imaging, Analytics, Recording과 같은 기능은 각각 별도의 Service Specification으로 나뉩니다.

이 구조는 운영체제의 system call처럼 하나의 거대한 요청으로 모든 일을 처리하는 방식이 아닙니다. Device가 제공하는 Service를 확인하고, 목적에 맞는 Service의 연산을 차례로 호출하는 방식에 가깝습니다.

## 5. 장치를 찾는 WS-Discovery

처음 연결하는 카메라의 IP 주소를 모른다면 Client는 먼저 장치를 찾아야 합니다. ONVIF의 장치 발견은 WS-Discovery를 기반으로 합니다.

WS-Discovery의 ad hoc mode에서는 Client가 UDP multicast로 `Probe` 메시지를 보내고, 조건에 맞는 Device가 `ProbeMatch`로 응답합니다. IPv4 multicast 주소와 port는 다음과 같습니다.

```text
239.255.255.250:3702/UDP
```

발견 과정에 등장하는 대표 메시지는 다음과 같습니다.

- `Hello`: Device가 네트워크에 참여했음을 알림
- `Probe`: Client가 조건에 맞는 Device를 검색
- `ProbeMatch`: 검색 조건에 맞는 Device가 자신의 endpoint 정보를 응답
- `Resolve`: endpoint reference에 해당하는 주소를 요청
- `Bye`: Device가 네트워크를 떠남을 알림

ONVIF Device는 discoverable mode일 때 `Probe`를 수신하고, 일치하면 Device Service에 접근할 수 있는 주소를 `XAddrs`에 담아 응답합니다.

:::note
WS-Discovery는 일반적인 IPv4 broadcast가 아니라 multicast를 사용합니다. 라우터나 VLAN 경계를 넘어 multicast가 전달된다고 가정할 수 없으므로, IP 통신은 가능하지만 자동 검색만 되지 않는 상황도 별도로 구분해야 합니다.
:::

## 6. SOAP와 WSDL로 장치를 제어한다

Device를 발견한 다음에는 장치의 정보를 읽거나 설정을 변경해야 합니다. ONVIF의 관리와 설정 인터페이스는 Web Services를 기반으로 합니다.

- **XML**은 데이터를 표현합니다.
- **SOAP**은 요청과 응답을 Envelope, Header, Body 구조로 전달합니다.
- **WSDL**은 사용할 수 있는 연산과 각 메시지의 형식을 설명합니다.

예를 들어 Client가 Device의 제조사, 모델, 펌웨어 정보를 알고 싶다면 Device Service의 `GetDeviceInformation` 연산을 호출할 수 있습니다. 지원하는 Service를 확인하려면 `GetServices`를 사용할 수 있습니다.

각 Service는 역할이 나뉘어 있습니다.

| Service | 역할 예시 |
| --- | --- |
| Device | 장치 정보, 네트워크, 시스템, 보안, Service 탐색 |
| Media / Media2 | 영상·음성 source와 encoder 설정, Media Profile, 스트림 URI |
| Imaging | 밝기, 색상, 노출 등 영상 센서 설정 |
| PTZ | Pan, Tilt, Zoom 제어 |
| Event | 이벤트 구독과 알림 수신 |
| Recording / Search / Replay | 녹화 제어, 검색, 재생 |
| Analytics | 영상 분석 기능과 규칙 설정 |

장치마다 지원하는 Service와 선택 기능은 다를 수 있습니다. 따라서 특정 endpoint나 연산이 항상 존재할 것이라고 가정하기보다 Device가 응답한 Service와 capability를 기준으로 다음 요청을 구성해야 합니다.

## 7. 스트림 URI를 얻기까지의 흐름

IP 카메라 영상을 받는 대표 흐름을 단순화하면 다음과 같습니다.

```text
Client                                                   Device
  |                                                         |
  | -- Probe (WS-Discovery multicast) ---------------------> |
  | <- ProbeMatch + Device Service XAddr ------------------- |
  |                                                         |
  | -- GetServices / GetCapabilities (SOAP) --------------> |
  | <- Media 또는 Media2 Service endpoint ----------------- |
  |                                                         |
  | -- GetProfiles (SOAP) --------------------------------> |
  | <- Media Profile과 profile token ----------------------- |
  |                                                         |
  | -- GetStreamUri(profile token, transport) ------------> |
  | <- rtsp://... 또는 지원되는 stream URI ---------------- |
  |                                                         |
  | == RTSP session control / RTP media stream ============ |
```

흐름의 핵심은 다음과 같습니다.

1. WS-Discovery로 Device Service endpoint를 찾습니다.
2. Device Service에서 장치가 제공하는 Service와 capability를 확인합니다.
3. Media 또는 Media2 Service에서 사용할 Media Profile을 조회합니다.
4. 선택한 Media Profile의 token으로 `GetStreamUri`를 호출합니다.
5. 반환된 URI에 RTSP 등으로 연결해 스트리밍 세션을 시작합니다.

이 순서는 전체 구조를 이해하기 위한 대표 흐름입니다. 실제 호출에서는 장치 인증, 지원 Profile, Media와 Media2의 차이, transport 설정에 따라 요청 내용이 달라질 수 있습니다.

## 8. ONVIF와 RTSP는 무엇이 다른가

ONVIF와 RTSP를 같은 계층의 경쟁 기술로 보면 흐름이 잘 이해되지 않습니다.

### ONVIF

- 장치를 발견합니다.
- 장치가 제공하는 기능을 조회합니다.
- 미디어와 PTZ, 이벤트 등의 설정·제어 인터페이스를 제공합니다.
- Media Service를 통해 Client가 사용할 stream URI를 요청할 수 있습니다.

### RTSP

- 반환받은 URI로 스트리밍 세션을 설정합니다.
- `DESCRIBE`, `SETUP`, `PLAY`, `PAUSE`, `TEARDOWN` 같은 메서드로 세션을 제어합니다.
- 영상 데이터 자체는 일반적으로 RTP로 전달됩니다.

즉, RTSP 주소를 이미 알고 있다면 ONVIF 호출 없이 영상만 재생할 수도 있습니다. 하지만 이 경우 장치 자동 발견, capability 조회, 표준화된 미디어 설정, PTZ와 이벤트 같은 ONVIF 기능은 별개의 문제로 남습니다.

한 문장으로 정리하면 **ONVIF로 장치와 스트림을 협상하고, RTSP/RTP로 스트림을 제어하고 전달한다**고 볼 수 있습니다.

## 9. ONVIF Profile은 기능 호환성의 기준이다

ONVIF Specification 전체는 범위가 매우 넓습니다. 모든 Device와 Client가 모든 기능을 구현하도록 요구하면 현실적으로 상호 운용이 어려워집니다.

ONVIF Profile은 특정 사용 사례를 구현하는 데 필요한 기능을 고정된 집합으로 묶습니다. Profile에는 필수 기능과 조건부 기능이 있으며, Device와 Client가 같은 Profile의 대응 요구사항을 구현할 때 해당 범위에서 상호 운용을 기대할 수 있습니다.

IP 비디오를 공부할 때 자주 만나는 Profile은 다음과 같습니다.

| Profile | 주요 목적 |
| --- | --- |
| Profile S | 기본 영상 스트리밍과 설정, 지원 장치의 PTZ·audio in·multicast·relay output |
| Profile T | H.264/H.265 기반 고급 영상 스트리밍, imaging, motion/tampering event, metadata, 양방향 audio 등 |
| Profile G | 장치 또는 네트워크의 edge storage 녹화, 검색과 재생 제어 |
| Profile M | 분석용 metadata와 event, object classification, analytics와 MQTT 연계 |

2026년 8월 현재 Profile S는 지원 종료(deprecation) 절차가 진행 중입니다. 2027년 3월 31일 이후에는 제조사가 새 제품이나 새 firmware/software version을 Profile S 적합 제품으로 제출할 수 없습니다.

이 날짜에 기존 Profile S 시스템이 동작을 멈춘다는 뜻은 아닙니다. ONVIF는 배포된 Profile S 기반 시스템의 동작에는 영향이 없으며, 등록된 특정 software/firmware version의 적합성도 제조사가 선언을 철회하기 전까지 유지된다고 설명합니다. 다만 지원 종료의 배경이 현재 권고에 맞지 않는 username token authentication인 만큼, 새 제품이나 구현을 검토할 때는 Profile T와 TLS/HTTPS 등 필요한 보안 기능을 함께 확인해야 합니다.

접근 통제 영역에는 Profile A, C, D가 있지만 이번 네트워크 비디오 개념편에서는 다루지 않습니다.

### Profile과 Add-on

Profile은 독립적인 제품 기능을 구성할 수 있는 고정된 요구사항 집합입니다. 반면 Add-on은 특정 사용 사례를 추가하는 더 작은 기능 집합이며, Add-on 적합성을 주장하려면 기본적으로 하나 이상의 ONVIF Profile에도 적합해야 합니다.

Profile의 기능 집합은 하위 호환성을 위해 고정되지만 Add-on은 버전을 갖고 기술 변화에 맞게 갱신될 수 있다는 차이도 있습니다.

## 10. ONVIF Profile과 Media Profile은 다르다

ONVIF 문서를 읽을 때 가장 헷갈리기 쉬운 용어가 Profile입니다. 다음 두 Profile은 이름만 같을 뿐 역할이 다릅니다.

| 용어 | 의미 | 예시 |
| --- | --- | --- |
| ONVIF Profile | 제품 간 기능 호환성을 정의한 요구사항 집합 | Profile S, T, G, M |
| Media Profile | 한 Device 안에서 stream 구성을 묶은 설정 단위 | video source, encoder, audio, PTZ, analytics configuration의 조합 |

Media Profile에는 video source와 encoder, audio, PTZ, analytics, metadata configuration 등이 장치 capability에 따라 연결됩니다. Client는 `GetProfiles`로 이 목록을 받고, 특정 Media Profile의 token을 `GetStreamUri`에 전달해 해당 구성의 stream URI를 요청합니다.

예를 들어 하나의 카메라가 다음 Media Profile을 제공할 수 있습니다.

- 고해상도 main stream용 Media Profile
- 낮은 bitrate의 sub stream용 Media Profile
- metadata와 analytics configuration이 포함된 Media Profile

이 Media Profile들이 존재한다고 해서 제품이 ONVIF Profile T나 M에 적합하다는 뜻은 아닙니다. 제품 적합성 Profile과 장치 내부의 stream configuration을 반드시 구분해야 합니다.

## 11. “ONVIF 지원”을 볼 때 확인할 것

제품 또는 소프트웨어의 ONVIF 지원 여부를 판단할 때는 다음 순서로 보는 편이 좋습니다.

1. Device인지 Client인지 구분합니다.
2. 지원한다고 명시한 ONVIF Profile을 확인합니다.
3. ONVIF Conformant Products 목록에서 정확한 제품을 확인합니다.
4. 필요한 기능이 해당 Profile에서 필수인지 조건부인지 확인합니다.
5. 실제 환경에서는 장치 검색, 인증, Service 조회, stream 연결을 각각 검증합니다.

“ONVIF compatible”이라는 제조사의 표현과 공식 Profile conformant product는 같은 의미로 단정할 수 없습니다. ONVIF 공식 설명에 따르면 Profile 적합성을 주장하려는 제품은 ONVIF test tool을 통과해야 하며, 회원사가 정해진 적합성 절차에 따라 등록합니다.

또한 ONVIF Profile 적합 제품끼리라도 모든 조합과 제조사 고유 기능이 동일하게 동작한다고 보장되는 것은 아닙니다. Profile이 정의한 범위와 실제 필요한 기능의 교집합을 확인해야 합니다.

## 12. 정리

- ONVIF는 IP 카메라 영상만을 위한 단일 streaming protocol이 아니라, IP 기반 물리 보안 제품의 상호 운용을 위한 network interface specification 모음입니다.
- Device는 Service를 제공하고 Client는 정해진 Web Service 연산으로 이를 요청합니다.
- WS-Discovery는 Device를 찾고, SOAP/WSDL 기반 Service는 장치와 미디어를 설정합니다.
- RTSP는 streaming session을 제어하고, 실제 media는 주로 RTP로 전달됩니다.
- ONVIF Profile은 제품의 기능 호환 범위를 나타내며, Media Profile은 Device 내부의 stream configuration 묶음입니다.
- ONVIF 적합성은 제품 품질이나 시스템 전체의 보안을 보장하지 않습니다.

다음 글에서는 이 구조의 첫 단계인 WS-Discovery를 직접 전송하고, `ProbeMatch` 응답에서 Device Service 주소를 확인해 보겠습니다.

## 참고 자료

- [ONVIF - Our Mission](https://www.onvif.org/about/mission/)
- [ONVIF Core Specification v26.06](https://www.onvif.org/specs/core/ONVIF-Core-Specification.pdf)
- [ONVIF Network Interface Specifications](https://www.onvif.org/profiles-specifications-new/)
- [ONVIF Profiles, Add-ons and Specifications](https://www.onvif.org/profiles-add-ons-specifications/)
- [ONVIF Profiles](https://www.onvif.org/profiles/)
- [ONVIF Profile S](https://www.onvif.org/profiles/profile-s/)
- [ONVIF Profile S Deprecation Q&A](https://www.onvif.org/profiles/profile-s/profile-s-deprecation-qna/)
- [ONVIF Profile T](https://www.onvif.org/profiles/profile-t/)
- [ONVIF Profile G](https://www.onvif.org/profiles/profile-g/)
- [ONVIF Profile M](https://www.onvif.org/profiles/profile-m/)
- [ONVIF Media Service Specification](https://www.onvif.org/specs/srv/media/ONVIF-Media-Service-Spec.pdf)
- [ONVIF Streaming Specification v26.06](https://www.onvif.org/specs/stream/ONVIF-Streaming-Spec.pdf)
- [OASIS WS-Discovery 1.1](https://docs.oasis-open.org/ws-dd/discovery/1.1/os/wsdd-discovery-1.1-spec-os.html)
