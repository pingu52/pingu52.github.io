---
title: "[ONVIF] 05. nginx 전환 후 Media Profile 오류와 인증 처리 추적"
published: 2026-10-07
description: "nginx 전환 후 ONVIF DTT에서 발생한 Media Profile 오류를 추적했다. AAC 옵션과 이전 통과본을 비교하고 GetServiceCapabilities의 PRE_AUTH 인증 처리를 확인한 기록이다."
image: ""
tags: [ONVIF, nginx, HTTP, Authentication, Debugging]
category: "Protocol & Security"
draft: false
---

Appweb에서 nginx로 웹 서버를 바꾸고 ONVIF DTT를 돌렸는데 이전에 통과하던 시험에서 실패가 나왔다. 오디오 관련 항목이 여러 개였고 오류 내용도 비슷했다.

```text
Cannot find nor create Media Profile to run the test
```

시험에 쓸 Media Profile을 찾거나 만들 수 없다는 뜻이다. 웹 서버를 바꿨는데 왜 미디어 프로파일에서 문제가 생길까?

처음에는 AAC 옵션을 의심했다. 하지만 통과했던 소스와 비교하고 로그를 다시 읽어 보니 그보다 앞에서 capability 조회가 인증 오류로 끝나고 있었다. 이번 글은 2026년 9월에 이 문제를 추적했던 기록이다.

## 시험 도구의 요청은 어디로 가는가

DTT(Device Test Tool)는 ONVIF 요청을 보내 장치의 응답과 동작을 검사하는 도구다. 여기서 Media Profile은 영상 소스나 인코더 같은 미디어 설정을 묶은 구성이다. AAC 오디오 시험이라면 그 조건에 맞는 프로파일을 준비할 수 있어야 한다.

장치가 지원하는 기능을 확인하는 요청도 있다. `GetServiceCapabilities`는 해당 서비스의 기능 정보를 조회한다. 실제 미디어 구성을 조회하는 요청과는 역할이 다르지만 시험 도구가 장치를 파악하는 데 둘 다 필요하다.

이번에 확인한 nginx 경로에서는 ONVIF 요청이 다음 순서로 전달됐다.

```text
DTT
  → nginx: HTTP 요청 수신
  → FastCGI 브리지: ONVIF 요청을 내부 처리부로 전달
  → 내부 ONVIF 처리부: 요청의 인증 여부 판단 및 서비스 실행
```

웹 서버가 요청을 받았다고 내부 서비스까지 성공한 것은 아니다. 브리지에서 통과시킨 요청도 내부 인증 처리에서 거부될 수 있다. 이 구조를 먼저 알고 로그를 보면 HTTP 상태와 SOAP 응답을 함께 확인해야 하는 이유가 보인다.

## 1. AAC 옵션이 빠진 것은 맞았다

실패한 시험에는 공통점이 있었다. AAC 오디오를 요구한다는 점이다.

그런데 `GetAudioEncoderConfigurationOptions` 응답에는 `PCMU`만 들어 있었다. 아래는 응답에서 옵션 부분만 남기고 namespace 접두어를 정리한 것이다.

```xml
<tr2:Options xmlns:tr2="http://www.onvif.org/ver20/media/wsdl"
             xmlns:tt="http://www.onvif.org/ver10/schema">
  <tt:Encoding>PCMU</tt:Encoding>
  <tt:BitrateList>
    <tt:Items>64</tt:Items>
  </tt:BitrateList>
  <tt:SampleRateList>
    <tt:Items>8</tt:Items>
  </tt:SampleRateList>
</tr2:Options>
```

AAC를 시험하려는데 선택할 수 있는 코덱이 PCMU뿐이라면 필요한 프로파일을 만들지 못할 수 있다. 프로파일 목록을 조회하거나 구성을 추가하는 요청 자체는 성공하고 있었다. 그래서 요청 실패보다는 시험 조건에 맞는 조합이 없는 쪽을 먼저 의심했다.

소스에도 플랫폼에 따라 AAC를 옵션에서 제외하는 조건이 있었다. 여기까지만 보면 이 조건을 풀면 될 것 같았다.

