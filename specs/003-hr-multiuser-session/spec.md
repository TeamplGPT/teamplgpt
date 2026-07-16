# Feature Specification: HR 스킬 다중 사용자 세션 인증

**Feature Branch**: `feat/5240hr`
**Created**: 2026-07-16
**Status**: **specify 단계 — 사용자 승인 대기 (풀 게이트)**
**대상**: hr-attendance(001)·hr-personnel(002) + 이후 hr-salary 등 전 HR 스킬 공통 인증 골격

## 문제 (Why)

001·002의 인증은 `HR_SESSION_COOKIE` setup_args — **워크스페이스 단위 단일 세션**.
다중 사용자 배포에서는:

1. 모든 사용자가 등록된 세션 계정의 HR 데이터를 보게 됨 (개인정보 유출).
2. a범위 엔드포인트(휴가상세·연차 등)는 kiwibox가 `ssnStaffId`(세션 신원)로 강제하므로
   emp_no를 바꿔도 항상 세션 계정 데이터만 반환 — 기능적으로도 오답.
3. `emp_no`를 LLM 파라미터로 받는 현 구조는 사용자가 타인 사번을 발화로 넣을 수 있음 —
   b범위(cmmSearchStaffId)에서 게이트 통과 시 타인 조회 위험.

## 조사 사실 (Fact)

- skill handler는 `this.super.handlerProps.invocation`으로 호출 컨텍스트 접근 가능:
  `user_id`, `workspace_id`, `thread_id` ([server/utils/agents/index.js:578](../../server/utils/agents/index.js#L578),
  [imported.js:196](../../server/utils/agents/imported.js#L196) `super: aibitat`) — **코어 수정 없이 사용자 식별 가능**.
- embed 위젯 경로의 invocation user 컨텍스트는 미확인 (embed는 익명 세션 가능) — plan 단계 조사 항목.
- 카탈로그 원설계는 "위젯 서버가 JSESSIONID pass-through" — kiwibox 포털 안에 위젯이
  내장되는 배포를 전제.

## 설계 후보 (결정 필요 — 승인 대상)

| 안 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **S1. 사용자-세션 매핑 저장소** | TeamplGPT user_id → {emp_no, JSESSIONID} 매핑을 서버 저장소에 등록(관리 UI/API). handler가 invocation.user_id로 조회 | 코어 무수정, 구조 단순 | JSESSIONID 만료 시 사용자별 수동 갱신 — 운영 부담 큼 |
| **S2. 위임 로그인 (자동 세션)** | user_id → kiwibox 자격증명(암호화 저장) 매핑. handler가 만료 감지 시 자동 재로그인·세션 캐시 | 만료 자동 처리, UX 최상 | 비밀번호 보관 리스크(암호화 필수), kiwibox 로그인 엔드포인트 실측 필요(카탈로그 밖) |
| **S3. embed pass-through (카탈로그 원설계)** | kiwibox 포털 페이지에 TeamplGPT embed 위젯 내장. 페이지 JS가 현재 세션(JSESSIONID 또는 단기 위임 토큰)을 위젯에 전달 → 대화별 세션으로 스킬까지 전파 | 세션 생명주기가 kiwibox 로그인과 자동 일치, 자격증명 미보관, self 보장 최강 | embed 메시지 → agent invocation 경로에 세션 전파 코어 수정 필요(업스트림 발산), embed 배포 전제 |

권고: **배포 채널이 kiwibox 내장 위젯이면 S3**(main 이력의 embed tool-calling 기반이
이미 있음), **TeamplGPT 포털 직접 사용이면 S2**(S1은 만료 운영 부담으로 비권장).
혼합 배포면 S3 + S2 폴백.

## 공통 요구사항 (어느 안이든)

- **FR-1**: `emp_no`를 LLM 파라미터에서 **제거**. 호출 사용자 신원(invocation.user_id)에서
  서버측 해석 — 사용자가 발화로 타인 사번 지정 불가. (b범위 cmmSearchStaffId도 매핑값 주입)
- **FR-2**: 세션 부재/만료 시 명확한 사용자 안내(등록/재로그인 방법 포함) 반환.
- **FR-3**: 001·002 handler의 인증 부분을 `_shared/hrSession.js`로 공통화 —
  이후 hr-salary 등 확장 시 재사용.
- **FR-4**: 감사 로그 — 어느 user_id가 어느 emp_no로 어떤 query_type을 조회했는지 기록.

## 미확인 (plan 단계 조사)

- embed 경로 invocation의 user 식별 가능 여부 (익명 embed 세션 처리)
- kiwibox 로그인 엔드포인트 형식 (S2 채택 시)
- kiwibox 페이지에서 위젯으로 세션 전달 가능한 embed 설정 훅 (S3 채택 시)

---
**다음 단계**: S1/S2/S3 중 선택 + 배포 채널 확인 → 승인 후 /speckit-plan 진행.
