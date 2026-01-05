---
title: "[WSL2] WSL2로 USB 디바이스 연결하기 (usbipd-win 가이드)"
published: 2025-12-29
description: "WSL2에서 USB 장치가 안 보일 때, usbipd-win(USB/IP)으로 USB-UART/디버그 프로브(ST-Link 등)를 WSL2(Ubuntu)로 연결하는 방법을 정리합니다."
image: './image/usbipd-win.png'
tags: [WSL2, Windows11, USB, Ubuntu, usbipd-win]
category: "Virtualization"
draft: false
---

안녕하세요, pingu52입니다.

지난 글에서는 Windows 11에서 **WSL2(Ubuntu) 빌드 환경**을 세팅했습니다.  
([지난 글: WSL2 세팅](/posts/2025-12-27-wsl-setup/))

이번 글은 그 다음 단계입니다.

- Windows에 USB 디바이스는 정상 인식되는데 WSL2에서는 인식이 안되는 문제

해결은 **usbipd-win(USB/IP)** 입니다.

:::note
“Windows에 꽂힌 USB를 WSL2로 패스스루해서 Linux에서 네이티브처럼 쓰기”에 초점을 둡니다.
:::

---

## usbipd-win이란?

Windows에서 USB 디바이스를 **USB/IP 방식으로 공유**하고, WSL2가 그 장치를 네트워크로 “붙여서” 쓰게 해주는 도구입니다.

::github{repo="dorssel/usbipd-win"}

(WSL 관련 프로젝트도 함께 참고하면 좋습니다.)

::github{repo="microsoft/WSL"}

---

## 목표

- Windows 11 + WSL2 환경에서 **USB 디바이스를 WSL2로 패스스루**
- `usbipd list → (관리자) bind → attach → (WSL에서 확인) → detach` 흐름으로 끝내기

---

## 준비

### 0. Windows / WSL 요구사항

:::important
Microsoft 공식 가이드 기준으로 **Windows 11 Build 22000 이상**, WSL 커널 버전 조건이 있습니다.  
가장 안전한 접근은 `wsl --update`로 WSL을 최신으로 올리는 것입니다.
:::

Windows에서 한 번에 정리:

```powershell
# (선택) WSL이 꼬였을 때는 먼저 완전 종료
wsl --shutdown

# 커널/WSL 업데이트
wsl --update
wsl --version
```

WSL(Ubuntu)에서 커널 확인:

```bash
uname -r
```

혹은 PowerShell에서 커널 확인:

```powershell
wsl uname -r
```

---

## 1. usbipd-win 설치 (Windows)

두 가지 중 편한 방법으로 설치합니다. (1번 권장)

### 1.1 `.msi` 설치

