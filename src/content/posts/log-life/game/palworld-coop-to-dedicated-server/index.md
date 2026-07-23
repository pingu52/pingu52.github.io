---
title: "[Palworld] Co-op 월드를 데디케이트 서버로 이전하기"
description: "Steam Co-op 월드와 방장 캐릭터를 WSL2의 Palworld Dedicated Server로 이전하는 과정을 정리합니다."
published: 2026-07-23
updated: 2026-07-23
draft: false
image: "./palworld.jpg"
tags:
  - Palworld
  - Co-op
  - Dedicated Server
  - Save Migration
  - WSL2
category: "게임"
---

앞선 글에서는 Windows 11의 WSL2 Ubuntu에 Palworld Dedicated Server를 구축했다.

[지난 글: WSL2에서 데디케이트 서버 구축하기](/posts/log-life/game/palworld-wsl2-dedicated-server)

이번에는 Steam에서 방장이 직접 열던 기존 Co-op 월드를 데디케이트 서버로 옮긴다. 월드 파일만 복사하는 것으로 끝나는 것이 아니라, 기존 방장 캐릭터의 플레이어 ID도 데디케이트 서버에서 사용하는 ID로 변환해야 한다.

이 글은 아래 환경을 기준으로 한다.

```text
클라이언트: Windows 11 Steam 버전
서버: WSL2 Ubuntu의 Linux Dedicated Server
서버 경로: ~/work/palserver
Palworld 버전: 1.0
```

## 이전 과정의 핵심

일반 Co-op 월드의 방장 캐릭터는 고정된 플레이어 ID를 사용한다.

```text
00000000000000000000000000000001
```

반면 데디케이트 서버에서는 Steam 계정에 대응하는 별도의 플레이어 ID를 사용한다. 따라서 전체 이전 과정은 아래처럼 나뉜다.

```text
1. Windows의 Co-op 월드 전체 백업
2. 월드 폴더를 WSL 데디케이트 서버로 복사
3. DedicatedServerName을 기존 월드 ID로 변경
4. 서버에서 임시 캐릭터를 만들어 새 플레이어 ID 확인
5. 기존 방장 ID를 새 플레이어 ID로 변환
6. 변환된 월드를 서버에 적용
7. 캐릭터·팰·길드·거점 확인
```

Co-op에 참가했던 다른 Steam 플레이어는 이미 계정 기반 ID를 사용하므로 일반적으로 방장 캐릭터만 변환하면 된다.

:::important
저장 데이터 변환 전에는 원본 월드 폴더를 반드시 별도 위치에 복사한다. 이후 작업은 원본이 아닌 복사본으로 진행한다.
:::

## 1. 기존 Co-op 월드 찾기

Palworld와 Steam을 먼저 종료한다.

`Win + R`을 누른 뒤 아래 경로를 연다.

```text
%LOCALAPPDATA%\Pal\Saved\SaveGames
```

Steam 버전의 저장 구조는 대략 아래와 같다.

```text
SaveGames
└─ <SteamID64>
   └─ <월드 ID>
      ├─ Level.sav
      ├─ LevelMeta.sav
      ├─ LocalData.sav
      ├─ WorldOption.sav
      └─ Players
         ├─ 00000000000000000000000000000001.sav
         └─ <다른 플레이어 ID>.sav
```

월드가 여러 개라면 폴더의 수정 날짜와 `Level.sav`의 수정 시간을 기준으로 이전할 월드를 찾는다.

내가 이전한 Co-op 월드 ID는 아래 값이었다.

```text
139927D540631CFB61B947BEA9D05437
```

방장 파일도 확인한다.

```text
Players\00000000000000000000000000000001.sav
```

## 2. 원본 월드 백업

Windows 파일 탐색기에서 월드 ID 폴더 전체를 바탕화면 같은 별도 위치에 복사한다.

```text
Palworld_Coop_Original_Backup
└─ 139927D540631CFB61B947BEA9D05437
   ├─ Level.sav
   ├─ LevelMeta.sav
   ├─ LocalData.sav
   ├─ WorldOption.sav
   └─ Players
```

WSL에서 백업하려면 Windows 사용자명과 월드 ID를 지정한 뒤 복사할 수도 있다.

