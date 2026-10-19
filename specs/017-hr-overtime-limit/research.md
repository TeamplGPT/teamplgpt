# Research: HR 챗봇 연장근무 한도·사용·잔여 표시

근거 원본(읽기 전용): kiwibox_eGov4.2
- 화면 `kiwibox/src/main/webapp/WEB-INF/jsp/kiwibox/MBL/MBL/mblDclzWorkOtSchdul/mblDclzWorkOtSchdul.jsp`
- 컨트롤러 `kiwibox/src/main/java/kiwibox/MBL/MBL/mblDclzWorkOtSchdul/MBLDclzWorkOtSchdulController.java`
- SQL `kiwibox/src/main/resources/kiwibox/sqlmap/MBL/MBL/MBLDclzWorkOtSchdul_SQL.xml`

## R1. 데이터 출처 — 모바일 연장근무현황 조회 두 가지

**Decision**:
- 한도·사용·잔여는 `POST /getMBLDclzWorkOtSchdul.do`를 쓴다(SQL `getMBLDclzWorkOtSchdulList`). `cmd` 파라미터는 없다.
  - `searchType=2`: 주간. `LMT_OT`(한도), `USE_OT`(사용, 신청건 포함), `REM_OT`(잔여), `APPL_OT`(결재 중 신청분). 월간 칸은 0으로 고정된다.
  - `searchType=3`: 월간. `LMT_OT2`, `USE_OT2`, `REM_OT2`. 주간 칸은 0으로 고정된다.
  - 기준일은 `searchBaseSYmd`(YYYY-MM-DD 또는 YYYYMMDD, `-`는 SQL이 제거). 주간은 기준일이 속한 주를 계산하고, 월간은 기준일이 속한 달의 1일~말일을 계산한다.
  - 대상은 `cmmSearchStaffId`.
- 날짜별 내역은 `POST /getMBLDclzWorkOtSchdulPerson.do`를 쓴다(SQL `getMBLDclzWorkOtSchdulPersonList`).
  - 기간: `searchBaseSYmd`가 속한 달의 1일 ~ `searchBaseEYmd`.
  - 결재 상태 `REQ_STATUS_CD IN ('20','30')`(결재 중·결재 완료)만 나온다.
  - 응답 칸: `WORK_YMD`, `STA_HM`, `END_HM`, `OT_TIME`(시:분 형식 문자열, `CMMF_FORM_HHMM`), `WKTYPE_NM`, `REASON`, `NOTE`. 결재 상태 칸은 없다.

**Rationale**: 직원이 보는 5240 모바일 연장근무현황(jsp)이 정확히 이 두 조회를 쓴다. 개인보기는 Person, 주간·월간 보기는 searchType 2/3이다. 화면과 같은 숫자를 보장하는 가장 짧은 길이다.

**Alternatives considered**:
- 기존 PC 조회(`/TAADclzWorkOtSchdul.do` List/List2) 유지. 한도가 없고, 연장근무가 없는 달에는 성명·소속만 남아 운영 오답의 원인이 됐다. 그래서 채택하지 않았다.
- PC 조회와 병행. 같은 질문에 두 기준의 숫자가 섞일 수 있어 채택하지 않았다.

## R2. 대상 직원을 비우면 팀 전체가 나온다 — 본인 한정 방어

**Decision**: 대상 직원 파라미터(`cmmSearchStaffId`)는 세 곳에서 **반드시 있고 본인 마커여야** 한다.
1. 서버 handler는 항상 `$SELF_STAFF_ID`를 넣는다. 서버 폴백은 `HR_STAFF_ID`가 없으면 기존 hrFetch가 이미 거절한다.
2. 위젯 브리지(okrservice `hrBridge.ts`)
3. HR 시스템 내부 브리지(`extras/kiwibox-bridge/teamplgpt-hr-bridge.js`)

두 브리지는 이미 "사번 파라미터가 **있으면** 마커만 허용"한다. 키가 **아예 없는** 요청은 그대로 통과한다. 그래서 경로별 필수 사번 파라미터 목록(`REQUIRED_STAFF_PARAMS`)을 추가한다. 키가 없으면 거부한다.