[usbipd-win Github Release Page](https://github.com/dorssel/usbipd-win/releases)에서 최신 버전 다운로드 후 설치

### 1.2 `winget` 설치

```powershell
winget install --interactive --exact dorssel.usbipd-win
```

설치 후 터미널을 다시 열어 PATH 반영을 확인합니다.

```powershell
usbipd --version
```

---

## 2. 연결할 USB 디바이스 확인 (Windows)

PowerShell에서 현재 연결된 장치를 나열합니다.

```powershell
usbipd list
```

예시 출력:

```text
BUSID  VID:PID    DEVICE                                    STATE
2-1    0483:3748  ST-LINK/V2-1                              Not shared
2-2    10c4:ea60  Silicon Labs CP210x USB to UART Bridge    Not shared
```

여기서 **BUSID**(예: `2-2`)를 기억합니다.

:::tip
예전 글/예전 버전에서는 `usbipd wsl list` 같은 하위 명령이 보일 수 있는데, 최근 가이드는 `usbipd list`를 기본으로 사용합니다.
:::

---

## 3. (중요) 디바이스 공유하기: bind (Windows 관리자)

WSL에 붙이기 전에 먼저 **공유(share)** 해야 합니다.  
이 단계는 **관리자 권한이 필요**합니다.

```powershell
usbipd bind --busid 2-2
```

다시 확인:

```powershell
usbipd list
```

`STATE`가 `Shared`로 바뀌면 정상입니다.

:::tip
`bind`는 **영구(persistent)** 입니다. 재부팅해도 유지되며, 보통 디바이스당 **한 번만** 해두면 됩니다.
:::

---

## 4. WSL2로 붙이기: attach

:::important
attach 전에 **WSL 터미널을 미리 열어두세요.**  
WSL2이 살아 있어야 attach가 안정적으로 됩니다.
:::

이제 attach:

```powershell
usbipd attach --wsl --busid 2-2
```

확인:

```powershell
usbipd list
```

`STATE`가 `Attached`로 나오면 성공입니다.

:::warning
디바이스가 WSL에 붙어 있는 동안 **Windows에서는 해당 USB를 사용할 수 없습니다.**  
(Windows 쪽 앱/드라이버가 잡고 있으면 attach가 실패할 수 있습니다.)
:::

---

## 5. WSL(Ubuntu)에서 인식 확인

WSL로 돌아가서 확인합니다.

### 5.1 `lsusb` 확인

`lsusb`가 없다면 설치:

```bash
sudo apt update
sudo apt install -y usbutils
```

확인:

```bash
lsusb
```

연결한 장치(예: CP210x, ST-Link)가 보이면 1차 성공입니다.

### 5.2 시리얼(UART)이라면 `/dev/tty*` 확인

```bash
ls -l /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

:::caution
CH340/CP210x 같은 USB-UART는 장치에 따라 커널 모듈/권한 이슈로 `/dev/ttyUSB0`가 바로 안 생길 수 있습니다.  
우선 `dmesg -w`로 연결 이벤트를 확인하고, 드라이버/권한 문제를 분리해서 보세요.
:::

---

## 6. 연결 해제: detach (Windows)

작업이 끝났으면 detach로 Windows에 돌려줍니다.

```powershell
usbipd detach --busid 2-2
```

:::note
`attach`는 **비영구(non-persistent)** 입니다.  
재부팅/WSL 재시작/USB 재연결/보드 리셋 시에는 다시 attach가 필요할 수 있습니다.
:::

---

## 7. (선택) 공유 해제: unbind (Windows 관리자)

`bind`는 “공유 상태를 유지”하므로, 공유 자체를 끄고 싶다면 unbind를 사용합니다.  
이 단계도 **관리자 권한이 필요**합니다.

```powershell
usbipd unbind --busid 2-2
```

---

## 8. 자주 겪는 문제 (Troubleshooting)

### 8.1 `Device is not shared` / `Not shared` 상태에서 attach 시도

먼저 `bind`를 해야 합니다.

```powershell
# 관리자 PowerShell
usbipd bind --busid <BUSID>
```

### 8.2 `The device appears to be used by Windows`

Windows에서 해당 장치를 잡고 있는 프로그램을 종료하세요.  
(예: 시리얼 모니터, IDE, 드라이버 유틸 등)

### 8.3 보드 리셋/부트로더 진입으로 BUSID가 바뀌는 경우

펌웨어 업로드/부트로더 진입에서 장치가 재인식되면 BUSID가 바뀌며 attach가 끊길 수 있습니다.  
이때는 `--auto-attach` + `--hardware-id (VID:PID)` 조합이 도움이 됩니다.

```powershell
# 예시: VID:PID 기반 자동 재-attach (실행 중인 동안 루프로 동작)
usbipd attach --wsl --auto-attach --hardware-id 10c4:ea60
```

:::note
`--auto-attach`는 서비스처럼 상시 백그라운드에 붙는 개념이 아니라, **해당 명령이 실행 중인 동안** 재연결을 시도하는 형태입니다.
:::

---

## 요약

- Windows에서: `usbipd list → (관리자) usbipd bind → usbipd attach`
- WSL에서: `lsusb` / `/dev/ttyUSB*` 확인 후 사용
- 끝나면: `usbipd detach`
- 공유까지 끄고 싶으면: `(관리자) usbipd unbind`

---

## 참고 자료

- Microsoft 공식 가이드: Connect USB devices (WSL)  
  <https://learn.microsoft.com/windows/wsl/connect-usb>
- usbipd-win WSL 지원 위키  
  <https://github.com/dorssel/usbipd-win/wiki/WSL-support>
- usbipd-win GitHub 저장소  
  <https://github.com/dorssel/usbipd-win>