```bash
WIN_USER="<Windows 사용자명>"
WORLD_ID="139927D540631CFB61B947BEA9D05437"

SOURCE_ROOT="/mnt/c/Users/$WIN_USER/AppData/Local/Pal/Saved/SaveGames"

find "$SOURCE_ROOT" \
  -mindepth 2 \
  -maxdepth 3 \
  -type f \
  -name Level.sav \
  -printf '%TY-%Tm-%Td %TH:%TM %p\n'
```

출력에서 `<SteamID64>/<월드 ID>/Level.sav` 경로를 확인한다.

```bash
STEAM_ID64="<SteamID64>"
SOURCE="$SOURCE_ROOT/$STEAM_ID64/$WORLD_ID"
BACKUP_ROOT="/mnt/c/Users/$WIN_USER/Desktop/Palworld_Coop_Original_Backup"

mkdir -p "$BACKUP_ROOT"
cp -a "$SOURCE" "$BACKUP_ROOT/"
```

백업 구조를 확인한다.

```bash
find "$BACKUP_ROOT/$WORLD_ID" \
  -maxdepth 2 \
  -type f \
  -printf '%P\n' |
sort
```

:::caution
`Level.sav`와 방장 플레이어 파일만 따로 보관하지 않는다. `LevelMeta.sav`, `WorldOption.sav`, `LocalData.sav`, `Players` 전체를 포함한 월드 폴더를 통째로 백업해야 한다.
:::

## 3. Co-op 월드를 WSL 서버로 복사

데디케이트 서버를 완전히 종료한다.

```bash
pkill -TERM -f PalServer-Linux-Shipping 2>/dev/null
sleep 3
pgrep -af PalServer
```

마지막 명령에서 아무것도 출력되지 않아야 한다.

서버 경로와 복사할 월드 경로를 지정한다.

```bash
SERVER_ROOT="$HOME/work/palserver"
DEST_PARENT="$SERVER_ROOT/Pal/Saved/SaveGames/0"
DEST="$DEST_PARENT/$WORLD_ID"
```

동일한 이름의 폴더가 없는지 확인한다.

```bash
if test -e "$DEST"; then
  echo "이미 대상 월드 폴더가 존재합니다: $DEST"
else
  cp -a "$SOURCE" "$DEST"
fi
```

복사 결과를 확인한다.

```bash
find "$DEST" \
  -maxdepth 2 \
  -type f \
  -printf '%P\n' |
sort
```

최소한 다음 구조가 보여야 한다.

```text
Level.sav
LevelMeta.sav
Players/00000000000000000000000000000001.sav
```

폴더가 이중으로 들어가지 않았는지도 확인한다.

```text
정상:
SaveGames/0/1399.../Level.sav

잘못된 구조:
SaveGames/0/1399.../1399.../Level.sav
```

## 4. 기존 월드를 활성 월드로 지정

서버가 최초 실행 때 만든 새 월드와 방금 복사한 Co-op 월드가 함께 있을 수 있다.

```bash
ls -1 "$DEST_PARENT"
```

내 환경에서는 아래 두 폴더가 있었다.

```text
139927D540631CFB61B947BEA9D05437
EE77A9292E604A90B789114BC88E9DCF
```

`EE77...`은 데디케이트 서버가 처음 만든 월드이고, `1399...`가 이전할 Co-op 월드다.

Linux 서버의 `GameUserSettings.ini`를 연다.

```bash
nano \
  "$SERVER_ROOT/Pal/Saved/Config/LinuxServer/GameUserSettings.ini"
```

`DedicatedServerName`을 기존 월드 ID로 변경한다.

```ini
DedicatedServerName=139927D540631CFB61B947BEA9D05437
```

따옴표나 앞뒤 공백을 넣지 않고, `SaveGames/0` 아래의 폴더명과 대소문자까지 정확히 맞춘다.

```bash
grep '^DedicatedServerName=' \
  "$SERVER_ROOT/Pal/Saved/Config/LinuxServer/GameUserSettings.ini"
```

정상 출력은 다음과 같다.

```text
DedicatedServerName=139927D540631CFB61B947BEA9D05437
```

## 5. 새 데디케이트 플레이어 ID 만들기

서버를 실행한다.

```bash
cd "$SERVER_ROOT"

./PalServer.sh \
  -port=8211 \
  -players=8
```

기존 Co-op 방장이 Palworld에서 아래 주소로 접속한다.

```text
127.0.0.1:8211
```

새 캐릭터 생성 화면이 나타나면 임시 캐릭터를 만든다.