**Rationale**: SQL 62~87행. `x.staff_id is null`이면 "본인소속조회"로 넘어가 조직 조회 권한 안의 직원 전체를 돌려준다. 실제로 모바일 화면도 주간·월간 보기에서는 `cmmSearchStaffId`를 비운다(jsp 356·366·410행). 사용자 스크린샷이 팀 목록이었던 이유다.

범위는 "팀"으로 고정돼 있지 않다. 기준은 요청자의 조직·회사·직원 조회 권한(`AUTF_SRCH_ORG_YN`·`AUTF_SRCH_CORP_YN`·`AUTF_SRCH_STAFF_YN`, `activeMenuCd` 기준)이다. 인사 담당자나 관리자 계정이면 부서나 회사 전체가 나올 수 있다.

챗봇에서 칸이 비어 나가는 경로는 다음과 같다.
- handler가 키를 빠뜨림 → 현재 두 브리지 모두 통과한다. 이번에 막는다.
- 빈 값·공백 → 브리지가 거부한다.
- 페이지에서 본인 ID를 못 찾음 → 브리지가 거부한다.
- 서버 폴백 `HR_STAFF_ID` 미설정 → hrFetch가 거부한다.

Person 조회는 `C.STAFF_ID = x.staff_id` 조건이라 비어 있으면 0건이다. 그래도 같은 규칙을 적용한다(일관성).

**Alternatives considered**: 서버에서만 막기. 브리지는 서버가 보낸 요청을 실행하는 마지막 관문이다. 서버 버그나 조작에 대비해 016과 같이 양쪽에서 막는다.

## R3. 응답에 본인 외 행이 섞였을 때 — 본인 행을 가려낼 수 없다

**Decision**: 한도 조회 응답이 **정확히 1행이 아니면** 그 기간은 결과로 쓰지 않는다. 표에는 "조회 실패"로 표시하고 사유는 고정 문구로 둔다. 본인 행만 골라 쓰지 않는다.

**Rationale**: 응답에 `STAFF_ID`가 없다(`STAFF_NO`, `STAFF_NM`만 있다). 서버는 브리지 경로에서 본인 사번·이름을 모른다(마커 치환은 브리지에서 일어난다). 이름으로 고르면 동명이인 위험이 있다. 015 `fetchSelfMonth`가 이미 쓰는 규칙("여러 행이면 합산하지 않음")과 같다.

**Spec 영향**: FR-011과 US4 시나리오 2의 "본인 행만 남긴다"를 "결과 전체를 쓰지 않는다"로 고쳤다(spec 갱신).

## R4. 주간 기간 표기

**Decision**: 주 범위를 계산해 적지 않는다. "이번 주(10/19 기준)"처럼 기준일만 적는다.

**Rationale**: 주의 시작 요일은 HR 함수 `TAAF_OT_WEEKTIME`과 근무 규칙 설정이 정한다. 원본에서 확인할 수 없다. 추측한 범위를 적으면 사실과 다를 수 있다.

**Spec 영향**: Edge Case "이번 주(9/29~10/5)처럼 함께 적는다"를 기준일 표기로 고쳤다.

## R5. 시간 표시 형식

**Decision**:
- 한도·사용·잔여는 숫자(시간)를 소수 첫째 자리로 맞춘다. 화면 jsp가 `Format:"#,##0.0"`을 쓴다.
- 날짜별 연장시간은 응답의 시:분 문자열을 그대로 쓴다. 화면도 `IB_Preset.HM`이다.
- 값이 null이거나 숫자가 아니면 "—"로 두고 0으로 바꾸지 않는다.

**실서버 확인 항목(T-실서버)**:
- 연장근무가 없을 때 `USE_OT`/`USE_OT2`가 0인지 null인지 확인한다.
- 한도 단위가 시간인지 확인한다(분이면 변환이 필요하다).

null이면 "사용 —"가 되어 D5("사용 0.0")와 어긋난다. 그 경우 한 가지만 허용한다. Person 내역이 0건으로 확인된 같은 달에 한해 사용을 0.0으로 표시한다. 이 규칙은 실서버 결과를 보고 확정한다.

## R6. 기간 질문별 기준일

