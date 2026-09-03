---
title: "[ONVIF] 03. Device/Media Service를 호출해 스트림 URI 얻기"
published: 2026-09-01
description: "Device Service의 GetServices로 Media Service endpoint를 확인하고, GetProfiles와 GetStreamUri를 호출해 RTSP 스트림 URI를 얻는 흐름을 정리합니다."
image: ""
tags: [ONVIF, Network, IP Camera, SOAP, RTSP, Media Service]
category: "Protocol & Security"
draft: false
---

안녕하세요, pingu52입니다.

[2편](/posts/embedded-system/protocol-security/onvif-ws-discovery/)에서는 WS-Discovery의 `ProbeMatches`에서 Device Service의 `XAddrs`를 얻는 단계까지 살펴봤습니다. 이번 글에서는 그 주소를 시작점으로 `GetServices`, `GetProfiles`, `GetStreamUri`를 차례로 호출해 RTSP 스트림 URI를 얻는 흐름을 정리합니다.

이번에는 기존 시험 기록에서 다음 근거를 확인할 수 있었습니다.

- 원문으로 남아 있는 Device Service의 `GetServices` 요청
- 별도 시험 결과에 기록된 Media Service 주소 확인, Media Profile 조회, `GetStreamUri` 성공
- 한 RTP multicast/UDP 시험에서 RTSP `DESCRIBE`, `SETUP`, `PLAY` 단계는 통과했지만 뒤이은 frame 수신은 실패한 결과

다만 `GetServicesResponse`, `GetProfilesResponse`, `GetStreamUriResponse`의 SOAP 원문은 보존되지 않았습니다. `GetProfiles`와 `GetStreamUri`는 시험 도구의 송수신 성공 기록으로 확인한 결과입니다.

:::note
이 글에서 시험 기록으로 확인한 결과와 공식 명세를 구분합니다. 아래 SOAP 응답 XML은 보존된 패킷을 옮긴 것이 아니라 **ONVIF 공식 WSDL을 기준으로 단순화한 예제**입니다. 주소와 token도 문서용 값으로 바꿨습니다.
:::

## 시리즈 구성

- [1편: ONVIF의 역할과 전체 구조 이해하기](/posts/embedded-system/protocol-security/onvif-introduction/)
- [2편: WS-Discovery로 같은 네트워크의 ONVIF 장치 찾기](/posts/embedded-system/protocol-security/onvif-ws-discovery/)
- 3편: Device/Media Service를 호출해 스트림 URI 얻기 — 현재 글
- 4편: RTSP 세션과 RTP frame 수신 경계 확인하기

## 1. 이번 글의 완료 조건

전체 흐름부터 단순화하면 다음과 같습니다.

```text
Device Service XAddr
        |
        | GetServices
        v
Media 또는 Media2 Service XAddr
        |
        | GetProfiles
        v
Media Profile + profile token
        |
        | GetStreamUri
        v
RTSP stream URI
        |
        | DESCRIBE -> SETUP -> PLAY
        v
RTP/RTCP media packets
```

이번 글의 완료 조건은 **장치가 반환한 RTSP URI를 얻는 것**까지입니다. URI를 얻는 순간 영상 전송이 시작되는 것은 아닙니다. 그 뒤에는 별도의 RTSP 세션 설정과 RTP/RTCP 수신, codec 처리 과정이 남아 있습니다.

단계마다 확인할 수 있는 사실도 다릅니다.

| 성공한 단계 | 확인할 수 있는 사실 | 아직 확인하지 못한 것 |
| --- | --- | --- |
| `GetServices` | 장치가 제공하는 Service와 endpoint | Media Profile과 stream URI |
| `GetProfiles` | profile token, 그리고 Media1 또는 Media2의 `Type` 요청에 따라 반환된 configuration | 해당 profile의 RTSP 접속 성공 |
| `GetStreamUri` | 선택한 profile과 전송 방식에 사용할 URI | RTSP 인증, SDP, RTP frame 수신 |
| RTSP `PLAY` | RTSP 제어 세션의 재생 요청 수락 | 실제 media packet 도착과 decode 성공 |