그런데 이전에 통과했던 커밋에도 같은 조건이 있었다.

관련 Media 파일을 비교했더니 내용과 해시가 같았다. AAC 옵션이 없는 이유는 찾았지만 이전에는 통과하던 시험이 왜 이번에 실패했는지는 설명하지 못한 셈이다. 그래서 AAC를 추가하는 수정은 이번 문제의 해결책에서 제외하고 요청이 전달되는 경로를 보기로 했다.

## 2. 이전 통과본과 비교한 뒤 사전 단계를 봤다

개별 시험의 실패 로그에 집중하다 보니 사전 단계의 경고를 뒤늦게 봤다. `DEFINE FEATURES`가 실패해 있었다. DTT가 장치에서 어떤 기능을 지원하는지 확인하는 단계다.

경고에는 Recording·Search·Replay 서비스의 capability를 가져오지 못했다는 내용이 있었다. Search와 Replay의 상세 응답을 열어 보니 공통으로 다음 상태였다.

```text
요청: GetServiceCapabilities
HTTP: 400 Bad Request
SOAP Fault: ter:NotAuthorized
Reason: Sender not authorized
```

Media Profile 오류와는 다른 요청에서 인증 오류가 나고 있었다.

응답에 나온 요청은 capability 조회였고 실패 이유는 인증이었다. AAC 인코더 옵션을 추가해도 이 인증 오류가 없어지지는 않는다. 조사 대상을 프로파일 구성에서 기능 조회 경로로 옮긴 이유다.

여기서 코드와 응답을 함께 확인하니 FastCGI 브리지와 내부 ONVIF 처리부의 판단이 달랐다. 브리지는 `GetServiceCapabilities`를 인증 없이 전달해도 되는 요청으로 취급했다. 반면 내부 인증 허용 목록에는 Media2·Recording·Search·Replay의 해당 요청이 빠져 있었다.

앞에서는 통과시킨 요청을 뒤에서 거부하고 있었다.

## 3. 두 웹 서버 경로의 인증 응답이 달랐다

두 웹 서버 경로를 비교해 보니 인증을 처리하는 순서가 달랐다. 당시 구현의 흐름을 줄이면 다음과 같다.

```text
Appweb 경로
인증 정보 없이 요청
  → 401 응답으로 인증 요구
  → 클라이언트가 인증 정보를 붙여 재요청
  → capability 응답

nginx 경로
인증 정보 없이 요청
  → FastCGI 브리지가 내부로 전달
  → 내부 ONVIF 처리부에서 인증 정보가 없다고 거부
  → 400 응답 + NotAuthorized
```

Appweb에는 첫 요청에서 인증 재시도를 유도하는 경로가 있었다. nginx 쪽은 브리지가 요청을 그대로 넘겼고 내부에서 거부했다. 기존에도 있던 허용 목록의 누락이 웹 서버 전환 후 다른 응답으로 드러난 것이다.

HTTP 인증을 요구하는 `401`에는 `WWW-Authenticate` challenge가 따라야 한다. 클라이언트는 이를 보고 인증 정보를 붙여 다시 요청할 수 있다. `400` 응답 본문에 `NotAuthorized`가 있다고 해서 같은 과정이 진행되지는 않는다. [RFC 9110 §15.5.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.2)

그러면 nginx에서도 `401`을 보내면 되는 걸까? 이 요청은 그 전에 규격을 확인해야 했다.

## 4. 응답 코드를 바꾸기 전에 접근 등급을 확인했다

