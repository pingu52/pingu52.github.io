---
title: "[Palworld] WSL2에서 데디케이트 서버 구축하기"
description: "Windows 11의 WSL2 Ubuntu에 SteamCMD로 Palworld Dedicated Server를 설치하고 UDP 8211 네트워크를 설정하는 과정을 정리합니다."
published: 2026-07-23
updated: 2026-07-23
draft: false
image: "./palworld.jpg"
tags:
  - Palworld
  - WSL2
  - SteamCMD
  - Dedicated Server
  - Windows11
  - Ubuntu
category: "게임"
---

팰월드 일반 멀티플레이는 방장이 게임을 실행하고 있어야 친구들이 같은 월드에 들어올 수 있다.

이번에는 기존 Windows 11 PC를 그대로 사용하면서, WSL2 Ubuntu에서 Linux용 Palworld Dedicated Server를 실행하는 방식으로 바꿨다. 게임 클라이언트와 서버 프로세스를 분리할 수 있고, 서버 관리는 Linux 명령으로 처리할 수 있다는 점이 마음에 들었다.

Palworld 1.0 공식 가이드는 Linux 64비트와 SteamCMD 구성을 지원한다. 다만 WSL2 자체가 공식 지원 대상으로 명시된 것은 아니므로, 이 글의 구성은 **Windows 위의 WSL2에서 공식 Linux 서버를 실행하는 형태**다.

## 구성

최종 구성은 다음과 같다.

```text
Windows 11
├─ Palworld 게임 클라이언트
└─ WSL2 Ubuntu
   └─ ~/work/palserver
      ├─ PalServer.sh
      └─ Pal/Saved
```

외부에서 들어오는 네트워크 경로는 아래와 같다.

```text
외부 플레이어
  ↓ 공인 IP:8211/UDP
공유기 포트포워딩
  ↓ Windows PC의 내부 IP:8211/UDP
Windows 방화벽
  ↓
Hyper-V 방화벽
  ↓ mirrored networking
WSL2 PalServer:8211/UDP
```

여기서 중요한 점은 세 가지다.

- WSL2는 `mirrored` 네트워크 모드로 사용한다.
- 공유기는 WSL IP가 아니라 Windows PC의 내부 IP로 포트포워딩한다.
- 게임 접속에 필요한 `UDP 8211`만 연다.

## 준비 사항

Palworld 1.0 공식 요구사항은 다음과 같다.

- CPU: 4코어 이상 권장
- 메모리: 16GB, 대규모 서버는 32GB 이상 권장
- 저장장치: 빠른 SSD 권장
- 네트워크: 기본 `UDP 8211` 포트포워딩
- 운영체제: Windows 64비트 또는 Linux 64비트

WSL2가 아직 없다면 기존 글을 먼저 참고하면 된다.

[지난 글: WSL2 세팅](/posts/system-engineering/virtualization/wsl2-install)

이번 글에서는 Windows 11과 WSL2 Ubuntu가 이미 설치되어 있다고 가정한다.

:::note
Palworld 공식 문서는 Docker Desktop 배포를 저장장치 I/O 관점에서 권장하지 않는다. 이 구성에서는 Docker Desktop을 거치지 않고 WSL2 안에 SteamCMD와 서버를 직접 설치한다.
:::

## 1. WSL2 상태 확인

관리자 PowerShell에서 WSL을 업데이트하고 배포판 상태를 확인한다.

```powershell
wsl --update
wsl --version
wsl -l -v
```

Ubuntu의 `VERSION`이 `2`여야 한다.

```text
NAME      STATE    VERSION
Ubuntu    Running  2
```

WSL1이라면 배포판 이름을 확인한 뒤 WSL2로 변경한다.

```powershell
wsl --set-version Ubuntu 2
```

## 2. mirrored networking 설정

Palworld는 기본적으로 `UDP 8211`을 사용한다. WSL2 기본 NAT 모드에서도 서버를 실행할 수는 있지만, 외부 UDP 트래픽을 WSL까지 전달하는 구성이 복잡해진다.