이 경계를 지켜야 “URI는 받았는데 영상이 나오지 않는다”는 문제를 SOAP, RTSP, RTP 중 어느 계층에서 조사할지 결정할 수 있습니다.

## 2. Device Service와 Media Service는 다른 endpoint다

WS-Discovery가 돌려준 `XAddrs`는 Device Service의 주소입니다. 이 주소는 장치 관리의 진입점이지, 모든 ONVIF 요청을 보내는 공용 주소가 아닙니다.

```text
http://192.0.2.10/onvif/device_service
```

Device Service의 `GetServices`는 장치가 제공하는 Service를 namespace, endpoint, version과 함께 반환합니다. `IncludeCapability`는 필수 boolean이며, Service 목록만 먼저 확인하려면 `false`로 요청할 수 있습니다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body>
    <tds:GetServices>
      <tds:IncludeCapability>false</tds:IncludeCapability>
    </tds:GetServices>
  </s:Body>
</s:Envelope>
```

SOAP action은 다음과 같습니다.

```text
http://www.onvif.org/ver10/device/wsdl/GetServices
```

다음은 Media1 Service 한 항목만 남긴 축약 응답 예제입니다.

```xml
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
  xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <tds:GetServicesResponse>
      <tds:Service>
        <tds:Namespace>http://www.onvif.org/ver10/media/wsdl</tds:Namespace>
        <tds:XAddr>http://192.0.2.10/onvif/media_service</tds:XAddr>
        <tds:Version>
          <tt:Major>21</tt:Major>
          <tt:Minor>6</tt:Minor>
        </tds:Version>
      </tds:Service>
    </tds:GetServicesResponse>
  </s:Body>
</s:Envelope>
```

`Version`은 ONVIF Core 전체의 버전이 아니라 해당 Service 명세의 버전입니다. 위 숫자는 응답 구조를 보여 주기 위한 문서용 값이며 실제 장치의 응답값이 아닙니다.

중요한 값은 `Namespace`와 `XAddr`입니다.

- `Namespace`로 Media1과 Media2를 구분합니다.
- 다음 SOAP 요청은 Device Service가 아니라 반환된 Media Service `XAddr`로 보냅니다.
- `/onvif/media_service` 같은 경로를 Client가 추측하거나 고정하지 않습니다.
- scheme, host, port, path를 나눠 재조립하지 말고 장치가 돌려준 URI를 endpoint로 사용합니다.

기존 시험 기록의 `GetServices` 요청도 `IncludeCapability=false`였고, 응답 원문은 남아 있지 않아 성공까지 확인한 것은 아닙니다.

:::note
`GetCapabilities`로도 과거 ONVIF Service의 주소를 얻을 수 있지만 하위 호환을 위한 인터페이스입니다. 임의의 namespace를 가진 새 Service까지 열거하려면 `GetServices`를 사용하는 편이 적합합니다.
:::

## 3. Media1과 Media2를 먼저 구분한다

ONVIF에는 Media1과 Media2 Service가 있습니다. 이름이 비슷하지만 namespace와 요청 구조가 다릅니다.

| 구분 | Media1 | Media2 |
| --- | --- | --- |
| namespace | `http://www.onvif.org/ver10/media/wsdl` | `http://www.onvif.org/ver20/media/wsdl` |
| `GetProfiles` | 빈 요청으로 전체 profile과 configuration 반환 | `Token`, `Type`을 선택적으로 지정 |
| `GetStreamUri` 입력 | `StreamSetup` + `ProfileToken` | `Protocol` + `ProfileToken` |
| `GetStreamUri` 출력 | `MediaUri` 구조 | `Uri` 하나 |

