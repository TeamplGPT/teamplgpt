# Feature Specification: hr-approval (전자결재) 신규 skill

**Feature Branch**: `feat/5240hr`
**Created**: 2026-07-16
**Status**: **specify 단계 — 사용자 승인 대기 (풀 게이트)**
**Input**: kiwibox_eGov4.2 `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` §4.4 + kiwibox 소스 실측

## 무엇을 (What)

본인 전자결재 문서(결재함 목록 + 문서 상세/본문)를 5240 HR(kiwibox)에서 조회하는
신규 agent-skill. R1 클라이언트 위임 구조(003)·hrSession 공용. hubId `hr-approval`.

## 왜 (Why)

카탈로그 §5 내부도구 MY_APPROVAL_*가 커버 못 하던 "결재 문서 목록·본문"을 도구화.
단 §4.4/§7에서 **최고 위험**으로 분류 — 본문 CLOB + reqNo 무검증 → self 강제 설계 필수.

## 실측 (kiwibox 소스)

- **목록 = 순수 self(a)**: `EAPRequestMgr.do?cmd=getEAPRequestMgrList`,
  `work_staff_id = #{ssnStaffId}` 세션 강제([EAPRequestMgr_SQL.xml:188](../../../5240/kiwibox_eGov4.2/kiwibox/src/main/resources/kiwibox/sqlmap/SYS/EAP/EAPRequestMgr_SQL.xml#L188)).
  대상 사번 파라미터 없음 — LLM이 타인 지정 불가.
  - `selectGubun`: null=전체 / 2=기안함 / 3=미결함 / 4=기결함 / 5=참조 / 6=반려함
  - `searchStaDate`/`searchEndDate`: 기간. `activeMenuCd` 게이트 인자(gate:true).
  - 결과 항목: `reqNo`, `applCd`, `applStaffNm`(기안자), `applNm`(문서명), `applYmd`, `signType`
- **상세 = c(reqNo 단건, self 검증 없음)**: `getApprovalDetailJson.do`, `reqNo`(+`applCd`),
  본문 `CONTENTS`(CLOB) 반환. `WHERE SERVAREA_ID + REQ_NO`만 —
  기안/결재/참조자 검증 없음([MBLApprovalBox_SQL.xml:44](../../../5240/kiwibox_eGov4.2/kiwibox/src/main/resources/kiwibox/sqlmap/MBL/MBL/MBLApprovalBox_SQL.xml#L44)).
  → **reqNo는 목록 도구 결과값만 허용**(임의 reqNo = 타인 문서 유출).

## query_type ↔ 엔드포인트 계약 (2단계 체이닝)

| query_type | 역할 | 엔드포인트 | 파라미터 | self |
|---|---|---|---|---|
| pending (미결함) | 내가 결재할 대기 문서 | getEAPRequestMgrList selectGubun=3 | year_month | a |
| drafted (기안함) | 내가 상신한 문서 | 同 selectGubun=2 | year_month | a |
| completed (기결함) | 결재 완료 문서 | 同 selectGubun=4 | year_month | a |
| rejected (반려함) | 반려된 문서 | 同 selectGubun=6 | year_month | a |
| referenced (참조) | 참조 수신 문서 | 同 selectGubun=5 | year_month | a |
| detail | 특정 문서 상세+본문 | getApprovalDetailJson.do | req_no(체이닝)+appl_cd | c→목록강제 |

- LLM 노출 파라미터: `query_type` + `year_month`(목록 기간) + `req_no`·`appl_cd`(detail 전용, 체이닝).
- `req_no`/`appl_cd`는 pending/drafted/… 목록 결과값만 — org_cd·pay_item과 동일 체이닝 가드
  (handler가 detail에 req_no 없으면 "먼저 목록 조회" 안내).
- 결재 카운트("미결 몇 건")는 hr-personnel `todo_count`(getTodoIconCnt)로 이미 커버 — 중복 안 함.

### 목록 반환 컬럼 화이트리스트 (실측 — 스크린샷 대조)

목록 SELECT에는 내부 식별자·코드 컬럼이 섞여 있어 그대로 렌더하면 노이즈/민감. handler가
아래 컬럼만 추려 formatTable에 넘긴다:

- **노출**: `REQ_NO`(체이닝 키), `APPL_NM`(문서명), `TITLE`(제목), `REQ_STATUS_NM`(상태),
  `LAPSED_DD`(경과일), `APPL_STAFF_NM`(기안자), `APPL_ORG_NM`(소속), `APPL_YMD`(신청일),
  `S_YMD`/`E_YMD`(문서 기간), `MEMO`(신청사유 — 화면의 요약 텍스트, **본문 아님**),
  `SIGN_LINE`(결재라인/대기자), `LAST_SIGN_YMD`, `APPL_CD`(체이닝)
- **제외**: SERVAREA_ID, DOC_TYPE, APPL_STAFF_ID(내부 PK), ORG_CD/POS_CD/RES_CD(코드),
  MOBILE_DTL_PROG_CD, BUNDLE_YN, FILE_SEQ, SEQ_NO, APPL_STAFF_NO(사번 가능성 — 실측 전 제외)

핵심: 화면의 요약("장보고 29/05/2026 18/00~20/00/대근")은 `MEMO`(신청사유) 목록 컬럼이다.
본문(CONTENTS) 없이 목록만으로 "무슨 결재인지"를 답할 수 있어 detail 없이도 유용하다.

## 보안 요구 (승인 대상 — §7 최고 위험)

- **FR-1**: 목록은 순수 self(ssnStaffId 세션). detail의 `req_no`는 목록 결과값만
  (description [CRITICAL] 강제 + 체이닝 순서). LLM이 req_no 임의 생성 금지 명시.
- **FR-2**: 본문(CONTENTS CLOB)은 고민감 — plugin.json `active` 기본값·배포 정책:
  **조직 승인 전까지 detail 비활성 권고**(목록만 활성). 결정 필요(아래 승인 항목).
- **FR-3**: 브리지 allowlist에 `/EAPRequestMgr.do`, `/getApprovalDetailJson.do` 추가.
  CommonCode 같은 범용 endpoint 아니라 queryId 화이트리스트 불요.
- **FR-4**: hrSession 공용, gate:true(목록 activeMenuCd), searchType 무관.

## 승인 결정 (2026-07-16)

1. **detail(본문 조회) 제외** — 목록 5종만 구현. reqNo→본문 체이닝, CONTENTS CLOB,
   getApprovalDetailJson.do 미채택. §7 최고 위험(본문·reqNo 무검증) 표면 원천 제거.
   → query_type에서 detail 삭제, req_no/appl_cd 파라미터 삭제.
2. 목록은 순수 self(a)라 위험 낮음 — 별도 조직 승인 없이 배포 가능(active 기본 유지).
3. 본문 미포함이라 CLOB 처리 무관.

**결과**: query_type 5종(pending/drafted/completed/rejected/referenced), 파라미터
`query_type`+`year_month`, 체이닝 없음. detail 재도입은 별도 스펙 회차.

## 범위 밖

- 결재 처리(승인/반려 실행) — 조회 전용. write 액션은 별도 스펙·강한 인증 필요.
- 증명서(§4.6)·복리후생 reqNo 상세(§4.10) — 각 도메인 별도 회차.

## 잔여 실측 (plan/T)

- `searchStaDate/EndDate` 형식(YYYYMMDD 추정) 및 미전송 시 서버 기본 기간
- detail `applCd` 필수 여부 (목록 applCd 없이 reqNo만으로 조회되는지)
- 응답 키 케이스 → 컬럼 라벨