1. 이름과 외형은 임시 값으로 생성한다.
2. 월드에 들어가 기존 건물과 거점이 보이는지 확인한다.
3. 30초 정도 기다린 뒤 타이틀로 정상적으로 나간다.
4. 서버의 저장이 끝날 때까지 잠시 기다린다.
5. 서버를 `Ctrl+C`로 정상 종료한다.

이 캐릭터는 기존 방장 캐릭터가 데디케이트 서버에서 사용할 새 플레이어 ID를 생성하기 위한 임시 데이터다.

서버를 종료한 뒤 최근 생성된 플레이어 파일을 확인한다.

```bash
find "$DEST/Players" \
  -maxdepth 1 \
  -type f \
  -name '*.sav' \
  ! -name '*_dps.sav' \
  -printf '%T@ %TY-%Tm-%Td %TH:%TM:%TS %f\n' |
sort -nr |
head
```

기존에 없던 최신 파일이 임시 캐릭터 파일이다.

```text
6E80B1A6000000000000000000000000.sav
```

`.sav`를 제외한 값이 새 데디케이트 플레이어 ID다.

```bash
OLD_HOST_ID="00000000000000000000000000000001"
NEW_HOST_ID="6E80B1A6000000000000000000000000"
```

실제 변환에는 예시 값이 아니라 자신의 `Players` 폴더에 생성된 값을 사용한다.

## 6. 방장 캐릭터 변환

플레이어 파일 이름만 바꾸면 `Level.sav` 안의 캐릭터, 길드, 팰, 건축물 참조는 이전 ID를 계속 가리킨다. 따라서 플레이어 파일과 `Level.sav`의 관련 ID를 함께 변환해야 한다.

Palworld 1.0 저장 형식을 지원하는 브라우저 기반 변환 도구를 사용했다.