이번 시험 기록에서 성공한 흐름은 **Media1**이었습니다. 따라서 본문의 실제 호출 순서는 Media1을 기준으로 설명하고, Media2는 6절에서 공식 WSDL 기준 차이만 따로 정리합니다.

다음과 같이 섞어 쓰면 안 됩니다.

- Media1 endpoint에 Media2 namespace의 body 전송
- Media1에서 받은 token이 Media2에서도 같을 것이라고 가정
- Media1의 `StreamSetup` 구조를 Media2 요청에 사용
- Media2의 `Protocol` 값 규칙을 Media1의 `tt:Protocol`에 그대로 적용

항상 `GetServices`에서 선택한 namespace와 같은 WSDL의 요청·응답 형식을 끝까지 사용해야 합니다.

## 4. GetProfiles로 profile token 얻기

Media Profile은 영상 source, encoder, audio, metadata와 같은 media configuration을 묶는 단위입니다. 스트림 URI를 요청할 때는 그 Profile을 가리키는 **profile token**이 필요합니다.

Media1의 `GetProfiles` 요청 body에는 별도 입력값이 없습니다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <s:Body>
    <trt:GetProfiles />
  </s:Body>
</s:Envelope>
```

SOAP action은 다음과 같습니다.

```text
http://www.onvif.org/ver10/media/wsdl/GetProfiles
```

응답에는 `trt:Profiles`가 0개 이상 들어옵니다. 각 항목의 `token` 속성이 다음 요청에 사용할 ProfileToken입니다.

```xml
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
  xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <trt:GetProfilesResponse>
      <trt:Profiles token="profile-token-1" fixed="true">
        <tt:Name>Main Stream</tt:Name>
        <!-- VideoSourceConfiguration, VideoEncoderConfiguration 등은 생략 -->
      </trt:Profiles>
      <trt:Profiles token="profile-token-2" fixed="true">
        <tt:Name>Sub Stream</tt:Name>
        <!-- 연결된 configuration은 생략 -->
      </trt:Profiles>
    </trt:GetProfilesResponse>
  </s:Body>
</s:Envelope>
```

`profile-token-1`은 문서용 값입니다. 실제 token은 장치가 정하는 opaque identifier이므로 문자열의 모양에 의미를 부여하지 않습니다.

Profile을 선택할 때도 배열의 첫 번째 항목이나 token 이름만 보고 main/sub stream을 추정하면 안 됩니다. 실제 응답에서 다음과 같은 configuration을 읽어 목적에 맞는 Profile을 골라야 합니다.

- `VideoEncoderConfiguration`의 codec과 해상도
- bitrate, frame rate와 encoding interval
- audio와 metadata configuration의 연결 여부
- multicast configuration이 필요한 경우 그 설정 유무

또한 **ONVIF Profile S·T·G**와 여기서 말하는 **Media Profile**은 다른 개념입니다. 전자는 제품의 적합성 기능 묶음이고, 후자는 한 장치 안의 stream configuration 묶음입니다. `VideoEncoderConfiguration` 자체의 token도 ProfileToken과 다른 식별자입니다.

기존 시험 기록에서는 Media Profile 조회가 성공했고 여러 Profile을 순회한 사실도 확인했습니다. 다만 SOAP 응답 원문은 남아 있지 않습니다.

## 5. GetStreamUri로 RTSP URI 얻기

선택한 ProfileToken을 Media1의 `GetStreamUri`에 넣습니다. 다음 XML은 호출 구조를 설명하기 위해 RTP를 RTSP/TCP interleaved 방식으로 요청하는 예제입니다. 보존된 실제 시험은 이 예제와 다른 `RTP-Multicast`와 `UDP` 조합이었습니다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
  xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <trt:GetStreamUri>
      <trt:StreamSetup>
        <tt:Stream>RTP-Unicast</tt:Stream>
        <tt:Transport>
          <tt:Protocol>RTSP</tt:Protocol>
        </tt:Transport>
      </trt:StreamSetup>
      <trt:ProfileToken>profile-token-1</trt:ProfileToken>
    </trt:GetStreamUri>
  </s:Body>
</s:Envelope>
```

