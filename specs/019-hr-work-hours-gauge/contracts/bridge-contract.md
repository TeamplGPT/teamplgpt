# Contract: 근무시간 조회 중계 규칙

세 곳에 같은 규칙을 둔다(research R2·R9). 단 서버는 사번 규칙(필수·본인 마커)만 갖는다 — cmd·키는 handler 코드 상수라 LLM이 바꿀 수 없다(019 보안 리뷰 INFO-1). 경로·cmd·허용 키 검사는 두 브리지 몫이다.

⚠️ HR 시스템(`HomeController`)은 `cmmSearchStaffId`가 로그인한 본인인지 확인하지 않는다(019 보안 리뷰 참고-1, kiwibox 읽기 전용이라 이쪽에서 고칠 수 없음). 이 경로에서 다른 직원 조회를 막는 것은 아래 규칙뿐이므로 세 곳 중 하나라도 빼지 않는다.

| 위치 | 파일 |
|---|---|
| 서버 | `server/storage/plugins/agent-skills/_shared/staffParams.js` (`REQUIRED_STAFF_PARAMS`) |
| 위젯 | okrservice `widgets/client/messenger/widget/hrBridge.ts` |
| HR 페이지 | `extras/kiwibox-bridge/teamplgpt-hr-bridge.js` |

## 요청 (handler → 브리지)

```text
path: /Home.do
form: { cmd: "getHomeWorkStatusBarWidgetMap", searchYmd: "2026-10-21", cmmSearchStaffId: "$SELF_STAFF_ID" }
```

## 규칙

| 규칙 | 값 | 어기면 |
|---|---|---|
| 경로 허용 | `/Home.do` 추가(위젯 `ALLOWED_PATHS`, JSP `DEFAULT_ALLOWED_PATHS`) | `bridge: path not allowed` |
| cmd 허용 | `/Home.do`: `getHomeWorkStatusBarWidgetMap` 하나 | `bridge: cmd not allowed` |
| 필수 사번 | `/Home.do`: `cmmSearchStaffId` — 없으면 거부, 값은 본인 마커만 | 서버: "본인 정보를 확인할 수 없어 조회하지 않았습니다" / 브리지: `bridge: staff param required`, `bridge: staff param must be self` |
| 허용 키 | `/Home.do`: `cmd`, `searchYmd`, `cmmSearchStaffId` 외 거부 | `bridge: param key not allowed` |

## 테스트 벡터

| 요청 | 결과 |
|---|---|
| 위 정상 요청 | 허용, `cmmSearchStaffId` → 페이지 본인 STAFF_ID |
| `cmd: "getHomeOverTimeChartMapDetailStaff"` | cmd 거부 |
| `cmd` 없음 | cmd 거부 |
| `cmmSearchStaffId` 없음 | 필수 사번 거부 |
| `cmmSearchStaffId: "S9999"` | 본인 아님 거부 |
| `searchOrgCd: "100"` 추가 | 허용 키 거부 |
| JSP `config.allowedPaths`에 `/Home.do`만 지정 | 기본 목록과 교집합이라 허용(기존 규칙) |