| 질문 | 한도 조회 | 내역 조회 |
|---|---|---|
| 기간 없음 / 이번 달 | 주간: 오늘, 월간: 오늘 | 이번 달 1일 ~ 오늘 |
| 지난 달 YYYYMM | 월간: 그 달 말일 | 그 달 1일 ~ 말일 |
| 미래 달 | 조회하지 않음(아직 기록 없음 안내) | — |
| 올해 | 1월~이번 달 각 월간(이번 달은 오늘, 지난 달은 말일). 최대 12회 | 조회하지 않음(월별 표만) |
| 지난 해 | 1~12월 각 월간(말일) | 조회하지 않음 |
| 미래 해 | 조회하지 않음 | — |

**Rationale**: 월간 SQL은 기준일 시점의 소속·근무유형으로 한도를 계산한다(`APMT_HST_DAY`의 `base_ymd BETWEEN STA_YMD AND END_YMD`). 월 중간 입사자는 1일 기준이면 0건이 된다. 말일 기준이 해당 월 재직 상태를 가장 잘 반영한다.

연 단위 월별 호출은 015 `runMonthly`(예산 60초, 연속 2회 실패 시 중단, 첫 달 실패 시 즉시 오류)를 그대로 쓴다.

## R7. 기존 조회 종류 이름과 라우팅

**Decision**: `query_type` 값 `overtime`·`overtime_limit`은 그대로 둔다. 둘 다 같은 새 경로로 처리한다. plugin.json 설명은 "둘 다 한도·사용·잔여 + 날짜별 내역을 돌려준다"로 고친다. 기존 라우팅 평가(연장근무 10건)는 기대 query_type이 바뀌지 않아 그대로 유효하다.

**Rationale**: 운영 프롬프트·평가·E2E 호환(spec D7). 두 값을 하나로 합치면 파라미터 계약이 바뀐다.

## R8. 기존 PC 조회 경로의 브리지 허용 목록

**Decision**: 이번 배포에서는 두 브리지의 `/TAADclzWorkOtSchdul.do` 허용을 **남긴다**. 새 서버가 운영에 반영되고 확인된 뒤 후속 작업으로 제거한다.

**Rationale**: 서버 이미지와 위젯·HR 시스템 브리지는 배포 시점이 다르다. 새 서버 + 구 브리지 조합이면 새 경로가 거부되고, 구 서버 + 새 브리지(구 경로 제거) 조합이면 구 경로가 거부된다. 새 경로 추가는 양쪽 호환이다. 구 경로 제거만 순서에 의존하므로 나중에 한다.

**정정(보안 리뷰, 2026-10-19)**: 처음에는 "구 경로도 사번 마커 강제 안에 있어 다른 직원 위험은 없다"고 적었으나 틀렸다. 마커 강제는 사번 키가 **있을 때만** 걸리고, 구 경로 SQL은 `(x1.STAFF_ID is null OR P.STAFF_ID = x1.STAFF_ID) /* null 이면 전체 */`라 키를 빼면 조회 권한 범위 전체를 돌려준다. 근무현황(`/TAAWrkTimeStatusMgr.do`, "본인소속조회")도 같은 구조로, 016 이전부터 운영에 있던 구멍이다. 그래서 구 경로를 남기되 R11처럼 **서버가 사번 키를 보내는 모든 경로를 키 필수**로 바꿨다. 구 서버도 구 경로에 항상 `cmmSearchStaffId`를 보냈으므로 호환된다.

## R9. 렌더 위치 — handler 분리

**Decision**: 조회·검증·렌더를 새 공유 모듈 `_shared/overtimeStatus.js`로 뺀다. handler는 `overtime`·`overtime_limit` 진입 시 이 모듈만 호출한다.

**Rationale**: handler가 이미 672줄이다(코딩 규칙: 파일 800줄 이하, 함수 50줄 이하). 네트워크 없이 단위 테스트하려면 015 `yearQuery`처럼 fetch 콜백을 주입받는 형태가 맞다.

헌장 IV "handler.js 무수정 원칙"은 LLM 행태 제어에 관한 것이다. 데이터 출처 교체는 코드 변경이 불가피하다(015·016도 같은 예외). Complexity Tracking에 적었다.

