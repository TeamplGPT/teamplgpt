# Tasks: HR 스킬 다중 사용자 세션 (R1 클라이언트 실행 위임)

승인 이력: spec(S3/R1 방향) → plan r2(R1 확정) 모두 사용자 승인 (2026-07-16).
상태: T1~T4 구현 완료 + 전 체인 스모크 PASS. T5 일부·T6 잔여.

## 완료

- [x] **T1** 서버 프로토콜:
  - `server/utils/chats/toolCalling/clientToolBroker.js` — pending registry, SSE
    `clientToolRequest` 이벤트, 타임아웃(30s), embedUuid/sessionId 위조 주입 차단, disposeAll
  - executor/loop에 `clientToolTransport` 배관 (handler `this`로 주입)
  - `embed_configs.client_tool_execution` 컬럼(prisma + migration 20260716000000) — embed 단위 opt-in
  - `POST /embed/:embedId/client-tool-result` 결과 회신 endpoint (opt-in 403 가드)
  - embed.js: broker 생성·loop 전달·finally disposeAll
- [x] **T2** 위젯(embed 서브모듈): `src/utils/clientTools.js` — parent origin pin(document.referrer),
  postMessage 왕복, 실패 시에도 서버 회신(빠른 pending 해제). chatService.js onmessage 분기
- [x] **T3** 브리지: `extras/kiwibox-bridge/teamplgpt-hr-bridge.js` — origin 검증, endpoint
  allowlist(14경로), $SELF_STAFF_ID 치환, searchType=mobile 차단, same-origin fetch.
  삽입 가이드 `extras/kiwibox-bridge/README.md` (JSP 스니펫 포함)
- [x] **T4** 스킬 재편: `_shared/hrSession.js`(전송 자동 선택: client 위임 정본 + 서버 폴백),
  hr-attendance v2.1.0·hr-personnel v2.1.0 — **emp_no LLM 파라미터 제거**,
  $SELF_STAFF_ID 마커, HR_SESSION_COOKIE/HR_STAFF_ID는 폴백 전용(optional)
- [x] **T5(부분)** broker jest 단위 테스트 작성(`__tests__/clientToolBroker.test.js`) +
  node 통합 스모크 PASS: a/b범위·마커 보존·세션만료·브리지 타임아웃·체이닝 가드·pending 누수 0·서버 폴백

## 잔여

- [ ] **T5(잔여)** `yarn install` 환경에서 jest 실행 확인. E2E 러너에 mock kiwibox +
  모의 브리지(SSE clientToolRequest 수신 → client-tool-result POST) 시나리오 4계열 추가
  (001/002 T4와 통합)
- [ ] **T-UI** embed admin UI에 `client_tool_execution` 토글 노출
  (기존 allow_tool_calling 토글 옆 — frontend EditEmbedModal/NewEmbedModal)
- [ ] **T-실측** ntest.5240.kr 실환경: 브리지 삽입 후 왕복 확인, b게이트 activeMenuCd 동작,
  응답 키 케이스, **STAFF_ID vs 사번(STAFF_NO) 동일 여부**(ssnStaffId가 사번과 다른 내부
  PK인지 — `cmmSearchStaffId`/`searchId` 바인딩 값 검증) (001/002 T5와 통합)
- [ ] **T6** report + 001/002 스펙의 서버측 인증 서술을 R1 기준으로 최신화 표기
- [ ] **비고**: 인메모리 pending registry — 다중 인스턴스 배포 시 sticky session 필요 (가이드 명시)