SOAP action은 다음과 같습니다.

```text
http://www.onvif.org/ver10/media/wsdl/GetStreamUri
```

Media1의 `StreamSetup` 조합은 다음처럼 읽습니다.

| `tt:Stream` | `tt:Protocol` | 의미 |
| --- | --- | --- |
| `RTP-Unicast` | `UDP` | RTP over UDP unicast |
| `RTP-Unicast` | `RTSP` | RTP interleaved over RTSP/TCP |
| `RTP-Unicast` | `HTTP` | RTSP와 RTP를 HTTP/TCP로 tunnel |
| `RTP-Multicast` | `UDP` | RTP over UDP multicast |

`tt:Stream`의 정확한 XSD 값은 underscore가 아니라 hyphen을 사용한 `RTP-Unicast`입니다. `tt:Protocol`의 `TCP` 값은 deprecated이므로 RTSP/TCP를 요청할 때는 `RTSP`를 사용합니다.

다음은 명세를 단순화한 응답 예제입니다.

```xml
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
  xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <trt:GetStreamUriResponse>
      <trt:MediaUri>
        <tt:Uri>rtsp://192.0.2.10:554/stream/profile-token-1</tt:Uri>
        <tt:InvalidAfterConnect>false</tt:InvalidAfterConnect>
        <tt:InvalidAfterReboot>false</tt:InvalidAfterReboot>
        <tt:Timeout>PT0S</tt:Timeout>
      </trt:MediaUri>
    </trt:GetStreamUriResponse>
  </s:Body>
</s:Envelope>
```

Media1 명세에서 세 수명 필드는 `false`, `false`, `PT0S`로 설정됩니다. 여기서 `PT0S`는 “0초 뒤 즉시 만료”가 아니라 이 stream URI가 무기한 유효함을 나타내는 ONVIF의 정의입니다. 첫 연결, 재부팅, 시간 경과, Profile 변경만을 이유로 URI를 무효화하지 않는다는 의미이며, Profile 삭제나 factory reset, 장치 주소 변경 뒤에도 같은 URI가 유지된다고 확대할 수는 없습니다. URI 수명과 RTSP 세션의 keep-alive timeout도 서로 다른 값입니다.

URI의 path 역시 장치별 구현입니다. 예제처럼 token이 그대로 들어간다고 가정해 URI를 조립하지 말고, `tt:Uri`의 반환값 전체를 opaque URI로 취급해야 합니다.

## 6. Media2에서는 XML 구조가 달라진다

Media2 Service를 반환한 장치라면 namespace를 `tr2`로 바꾸는 데서 끝나지 않습니다.

Media2의 빈 `GetProfiles`는 모든 Profile의 이름과 token을 반환하지만 configuration 정보는 포함하지 않습니다.

```xml
<tr2:GetProfiles
  xmlns:tr2="http://www.onvif.org/ver20/media/wsdl" />
```

이 연산의 SOAP action은 `http://www.onvif.org/ver20/media/wsdl/GetProfiles`입니다.

전체 configuration까지 필요하다면 `Type`에 `All`을 넣을 수 있습니다.

```xml
<tr2:GetProfiles
  xmlns:tr2="http://www.onvif.org/ver20/media/wsdl">
  <tr2:Type>All</tr2:Type>
</tr2:GetProfiles>
```

특정 token만 조회하려면 선택적인 `Token`을, video encoder 정보만 필요하면 `Type`에 `VideoEncoder`를 사용할 수 있습니다.

Media2의 `GetStreamUri`에는 Media1의 `StreamSetup` 대신 `Protocol` 문자열이 들어갑니다.