Windows 11 22H2 이상에서는 `mirrored` 네트워크 모드를 사용할 수 있다. 이 모드에서는 Windows의 네트워크 인터페이스가 WSL에 미러링되고, Windows와 WSL 사이에서 `localhost`를 사용할 수 있으며, LAN에서도 WSL 서비스에 직접 접근할 수 있다.

PowerShell에서 다음 파일을 연다.

```powershell
notepad $env:USERPROFILE\.wslconfig
```

아래 내용을 추가한다.

```ini
[wsl2]
networkingMode=mirrored
firewall=true
```

이미 메모리나 CPU 설정을 사용 중이라면 기존 값은 유지한다.

```ini
[wsl2]
memory=24GB
processors=12
networkingMode=mirrored
firewall=true
```

변경 내용을 적용하려면 WSL을 완전히 종료해야 한다.

```powershell
wsl --shutdown
```

그다음 Ubuntu를 다시 실행한다.

:::important
`wsl --shutdown`은 설치된 파일을 삭제하지 않지만, 실행 중인 모든 WSL 배포판과 프로세스를 종료한다. 다른 빌드나 개발 서버가 실행 중이라면 먼저 작업을 저장해야 한다.
:::

## 3. SteamCMD 설치

이제 WSL Ubuntu에서 작업한다.

먼저 SteamCMD 실행에 필요한 패키지와 운영 도구를 설치한다.

```bash
sudo apt update
sudo apt install -y \
  lib32gcc-s1 \
  lib32stdc++6 \
  curl \
  tar \
  tmux
```

SteamCMD와 Palworld 서버 디렉터리를 만든다.

```bash
mkdir -p ~/steamcmd ~/work/palserver
cd ~/steamcmd
```

SteamCMD를 내려받아 압축을 해제한다.

```bash
curl -fsSL \
  https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz \
  | tar -xz
```

설치 결과를 확인한다.

```bash
ls -al ~/steamcmd
```

다음 파일이 있으면 된다.

```text
steamcmd.sh
linux32/
```

## 4. Palworld Dedicated Server 설치

SteamCMD에서 Palworld Dedicated Server를 설치한다.

```bash
cd ~/steamcmd

./steamcmd.sh \
  +force_install_dir "$HOME/work/palserver" \
  +login anonymous \
  +app_update 2394010 validate \
  +quit
```

Palworld Dedicated Server의 Steam App ID는 `2394010`이다.

설치가 끝나면 서버 디렉터리를 확인한다.

```bash
ls -al ~/work/palserver
```

대략 다음 구조가 만들어진다.

```text
palserver
├─ DefaultPalWorldSettings.ini
├─ Engine/
├─ Pal/
└─ PalServer.sh
```

서버 파일은 `/mnt/c`가 아니라 WSL의 Linux 파일시스템인 `~/work/palserver`에 두었다. Linux 명령으로 작업하는 파일은 WSL 파일시스템에 둘 때 성능이 더 좋고, 저장 데이터도 Windows 마운트 경로와 분리할 수 있다.

## 5. 서버 최초 실행

설정 디렉터리는 서버를 한 번 실행해야 생성된다.

```bash
cd ~/work/palserver
chmod +x PalServer.sh

./PalServer.sh \
  -port=8211 \
  -players=8
```

로그 마지막 부분에서 다음 메시지를 확인한다.

```text
Running Palworld dedicated server on :8211
```

설정과 저장 디렉터리가 생성될 때까지 잠시 기다린 뒤 `Ctrl+C`로 서버를 종료한다.

```bash
ls -al Pal/Saved/Config/LinuxServer
ls -al Pal/Saved/SaveGames/0
```

Palworld 1.0부터는 아래의 예전 멀티스레드 옵션을 무조건 추가하지 않는 편이 좋다.

```text
-useperfthreads
-NoAsyncLoadingThread
-UseMultithreadForDS
```

공식 문서도 1.0 이상에서는 이 옵션을 설정하지 않는 편이 성능에 유리할 수 있다고 설명한다. 처음에는 `-port`와 `-players`만 지정하고 시작하는 것이 깔끔하다.

## 6. 서버 설정 파일 만들기

기본 설정 파일을 Linux 서버 설정 디렉터리로 복사한다.

