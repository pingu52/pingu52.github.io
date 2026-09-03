---
title: "[ONVIF] 02. WS-Discovery로 같은 네트워크의 ONVIF 장치 찾기"
published: 2026-08-31
description: "ONVIF Core 26.06을 기준으로 Probe와 ProbeMatches, XAddrs의 관계를 정리하고 Python과 Wireshark로 장치 발견 트래픽을 확인하는 방법을 살펴봅니다."
image: ""
tags: [ONVIF, Network, IP Camera, WS-Discovery, SOAP, Wireshark]
category: "Protocol & Security"
draft: false
---

안녕하세요, pingu52입니다.

[1편](/posts/embedded-system/protocol-security/onvif-introduction/)에서는 ONVIF 장치를 찾고 스트림을 받기까지의 전체 구조를 살펴봤습니다. 이번 글에서는 그 첫 단계인 **WS-Discovery**만 떼어 Probe를 보낼 수 있는 코드와 Wireshark 확인 방법을 정리합니다.

이번 글을 준비하면서 기존 ONVIF 작업 기록도 다시 살펴봤습니다. 기록으로 확인할 수 있었던 것은 이미 알고 있는 Device Service 주소로 보낸 SOAP 요청이었고, `Probe`와 `ProbeMatches`를 함께 확인한 패킷 캡처는 남아 있지 않았습니다.

다음 HTTP 요청을 봤다는 사실만으로는 WS-Discovery가 수행됐다고 말할 수 없습니다.

```http
POST /onvif/device_service HTTP/1.1
```

클라이언트가 주소를 미리 설정했거나 캐시에 저장해 두었을 수도 있고, Discovery가 끝난 뒤 캡처를 시작했을 수도 있기 때문입니다.

:::note
기존 기록에서 확인한 사실은 **알고 있는 endpoint로 Device Service를 호출한 단계**까지입니다. 이 글의 Probe와 ProbeMatches XML, Python 코드는 ONVIF 공식 명세 기반 학습용 예제이며, 실제 장치를 대상으로 `Probe`를 송신하거나 응답을 캡처한 결과는 포함하지 않습니다.
:::

## 시리즈 구성

- [1편: ONVIF의 역할과 전체 구조 이해하기](/posts/embedded-system/protocol-security/onvif-introduction/)
- 2편: WS-Discovery로 같은 네트워크의 ONVIF 장치 찾기 — 현재 글
- [3편: Device/Media Service를 호출해 스트림 URI 얻기](/posts/embedded-system/protocol-security/onvif-device-media-stream-uri/)
- 4편: RTSP 세션과 RTP frame 수신 경계 확인하기

## 1. 어디까지가 장치 발견인가

일반적인 IPv4 로컬 네트워크의 active discovery 흐름을 먼저 단순화하면 다음과 같습니다.

```text
Client                                            ONVIF Device
  |                                                     |
  | -- Probe (SOAP/UDP multicast) --------------------> |
  |    239.255.255.250:3702                             |
  |                                                     |
  | <- ProbeMatches (SOAP/UDP unicast) ---------------- |
  |    RelatesTo + ProbeMatch { XAddrs, ... }           |
  |                                                     |
  | -- SOAP/HTTP(S) POST to returned XAddr -----------> |
  |    <scheme>://<host>[:port]/onvif/device_service    |
```

1. 클라이언트는 `Probe`를 IPv4 multicast로 보냅니다.
2. 조건에 맞는 장치는 `ProbeMatches`로 클라이언트에 unicast 응답합니다.
3. `XAddrs`는 별도 메시지가 아니라 `ProbeMatches` 안에 들어 있는 Device Service 주소 필드입니다.

따라서 흐름을 `Probe → ProbeMatches → XAddrs`라고 축약해 말할 수는 있지만, `XAddrs`라는 세 번째 패킷이 오는 것은 아닙니다.

또 하나 주의할 점은 두 단계 모두 SOAP 메시지라는 것입니다.

| 구간 | 메시지 | 전송 |
| --- | --- | --- |
| 장치 발견 | `Probe`, `ProbeMatches` | SOAP over UDP |
| 장치 관리 | `GetServices`, `GetDeviceInformation` 등 | SOAP over HTTP 또는 HTTPS |

“Discovery가 끝난 뒤 SOAP이 시작된다”기보다는, **SOAP 메시지의 목적과 전송 방식이 바뀐다**고 이해하는 편이 정확합니다.

## 2. ONVIF는 어느 WS-Discovery 버전을 사용하는가

여기서 한 번 버전을 짚고 넘어가야 합니다.

