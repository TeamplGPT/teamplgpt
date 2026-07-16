# Feature Specification: hr-personnel 5240 HR(kiwibox) 직접 통합 + 항목 보정

**Feature Branch**: `feat/5240hr`
**Created**: 2026-07-16
**Status**: 구현 진행
**Input**: kiwibox_eGov4.2 `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` §4.6~4.9, §5, §7

## 무엇을 (What)

hr-personnel agent skill의 백엔드를 kiwibox-hr-api REST에서 5240 HR(kiwibox) 직접 호출로
교체하고, query_type 항목을 카탈로그에 실존·안전한 엔드포인트 기준으로 보정한다.

## 왜 (Why)

- hr-attendance(001)와 동일한 통합 방향 — 중간 API 의존 제거.
- 기존 11개 query_type 중 다수(address/career/disciplines/education/family/licenses/rewards/visa)는
  카탈로그에 대응 엔드포인트가 없거나(§4.7 교육 self 미분석) 등록 금지 대상
  (family: `SCIRegDependent`가 주민번호 FAM_CTZ_NO 반환 — §7 원칙 제외)이라 보정 필수.

## 항목 보정 결정 (구→신)

| 기존 query_type | 처분 | 근거 |
|---|---|---|
| appointment_current, contact, employment | → **profile**(사원증)로 통합 | §4.8 사원증이 성명·소속·직위·직책·근무유형·재직상태·연락처 일괄 반환 |
| education, career, licenses, rewards, disciplines, address, visa | → **profile_detail**(인사카드 메뉴별 상세)로 통합, 실측 후 분화(T5) | §4.8 `getMBLPrtEmpCardPop` "인사카드 메뉴별 상세" — 컬럼 parity §8 미확인 |
| family | **제거** | §4.10 `SCIRegDependent` 주민번호 반환 → §7 등록 금지. 인사카드 가족 메뉴는 실측 후 판단 |
| (신규) org_tree / org_members | 추가 | §4.8 조직도 — 비민감, 조직 브라우징 |
| (신규) todo_count / schedule_day | 추가 | §4.9 메인 포털 — 순수 self(a), 저위험 등록 권장 |
| (신규) contact_directory | 추가 | §4.9 운영자 연락처 — 공개 정보 |
| (보류) 증명서 목록·교육이력 | 미채택 | §4.6 게이트 미확인 / §4.7 self 화면 미분석 (§8 검증 후 회차) |

## 요구사항 (FR)

- **FR-1**: query_type ↔ 엔드포인트 계약 (아래 표). 카탈로그 §7 "원칙 제외"(주민번호 파생) 미노출.
- **FR-2**: 사원증 계열 대상 사번(`searchStaffId`)은 handler가 emp_no로 self 강제 주입 —
  LLM에 타인 사번 파라미터 미노출 (§6.1). 옵션분기(d)의 타인 검색 경로 차단.
- **FR-3**: 인증·세션만료·게이트 처리 = 001 FR-5 동일 (JSESSIONID pass-through,
  HTML/로그인 감지, `HR_ACTIVE_MENU_CD` 선세팅).
- **FR-4**: `org_members`의 `searchOrgCd`는 계층3 체이닝 — org_tree 선행 조회 결과의
  조직코드만 사용하도록 description에 명시 (§1.2 계층3).
- **FR-5**: 복호화 연락처(휴대폰 등)는 본인(세션 신원) 조회 전제로만 노출 — profile 응답 그대로,
  타인 조회 경로가 열리는 파라미터 미노출.
- **FR-6**: `[CRITICAL]` 3단 + `[재강조]` 패턴 유지. setup_args는 001과 동일 4종.

## query_type ↔ 엔드포인트 계약

| query_type | 엔드포인트 | 범위 | 파라미터 |
|---|---|---|---|
| profile | /getMBLPrtEmpCard.do | d→self강제 | searchStaffId=emp_no |
| profile_detail | /getMBLPrtEmpCardPop.do | b | searchStaffId=emp_no (+세션 activeMenuCd 게이트) |
| org_tree | /getMBLHrBassiemOrgList.do | 조직(비민감) | searchSymd=오늘, cmmSearchOrgCd=org_cd(선택) |
| org_members | /getMBLHrBassiemMemberList.do | 조직(비민감) | searchOrgCd=org_cd(필수, 체이닝), searchSymd=오늘 |
| todo_count | /getTodoIconCnt.do | a | 없음(세션) |
| schedule_day | /getScheduleDay.do | a | staYmd/endYmd ← year_month(월초~말일) |
| contact_directory | /getContactList.do | 공개 | 없음(세션) |

## 파라미터 설계 (3계층)

- 계층1: JSESSIONID setup_arg — 001과 동일.
- 계층2: LLM 노출 = emp_no, query_type, year_month(schedule_day 전용), org_cd(조직도 전용).
- 계층3: org_cd는 org_tree 결과 체이닝만 허용 (description으로 강제).

## 범위 밖

- 증명서(§4.6)·교육(§4.7) — §8 실측 후 회차.
- 인사카드 상세의 메뉴별 분화(학력/경력/자격증 개별 query_type 복원) — T5 실측 후.