```bash
cd ~/work/palserver

cp \
  DefaultPalWorldSettings.ini \
  Pal/Saved/Config/LinuxServer/PalWorldSettings.ini
```

실제로 수정할 파일은 다음 파일이다.

```bash
nano Pal/Saved/Config/LinuxServer/PalWorldSettings.ini
```

`DefaultPalWorldSettings.ini`는 새 설정을 만들 때 사용하는 원본이다. 이 파일만 수정하면 서버 설정에 반영되지 않는다.

설정 파일은 아래처럼 헤더와 긴 `OptionSettings` 한 줄로 구성되어 있다.

```ini
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(...)
```

:::warning
`OptionSettings=(...)` 안의 쉼표, 따옴표, 마지막 괄호를 지우면 전체 설정이 적용되지 않을 수 있다. 아래 항목은 파일 안에서 검색해 값만 바꾸는 편이 안전하다.
:::

### 개인 서버에서 먼저 바꿀 값

| 설정 | 용도 | 예시 |
|---|---|---|
| `ServerName` | 서버 이름 | `"Pingu Palworld"` |
| `ServerDescription` | 서버 설명 | `"Private server"` |
| `ServerPassword` | 접속 비밀번호 | 별도의 접속용 비밀번호 |
| `AdminPassword` | 관리자 권한 비밀번호 | 접속 비밀번호와 다른 긴 값 |
| `ServerPlayerMaxNum` | 최대 접속 인원 | `8` |
| `bIsUseBackupSaveData` | 서버 자체 백업 활성화 | `True` |
| `bAllowClientMod` | 모드 클라이언트 접속 허용 | 모드를 쓰지 않으면 `False` |
| `RCONEnabled` | RCON 활성화 | `False` |
| `RESTAPIEnabled` | REST API 활성화 | `False` |

소수의 친구만 접속하는 개인 서버라면 RCON과 REST API는 열 필요가 없다. 접속 비밀번호와 관리자 비밀번호도 서로 다르게 설정한다.

### 게임 배율 설정

내 서버에서는 편의성을 위해 아래 항목을 조정했다.

| 설정 | 값 | 체감 |
|---|---:|---|
| `ExpRate` | `5.0` | 경험치 획득량 5배 |
| `PalSpawnNumRate` | `1.5` | 팰 출현량 증가 |
| `CollectionDropRate` | `3.0` | 채집 자원 획득량 3배 |
| `PlayerStomachDecreaceRate` | `0.5` | 플레이어 허기 소모 감소 |
| `PlayerStaminaDecreaceRate` | `0.3` | 플레이어 스태미나 소모 감소 |
| `PalStomachDecreaceRate` | `0.7` | 팰 허기 소모 감소 |
| `PalStaminaDecreaceRate` | `0.7` | 팰 스태미나 소모 감소 |
| `PalEggDefaultHatchingTime` | `1.0` | 거대 알 기준 부화 시간 1시간 |

`Rate`가 붙었다고 해서 값을 올릴수록 항상 빨라지는 것은 아니다.

- 획득량과 공격력 계열은 값이 높을수록 증가한다.
- `DecreaceRate`는 값이 낮을수록 허기나 스태미나가 천천히 줄어든다.
- `PalSpawnNumRate`를 올리면 팰 수와 함께 서버 부하도 증가할 수 있다.
- 공식 문서에서 동작이 불분명한 값은 기본값을 유지하는 편이 안전하다.

전체 설정 목록은 글 마지막의 Palworld 공식 Configuration 문서에서 확인할 수 있다.

## 7. Windows 방화벽 설정

이제 외부에서 들어오는 `UDP 8211`을 Windows 방화벽에서 허용한다.

먼저 집 네트워크가 `Private` 프로필인지 확인한다.

```powershell
Get-NetConnectionProfile
```

관리자 PowerShell에서 규칙을 만든다.

```powershell
New-NetFirewallRule `
  -DisplayName "Palworld Dedicated UDP 8211" `
  -Direction Inbound `
  -Protocol UDP `
  -LocalPort 8211 `
  -Action Allow `
  -Profile Private
```

규칙을 확인한다.

```powershell
Get-NetFirewallRule `
  -DisplayName "Palworld Dedicated UDP 8211" |
