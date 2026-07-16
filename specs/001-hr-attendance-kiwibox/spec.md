# Feature Specification: hr-attendance 5240 HR(kiwibox) 직접 통합

**Feature Branch**: `feat/5240hr`
**Created**: 2026-07-16 (구현 후 소급 작성 — 헌장 §II 트리거 오분류 보정)
**Status**: 구현 완료, E2E 회귀 미완 (tasks.md T4~T6)
**Input**: kiwibox_eGov4.2 `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` (엔드포인트 전수 카탈로그)

## 무엇을 (What)

hr-attendance agent skill의 조회 백엔드를 중간 REST API(kiwibox-hr-api:8000)에서
5240 HR 시스템(kiwibox, `https://ntest.5240.kr/kiwibox`) 엔드포인트 직접 호출로 교체한다.

## 왜 (Why)

- 중간 API 서버 없이 kiwibox 실환경 데이터를 직접 조회 — 배포 의존성 1개 제거.
- 카탈로그 문서가 엔드포인트별 대상자 범위(a/b/c/d)·권한 게이트·민감도를 전수 실측해
  안전한 도구화 기준을 제공 — 이를 준수하는 통합이 목표.

## 요구사항 (FR)

- **FR-1**: query_type은 카탈로그 §4.1~4.3(근태·OT·휴가)에 실존하는 엔드포인트만 노출한다.
  대응 엔드포인트가 없는 기존 6종(business_trips, substitute_leave, timesheet_requests,
  work_plan_weekly, annual_leave_plan, work_type)은 제거한다.
- **FR-2**: 데스크탑 정본(b, `AUTF_SRCH_STAFF_YN` 게이트) 우선 채택. 모바일 무게이트(c/d)
  동등 엔드포인트는 채택 금지. 예외: 휴가 도메인은 모바일이 순수 self(a) — 모바일 정본 (§4.3).
- **FR-3**: c 범위(`searchId`)는 handler가 emp_no로 self 강제 주입 — LLM에 별도 대상 사번
  파라미터를 노출하지 않는다 (§6.1 self 강제 래핑).
- **FR-4**: 게이트 스킵 파라미터(`searchType=mobile` 류) 주입을 handler 차원에서 차단한다 (§4.5).
- **FR-5**: 인증은 JSESSIONID 쿠키 pass-through. 세션 만료(HTML/로그인 응답) 감지 시
  사용자 안내 메시지로 변환한다 (§6.2 공통 규약).
- **FR-6**: LLM 노출 기간 파라미터는 `year_month` 단일로 통일. 자연어(지난달/3월) 해석은
  기존 `_shared/dateResolver` 재사용, 엔드포인트별 kiwibox 파라미터 변환은 handler 책임.
- **FR-7**: `[CRITICAL]` 3단 + `[재강조]` 되묻기 금지 패턴(Convention T-A 계열)을
  query_type·year_month description에 유지한다.

## query_type ↔ 엔드포인트 계약

| query_type | 엔드포인트 (cmd) | 범위 | 기간 파라미터 변환 |
|---|---|---|---|
| timesheet | TAAWrkTimeListMgrByDate.do getTAAWrkTimeListMgrByDateList | b | searchBaseSYmd/EYmd (월초~말일) |
| work_status | TAAWrkTimeStatusMgr.do getTAAWrkTimeStatusMgrList | b | 동일 |
| work_calendar | TAADclzWorkSearchCldr.do getTAADclzWorkSearchCldr | **c** | searchYm |
| overtime | TAADclzWorkOtSchdul.do getTAADclzWorkOtSchdulList2 | b | searchBaseSYmd/EYmd + searchType=3 |
| overtime_limit | 同 getTAADclzWorkOtSchdulList | b | 동일 |
| leave_requests | /getMBLLeavDetailStaff.do | **a** | 없음 |
| annual_leave_balance | /getMBLHomeLeaveDetail.do | **a** | 없음 + searchType=1 고정 |
| vacation_calendar | TAADclzVcatnCldrMgr.do getTAADclzVcatnCldrMgr | b | searchSYmd/EYmd |

## 파라미터 획득 설계 (카탈로그 §1.2 3계층 대응)

| 계층 | 처리 |
|---|---|
| 1 세션(신원) | setup_args `HR_SESSION_COOKIE`(JSESSIONID) pass-through — ssnStaffId는 서버가 강제 주입(위조 불가). `HR_BASE_URL`(기본 https://ntest.5240.kr)·`HR_CONTEXT_PATH`(/kiwibox) 함께 setup_args |
| 2 조회조건 | LLM 노출: emp_no + query_type + year_month 3개뿐. kiwibox 파라미터명 변환은 handler. b게이트용 `HR_ACTIVE_MENU_CD` 설정 시 setSessionActiveTabMenuCd.do 선호출 |
| 3 체이닝 | 근태 도메인 reqNo 계열 없음 — 해당 없음 |

## 범위 밖 (Out of Scope)

- 급여(§4.5)·결재(§4.4)·복리후생(§4.10)·평가(§4.11) — 별도 skill(hr-salary 등) 회차.
- 사용자별 세션 자동 발급/갱신 (현재는 setup_args 수동 등록).