2026년 6월에 공개된 ONVIF Core 26.06은 OASIS WS-Discovery 1.1의 2009년 namespace가 아니라, **2005년 4월 XMLSOAP WS-Discovery**를 규범 참조합니다.

ONVIF Discovery 메시지에서 사용하는 주요 namespace는 다음과 같습니다.

| 용도 | namespace |
| --- | --- |
| SOAP 1.2 | `http://www.w3.org/2003/05/soap-envelope` |
| WS-Addressing | `http://schemas.xmlsoap.org/ws/2004/08/addressing` |
| WS-Discovery | `http://schemas.xmlsoap.org/ws/2005/04/discovery` |
| ONVIF Device WSDL | `http://www.onvif.org/ver10/device/wsdl` |

인터넷에서 찾은 예제에 다음 namespace가 있다면 OASIS WS-Discovery 1.1 예제일 가능성이 큽니다.

```text
http://docs.oasis-open.org/ws-dd/ns/discovery/2009/01
```

메시지 구조가 비슷해 보여도 ONVIF 예제에 그대로 섞어 쓰면 장치가 요청을 인식하지 못할 수 있습니다. 이번 글의 XML은 ONVIF Core 26.06이 참조하는 2005년 namespace로 통일합니다.

## 3. Probe는 어디로 전송하는가

WS-Discovery의 IPv4 multicast 목적지는 다음과 같습니다.

```text
239.255.255.250:3702/UDP
```

IPv6에서는 link-local multicast 주소 `FF02::C`와 UDP 3702를 사용하지만, 이번 글의 실습 범위는 IPv4로 한정합니다.

`239.255.255.250`은 broadcast 주소가 아니라 multicast 주소입니다. 따라서 다음 상황에서는 일반 IP 통신이 되더라도 자동 검색만 실패할 수 있습니다.

- 잘못된 네트워크 인터페이스로 Probe를 보낸 경우
- 장치나 클라이언트의 방화벽이 UDP 3702를 차단한 경우
- 장치가 non-discoverable mode인 경우
- VLAN 또는 multicast routing 정책이 트래픽을 전달하지 않는 경우
- Probe의 `Types` 또는 `Scopes` 조건과 장치가 일치하지 않는 경우

ONVIF Core는 discoverable mode의 장치가 `Probe`와 `Resolve`를 수신하고 응답하도록 정의합니다. 기본 동작도 discoverable mode이지만, DoS 공격 완화를 위해 Device Service의 `SetDiscoveryMode`로 non-discoverable mode를 설정할 수 있습니다.

:::note
이 글에서 다루는 것은 일반적인 로컬 multicast discovery입니다. WS-Discovery에는 이미 주소를 알고 있을 때의 unicast Probe도 있으므로 “모든 Probe는 반드시 multicast”라고 일반화하면 안 됩니다.
:::

## 4. Probe 메시지 읽기

다음은 ONVIF 장치를 찾기 위한 Probe 예제입니다. `MessageID`는 요청마다 새 UUID로 생성해야 합니다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Header>
    <a:Action s:mustUnderstand="1">
      http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe
    </a:Action>
    <a:MessageID>urn:uuid:11111111-2222-4333-8444-555555555555</a:MessageID>
    <a:ReplyTo>
      <a:Address>
        http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous
      </a:Address>
    </a:ReplyTo>
    <a:To s:mustUnderstand="1">
      urn:schemas-xmlsoap-org:ws:2005:04:discovery
    </a:To>
  </s:Header>
  <s:Body>
    <d:Probe>
      <d:Types>tds:Device</d:Types>
    </d:Probe>
  </s:Body>