[Palworld Save Converter](https://hub.tcno.co/games/palworld/converter/)

작업 순서는 다음과 같다.

1. 변환 방향을 `Co-op → Dedicated`로 선택한다.
2. 서버에 복사한 파일이 아닌 **원본 백업 월드 폴더 전체**를 선택한다.
3. 방장 캐릭터 파일을 선택한다.

```text
00000000000000000000000000000001.sav
```

4. 대상 플레이어 ID에 앞에서 확인한 새 데디케이트 ID를 입력한다.

```text
6E80B1A6000000000000000000000000
```

5. 원본 백업이 있다는 항목을 확인한 뒤 변환을 실행한다.
6. 변환된 ZIP 파일을 내려받아 별도 폴더에 압축을 푼다.

도구는 선택한 방장 캐릭터의 플레이어 ID와 `Level.sav` 안의 관련 참조를 함께 변경한다. 다른 Co-op 참가자의 플레이어 파일은 그대로 유지된다.

:::warning
이 도구는 Pocketpair 공식 도구가 아니다. 페이지는 저장 파일을 서버에 업로드하지 않고 브라우저 안에서 처리한다고 설명하지만, 변환 결과를 적용하기 전에 원본 백업을 별도로 유지해야 한다.
:::

## 7. 변환된 월드를 서버에 적용

압축을 푼 변환 결과 경로를 지정한다.

```bash
CONVERTED="/mnt/c/Users/$WIN_USER/Downloads/palworld-converted"
```

아래 파일과 디렉터리가 있는지 먼저 확인한다.

```bash
test -f "$CONVERTED/Level.sav"
test -f "$CONVERTED/LevelMeta.sav"
test -d "$CONVERTED/Players"
```

서버가 완전히 종료된 상태인지 다시 확인한다.

```bash
pgrep -af PalServer
```

기존 서버 월드를 한 번 더 백업하고, 활성 월드 폴더를 같은 ID로 교체한다.

```bash
SERVER_BACKUP="$HOME/palworld-before-host-convert-$(date +%Y%m%d-%H%M%S)"

mv "$DEST" "$SERVER_BACKUP"
mkdir -p "$DEST"
cp -a "$CONVERTED/." "$DEST/"
```

변환된 방장 파일을 확인한다.

```bash
test -f "$DEST/Level.sav"
test -f "$DEST/Players/$NEW_HOST_ID.sav"
```

`GameUserSettings.ini`의 `DedicatedServerName`은 같은 월드 ID를 계속 가리키므로 다시 바꿀 필요가 없다.

:::important
실행 중인 서버에 변환 파일을 덮어쓰면 종료 과정에서 메모리에 있던 이전 월드가 다시 저장될 수 있다. 파일 교체는 반드시 서버가 종료된 상태에서 진행한다.
:::

## 8. 이전 결과 확인

서버를 다시 실행한다.

```bash
cd "$SERVER_ROOT"

./PalServer.sh \
  -port=8211 \
  -players=8
```

기존 방장 계정으로 접속해 아래 항목을 확인한다.

- 기존 캐릭터의 레벨과 이름
- 인벤토리와 장비
- 보유 팰과 팰 상자
- 길드와 거점 소유권
- 건축물과 보관함
- 다른 참가자의 캐릭터 데이터

확인이 끝나기 전에는 원본 백업과 교체 직전 서버 백업을 삭제하지 않는다.

## 9. 지도 탐험 기록 옮기기

캐릭터와 월드는 정상인데 지도 탐험 기록이 초기화된 것처럼 보일 수 있다. `LocalData.sav`는 서버의 `SaveGames/0`이 아니라 각 플레이어의 Windows PC에 저장되는 개인 데이터다.

Palworld를 종료한 상태에서 PowerShell을 연다.

```powershell
$SaveRoot = "$env:LOCALAPPDATA\Pal\Saved\SaveGames\<SteamID64>"

Get-ChildItem $SaveRoot -Directory |
Sort-Object LastWriteTime -Descending |
Select-Object Name, LastWriteTime
```

기존 Co-op 월드 폴더와 데디케이트 서버 접속 후 새로 생성된 폴더를 수정 시간으로 구분한다.

새 서버 쪽 `LocalData.sav`를 먼저 백업한 뒤 기존 파일을 복사한다.

```powershell
$OldWorld = Join-Path $SaveRoot "139927D540631CFB61B947BEA9D05437"
$NewServer = Join-Path $SaveRoot "<새 서버 접속 폴더>"

Copy-Item `
  (Join-Path $NewServer "LocalData.sav") `
  (Join-Path $NewServer "LocalData.sav.before-migration.bak")

Copy-Item `
  (Join-Path $OldWorld "LocalData.sav") `
  (Join-Path $NewServer "LocalData.sav") `
  -Force
```

이 작업은 필요한 플레이어의 PC에서 각각 진행한다.

## 10. WorldOption.sav 처리

기존 Co-op 월드의 난이도와 배율을 그대로 유지하려면 `WorldOption.sav`도 함께 보존한다.

반대로 데디케이트 서버의 `PalWorldSettings.ini`로 설정을 관리하려면 서버를 종료한 상태에서 파일을 백업 이름으로 변경한다.

```bash
mv \
  "$DEST/WorldOption.sav" \
  "$DEST/WorldOption.sav.coop-backup"
```

그다음 아래 파일의 설정을 사용한다.

```text
~/work/palserver/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini
```

월드 이전과 방장 ID 변환이 모두 확인된 뒤에 설정 관리 방식을 선택하는 편이 안전하다.

## 정리

Co-op 월드를 데디케이트 서버로 이전할 때 필요한 핵심 파일과 설정은 아래와 같다.

```text
Windows Co-op 원본:
%LOCALAPPDATA%\Pal\Saved\SaveGames\<SteamID64>\<월드 ID>

WSL 서버 월드:
~/work/palserver/Pal/Saved/SaveGames/0/<월드 ID>

활성 월드 지정:
Pal/Saved/Config/LinuxServer/GameUserSettings.ini

기존 Co-op 방장 ID:
00000000000000000000000000000001

새 데디케이트 방장 ID:
서버 접속 후 새로 생성된 Players/<ID>.sav의 파일명
```

월드 폴더를 복사한 뒤 `DedicatedServerName`을 맞추고, 방장 캐릭터의 ID를 변환한 `Level.sav`와 `Players`를 함께 적용해야 기존 진행 상황을 유지할 수 있다.

## 참고 자료

- [Palworld Server Guide 1.0 - Deploy dedicated server](https://docs.palworldgame.com/getting-started/deploy-dedicated-server/)
- [Palworld Server Guide 1.0 - Configuration parameters](https://docs.palworldgame.com/settings-and-operation/configuration/)
- [Palworld Save Converter](https://hub.tcno.co/games/palworld/converter/)
- [xNul - palworld-host-save-fix](https://github.com/xNul/palworld-host-save-fix)