```xml
<tr2:GetStreamUri
  xmlns:tr2="http://www.onvif.org/ver20/media/wsdl">
  <tr2:Protocol>RTSP</tr2:Protocol>
  <tr2:ProfileToken>profile-token-1</tr2:ProfileToken>
</tr2:GetStreamUri>
```

응답도 `MediaUri` 구조가 아니라 `Uri` 하나입니다.

```xml
<tr2:GetStreamUriResponse
  xmlns:tr2="http://www.onvif.org/ver20/media/wsdl">
  <tr2:Uri>rtsp://192.0.2.10:554/stream/profile-token-1</tr2:Uri>
</tr2:GetStreamUriResponse>
```

`GetStreamUri`의 SOAP action은 `http://www.onvif.org/ver20/media/wsdl/GetStreamUri`입니다. Media2 응답에는 Media1의 `InvalidAfterConnect`, `InvalidAfterReboot`, `Timeout` 필드가 없으며, Media2 명세에도 reboot flag가 없습니다.

Media2의 protocol 값은 대소문자를 구분합니다.

| 값 | 전송 방식 |
| --- | --- |
| `RtspUnicast` | RTSP로 제어하는 RTP/UDP unicast |
| `RtspMulticast` | RTSP로 제어하는 RTP/UDP multicast |
| `RtspsUnicast` | RTSPS와 SRTP를 사용하는 unicast |
| `RtspsMulticast` | RTSPS와 SRTP를 사용하는 multicast |
| `RTSP` | RTP over RTSP/TCP |
| `RtspOverHttp` | RTSP와 RTP의 HTTP(S) tunnel |

이번 기록에서는 Media2의 성공한 SOAP/URI 흐름을 확인하지 못했습니다. 이 절은 Media2 26.06 명세와 WSDL을 비교해 정리한 내용이며, 실측 결과로 확대해서 해석하지 않습니다.

## 7. curl로 SOAP 요청 확인하기

앞의 요청 XML을 각각 `get-services.xml`, `get-profiles.xml`, `get-stream-uri.xml`로 저장했다면 다음 형태로 요청할 수 있습니다. `MEDIA_XADDR`에는 경로를 추측해 넣지 말고 첫 요청의 실제 응답에서 Media1 namespace와 함께 온 `XAddr`를 사용합니다.

```bash
soap_post() {
  endpoint=$1
  action=$2
  request_file=$3

  curl --fail-with-body --silent --show-error \
    --header "Content-Type: application/soap+xml; charset=utf-8; action=\"${action}\"" \
    --data-binary "@${request_file}" \
    "${endpoint}"
}

DEVICE_XADDR='REPLACE_WITH_DISCOVERED_DEVICE_XADDR'
MEDIA_XADDR='REPLACE_WITH_GETSERVICES_MEDIA_XADDR'

soap_post \
  "${DEVICE_XADDR}" \
  'http://www.onvif.org/ver10/device/wsdl/GetServices' \
  get-services.xml > get-services-response.xml

soap_post \
  "${MEDIA_XADDR}" \
  'http://www.onvif.org/ver10/media/wsdl/GetProfiles' \
  get-profiles.xml > get-profiles-response.xml

soap_post \
  "${MEDIA_XADDR}" \
  'http://www.onvif.org/ver10/media/wsdl/GetStreamUri' \
  get-stream-uri.xml > get-stream-uri-response.xml
```

이 명령은 SOAP body와 endpoint를 확인하기 위한 최소 예제이며 인증 처리는 생략했습니다. Device Service의 `GetServices`는 `PRE_AUTH` access class이므로 인증을 요구하지 않는 것이 표준 흐름입니다. 이 요청 자체가 `401`이나 `403`을 반환한다면 이를 정상적인 Digest challenge라고 일반화하지 말고 장치별 access policy, 구현과 중간 proxy를 확인해야 합니다.

