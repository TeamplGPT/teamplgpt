# Node-oracledb Thick 모드 환경설정 가이드 (WSL Ubuntu)

---

## 목차

1. [시스템 패키지 업데이트](#1-시스템-패키지-업데이트)
2. [Oracle Instant Client 다운로드 및 설치](#2-oracle-instant-client-다운로드-및-설치)
3. [필수 의존성 패키지 설치](#3-필수-의존성-패키지-설치)
4. [Instant Client 라이브러리 경로 등록](#4-instant-client-라이브러리-경로-등록)
5. [문제 해결 체크리스트](#5-문제-해결-체크리스트)
6. [Thin 모드로 대체 (선택)](#6-thin-모드로-대체-선택)

---

## 1. 시스템 패키지 업데이트

sudo apt update && sudo apt upgrade -y  
sudo apt install -y build-essential curl unzip

---

## 2. Oracle Instant Client 다운로드 및 설치

1. [Oracle 공식 Instant Client 다운로드 페이지](https://www.oracle.com/database/technologies/instant-client/downloads.html)에서 Basic (또는 Basic Lite) x64 ZIP 파일을 다운로드합니다.
2. 홈 디렉터리(예: ~/oracle)에 압축 해제합니다.

```
mkdir -p ~/oracle
cd ~/oracle
wget https://download.oracle.com/otn_software/linux/instantclient/2380000/instantclient-basic-linux.x64-23.8.0.25.04.zip
unzip instantclient-basic-linux.x64-*.zip -d ~/oracle  
```
> 예시 결과: ~/oracle/instantclient_23_8


---

## 3. 필수 의존성 패키지 설치

```
sudo apt install -y libaio1 libnsl2 zlib1g libgcc-s1 libstdc++6
```

> Ubuntu 24.04 이상에서는 아래도 필요할 수 있습니다:

```
sudo apt install -y libaio1t64  
sudo ln -s /usr/lib/x86_64-linux-gnu/libaio.so.1t64 /usr/lib/x86_64-linux-gnu/libaio.so.1
```

---

## 4. Instant Client 라이브러리 경로 등록

### (1) 시스템 전체 적용 

```
echo "$HOME/oracle/instantclient_23_5" | sudo tee /etc/ld.so.conf.d/oracle-instantclient.conf  
sudo ldconfig
```

### (2) 현재 사용자 적용 (대안)

```
nano ~/.bashrc
```

> 파일 맨 아래에 추가
```
export LD_LIBRARY_PATH=$HOME/oracle/instantclient_23_5:$LD_LIBRARY_PATH
```
> 저장 후 아래 명령으로 즉시 반영
```
source ~/.bashrc
```
> 해당 사용자가 새로운 터미널을 열거나 로그인할 때마다 LD_LIBRARY_PATH가 자동으로 설정되어 Node.js + Thick 모드 실행에 항상 적용됩니다.

### 추가 설명
- 시스템 전체(모든 사용자)에 적용하려면 /etc/ld.so.conf.d+sudo ldconfig 방식이 더 안전합니다.
- 여러 사용자가 각각 Instant Client 경로가 다를 때는 .bashrc 방법이 적합합니다.

---


## 5. 문제 해결 체크리스트

| 증상 | 원인 | 해결 방법 |
|------|------|-----------|
| DPI-1047 오류 | .so 라이브러리 검색 실패 | 경로 및 권한, 의존성, ldconfig 설정 확인 |
| libaio.so.1 오류 | Ubuntu 24.04 이상에서 패키지명 변경 | libaio1t64 설치 후 심볼릭 링크 생성 |
| Segmentation fault | 의존성 누락, 잘못된 폴더 위치 | 홈 폴더 내 설치, 의존성 설치, 최신 node-oracledb 사용 |
| oracledb.thin이 true | Thick 모드 활성화 실패 | 코드 및 환경변수, 경로 설정 재점검 |

---

## 10. Thin 모드로 대체 (선택)

> Thick 모드가 꼭 필요하지 않다면, initOracleClient() 호출을 생략하면 Thin 모드(순수 JS)로 실행되어, 대부분의 일반 SQL 작업이 가능합니다.

---

## ✅ 최종 체크리스트

- [ ] WSL2 및 Ubuntu 최신화
- [ ] Instant Client 홈폴더 압축 해제
- [ ] 필수 패키지 설치 (libaio, libnsl, 등)
- [ ] ldconfig 또는 LD_LIBRARY_PATH 설정
- [ ] Node.js, node-oracledb 설치
- [ ] 코드에서 Thick 모드 활성화
- [ ] oracledb.thin이 false, 버전 정상 확인
- [ ] 쿼리 테스트 및 오류 없는지 검증

---
