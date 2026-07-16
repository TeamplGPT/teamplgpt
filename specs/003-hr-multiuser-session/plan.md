# Implementation Plan: HR 스킬 다중 사용자 세션 (r2 — iframe·별도 도메인 기준 재설계)

**Status**: **plan 개정 r2 — 사용자 승인 대기 (풀 게이트)**
**확정 전제**: ① kiwibox → AI 채팅 위젯(독립 URL/서버)을 **iframe** 임베딩, 위젯이 TeamplGPT API 호출
② 3자 모두 **별도 서버·도메인** ③ HR_BASE_URL은 고객사(테넌트)별 서브도메인 ④ kiwibox 수정은 **설정/JSP 수준만**

## 무효화된 전제 (r1에서 변경)

- ~~동일 도메인 프록시 → 쿠키 자동 동반~~ — 별도 도메인이라 불성립.
- ~~HR_BASE_URL 상수~~ — 테넌트별 상이. 단 **클라이언트 공급 금지 원칙 유지**:
  서버측 `embedId → hr_base_url` 등록 매핑(또는 등록 도메인 allowlist 대조)으로 해석.
- kiwibox 서버 코드 수정 불가 → 위임 토큰 발급 endpoint(구 P2) 탈락.

## 성립 가능한 안 2개

### R1. 부모 브리지 클라이언트 실행형 (보안 정석)

kiwibox **페이지 JS(JSP 스니펫)**는 same-origin이라 쿠키 자동 동반으로 kiwibox fetch 가능 — 이걸 실행자로 쓴다.

```
위젯(iframe) ── 질문 ──> TeamplGPT
TeamplGPT: LLM tool-call 발생 → 스킬을 서버에서 실행하지 않고
  "client-tool 요청" 이벤트를 스트림으로 위젯에 전달
위젯(iframe) ── postMessage {tool, params} ──> 부모(kiwibox 페이지 브리지 JS)
부모 브리지: endpoint allowlist 검사 → kiwibox fetch (same-origin, JSESSIONID 자동,
  cmmSearchStaffId 등 self 강제 — 카탈로그 cmmAiBuildTopSearchParams 방식)
부모 ── postMessage 결과 ──> 위젯 ── tool result 회신 ──> TeamplGPT (루프 계속)
```

- 장점: **JSESSIONID가 브라우저·kiwibox origin 밖으로 절대 안 나감**(HttpOnly 유지).
  테넌트 base URL = 페이지 자신 origin — 자동. 3P 쿠키 정책 무관.
- 부담: TeamplGPT embed tool-calling loop에 **client-executed tool 프로토콜** 신설
  (tool-call 스트림 이벤트 + 결과 회신 API + 루프 재개). 위젯·브리지 JS 개발.
  kiwibox JSP: iframe 스니펫 + 브리지 JS 삽입 (허용 범위).
- 보안 장치: 브리지에 도구·endpoint 고정 allowlist(임의 URL 실행 차단),
  postMessage origin 검증(위젯 도메인 고정), self 강제 파라미터 브리지에서 주입.

### R2. JSP 세션ID 전달 + 서버측 실행 (개발 최소, 보안 타협)

JSP는 서버 렌더라 `session.getId()` 출력 가능 — 위젯 init 파라미터로 전달.

```
kiwibox JSP: iframe src에 (또는 postMessage로) sessionId·테넌트 식별자 전달
위젯 → TeamplGPT 요청 바디에 sessionId 포함
TeamplGPT: embedId→hr_base_url 매핑(DB, allowlist) + sessionId를
  toolRuntimeOverrides {HR_SESSION_COOKIE} 로 서버측 주입 (r1 배관 재사용)
스킬: 001·002 현행 구조 거의 그대로 (서버측 kiwibox 호출)
```

- 장점: 개발 최소 — 기존 001·002 handler·toolRuntimeOverrides 골격 재사용.
  kiwibox 수정 = JSP 한 줄.
- 약점: **HttpOnly 무력화** — 세션ID가 JS 공간·위젯→TeamplGPT 전송·TeamplGPT 서버 메모리에
  노출. XSS·로그 유출 시 세션 탈취. 다중 고객사 HR 개인정보 SaaS 감사 관점 지적 사항.
- 완화: HTTPS 강제, 바디 전달(URL 금지)·로그 마스킹, embed opt-in, 사용 직후 폐기(비저장).

## 권고

**R1 채택.** 근거: 다중 고객사 × HR 개인정보 — 세션 원본 유출 표면을 만드는 R2는
보안 감사에서 재작업 리스크. R1의 개발 부담은 fork 소유 영역(embed tool calling loop,
위젯)에 국한되고, client-tool 프로토콜은 이후 다른 사내 시스템 연동에도 재사용 자산.
일정 압박 시 R2를 **PoC 한정**(운영 배포 금지 조건)으로 선행하는 절충 가능.

## 공통 설계 (어느 안이든)

- **FR-1 유지**: emp_no LLM 파라미터 제거. R1=브리지가 폼 관례로 주입, R2=JSP가 사번 전달.
- **테넌트 매핑**: embeds에 `hr_base_url`(R2) 또는 불필요(R1). 클라이언트 공급 금지.
- **스킬 재편(R1 시)**: hr-* 스킬의 ENDPOINT_MAP·self 강제·기간 변환 로직이
  "client-tool 정의(스키마·매핑)"로 이동 — handler는 파라미터 검증·결과 포맷만.
  001·002 스펙 문서 동기 개정 필요.
- 감사 로그(FR-4)·E2E(mock kiwibox)는 이전 plan 항목 유지, 실행 위치만 안에 맞춰 조정.

## Tasks (R1 기준 — 승인 후 확정)

- [ ] **T1** client-tool 프로토콜 설계·구현: tool-calling loop에 client 실행 위임 이벤트
  + 결과 회신 API + 루프 재개 (fork embed 모듈)
- [ ] **T2** 위젯: client-tool 이벤트 수신 → postMessage 브리지 왕복 → 결과 회신
- [ ] **T3** kiwibox JSP 스니펫 + 브리지 JS: allowlist·origin 검증·self 강제·fetch 실행
  (배포 가이드 문서 포함 — 고객사 적용용)
- [ ] **T4** hr-attendance/hr-personnel을 client-tool 정의로 재편 + specs 001·002 동기 개정
- [ ] **T5** E2E: mock kiwibox + 브리지 시뮬레이터로 왕복 시나리오 → 전건 PASS
- [ ] **T6** report + 감사 로그

---
**승인 요청**: R1/R2 선택 (권고 R1). R2 선택 시 tasks 재작성해 재제시.