반면 Media Service의 `GetProfiles`와 `GetStreamUri`는 `READ_MEDIA` access class입니다. 보호된 Media 요청에서는 첫 `401`의 `WWW-Authenticate` challenge를 받은 뒤 HTTP Digest 인증값과 함께 재요청하는 과정이 정상일 수 있습니다. Core 26.06은 HTTP Digest를 기본으로 하며, legacy WS-Security UsernameToken을 사용하는 구현이라면 `Nonce`와 `Created`를 포함하고 Client와 Device의 시간 차이도 확인해야 합니다.

SOAP 인증에 성공했다고 RTSP 인증까지 끝난 것은 아닙니다. 반환된 URI에 접근할 때는 RTSP 계층의 인증을 별도로 처리해야 합니다.

:::warning
암호를 명령행 인수, XML 파일, shell history에 직접 남기지 마세요. `Authorization`, WS-Security `UsernameToken`, nonce와 digest 값, 실제 stream URI도 로그를 공유하기 전에 삭제하거나 치환해야 합니다.
:::

## 8. GetStreamUri 성공은 영상 재생 성공이 아니다

한 multicast/UDP 시험 기록에서 가장 분명하게 확인된 부분입니다.

1. Media Service 주소 확인이 성공했습니다.
2. Media Profile 조회가 성공했습니다.
3. `GetStreamUri`가 성공하고 RTSP URI가 반환됐습니다.
4. 그 URI에 대한 RTSP `DESCRIBE`, `SETUP`, `PLAY` 단계가 모두 통과했고, 보존된 `PLAY` 응답은 `200 OK`였습니다.
5. 하지만 다음 media frame 수신 단계에서는 frame을 받지 못했습니다.

즉 SOAP 제어 흐름과 RTSP 제어 흐름이 성공해도 RTP 데이터가 실제로 도착했다고 말할 수 없습니다.

```text
GetStreamUri PASS
      !=
RTSP session PASS
      !=
RTP packets received
      !=
frames decoded and displayed
```

이 결과는 해당 실행의 실패 경계를 좁히는 근거입니다. 이후 별도 환경에서는 관련 시험이 통과했으므로 장치가 계속 같은 상태였다고 해석해서도 안 됩니다. `GetStreamUri`까지 성공했다면 처음부터 Discovery나 SOAP parsing만 다시 볼 것이 아니라 그 다음 계층을 조사해야 하며, 구체적인 RTSP/RTP 진단은 4편으로 분리합니다.

## 9. 단계별 실패 지점 찾기

| 관찰 결과 | 먼저 확인할 것 |
| --- | --- |
| `GetServices`가 `401` 또는 `403` | `PRE_AUTH` 동작과 어긋나므로 장치별 access policy, 구현과 중간 proxy 확인 |
| `GetProfiles` 또는 `GetStreamUri`가 `401` 또는 `403` | `WWW-Authenticate` challenge, Digest·UsernameToken 방식, 권한과 장치 시간 |
| Device Service는 되지만 Media Service 연결 실패 | 반환된 `XAddr`를 그대로 사용했는지, scheme·port·path와 TLS |
| `GetProfiles`가 SOAP Fault | Media1/Media2 endpoint와 namespace를 섞지 않았는지 |
| Profile이 0개 | 장치의 media configuration 상태와 해당 Service 지원 범위 |
| `GetStreamUri`가 Profile 관련 Fault | 다른 Service의 token, 오래된 token, configuration token을 넣지 않았는지 |
| stream setup 관련 Fault | 장치가 요청한 unicast/multicast와 transport 조합을 지원하는지 |

Service endpoint, token, URI를 임의로 수정하면 일시적으로 증상이 달라질 수는 있지만 원인을 숨길 수 있습니다. 장치가 반환한 값을 먼저 보존하고, 수정은 routing이나 잘못된 address advertisement를 확인하기 위한 진단 실험으로만 분리하는 편이 좋습니다.