Format-Table DisplayName, Enabled, Direction, Action, Profile
```

## 8. Hyper-V 방화벽 설정

Windows 11의 WSL2 트래픽에는 Hyper-V 방화벽도 적용된다.

먼저 WSL의 `VMCreatorId`를 직접 조회한다.

```powershell
$wslId = (
  Get-NetFirewallHyperVVMCreator |
  Where-Object FriendlyName -eq "WSL"
).VMCreatorId

$wslId
```

조회한 ID로 `UDP 8211` 인바운드 규칙을 만든다.

```powershell
New-NetFirewallHyperVRule `
  -Name "Palworld-WSL-UDP-8211" `
  -DisplayName "Palworld WSL UDP 8211" `
  -Direction Inbound `
  -VMCreatorId $wslId `
  -Protocol UDP `
  -LocalPorts 8211 `
  -Action Allow
```

규칙을 확인한다.

```powershell
Get-NetFirewallHyperVRule `
  -Name "Palworld-WSL-UDP-8211" |
Format-List Name, Enabled, Direction, Protocol, LocalPorts, Action, VMCreatorId
```

전체 WSL 인바운드를 허용할 필요는 없다. Palworld에 필요한 `UDP 8211`만 개별 규칙으로 연다.

## 9. 공유기 포트포워딩

Windows PC의 내부 IPv4 주소를 확인한다.

```powershell
ipconfig
```

예를 들어 내부 IP가 `192.168.0.50`이라면 공유기에 다음 규칙을 추가한다.

```text
이름:      Palworld
프로토콜:  UDP
외부 포트: 8211
내부 IP:   192.168.0.50
내부 포트: 8211
```

포워딩 대상은 WSL의 `172.x.x.x` 주소가 아니라 **Windows PC의 LAN 주소**다.

mirrored networking에서는 Windows에서 WSL IP로 다시 포트포워딩하는 규칙을 만들지 않는다. 공유기, Windows 방화벽, Hyper-V 방화벽만 같은 `UDP 8211`을 통과시키면 된다.

:::caution
개인용 데디케이트 서버에서 IP 직접 접속만 사용할 때는 아래 포트를 추가로 열지 않았다.

```text
TCP 8211
TCP 8212
TCP 25575
UDP 27016
```

REST API, RCON, 커뮤니티 서버 공개 등 별도 기능을 활성화할 때만 해당 기능의 공식 문서를 확인해 필요한 포트를 추가한다. DMZ나 전체 포트 개방은 사용하지 않는다.
:::

## 10. 서버 실행

WSL에서 서버를 실행한다.

```bash
cd ~/work/palserver

./PalServer.sh \
  -port=8211 \
  -players=8
```

다른 WSL 터미널에서 리슨 상태를 확인한다.

```bash
sudo ss -lunp | grep ':8211'
```

정상이라면 다음과 비슷하게 표시된다.

```text
UNCONN 0 0 0.0.0.0:8211 0.0.0.0:* users:(("PalServer-Linux",...))
```

## 11. 서버 접속

데디케이트 서버에는 일반 멀티플레이처럼 초대 코드가 생성되지 않는다. Palworld 서버 목록 아래의 직접 접속 입력란에 `IP:포트`를 입력한다.

```text
같은 Windows PC: 127.0.0.1:8211
같은 공유기 내부: Windows PC의 내부IP:8211
외부 친구: 집의 공인IPv4:8211
```

예를 들어 같은 공유기 안에서 Windows PC의 IP가 `192.168.0.50`이라면 다음 주소로 접속한다.

```text
192.168.0.50:8211
```

외부 친구에게는 공유기의 공인 IPv4와 포트를 알려준다.

```text
<공인IPv4>:8211
```

## 12. tmux로 서버 유지

일반 터미널에서 실행하면 터미널을 닫을 때 서버도 같이 종료될 수 있다. 간단한 개인 서버라면 `tmux`로 분리해둘 수 있다.

```bash
cd ~/work/palserver
tmux new -s palworld
```

tmux 안에서 서버를 실행한다.

```bash
./PalServer.sh \
  -port=8211 \
  -players=8
