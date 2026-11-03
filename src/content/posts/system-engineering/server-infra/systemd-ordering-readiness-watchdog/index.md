---
title: "[systemd] 서비스 시작 순서·준비 완료·watchdog 구분하기"
published: 2026-11-03
description: "systemd의 After와 Requires는 시작 순서와 의존성을, Type=notify는 준비 완료를, WatchdogSec는 동작 중 멈춤을 다룬다. Python 예제로 READY·watchdog 알림을 보내고 서비스 상태와 재시작 기록을 확인하는 방법을 정리한다."
image: "./systemd-readiness-cover.jpg"
tags: [systemd, Linux, Watchdog, Embedded Linux, Python]
category: "Server & Infra"
categoryPath:
  - "System Engineering"
  - "Server & Infra"
draft: false
lang: "ko"
---

부팅 스크립트를 systemd 서비스로 옮기고 `After=`도 넣었는데 앱이 너무 일찍 시작한다. 프로세스는 살아 있지만 요청에는 응답하지 않는 경우도 있다. 겉으로는 모두 서비스 문제로 보이지만 확인할 설정은 다르다.

**시작 순서, 초기화 완료, 동작 중 진행 상태를 나눠 봐야 한다.** `After=`로 순서를 정해도 앱 내부의 초기화가 끝났는지는 알 수 없다. `Restart=on-failure`를 넣어도 종료하지 않고 멈춘 프로세스를 그것만으로 찾아내지는 못한다.

이 글은 systemd 255와 Python 3.11을 사용하는 WSL2의 사용자 서비스 관리자에서 확인한 예제로 설명한다. 실제 보드의 장치 초기화나 하드웨어 watchdog을 시험한 결과는 아니다. 서비스를 rootfs에 설치하는 레시피는 [Yocto rootfs 수정사항을 레시피로 관리하기](/posts/embedded-system/bsp-build-system/yocto-rootfs-recipes/)에서 다뤘다.

## 먼저 어떤 상태를 기다리는지 정한다

| 필요한 동작 | 확인할 설정·동작 |
| --- | --- |
| 두 unit의 시작 순서 정하기 | `After=`·`Before=` |
| 다른 unit도 함께 시작하도록 요청하기 | `Wants=`·`Requires=` |
| 앱이 요청을 받을 준비가 될 때까지 기다리기 | `Type=notify`와 `READY=1` |
| 앱이 동작 중 진행 상태를 계속 알리기 | `WatchdogSec=`와 `WATCHDOG=1` |
| 실패한 서비스를 다시 실행하기 | `Restart=`·`RestartSec=` |
| 시작 자체가 끝나지 않는 상황 제한하기 | `TimeoutStartSec=` |

예를 들어 카메라 앱이 센서 설정을 마쳐야 요청에 답할 수 있다면, 프로세스가 생성된 시점과 서비스 준비가 끝난 시점이 다르다. 이 차이를 서비스 관리자가 알 수 있게 해야 한다.

## After는 순서를 정하고 Requires는 의존성을 만든다

다음 설정은 `demo-setup.service`와 앱 서비스가 모두 시작될 때 순서를 정한다.

```ini
[Unit]
After=demo-setup.service
```

이 설정만으로 `demo-setup.service`를 시작하도록 요청하지는 않는다. 준비 작업도 함께 실행해야 하고 그 작업의 시작 실패를 현재 서비스에 반영하려면 요구 의존성과 순서를 함께 지정한다.

```ini
[Unit]
Requires=demo-setup.service
After=demo-setup.service
```