암호화되지 않은 HTTP를 사용한다면 Wireshark에서 다음처럼 SOAP POST를 먼저 찾을 수 있습니다.

```text
http.request.method == "POST"
```

Device Service 경로는 알려져 있지만 Media Service 경로는 장치가 반환하므로, 처음부터 URI 문자열 하나로 너무 좁게 필터링하지 않는 편이 좋습니다. HTTPS에서는 endpoint 이후의 header와 SOAP body가 TLS 안에 있으므로 복호화 정보가 없다면 같은 방식으로 내용을 확인할 수 없습니다.

## 10. 보안과 기록 정리

Service를 호출하고 stream URI를 저장할 때는 다음 정보를 민감하게 다뤄야 합니다.

- 실제 장치의 내부 IP, hostname과 port
- ONVIF 사용자 이름과 암호
- HTTP `Authorization`과 Digest의 realm, nonce, response, opaque
- WS-Security `UsernameToken`, `Nonce`, `Created`
- 실제 Media Profile과 configuration token
- 인증 정보나 session parameter가 포함될 수 있는 stream URI

가능하다면 장치가 지원하는 HTTPS endpoint와 검증 가능한 인증서를 사용합니다. SOAP을 HTTPS로 보호했더라도 반환된 URI가 `rtsp://`라면 이후 RTSP/RTP 구간의 보호 수준은 별도로 검토해야 합니다. Media2의 `Rtsps*` 지원 여부도 장치 capability와 Profile 요구사항을 기준으로 확인해야 합니다.

이 글의 `192.0.2.10`은 RFC 5737의 문서용 TEST-NET 주소입니다. 실제 endpoint, token, 인증값을 옮긴 것이 아닙니다.

## 11. 정리

- Media 요청은 경로를 추측하지 않고 `GetServices`가 반환한 `XAddr`로 보냅니다.
- Media1의 `GetProfiles` 응답에서 ProfileToken을 얻고, token 이름이나 순서가 아니라 연결된 configuration을 보고 stream을 선택합니다.
- Media1과 Media2는 namespace뿐 아니라 `GetProfiles`, `GetStreamUri`의 XML 구조와 protocol 값도 다릅니다.
- ProfileToken과 stream URI는 장치가 반환한 값을 그대로 사용하며, Client가 token이나 URI path를 조립하지 않습니다.
- `GetStreamUri` 성공은 영상 재생 성공이 아닙니다. 8절의 multicast/UDP 시험에서는 RTSP `PLAY`까지 통과하고도 frame 수신은 실패했습니다.

다음 글에서는 반환된 URI로 RTSP `DESCRIBE`, `SETUP`, `PLAY`를 수행하고, RTP packet과 실제 frame 수신을 구분해 확인하겠습니다.

## 참고 자료

- [ONVIF Core Specification v26.06](https://www.onvif.org/specs/2606/ONVIF-Core-Spec-v2606.pdf)
- [ONVIF Device Management WSDL](https://www.onvif.org/ver10/device/wsdl/devicemgmt.wsdl)
- [ONVIF Media Service Specification v24.12](https://www.onvif.org/specs/2412/ONVIF-Media-Service-Spec-v2412.pdf)
- [ONVIF Media Service WSDL](https://www.onvif.org/ver10/media/wsdl/media.wsdl)
- [ONVIF Media2 Service Specification v26.06](https://www.onvif.org/specs/2606/ONVIF-Media2-Service-Spec-v2606.pdf)
- [ONVIF Media2 Service WSDL](https://www.onvif.org/ver20/media/wsdl/media.wsdl)
- [ONVIF Streaming Specification v26.06](https://www.onvif.org/specs/2606/ONVIF-Streaming-Spec-v2606.pdf)
- [ONVIF XML Schema](https://www.onvif.org/ver10/schema/onvif.xsd)
- [RFC 5737 - IPv4 Address Blocks Reserved for Documentation](https://www.rfc-editor.org/rfc/rfc5737.html)
