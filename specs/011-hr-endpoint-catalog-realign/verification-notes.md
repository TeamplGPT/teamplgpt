# Verification Notes — 011 HR 엔드포인트 재정렬

**Date**: 2026-07-24 | 구현: /speckit-implement

## 완료된 검증 (이 머신)

### L2 — 결정론적 handler BODY 검증 (FAIL-first)

라이브 E2E 환경 부재(하단 참조)로, handler를 서버 폴백 경로로 직접 호출해 로컬 mock이 수신한
요청을 scenarios.json의 K1~K17 패턴으로 판정하는 하네스([evidence/harness.js](./evidence/harness.js))로 대체 검증.
LLM 미개입이라 BODY 정확성 판정은 E2E보다 결정론적.

| 시점 | 결과 | 증빙 |
|---|---|---|
| 수정 전 | **FAIL 16 / PASS 1** (K8 조직캘린더만 PASS — D7 유지 회귀 예상대로) | [evidence/harness-before.json](./evidence/harness-before.json) |
| 수정 후 | **PASS 17 / FAIL 0** | [evidence/harness-after.json](./evidence/harness-after.json) |

수정 전 FAIL이 스펙의 괴리 주장을 실증: K1이 `getMBLHomeLeaveDetail`(운영 NULL 위험), K3이
`TAAWrkTimeListMgrByDate`(관리자형), K13이 pay_item 요구로 호출 불능(SAL-0220 잔재) 등.

### L2 — 단위 테스트

`node --test _shared/__tests__/hrSession.test.js` → **15/15 PASS** (언랩 Map/codeList·todayDashed·monthsAgoFirstYmd).
참고: `dateResolver.test.js`는 이 머신에 server 의존성(`sugar-date`) 미설치라 로드 실패 — 기존 환경 문제, 본 변경과 무관.

### SC 검증

- SC-004: 폐기 endpoint(getMBL 휴가 2종·TAA-0360·SAL-0220) 호출 코드 **0건** (grep — 잔여 히트는 주석/보존 파일뿐).
- SC-006: scenarios.json 내 `/api/v1/` 패턴 시나리오 **0건** ($comment의 이력 설명 문자열만 존재).
- 계약: plugin.json 변경은 hr-attendance `HR_WKAREA_CD` 신설 + hr-salary salary_statement 문구(pay_item 불요 전환 — D5 필연 결과)뿐. query_type enum·파라미터 스키마 불변.
- 전 handler/스크립트 `node --check` 통과, 전 plugin.json JSON 유효.

## 미완 — 사용자 환경 필요 (라이브 E2E + 스모크)

이 머신에는 라이브 E2E 전제가 없음: `:3001` 서버 미기동, **`anythingllm-postgres` 컨테이너 부재**
(runner의 apikey helper가 `docker exec psql` 의존), node_modules 미설치, LLM 자격증명 미확인.

남은 절차 (quickstart.md):

1. `yarn dev:all` 기동 + postgres 컨테이너 + 워크스페이스(eshelsoft) skill setup_args를 mock으로 전환.
2. `npm run e2e:hr-skill` — K1~K17(BODY, 하네스로 이미 검증됨) + **KB20~KB31(LLM 행태 tier — 하네스로 검증 불가한 유일 영역)** 전건 PASS 확인.
3. 실동작 스모크: setup_args 실환경(ntest.5240.kr) 복원 후 연차/출퇴근/급여 2단 체인/월별 이력 + 민감정보 미노출 + 3-Mode/embed 브리지 `.do` 경로 통과 확인.
4. D4 리스크 실측 판정: §2.1(orgCd 미전송)·§3(wkareaCd=1000) 실환경 성공 여부 — 실패 시 `HR_ORG_CD` setup_arg 후속.

## 부수 확보물

- `scenarios-legacy-20260716.json` — 폐기 132건 원본 보존 (기능 재도입 시 참조).
- runner `mock_body_pattern`/`.do` 지원 — 이후 HR skill 검증 공통 인프라.