`Requires=`만 쓰면 두 unit이 병렬로 시작할 수 있다. 반대로 `After=`만 쓰면 상대 unit이 시작 대상으로 들어오지 않을 수 있다. 요구 의존성과 순서는 별도 설정이다. [systemd.unit 의존성과 순서](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html#Before=)

보조 서비스 없이도 앱을 실행할 수 있다면 `Wants=`를 검토한다. 다만 어떤 unit을 요구하는지만 정해서는 충분하지 않다. **그 unit이 언제 시작을 마쳤다고 판단하는지도 확인해야 한다.**

## Type에 따라 시작 완료 시점이 달라진다

| Type | 시작 완료 판단의 기준 | 앱의 초기화 완료도 알 수 있는가 |
| --- | --- | --- |
| `simple` | 서비스 프로세스를 생성한 시점 | 별도로 알 수 없음 |
| `exec` | 서비스 실행 파일의 `execve()`가 성공한 시점 | 별도로 알 수 없음 |
| `oneshot` | 시작 명령이 성공적으로 끝난 시점 | 그 명령이 수행한 작업까지 |
| `notify` | 서비스가 `READY=1`을 알린 시점 | 앱이 그 알림을 보낸 기준까지 |

`Type=exec`는 실행 파일을 찾지 못하거나 실행할 수 없는 문제를 시작 실패로 다루는 데 도움이 된다. 하지만 실행에 성공했다는 사실이 소켓 바인딩, 설정 로드, 장치 초기화의 완료를 뜻하지는 않는다. [systemd.service의 Type](https://www.freedesktop.org/software/systemd/man/255/systemd.service.html#Type=)

`Type=notify`를 쓰면 앱이 준비를 마친 뒤 알림을 보낼 수 있다. 그러면 이 서비스 뒤로 순서를 지정한 unit도 그 시작 완료를 기다린다. 알림을 너무 일찍 보내면 기다리는 쪽도 일찍 진행한다. `READY=1`은 서비스 관리자가 대신 검사해 주는 건강 진단이 아니다.

`After=network-online.target`도 같은 관점으로 읽어야 한다. 로컬 네트워크 초기화와 원격 서버의 응답 가능 여부는 다르다. 원격 API가 꼭 필요하다면 연결 실패 처리와 재시도 정책은 앱에도 있어야 한다. [네트워크 준비 상태의 의미](https://systemd.io/NETWORK_ONLINE/)

## 준비 완료와 heartbeat를 보내는 작은 앱

실습에는 실행 중인 사용자 서비스 관리자가 필요하다.

```bash
systemctl --version
systemctl --user is-system-running

mkdir -p systemd-readiness-lab
cd systemd-readiness-lab
```

아래 내용을 `worker.py`에 저장한다. Python 표준 라이브러리만 사용한다. 처음 2초는 초기화 작업을 흉내 내고, 이후 루프가 진행될 때마다 watchdog 알림을 보낸다.

```python title="worker.py"
import os
import socket
import time
from pathlib import Path


def notify(message):
    address = os.environ["NOTIFY_SOCKET"]
    if address.startswith("@"):
        address = "\0" + address[1:]
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
        channel.connect(address)
        channel.sendall(message.encode())


watchdog_pid = int(os.environ.get("WATCHDOG_PID", os.getpid()))
if watchdog_pid != os.getpid():
    raise RuntimeError("watchdog belongs to another process")

interval = int(os.environ["WATCHDOG_USEC"]) / 2_000_000
if interval <= 0:
    raise RuntimeError("watchdog interval must be positive")

# Simulate initialization; replace this with real readiness checks.
time.sleep(2)
notify("READY=1\nSTATUS=ready")

while True:
    if Path("stall").exists():
        time.sleep(60)
        continue
    # This loop stands in for application work and reports its progress.
    time.sleep(min(interval, 1))
    notify("WATCHDOG=1")
```

`NOTIFY_SOCKET`은 서비스 관리자가 전달한 Unix 소켓 주소다. `@`로 시작하면 추상 소켓 주소로 바꿔 연결한다. `WATCHDOG_USEC`는 초가 아니라 마이크로초이므로, 위 코드는 그 절반을 초로 환산한다. 이 예제에서는 알림 간격을 최대 1초로 제한한다. [알림 프로토콜](https://www.freedesktop.org/software/systemd/man/latest/sd_notify.html), [watchdog 환경 변수](https://www.freedesktop.org/software/systemd/man/latest/sd_watchdog_enabled.html)

이 프로그램은 systemd가 알림 소켓과 watchdog 환경 변수를 제공하는 조건을 전제로 한다. 터미널에서 `python3 worker.py`만 실행하는 예제는 아니다. C/C++ 데몬에서는 직접 소켓을 구현하기보다 `sd_notify()`와 `sd_watchdog_enabled()` 같은 libsystemd API를 사용하는 편이 낫다.

## 임시 사용자 서비스로 실행한다

실습 unit 이름이 기존 서비스와 겹치지 않는지 먼저 확인한다. 이미 사용 중이면 다른 이름을 정해 이후 명령에도 동일하게 적용한다.

```bash
systemctl --user show blog-readiness-demo.service -p LoadState
```

`LoadState=not-found`라면 다음 명령으로 실행한다. `sudo`나 시스템 서비스 등록은 필요 없다.

```bash
systemd-run --user --no-block --collect \
  --unit=blog-readiness-demo.service \
  --property=Type=notify --property=NotifyAccess=main \
  --property=WatchdogSec=4s --property=TimeoutStartSec=15s \
  --property=Restart=on-failure --property=RestartSec=1s \
  --property=LimitCORE=0 --property=WorkingDirectory="$PWD" \
  /usr/bin/python3 "$PWD/worker.py"
```

`--no-block`는 시작 작업이 끝날 때까지 명령을 기다리지 않게 한다. 따라서 초기화 중인 상태를 관찰할 수 있다. 명령이 반환됐다는 사실만으로 서비스 준비가 완료된 것은 아니다. `--collect`는 종료 후 불필요한 임시 unit을 정리하도록 한다. [systemd-run](https://www.freedesktop.org/software/systemd/man/255/systemd-run.html)

```bash
systemctl --user show blog-readiness-demo.service \
  -p ActiveState -p SubState -p MainPID -p NRestarts -p WatchdogUSec

journalctl --user -u blog-readiness-demo.service -b -n 30 --no-pager
```

초기화하는 동안에는 `activating`이고, `READY=1`을 받은 뒤에는 `active`로 바뀐다. 초기화가 끝나지 않으면 `TimeoutStartSec=15s`가 시작 실패를 제한한다. 서비스 watchdog은 시작 완료 이후의 진행 상태를 감시한다.

## 멈춘 앱이 다시 시작되는지 확인한다

정상 루프가 잠시 동작하도록 기다린 뒤 `MainPID`와 `NRestarts`를 기록한다. 이후 실습 디렉터리에 `stall` 파일을 만든다.

```bash
touch stall

systemctl --user show blog-readiness-demo.service \
  -p ActiveState -p SubState -p MainPID -p NRestarts -p Result

journalctl --user -u blog-readiness-demo.service -b -n 40 --no-pager
```

파일을 발견한 루프는 60초 동안 잠들며 heartbeat를 보내지 않는다. 마지막 알림 이후 watchdog 제한을 넘으면 서비스 관리자가 이를 실패로 처리하고, `Restart=on-failure`에 따라 다시 실행한다. 이 예제는 `LimitCORE=0`으로 실습 중 core dump 생성을 제한했다.

로그에 watchdog 실패가 남는지, `NRestarts`가 늘었는지, 새 프로세스의 `MainPID`가 이전과 다른지 함께 본다. 재시작 뒤 `Result`가 바뀔 수 있으므로 상태값 한 번만 읽고 원인을 단정하지 않는다.

`stall` 파일이 남아 있으면 다음 프로세스도 다시 멈춘다. 재시작을 관찰한 뒤 파일을 지워 정상 루프로 돌아오게 하고, 실습을 마치면 서비스를 중지한다.

```bash
rm -f stall
systemctl --user stop blog-readiness-demo.service
```

실제 데몬에는 `StartLimitIntervalSec=`와 `StartLimitBurst=`도 검토해야 한다. 실패 원인이 남아 있는데 재시작만 반복하면 로그와 자원을 계속 소모한다. 시작 제한에 도달한 경우에는 원인을 해결한 뒤 `systemctl reset-failed`로 상태를 정리할 수 있다. [시작 횟수 제한](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html#StartLimitIntervalSec=)

## heartbeat는 감시할 작업의 진행 상태를 반영해야 한다

별도 스레드가 일정한 간격으로 알림만 보내면, 실제 처리 루프가 멈춰도 watchdog은 정상으로 볼 수 있다. 어떤 상태를 실패로 판단할지 앱에서 정해야 한다.

예를 들어 프레임 처리 파이프라인을 감시한다면 최근 작업 완료 시각이나 각 단계의 진행 상태를 확인한 뒤 heartbeat를 보낼 수 있다. 입력이 원래 없는 상태와 처리가 교착된 상태도 구분해야 한다. 단순히 프레임이 잠시 들어오지 않았다는 이유로 서비스를 계속 재시작하면 정상적인 대기까지 실패로 취급하게 된다.

서비스 watchdog과 하드웨어 watchdog도 별개다. 여기서 확인한 `WatchdogSec=`는 프로세스가 알림을 보내는지 감시한다. 시스템 전체의 멈춤에 대응하는 `/dev/watchdog`와 `RuntimeWatchdogSec=` 설정까지 시험한 것은 아니다. [시스템 watchdog 설정](https://www.freedesktop.org/software/systemd/man/255/systemd-system.conf.html#RuntimeWatchdogSec=)

## 확인한 범위

로컬 사용자 서비스에서 준비 알림 전후의 상태 전환, 정상 heartbeat 유지, heartbeat 중단 후 재시작, 새 PID와 로그, 멈춤 조건을 제거한 뒤의 복구를 확인했다. 앱은 시험 후 중지했다.

실제 제품에 적용할 때는 고정된 대기 시간을 그대로 옮기지 않는다. 장치와 앱의 준비 조건을 검사하고, 처리 지연의 정상 범위를 측정한 뒤 timeout과 watchdog 시간을 정해야 한다. unit 설정이 맞아도 그 기준이 틀리면 너무 이른 시작이나 불필요한 재시작이 남는다.

## 함께 읽기

- [Yocto rootfs 수정사항을 레시피로 관리하기](/posts/embedded-system/bsp-build-system/yocto-rootfs-recipes/)
- [HTTPS의 지연과 서버 CPU 사용량 측정하기](/posts/system-engineering/server-infra/https-tls-cost-measurement/)
- [systemd.service 공식 문서](https://www.freedesktop.org/software/systemd/man/255/systemd.service.html)