</s:Envelope>
```

주요 필드는 다음과 같습니다.

| 필드 | 의미 |
| --- | --- |
| `Action` | 이 메시지가 Discovery `Probe`임을 나타냅니다. |
| `MessageID` | 응답과 요청을 연결할 고유 ID입니다. |
| `To` | WS-Discovery의 논리적 목적지입니다. |
| `Types` | 찾으려는 service type입니다. 여기서는 ONVIF Device Service의 `tds:Device`를 지정합니다. |

이번 예제는 검색 대상을 명확히 하려고 `tds:Device`를 넣었습니다. 다만 ONVIF Base Device Test에는 `Types`와 `Scopes`를 생략한 Probe 시험도 있습니다. 이 두 필드가 모든 Probe에서 필수라는 뜻은 아닙니다.

과거 ONVIF 예제와 구형 장치의 패킷에서는 `dn:NetworkVideoTransmitter`가 보일 수도 있습니다. 현재 Core 26.06의 Device type은 `tds:Device`이므로 새 예제는 이를 기준으로 작성하되, 오래된 캡처를 분석할 때는 두 이름이 등장한 배경을 구분해야 합니다.

`Scopes`를 추가하면 장치의 location, hardware, name과 같은 범위로 결과를 좁힐 수 있습니다. 첫 확인에서는 불필요한 조건 때문에 응답을 놓치지 않도록 `Scopes` 없이 시작하는 편이 단순합니다.

## 5. ProbeMatches와 XAddrs 읽기

조건에 맞는 장치는 `ProbeMatches`를 Probe를 보낸 클라이언트의 주소와 UDP port로 unicast 전송합니다. 다음은 구조를 보기 위한 축약 예제입니다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Header>
    <a:Action>
      http://schemas.xmlsoap.org/ws/2005/04/discovery/ProbeMatches
    </a:Action>
    <a:MessageID>urn:uuid:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee</a:MessageID>
    <a:RelatesTo>urn:uuid:11111111-2222-4333-8444-555555555555</a:RelatesTo>
    <a:To>
      http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous
    </a:To>
    <d:AppSequence InstanceId="1" MessageNumber="1" />
  </s:Header>
  <s:Body>
    <d:ProbeMatches>
      <d:ProbeMatch>
        <a:EndpointReference>
          <a:Address>urn:uuid:01234567-89ab-4cde-8f01-23456789abcd</a:Address>
        </a:EndpointReference>
        <d:Types>tds:Device</d:Types>
        <d:Scopes>
          onvif://www.onvif.org/name/example-camera
        </d:Scopes>
        <d:XAddrs>
          http://192.0.2.10/onvif/device_service
          https://192.0.2.10:8443/onvif/device_service
        </d:XAddrs>
        <d:MetadataVersion>1</d:MetadataVersion>
      </d:ProbeMatch>
    </d:ProbeMatches>
  </s:Body>
</s:Envelope>
```

:::note
`192.0.2.10`은 문서 예시를 위한 TEST-NET 주소입니다. 실제 장치 주소가 아닙니다.
:::

응답에서는 다음 순서로 확인합니다.

1. `Action`이 `ProbeMatches`인지 확인합니다.
2. `RelatesTo`가 보낸 Probe의 `MessageID`와 같은지 확인합니다.
3. 각 `ProbeMatch`의 `Types`와 `Scopes`가 검색 조건에 맞는지 확인합니다.
4. `XAddrs`에서 Device Service 주소를 가져옵니다.

ONVIF Core 26.06은 일치한 Probe Match에 Device Service 주소를 담은 `XAddrs`를 포함하도록 요구합니다. 하나의 `XAddrs`에는 공백으로 구분된 여러 URI가 들어올 수 있으므로 첫 번째 문자열만 무조건 사용해서는 안 됩니다. scheme, host, port를 포함한 응답값을 기준으로 접근해야 합니다.

일반적인 WS-Discovery에는 endpoint reference만 알고 전송 주소를 모를 때 사용하는 `Resolve`와 `ResolveMatch`도 있습니다. 하지만 ONVIF는 Hello와 일치한 Probe Match에 `XAddrs`를 포함하므로 보통 별도의 Resolve 교환이 필요하지 않습니다.

## 6. Python으로 학습용 Probe 보내기

다음 코드는 Python 표준 라이브러리만 사용해 Probe를 보내고, 자신이 보낸 `MessageID`와 연결되는 `ProbeMatches`에서 `XAddrs`를 출력합니다.