```

서버를 실행한 채 tmux에서 빠져나온다.

```text
Ctrl+B
D
```

다시 서버 콘솔로 돌아간다.

```bash
tmux attach -t palworld
```

:::note
tmux는 터미널 세션만 분리한다. Windows를 종료하거나 절전 상태로 만들거나 `wsl --shutdown`을 실행하면 서버도 중단된다. 완전한 24시간 운영이 필요하다면 별도의 Linux 서버나 VPS가 더 적합하다.
:::

## 13. 설정 변경과 안전한 종료

`PalWorldSettings.ini`는 실행 중에 수정해도 현재 서버에 실시간 적용되지 않는다. 설정을 바꿀 때는 월드를 저장하고 서버를 정상 종료한 다음 파일을 수정한다.

게임 채팅에서 관리자 권한을 얻는다.

```text
/AdminPassword <관리자비밀번호>
```

월드를 저장하고 30초 뒤 서버를 종료한다.

```text
/Save
/Shutdown 30 서버 설정을 변경합니다.
```

서버가 종료된 뒤 설정 파일을 백업한다.

```bash
cd ~/work/palserver

cp \
  Pal/Saved/Config/LinuxServer/PalWorldSettings.ini \
  "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini.$(date +%Y%m%d-%H%M%S).bak"
```

설정을 수정하고 서버를 다시 실행한다.

```bash
nano Pal/Saved/Config/LinuxServer/PalWorldSettings.ini

./PalServer.sh \
  -port=8211 \
  -players=8
```

## 14. 서버 업데이트와 백업

Palworld 서버를 업데이트하기 전에는 먼저 서버를 정상 종료하고 `Saved` 디렉터리를 백업한다.

```bash
cp -a \
  ~/work/palserver/Pal/Saved \
  "$HOME/palworld-saved-backup-$(date +%Y%m%d-%H%M%S)"
```

SteamCMD로 서버 파일을 업데이트한다.

```bash
cd ~/steamcmd

./steamcmd.sh \
  +force_install_dir "$HOME/work/palserver" \
  +login anonymous \
  +app_update 2394010 validate \
  +quit
```

업데이트가 끝나면 평소와 같이 서버를 다시 실행한다.

```bash
cd ~/work/palserver

./PalServer.sh \
  -port=8211 \
  -players=8
```

## 정리

WSL2에서 Palworld Dedicated Server를 운영할 때 최종적으로 필요한 구성은 아래와 같다.

```text
서버:
WSL2 Ubuntu + SteamCMD + ~/work/palserver

WSL 네트워크:
networkingMode=mirrored
firewall=true

공유기:
UDP 8211 → Windows PC의 내부 IP

Windows 방화벽:
UDP 8211 인바운드 허용

Hyper-V 방화벽:
WSL VMCreatorId에 UDP 8211 인바운드 허용

서버 실행:
./PalServer.sh -port=8211 -players=8
```

Windows에서 WSL IP로 별도의 포트 프록시를 만들 필요는 없다. 필요한 포트만 최소한으로 열고, RCON과 REST API는 사용하지 않는다면 비활성화한 상태로 두는 편이 안전하다.

## 참고 자료

- [Palworld Server Guide 1.0 - Requirements](https://docs.palworldgame.com/getting-started/requirements/)
- [Palworld Server Guide 1.0 - Deploy dedicated server](https://docs.palworldgame.com/getting-started/deploy-dedicated-server/)
- [Palworld Server Guide 1.0 - Configure the server](https://docs.palworldgame.com/settings-and-operation/arguments/)
- [Palworld Server Guide 1.0 - Configuration parameters](https://docs.palworldgame.com/settings-and-operation/configuration/)
- [Palworld Server Guide 1.0 - Commands](https://docs.palworldgame.com/settings-and-operation/commands/)
- [Palworld Server Guide 1.0 - Connect to the server](https://docs.palworldgame.com/getting-started/connect-server/)
- [Microsoft Learn - Accessing network applications with WSL](https://learn.microsoft.com/en-us/windows/wsl/networking)
- [Microsoft Learn - Advanced settings configuration in WSL](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)
- [Microsoft Learn - Configure Hyper-V firewall](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/hyper-v-firewall)
- [Microsoft Learn - Working across Windows and Linux file systems](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
