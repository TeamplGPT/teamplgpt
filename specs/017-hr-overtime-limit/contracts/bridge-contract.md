# Contract: 브리지 허용 규칙 (위젯 · HR 시스템 내부)

대상:
- okrservice `widgets/client/messenger/widget/hrBridge.ts` (+ `hrBridge.test.ts`)
- teamplgpt `extras/kiwibox-bridge/teamplgpt-hr-bridge.js`

두 파일은 같은 규칙을 가진다(기존 관례).

## 1. 경로 허용 목록 추가

| 경로 | cmd | 비고 |
|---|---|---|
| `/getMBLDclzWorkOtSchdul.do` | 없음(cmd 파라미터가 있으면 거부 — 기존 "CMD_ALLOWLIST에 없는 경로" 규칙) | 한도·사용·잔여 |
| `/getMBLDclzWorkOtSchdulPerson.do` | 없음 | 날짜별 내역 |

`/TAADclzWorkOtSchdul.do`는 이번 배포에서 유지한다(research R8). 제거는 후속 작업이다.

## 2. 파라미터 값 허용 (기존 `PARAM_VALUE_ALLOWLIST`)

| 경로 | 키 | 허용 값 |
|---|---|---|
| `/getMBLDclzWorkOtSchdul.do` | `searchType` | `2`, `3` |

키가 없거나 다른 값이면 `bridge: param not allowed`로 거부한다. searchType이 없으면 SQL이 아무 분기도 타지 않는다. 다른 값을 막는 것은 향후 분기 추가에 대비한 것이다.

## 3. 필수 사번 파라미터 (신규 `REQUIRED_STAFF_PARAMS`)

처음에는 새 두 경로만 넣었으나, 보안 리뷰에서 구 연장근무·근무현황 등도 키를 빼면 팀 전체가 나오는 것이 확인돼 **서버가 사번 키를 보내는 모든 경로**로 넓혔다(research R11).

| 경로 | 반드시 있어야 하는 키 |
|---|---|
| `/TAAWrkTimeStatusMgr.do`, `/TAADclzWorkOtSchdul.do`, `/getMBLDclzWorkOtSchdul.do`, `/getMBLDclzWorkOtSchdulPerson.do`, `/SALSalaryDtstmnMgr.do`, `/SALDaylabMgr.do`, `/LONLoanReqstListMgr.do` | `cmmSearchStaffId` |
| `/TAADclzWorkSearchCldr.do` | `cmmSearchStaffId`, `searchId` |
| `/TAADclzVcatnList.do` | `staffId`, `cmmSearchStaffId` |
| `/getMBLPrtEmpCard.do`, `/getMBLPrtEmpCardPop.do` | `searchStaffId` |
| `/PRCHrBassiemMgrTab220.do` | `staffId`, `cmmSearchStaffId`, `searchStaffId` |
| `/CommonCode.do`, `/SALSalaryBassMgr.do` | `staffId` |
| `/CTIMcrtfIssuMgr.do` | `staffIdNm` (사번 키 목록에도 추가 — 값은 본인 마커만) |
| `/YTA*{연도}.do` | `cmmSearchStaffId` (`YTAInDctMgr`만 `searchStaffId`) |

새 연장근무 두 경로는 허용 키도 정확히 정한다(`ALLOWED_PARAM_KEYS`, 그 밖의 키 → `bridge: param key not allowed`): 한도 = `searchType, searchBaseSYmd, cmmSearchStaffId`, 내역 = `searchBaseSYmd, searchBaseEYmd, cmmSearchStaffId`.

- 키가 없으면 → `bridge: staff param required`
- 키가 있는데 값이 마커가 아니면(빈 문자열 포함) → 기존 `bridge: staff param must be self`
- 마커를 본인 ID로 바꾸지 못하면(페이지에서 못 찾음) → 기존 `bridge: staffId not found`

검사 순서: 경로 → cmd → 파라미터 값 → 필수 사번 → 허용 키 → queryId → 키별 루프(기존). 거부 시 fetch를 호출하지 않는다. 본인 ID(페이지 DOM·JSP 설정)가 공백뿐이면 없는 것으로 본다.

## 4. 테스트 (okrservice jest, teamplgpt는 기존 브리지 테스트가 있으면 같은 케이스)

1. 두 경로가 마커 포함 요청이면 fetch 1회, 본문에 치환된 본인 ID가 들어간다.
2. `cmmSearchStaffId` 키가 없으면 거부하고 fetch 0회.
3. `cmmSearchStaffId=""`이면 거부하고 fetch 0회.
4. `searchType=1` 또는 키가 없으면 거부(한도 경로).
5. `cmd=anything`이 붙으면 거부.