```python
#!/usr/bin/env python3
import argparse
import socket
import time
import uuid
from xml.etree import ElementTree as ET

MULTICAST_ENDPOINT = ("239.255.255.250", 3702)

NS = {
    "s": "http://www.w3.org/2003/05/soap-envelope",
    "a": "http://schemas.xmlsoap.org/ws/2004/08/addressing",
    "d": "http://schemas.xmlsoap.org/ws/2005/04/discovery",
}

PROBE_ACTION = f"{NS['d']}/Probe"
PROBE_MATCHES_ACTION = f"{NS['d']}/ProbeMatches"


def build_probe(message_id: str) -> bytes:
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="{NS['s']}"
  xmlns:a="{NS['a']}"
  xmlns:d="{NS['d']}"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Header>
    <a:Action s:mustUnderstand="1">{PROBE_ACTION}</a:Action>
    <a:MessageID>{message_id}</a:MessageID>
    <a:ReplyTo>
      <a:Address>{NS['a']}/role/anonymous</a:Address>
    </a:ReplyTo>
    <a:To s:mustUnderstand="1">
      urn:schemas-xmlsoap-org:ws:2005:04:discovery
    </a:To>
  </s:Header>
  <s:Body>
    <d:Probe>
      <d:Types>tds:Device</d:Types>
    </d:Probe>
  </s:Body>
</s:Envelope>"""
    return xml.encode("utf-8")


def get_xaddrs(data: bytes, expected_message_id: str) -> list[str]:
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return []

    action = (root.findtext("./s:Header/a:Action", namespaces=NS) or "").strip()
    relates_to = (
        root.findtext("./s:Header/a:RelatesTo", namespaces=NS) or ""
    ).strip()

    if action != PROBE_MATCHES_ACTION or relates_to != expected_message_id:
        return []

    result = []
    for match in root.findall("./s:Body/d:ProbeMatches/d:ProbeMatch", NS):
        text = match.findtext("d:XAddrs", default="", namespaces=NS) or ""
        result.extend(text.split())
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "interface_ip",
        help="Probe를 보낼 로컬 네트워크 인터페이스의 IPv4 주소",
    )
    parser.add_argument("--timeout", type=float, default=3.0)
    args = parser.parse_args()

    message_id = f"urn:uuid:{uuid.uuid4()}"
    payload = build_probe(message_id)

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((args.interface_ip, 0))
        sock.setsockopt(
            socket.IPPROTO_IP,
            socket.IP_MULTICAST_IF,
            socket.inet_aton(args.interface_ip),
        )
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
        sock.settimeout(0.2)

        print(f"MessageID: {message_id}")
        print(f"Local endpoint: {sock.getsockname()}")

        # 학습용으로 같은 MessageID의 Probe를 세 번 전송합니다.
        # 적합성 구현에서는 SOAP-over-UDP의 재전송 알고리즘을 따라야 합니다.
        for delay in (0.0, 0.25, 0.5):
            if delay:
                time.sleep(delay)
            sock.sendto(payload, MULTICAST_ENDPOINT)

        deadline = time.monotonic() + args.timeout
        discovered = set()

        while time.monotonic() < deadline:
            try:
                data, peer = sock.recvfrom(65535)
            except socket.timeout:
                continue

            for xaddr in get_xaddrs(data, message_id):
                if xaddr not in discovered:
                    discovered.add(xaddr)
                    print(f"{peer[0]}:{peer[1]} -> {xaddr}")

        if not discovered:
            print("일치하는 ProbeMatches를 받지 못했습니다.")


if __name__ == "__main__":
    main()
```

먼저 장치와 통신하는 로컬 인터페이스의 IPv4 주소를 확인한 뒤 실행합니다.

```bash
ip -brief address
ip route get 239.255.255.250
python3 onvif_probe.py YOUR_LOCAL_IP
```

이 코드는 메시지 구조와 패킷 흐름을 확인하기 위한 최소 예제입니다. SOAP-over-UDP의 정확한 지연·재전송 알고리즘, IPv6, scope matching, 여러 네트워크 인터페이스, 잘못된 응답에 대한 상세 오류 처리는 생략했습니다. ONVIF 적합성을 주장하는 Client 구현으로 사용해서는 안 됩니다.

## 7. Wireshark에서 확인할 것

스크립트를 실행하기 전에 장치와 연결된 인터페이스에서 캡처를 시작합니다. 첫 필터는 다음처럼 넓게 잡는 편이 좋습니다.

```text
udp.port == 3702
```

Probe의 multicast 요청만 보고 싶다면 다음 필터로 좁힐 수 있습니다.

```text
ip.dst == 239.255.255.250 && udp.dstport == 3702
```

하지만 이 필터만 사용하면 클라이언트로 돌아오는 unicast `ProbeMatches`를 놓칠 수 있습니다. 요청의 출발지 UDP port를 확인한 뒤 해당 port까지 따라가거나, 먼저 `udp.port == 3702`에서 전체 흐름을 확인해야 합니다.

패킷에서는 다음 체크리스트를 순서대로 봅니다.

- [ ] Probe가 `239.255.255.250:3702/UDP`로 나갔는가
- [ ] SOAP `Action`이 2005년 namespace의 `/Probe`인가
- [ ] `Types`를 사용했다면 값이 의도한 조건인가
- [ ] 장치의 `ProbeMatches`가 unicast로 돌아왔는가
- [ ] `RelatesTo`가 Probe의 `MessageID`와 일치하는가
- [ ] `ProbeMatch` 안에 접근 가능한 `XAddrs`가 있는가

그 다음 Device Service 호출은 별도의 HTTP 트래픽입니다. 암호화되지 않은 HTTP라면 다음과 같이 확인할 수 있습니다.