ONVIF는 요청별로 접근 등급을 나눈다. 그중 `PRE_AUTH`는 사용자 인증을 요구하지 않는 등급이다. Media2의 `GetServiceCapabilities`는 여기에 속한다. [ONVIF Core 26.06 §5.9.4.3](https://www.onvif.org/specs/2606/ONVIF-Core-Spec-v2606.pdf), [Media2 26.06 §5.14](https://www.onvif.org/specs/2606/ONVIF-Media2-Service-Spec-v2606.pdf)

Recording Control과 Replay Control의 같은 요청도 `PRE_AUTH`다. Replay는 2026년 6월 명세 목록에서 연결하는 21.12 문서를 기준으로 확인했다. [Recording Control 26.06 §5.25](https://www.onvif.org/specs/2606/ONVIF-RecordingControl-Service-Spec-v2606.pdf), [Replay Control 21.12 §5.5](https://www.onvif.org/specs/2112/ONVIF-Replay-Service-Spec-v2112.pdf)

이 요청에 대해서는 앞단과 내부 처리부 모두 인증 없이 처리하도록 맞춰야 한다. Appweb에서 인증 후 성공했다는 사실만으로 기존 처리가 규격에 맞았다고 볼 수도 없었다.

허용 목록을 볼 때는 서비스도 같이 봐야 한다. Media2와 Replay는 둘 다 `GetServiceCapabilities`라는 이름을 쓰지만 namespace가 다르다.

```text
Media2: http://www.onvif.org/ver20/media/wsdl
Replay: http://www.onvif.org/ver10/replay/wsdl
```

operation 이름만 보고 한 군데를 고치면 다른 서비스의 처리가 빠질 수 있다. 반대로 `/onvif/` 경로 전체를 무인증으로 열면 인증이 필요한 요청까지 허용할 위험이 있다. 수정할 대상은 각 서비스의 capability 요청을 식별하고 접근 등급을 판단하는 부분이었다.

다시 검증할 때도 이 경계를 기준으로 봐야 한다. 해당 `PRE_AUTH` 요청은 인증 정보 없이 정상 응답을 받아야 하고 인증이 필요한 다른 요청은 계속 보호돼야 한다. capability 조회 하나를 통과시키려고 전체 인증 검사를 생략하면 수정 범위가 달라진다.

## 5. 확인한 문제와 남은 검증

인증 허용 목록의 불일치와 Search·Replay의 `NotAuthorized` 응답은 확인했다. 다만 여기서 AAC 시험이 선택된 이유까지 바로 확정할 수는 없었다.

DTT 26.06의 기능 판별 문서에는 필요한 응답을 받지 못하면 관련 기능을 `UNDEFINED`로 두는 규칙이 있다. 정상 응답을 받아 미지원으로 판단한 상태와 조회에 실패해 지원 여부를 모르는 상태가 구분되는 것이다.

당시 실행에서 Media2 AAC의 최종 기능값이 무엇이었는지는 상세 로그가 부족했다. 따라서 capability 조회 실패가 시험 선택에 영향을 줬을 가능성은 남지만 Search·Replay의 인증 오류 때문에 AAC 시험이 실행됐다고 단정할 수는 없다. 수정 후 전체 시험이 통과했는지도 이 기록만으로는 확인하지 못했다.

다음 확인 순서는 정해졌다. capability 인증 처리를 맞춘 펌웨어에서 `DEFINE FEATURES`를 다시 실행하고 FeatureList와 AAC 시험 선택 결과가 어떻게 달라지는지 비교하는 것이다. 그때도 같은 실패가 나오면 실제 코덱 옵션과 프로파일 구성으로 돌아가서 보면 된다.

Media Profile이라는 오류 문구 때문에 처음부터 오디오 코드를 봤다. 이전 통과본에도 같은 코드가 있다는 사실을 확인하고 나서야 조사 방향을 바꿀 수 있었다. 이번에는 프로파일을 만드는 코드에 손대기 전에, 그 앞의 기능 조회가 왜 실패했는지부터 확인해야 했다.

다음 글에서는 [AdvancedSecurity 구현을 위해 KeyStore부터 만든 과정](/posts/embedded-system/protocol-security/onvif-advancedsecurity-keystore-foundation/)을 정리한다.

ONVIF 스트리밍 흐름은 앞선 글 [RTSP 세션과 RTP frame 수신 경계 확인하기](/posts/embedded-system/protocol-security/onvif-rtsp-rtp-frame-boundary/)에서 다뤘다.
