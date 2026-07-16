# TeamplGPT HR Bridge — kiwibox 삽입 가이드

specs/003 R1(클라이언트 실행 위임) 배포 가이드. kiwibox(5240 HR) 페이지에 채팅 위젯 iframe과
브리지 JS를 삽입한다. **kiwibox 서버 코드 무변경 — JSP 스니펫 수준.**

## 동작 원리

```
위젯(iframe) ── postMessage(도구 요청) ──> 이 브리지 (kiwibox 페이지)
브리지 ── same-origin fetch (JSESSIONID 자동 동반) ──> kiwibox 엔드포인트
브리지 ── postMessage(결과) ──> 위젯 ──> TeamplGPT 서버 (LLM 루프 계속)
```

세션 쿠키는 브라우저의 kiwibox origin 밖으로 나가지 않는다.

## 사전 조건 (TeamplGPT 측)

1. embed 설정에서 `allow_tool_calling` + `client_tool_execution` 활성.
2. allowed skills에 hr-attendance, hr-personnel 포함.
3. embed `allowlist_domains`에 kiwibox 고객사 도메인 등록.

## JSP 삽입 스니펫

```jsp
<%-- TeamplGPT AI 어시스턴트 (main.jsp 등 공통 레이아웃) --%>
<iframe
  data-teamplgpt
  src="https://<위젯서버-도메인>/widget?embedId=<EMBED_UUID>"
  style="position:fixed;bottom:20px;right:20px;width:400px;height:600px;border:0;z-index:9999;"
  title="AI Assistant"></iframe>

<script src="/kiwibox/common/js/teamplgpt-hr-bridge.js"></script>
<script>
  new TeamplGPTHRBridge({
    widgetOrigin: "https://<위젯서버-도메인>",   // postMessage origin 검증용 — 정확히 일치해야 함
    contextPath: "/kiwibox",                     // kiwibox 컨텍스트 경로
    staffId: "<%= session.getAttribute("ssnStaffId") %>"  // 본인 사번 — $SELF_STAFF_ID 치환용
  });
</script>
```

- `teamplgpt-hr-bridge.js`는 이 폴더의 파일을 kiwibox 정적 리소스 경로에 배치.
- `staffId`에는 반드시 **세션 `ssnStaffId`(kiwibox 내부 STAFF_ID)**를 렌더할 것 —
  사번(STAFF_NO)과 다를 수 있으며, kiwibox SQL이 바인딩하는 값은 STAFF_ID다.
  세션 attribute 명이 배포본과 다르면 조정 (비밀 아님. self 강제의 실제 방어선은
  kiwibox 서버 게이트 + 서버측 ssnStaffId 강제).
- 고객사(테넌트)별 서브도메인은 신경 쓸 것 없음 — 브리지가 자기 페이지 기준 상대경로로 호출.

## 보안 체크리스트

- [ ] `widgetOrigin` 정확히 설정 (와일드카드 금지)
- [ ] 브리지 allowlist는 기본값 유지 (경로 추가 시 카탈로그 민감도 §7 확인)
- [ ] embed `allowlist_domains`에 해당 고객사 도메인만 등록
- [ ] 위젯 서버·TeamplGPT 모두 HTTPS

## 장애 시 증상 매핑

| 증상 | 원인 |
|---|---|
| "HR 조회 응답이 시간 내에 도착하지 않았습니다" | 브리지 미삽입 / widgetOrigin 불일치 / iframe 셀렉터 불일치 |
| "bridge: staffId not configured" | JSP staffId 미렌더 |
| "bridge: path not allowed" | 스킬이 쓰는 경로가 allowlist에 없음 (스킬-브리지 버전 불일치) |
| "HR 세션이 만료되었거나..." | kiwibox 로그아웃 상태 — 재로그인 |