```text
http.request.method == "POST" &&
http.request.uri contains "/onvif/device_service"
```

HTTPS를 사용하면 URI와 SOAP body는 TLS 안에서 암호화되므로 동일한 방식으로 내용을 볼 수 없습니다.

## 8. 패킷 조합으로 상태 판단하기

캡처에서 보이는 조합에 따라 문제의 범위를 나눌 수 있습니다.

| 관찰 결과 | 해석과 다음 확인 |
| --- | --- |
| Probe도 보이지 않음 | 캡처 인터페이스, 캡처 시작 시점, 클라이언트의 active discovery 수행 여부를 확인합니다. |
| Probe만 있고 응답이 없음 | 장치의 discovery mode, `Types`·`Scopes`, UDP 3702 방화벽, VLAN과 multicast 전달 경로를 확인합니다. |
| ProbeMatches는 왔지만 앱에 장치가 없음 | `MessageID`–`RelatesTo`, namespace 버전, XML parsing, `XAddrs` 선택 로직을 확인합니다. |
| XAddr는 얻었지만 Device Service 호출이 실패함 | Discovery는 완료된 상태입니다. 반환된 scheme·host·port의 연결, 인증과 TLS를 별도로 확인합니다. |
| `device_service` POST만 보임 | 주소를 미리 알았거나 캐시했을 수 있습니다. 이 패킷만으로 Discovery 수행을 증명할 수 없습니다. |

특히 마지막 행이 기존 기록을 다시 읽으며 분명해진 부분입니다. Device Service 통신이 존재한다는 사실과, 그 주소를 WS-Discovery로 방금 얻었다는 사실은 서로 다른 주장입니다.

:::warning
일반적인 ONVIF multicast discovery는 Device Service 인증 전에 장치의 endpoint와 scope 정보를 알리는 단계입니다. 자동 검색이 필요 없는 운영 환경이라면 네트워크 분리, multicast·방화벽 제한, SetDiscoveryMode를 통한 non-discoverable mode 전환을 검토해야 합니다.
:::

## 9. 정리

- 일반적인 IPv4 로컬 discovery에서 `Probe`는 `239.255.255.250:3702/UDP`로 multicast됩니다.
- 일치하는 장치는 `ProbeMatches`를 클라이언트로 unicast하며, Device Service 주소는 그 안의 `ProbeMatch`에 있는 `XAddrs`에 포함됩니다.
- `ProbeMatches`의 `RelatesTo`가 보낸 `Probe`의 `MessageID`와 일치하는지 확인해야 요청과 응답의 관계를 판단할 수 있습니다.
- ONVIF Core 26.06은 2005년 XMLSOAP WS-Discovery와 2004년 WS-Addressing namespace를 사용합니다.
- Discovery 메시지도 SOAP이지만 UDP로 전달되고, 이후 Device Service SOAP 요청은 HTTP 또는 HTTPS로 전달됩니다.
- 캡처에서 `POST /onvif/device_service`만 보인다면 WS-Discovery가 수행됐다고 단정할 수 없습니다.

다음 글에서는 `XAddrs`로 얻은 Device Service를 시작점으로 `GetServices`, Media Service의 `GetProfiles`, `GetStreamUri`를 차례로 호출해 스트림 URI를 얻는 과정을 살펴보겠습니다.

## 참고 자료

- [ONVIF Core Specification v26.06](https://www.onvif.org/specs/2606/ONVIF-Core-Spec-v2606.pdf)
- [ONVIF Network Interface Specifications](https://www.onvif.org/profiles-specifications-new/)
- [ONVIF Base Device Test Specification v26.06](https://www.onvif.org/wp-content/uploads/2026/07/ONVIF_Base_Device_Test_Specification_26.06.pdf)
- [ONVIF Device Feature Discovery Specification v26.06](https://www.onvif.org/wp-content/uploads/2026/07/ONVIF_Device_Feature_Discovery_Specification_26.06.pdf)
- [ONVIF Device Test Specifications](https://www.onvif.org/profiles/conformance/device-test-2/)
- [XMLSOAP WS-Discovery, April 2005](https://specs.xmlsoap.org/ws/2005/04/discovery/ws-discovery.pdf)
- [Microsoft Learn - Inspecting Network Traces for UDP WS-Discovery](https://learn.microsoft.com/en-us/windows/win32/wsdapi/inspecting-network-traces-for-udp-ws-discovery)
- [RFC 2365 - Administratively Scoped IP Multicast](https://www.rfc-editor.org/rfc/rfc2365.html)