## R10. 응답 지침 줄

**Decision**: 도구 결과에 다음 `[응답 형식]` 줄을 붙인다. 모두 "이 줄은 답변에 포함하지 마세요"로 끝난다.
- 한도 표는 표 그대로 보여준다. 남은 시간 질문이면 잔여를 첫 문장에 쓴다. 날짜별 내역이 2건 이상이면 표로 보여준다.
- 연장근무가 없으면 "기록이 없습니다"를 그대로 쓴다. "1건", "0건 조회" 같은 표현은 쓰지 않는다.
- 연 단위 표는 015 `MONTHLY_TABLE_LINE` 규칙(합계는 표 마지막 줄, 첫 칸 '합계')을 따른다.

"사용에는 결재 중인 신청 건이 포함됩니다"는 지침이 아니라 사실 문장이다. 그래서 표 아래 일반 줄로 둔다(모델이 그대로 옮기게 한다). 이 문장은 결재 중 건 유무와 관계없이 **항상** 붙인다. 월간 조회는 신청분을 따로 주지 않아 "포함된 경우"를 판별할 수 없기 때문이다(spec US1-3 갱신).

## R11. 브리지 사번 키 필수 — 전 경로 확대 (보안 리뷰)

**Decision**: 서버 HR handler가 사번 키를 보내는 **모든** 허용 경로에 `REQUIRED_STAFF_PARAMS`를 둔다. 목록은 handler를 네트워크 없이 모든 query_type으로 돌려 경로별로 보낸 키를 모은 결과다(21개 경로 + YTA 6종, 모든 호출에서 키가 빠진 적 0건).

- 증명서 발급내역(`/CTIMcrtfIssuMgr.do`)의 `staffIdNm`(사번·성명 검색, SQL `LIKE 값%`)도 사번 키다. 비우면 조회 권한 범위 전체다. `STAFF_PARAM_KEYS`에 넣어 값은 본인 마커만 허용한다. 서버는 결과를 본인 STAFF_ID로 다시 거르므로 지금까지 출력 유출은 없었다.
- 새 연장근무 두 경로는 **허용 키를 정확히** 정한다(`ALLOWED_PARAM_KEYS`). 쓸모없는 키 수천 개로 서버 파라미터 수 한도를 넘겨 사번 키를 잘라내는 시도도 막는다.
- 페이지·설정에서 얻은 본인 ID가 공백뿐이면 없는 것으로 본다. SQL `XTRIM`이 빈 값을 NULL로 만들어 "본인소속조회"로 넘어가기 때문이다.
- JSP 브리지 `config.allowedPaths`는 기본 목록과의 교집합만 쓴다(빠진 경로를 되살리지 못함).
- 예약어 키(`constructor` 등)는 `hasOwnProperty`로 걸러 예외 없이 처리한다.

**Rationale**: 브리지가 서버(또는 위젯 origin) 장악·회귀에 대한 마지막 관문이고, kiwibox는 `cmmSearchStaffId`를 세션 값으로 덮어쓰지 않는다(`StringUtil.sessionParamPutter`) — 대상 직원은 전적으로 요청 값이 정한다.

**남은 위험(범위 밖, 후속)**:
- kiwibox 자체 IDOR: 로그인한 직원이 개발자 도구로 다른 직원 STAFF_ID를 넣어 `/getMBLDclzWorkOtSchdul*.do`를 직접 POST하면 조회된다(본인조회 분기에 권한 함수 검사 없음). HR 시스템 담당에 전달할 사안.
- 위젯 브리지는 본인 ID를 DOM `#searchUserId`에서 읽는다. 이 id는 kiwibox에서 "직원 검색" 필드로도 쓰여, 위젯이 검색 헤더가 있는 화면으로 옮겨지면 다른 직원 ID가 될 수 있다. 세션 값을 `erxesSettings`로 따로 렌더하는 방식이 안전하다.
- 서버가 쓰지 않는 허용 경로(`/SALPayslipNewMgr.do`, `/CTIMcrtfReqstRefromMgr.do`)는 사번 키 규칙이 없다. 쓰지 않으면 허용 목록에서 빼는 편이 낫다.
