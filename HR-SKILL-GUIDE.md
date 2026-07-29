# HR-SKILL-GUIDE — HR Agent Skill 개발·검증 인수인계 가이드

- 작성: 2026-07-29 · 기준 브랜치: `feat/5240hr`
- 독자: TeamplGPT HR skill을 이어받아 개발·수정·검증할 팀원
- 어디를 보고 어떤 순서로 무엇을 검증할지 정리했다. 세부 규칙의 정본은 각 절에 링크해 뒀다.

---

## 0. 사전 준비

리포 3개를 clone하고 로컬 경로를 등록한다. 로컬 경로는 개인마다 다르므로 이 문서에서는 경로 변수로 표기한다. 먼저 clone부터:

```bash
git clone https://github.com/TeamplGPT/teamplgpt.git          # $TEAMPLGPT
git clone https://github.com/okrbest/okrservice.git           # $OKRSERVICE
git clone https://github.com/ux-builder/kiwibox_eGov4.2.git   # $KIWIBOX
```

| 변수 | 리포 | 예시 |
|---|---|---|
| `$TEAMPLGPT` | TeamplGPT/teamplgpt | `~/work/teamplgpt` |
| `$OKRSERVICE` | okrbest/okrservice | `~/work/okrservice` |
| `$KIWIBOX` | ux-builder/kiwibox_eGov4.2 | `~/work/kiwibox_eGov4.2` |

AI Agent(Claude Code 등)와 작업할 때는 걸리는 대목이 있다. 에이전트는 다른 프로젝트가 로컬 어디에 있는지 모른다. 세션을 시작할 때 한 번 등록해 준다:

1. 세션 첫 메시지에 세 경로를 알려주거나:
   > "kiwibox는 `~/work/kiwibox_eGov4.2`, okrservice는 `~/work/okrservice`에 clone돼 있음"
2. 또는 개인 전역 `~/.claude/CLAUDE.md`에 영구 등록한다. 이 파일은 리포에 커밋되지 않는다.
   ```markdown
   # HR 프로젝트 로컬 경로
   - $TEAMPLGPT = <본인 경로>/teamplgpt
   - $OKRSERVICE = <본인 경로>/okrservice
   - $KIWIBOX = <본인 경로>/kiwibox_eGov4.2
   ```
3. 경로를 모르면 에이전트가 직접 실행할 수 있는 탐색 명령을 시킨다:
   ```bash
   find ~ -maxdepth 4 -name "cmmAiAssistantToolEndpoints.md" -path "*spec-docs*" 2>/dev/null  # → $KIWIBOX
   find ~ -maxdepth 4 -name "teamplgpt-hr-client-tools-workorder.md" 2>/dev/null              # → $OKRSERVICE/docs
   ```

주의: 팀에 공유되는 에이전트 작업 결과물(spec·analysis·작업지시서·이 가이드 등)에는 `/home/<username>/...` 절대경로를 쓰지 말 것. 리포 내부는 상대경로로, 타 리포는 `$KIWIBOX/...` 식 변수로 쓴다. 기존 문서에서 절대경로를 발견하면 그때그때 고쳐 둔다.

---

## 1. 3개 프로젝트의 역할

| 프로젝트 | 원격 | 역할 | 수정 가능? |
|---|---|---|---|
| **teamplgpt** (`$TEAMPLGPT`) | github.com/TeamplGPT/teamplgpt | AnythingLLM fork. HR agent-skill 7종 + 채팅/embed API + E2E 인프라. **개발 주체** | O (이 리포) |
| **okrservice** (`$OKRSERVICE`) | github.com/okrbest/okrservice | 5240 헬프데스크 위젯 호스트(erxes 계열). 채팅 위젯 → teamplgpt embed API 프록시 + **hrBridge**(R1 클라이언트 위임 실행기) | O (작업지시서로 발주) |
| **kiwibox** (`$KIWIBOX`) | github.com/ux-builder/kiwibox_eGov4.2 | 5240 HR 원천 시스템(eGov). `.do` endpoint 제공. **무수정 전제** — 읽기 전용 정본(SQL·문서) | X (참조만) |

```
[사용자 브라우저]
  ├─ kiwibox 포털 로그인 (JSESSIONID 세션 — 브라우저 밖으로 안 나감)
  └─ okrservice 위젯 (5240help)
       │  POST /ai-chat/stream  (프록시: Origin 헤더 + embed uuid + sessionId uuid)
       ▼
[teamplgpt embed API]  ──(LLM tool_call)──▶  hr-* skill handler
       │                                        │
       │   ◀── clientToolRequest (R1) ──────────┘  kiwibox 호출 명세(spec)만 전달
       ▼
[okrservice hrBridge (브라우저)]
       │  ALLOWED_PATHS 검증 → $SELF_STAFF_ID → ssnStaffId 치환 → 페이지 세션으로 fetch
       ▼
[kiwibox .do endpoint]  → 결과 → /ai-chat/tool-result → handler → 화이트리스트 렌더 → LLM 답변
```

실행 모드는 두 가지다. `server/storage/plugins/agent-skills/_shared/hrSession.js`가 자동으로 고른다.

1. **R1 클라이언트 위임 (운영 정본, specs/003)**: embed `client_tool_execution=true`면 handler에 `clientToolTransport` 주입 → kiwibox 호출을 브라우저 hrBridge로 위임. 세션 쿠키가 서버로 오지 않음. 대상 사번은 `$SELF_STAFF_ID` 마커 → 브리지가 페이지 세션의 `ssnStaffId`로 치환(본인 강제).
2. **서버 직접 호출 (폴백/개발·E2E)**: skill `setup_args`의 `HR_BASE_URL`/`HR_CONTEXT_PATH`/`HR_SESSION_COOKIE`/`HR_STAFF_ID` 사용. E2E는 `toolRuntimeOverrides`로 mock(:8000)을 가리킴.

---

## 2. 무엇이 어디의 정본인가

| 정보 | 정본(Single Source of Truth) | 소비자 |
|---|---|---|
| kiwibox endpoint 카탈로그 (경로·cmd·BODY·범위 a/b·민감 경고) | `$KIWIBOX/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` | teamplgpt handler ENDPOINT_MAP, okrservice hrBridge allowlist |
| 응답 컬럼 구조 (컬럼명·타입) | `$KIWIBOX/kiwibox/src/main/resources/kiwibox/sqlmap/**/*_SQL.xml` (SELECT 별칭 = API 키. `egovMap`이면 UPPER_SNAKE→camelCase 변환) | handler 컬럼 화이트리스트 |
| 컬럼 한글 의미 | `$KIWIBOX/spec-db/Table/*.md`(컬럼 정의) + 화면 JSP/JS grid 헤더 | 화이트리스트 한글 라벨 |
| 모듈(화면) 문서·권한·별칭 | `$KIWIBOX/spec-docs/{부시스템}/{단위업무}/*.md` | query_type 매핑·경계 키워드 설계 |
| 실호출 검증 절차 (curl) | teamplgpt `specs/kiwibox-endpoint-test-guide.md` | 실환경 검증 |
| teamplgpt→okrservice 연동 계약 | okrservice `docs/teamplgpt-hr-client-tools-workorder.md`(R1 브리지) + `docs/teamplgpt-hr-endpoint-realign-workorder.md`(allowlist 동기화) | okrservice 구현 |
| 요청 BODY to-be 계약 | teamplgpt `specs/011-hr-endpoint-catalog-realign/contracts/kiwibox-request-bodies.md` | okrservice hrBridge·E2E BODY 검증 |
| footer(응답 지침) 문구 | teamplgpt `specs/012-hr-answer-quality/contracts/footer-contract.md` | `_shared/formatTable.js` ANSWER_GUIDE |
| 렌더 컬럼 노출/차단 판정 | teamplgpt `docs/03-analysis/hr-column-whitelist-audit.analysis.md` | 각 handler `columns` |

teamplgpt에서 endpoint 경로나 cmd를 바꿔도 okrservice hrBridge의 `ALLOWED_PATHS`(정적 allowlist)는 자동으로 바뀌지 않는다. 그러면 브리지가 `"bridge: path not allowed"`로 즉시 차단한다. 동기화 규칙은 반드시 이 순서로 밟는다:

1. teamplgpt spec/커밋 확정 →
2. okrservice `docs/teamplgpt-hr-*-workorder.md` 형식으로 작업지시서 발주(변경 endpoint 표 + 근거 커밋) →
3. okrservice `widgets/client/messenger/widget/hrBridge.ts` allowlist 갱신 + 테스트 →
4. 실환경(ntest.5240.kr) 확인.

---

## 3. teamplgpt 파일 지도

### 3.1 skill 본체 (`server/storage/plugins/agent-skills/`)

| 경로 | 역할 |
|---|---|
| `hr-attendance/` `hr-salary/` `hr-personnel/` `hr-approval/` `hr-certificate/` `hr-welfare/` `hr-year-end-tax/` | skill 7종. 각각 `plugin.json`(L1) + `handler.js`(L2) |
| `{skill}/plugin.json` | **L1 LLM 제어 계층**: description(호출 조건·query_type 매핑표·`[CRITICAL]` 주기 파라미터 지시), `params` 스키마, `examples`, `setup_args`(HR_BASE_URL 등) |
| `{skill}/handler.js` | **L2 코드 계층**: ENDPOINT_MAP(경로·cmd·BODY 고정값·`columns` 화이트리스트) + 렌더. **handler.js 무수정 원칙**은 LLM 행태 제어를 handler에 넣지 말고 description으로 하라는 뜻이다. 코드 가드(화이트리스트·검증)는 handler 소관 |
| `_shared/hrSession.js` | kiwibox 호출 공통 계층: R1/서버폴백 자동 선택, 응답 래퍼 언랩(`result`/`DATA`/`Map`/`codeList`/`data`), 세션 만료(HTML) 감지 |
| `_shared/formatTable.js` | 렌더 공통: `renderWhitelisted`(화이트리스트, UPPER_SNAKE·camel 키 모두 대응) / `renderTable`(raw 폴백) / `INTERNAL_KEYS`(servareaId·staffId·staffNo·corpId·loginId·oid 상시 차단 — 최후 방어선) / `ANSWER_GUIDE` footer(질문 유형 적응 3분기) |
| `_shared/dateResolver.js` | `year_month`("3"/"지난달"/"2026-03"…) → 정규화 |

### 3.2 채팅 경로 가드 (시스템 프롬프트 층)

| 파일 | 적용 경로 | 내용 |
|---|---|---|
| `server/utils/chats/index.js` → `hrSkillChatGuard()` | **chat/query + embed** | `[HR_DATE_CONTEXT]`(KST 오늘 날짜 주입) · `[HR_TOOL_CALL_PRIORITY]`(되묻기 금지) · `[HR_TABLE_OUTPUT]`(footer 3분기 준수) · `[HR_TABLE_OUTPUT_ENRICHMENT]` |
| `server/utils/agents/aibitat/providers/ai-provider.js` → `hrSkillPeriodGuard()` | **@agent** | `[HR_DATE_CONTEXT]` · `[HR_PERIOD_PARAM_STRICT]` · `[EXAMPLES]` |

주의: 두 가드는 미러 관계다. 한쪽만 고치면 경로별 행태가 갈라진다. 실제로 구 `[HR_TABLE_OUTPUT]` 문구가 footer와 충돌해 embed에서만 표가 통짜로 나온 적이 있다. 문구를 고칠 때는 양쪽과 footer-contract를 함께 대조한다.

### 3.3 채팅 4면 (수정 시 전부 확인)

`chat/query` · `react` · `@agent` · embed. 상세는 `docs/rag-search-flow-chat-vs-react.md`에 있다. embed 전용 배선은 `server/utils/chats/embed.js`가 맡는다(tool_choice=required 강제, allowlist 필터, `clientToolBroker` R1 주입).

---

## 4. Multi-Layer Defense 완료 판정 기준

한 층만 고쳐 놓고 "완료"라고 보고해서는 안 된다. 세 층을 모두 본다:

| 층 | 위치 | 예 |
|---|---|---|
| **L1** description 가드 | `plugin.json` | query_type 매핑표, `[CRITICAL]` 되묻기 금지, 경계 키워드 |
| **L2** 코드 가드 | handler `columns` 화이트리스트, `INTERNAL_KEYS`, footer `ANSWER_GUIDE`, 시스템 프롬프트 가드 2종 | 계좌번호·내부 PK 원천 차단 |
| **L3** E2E 시나리오 | `scenarios.json` | tool_call·BODY·answer_pattern 검증 |

LLM 프롬프트(L1·가드)는 확률적으로 동작한다. 그래서 민감정보 차단은 반드시 L2에서, tool 결과에서 원천 제거하는 방식으로 해야 한다. L1과 footer는 품질(발췌·요약·되묻기 억제)을 맡는다.

---

## 5. 개발 절차

### 5.0 작업 라우팅 (착수 첫 응답에 트랙 선언 — CLAUDE.md)

1. 버그/회귀 → systematic-debugging → 수정 → 관련 E2E 재실행 (스펙 생략)
2. description·파라미터 문구 조정 → convention doc §6 절차 (스펙 생략 가능)
3. 소규모(≤3파일) → 직접 수정 + 실검증
5. 신규 기능(다중 파일/신규 skill/파라미터 계약 구조 변경/외부 통합 교체) → **spec-kit 풀 게이트** (`/speckit-specify` → 승인 → plan → tasks → 승인 → implement)

경계: 스펙 생략 경로가 3파일 초과·API 변경·4면 횡단으로 커지면 중단 → 트랙 5 전환.

### 5.1 필수 선행 참조

- `docs/conventions/hr-skill-description-pattern.md`가 description 작성 표준이다. 작업 종류별로 어느 섹션을 봐야 하는지는 CLAUDE.md의 매트릭스에 있다. 주기 파라미터에는 `[CRITICAL]` 3단과 `[재강조]`가 반드시 들어가야 하고(Template T-A/T-B), 신규 query_type은 3-Location 패턴(Location A: skill description 매핑표 / B: query_type param description / C: examples)을 따른다.

### 5.2 신규 query_type 추가(또는 endpoint 교체) 표준 순서

1. kiwibox 정본부터 확인한다. `cmmAiAssistantToolEndpoints.md`에서 경로·cmd·필수 BODY·범위(a=세션 신원 강제/b=cmmSearchStaffId)와 민감 경고를 본다. 카탈로그 §7에 등록 금지로 표시된 endpoint(주민번호 반환 등)는 어떤 경우에도 연동하지 않는다.
2. 응답 컬럼을 대조한다. sqlmap `*_SQL.xml`에서 최외곽 SELECT 별칭을 전수 추출한다. spec-db `Table/*.md`와 화면 JSP grid로 한글 라벨을 확정한 뒤 화이트리스트를 설계한다(내부 식별자·`*_CD` 코드값·복호화 컬럼 차단). 판정 선례는 `docs/03-analysis/hr-column-whitelist-audit.analysis.md`에 모아 뒀다.
   - egovMap이면 응답 키는 camelCase(`STAFF_TYPE_NM`→`staffTypeNm`). alias가 겹치면 뒤 컬럼이 이긴다. 실제로 SALDaylab에서 `SAL_CLASS_NM`이 호봉명과 은행명으로 겹쳐 오염된 적이 있다.
3. 실호출로 검증한다. `specs/kiwibox-endpoint-test-guide.md` 절차대로 ntest.5240.kr에 curl을 날린다. 필수 파라미터가 빠지면 빈 응답이 흔하므로 실측 BODY를 전량 그대로 쓴다. 임의로 줄여 써서는 안 되고 `searchType=mobile`도 절대 넣지 말 것.
4. E2E 시나리오를 먼저 쓴다(E2E-First). `scenarios.json`에 tool_call + `mock_url_pattern` + `mock_body_pattern`(+ 필요시 `answer_pattern`/`answer_not_pattern`/`max_hr_calls`)을 append하고 FAIL을 확인한다.
5. mock fixture를 추가한다. cmd가 있으면 `mock-hr-api.js`의 `FIXTURES_BY_CMD`, cmd 없는 경로형이면 `FIXTURES_BY_PATH`에 넣는다. 키는 실측 그대로 쓴다. 예전에 work_status식 키를 넣었다가 timesheet 렌더가 공란으로 나온 적이 있다.
6. handler ENDPOINT_MAP + `columns` 구현 → 단위 렌더 확인(node로 renderWhitelisted 직접 호출).
7. plugin.json 3-Location 반영. 경계 키워드(2+ skill 동일 단어)는 convention §5 매트릭스 갱신.
8. E2E 해당 시나리오 PASS → **전건 PASS**(hr-skill + embed).
9. endpoint 경로가 바뀌었으면 **okrservice 작업지시서 발주**(§2 동기화 규칙).

### 5.3 신규 skill 생성

트랙 5 스펙 경로를 반드시 탄다. convention §3 T-B/§4 T-A 템플릿 + §7 3-Location. 기존 skill(`hr-attendance`가 가장 표준적) 복제 후: ENDPOINT_MAP·QUERY_LABELS·COLUMNS_BY_QT·plugin.json 전면 재작성. `_shared`는 수정 없이 재사용이 원칙(수정 시 전 skill 회귀).

---

## 6. 검증 절차

### 6.1 E2E 인프라 (2개 스위트)

| | @agent 스위트 | embed 스위트 |
|---|---|---|
| Runner | `server/scripts/e2e-hr-skill/runner.js` | `server/scripts/e2e-embed-hr-skill/runner.js` |
| 실행 | `npm run e2e:hr-skill` (전건) / `-- --only=ID1,ID2` / `--tier=full` | `npm run e2e:embed-hr-skill` (--only 없음) |
| 시나리오 | `scenarios.json` — K##(BODY 검증)/KB##(행태 승계)/Q##(답변 품질) | `scenarios.json` — EC-ALLOW/DENY/FILTER(권한 축) |
| Mock | `mock-hr-api.js` (:8000, runner가 자동 기동·종료) | 공유 mock(../e2e-hr-skill) spawn |
| 결과 | `runs/{timestamp}/result.json` + `mock.jsonl` | 동일 |

**사전 조건**: AnythingLLM 서버 `:3001` 기동(`yarn dev:server` 또는 `yarn dev:all`) + docker `anythingllm-postgres` healthy + workspace slug `eshelsoft` + HR skill 활성. LLM은 실제 provider를 호출하므로 결정론이 아니다. 시나리오는 관대한 정규식으로 쓴다.

**판정 필드**: `expect.tool_call`(bool) · `mock_url_pattern` · `mock_body_pattern[]`(mock 로그 body 전 항목 정규식) · `answer_pattern[]`/`answer_not_pattern[]`(최종 답변) · `max_hr_calls`(fan-out 억제).

### 6.2 코드 반영 확인

여기서 자주 틀린다.

- `handler.js`는 호출마다 require 캐시를 지우므로 서버를 재기동하지 않아도 반영된다.
- `_shared/*.js`·`server/utils/**`는 **서버 재기동 필요**(require 캐시 잔존/nodemon 범위 밖일 수 있음). E2E를 돌리기 전에 재기동해 두는 편이 안전하다.
- plugin.json description을 바꿨을 때도 재기동하는 편이 좋다. 로드 시점에 캐시되기 때문이다.

### 6.3 실환경 검증

- kiwibox 직접: `specs/kiwibox-endpoint-test-guide.md` (로그인 → 쿠키 → curl per endpoint).
- 위젯 경유(R1): okrservice 로컬 기동 + embed 설정(§7) 후 실브라우저. 최종 판정은 새 세션에서 한다. 기존 대화 히스토리가 남아 있으면 모델이 과거의 잘못된 답변 패턴을 따라 할 수 있다.
- LLM 답변 행태 변경은 반드시 4면 확인: chat/query·react·@agent·embed.

### 6.4 관측성

- `HR_DEBUG_TOOL_IO=true`를 켜면 `[tool-io]` 한 줄 JSON 로그가 남는다(LLM 입출력·TOOL_CALL·KIWIBOX_RAW). `grep tool-io`로 실데이터를 추적한다. 주의: 급여·개인정보가 섞일 수 있으므로 운영에서는 절대 켜 두지 않는다.

---

## 7. okrservice 운영 배선 계약

정본은 okrservice `docs/teamplgpt-hr-client-tools-workorder.md`다.

| 항목 | 값/규칙 |
|---|---|
| 프록시 | `widgets/server/index.ts` `/ai-chat/stream` → teamplgpt `POST /embed/:uuid/stream-chat`, `/ai-chat/tool-result` 회신 프록시 |
| Origin | 서버-사이드 fetch는 Origin 자동 미부착 → `TEAMPLGPT_WIDGET_ORIGIN` env를 명시 헤더로. teamplgpt embed `allowlist_domains`에 **동일 문자열** 등록. 미설정 시 401 |
| embed 식별 | `TEAMPLGPT_EMBED_ID` = embed **uuid** (숫자 PK 넣으면 404) |
| sessionId | **uuid 강제**(canRespond가 validate) — customerId별 UUID 발급·저장 |
| hrBridge | `widgets/client/messenger/widget/hrBridge.ts` — 정적 path allowlist + YTA 정규식 + CommonCode queryId 화이트리스트. `$SELF_STAFF_ID` 치환. `BRIDGE_TIMEOUT_MS=25000`(teamplgpt 타임아웃과 중첩 계약) |
| teamplgpt embed 설정 | `allow_tool_calling=true` + `client_tool_execution=true`(R1) + `allowed_skill_hashes`(스킬 제한 시) |

---

## 8. 실사고 사례집

같은 함정에 두 번 빠지지 않으려고 모아 뒀다.

| 사고 | 원인 | 방지책 |
|---|---|---|
| 41컬럼 raw 노출 / 인사정보 내부 식별자 노출 | 화이트리스트 없는 query_type이 raw 통짜 렌더로 폴백 | 신규 query_type은 `columns` 필수. `INTERNAL_KEYS`는 에어백일 뿐 |
| **일용직 계좌번호 평문 노출** | kiwibox가 `accNoDecrypt`(복호화 평문)를 응답에 실음. `cryptAuthYn`은 화면용 | 민감 필드는 L2에서 원천 차단. sqlmap에서 `CMMF_DECR` 검색 습관화 |
| "오늘 출근정보" 요청에 한 달치 표 출력 | ① 모델이 오늘 날짜 미인지(첫 행을 오늘로 오인) ② 구 `[HR_TABLE_OUTPUT]` "그대로 출력"이 footer와 충돌 | `[HR_DATE_CONTEXT]` 유지. 가드 문구는 양 경로 미러 + footer 대조 (Q5/Q6/EC-ALLOW-11이 회귀 감지) |
| E2E는 통과하는데 실위젯만 오동작 | @agent와 embed의 시스템 프롬프트 가드가 서로 다름 | 행태 변경은 두 스위트 모두 + 실위젯 새 세션 확인 |
| timesheet 출근/퇴근 컬럼 공란 | mock fixture 키를 실측(`staTime`)이 아닌 추정(`inTime`)으로 작성 | fixture는 sqlmap 별칭 기준. 실측 42필드는 timesheet 키와 work_status 키를 둘 다 포함한다(동일 endpoint 공유) |
| 빈 응답 | 필수 BODY 파라미터 축약(`searchSymdLv` 등 누락), `searchType=mobile` | 실측 본문 전량 원칙. `FORBIDDEN_FIXED_VALUES` 참고 |
| 세션 만료가 JSON 파싱 에러로 보임 | kiwibox가 로그인 HTML 반환 | `hrSession.parseKiwiboxBody`가 처리 — 신규 호출 계층 만들지 말고 hrSession 경유 |
| 응답 언랩 실패 | 래퍼 키가 endpoint별 상이(`result`/`DATA`/`Map`/`codeList`/`data`) | hrSession 언랩 계층 사용 |
| 신규 endpoint가 embed에서만 실패 | okrservice hrBridge ALLOWED_PATHS 미갱신 | §2 동기화 규칙 — 작업지시서 발주 |

---

## 9. 문서 색인

### teamplgpt (`$TEAMPLGPT/`)
- `CLAUDE.md` — 작업 라우팅·필수 규칙 (시작점)
- `docs/conventions/hr-skill-description-pattern.md` — description 표준 (영구 convention)
- `specs/001~013-*` — 피처별 spec/plan/tasks/contracts (특히 003 세션 인증, 011 endpoint 재정렬, 012 답변 품질, 013 embed E2E)
- `specs/kiwibox-endpoint-test-guide.md` — 실호출 검증
- `docs/03-analysis/hr-column-whitelist-audit.analysis.md` — 13종 컬럼 노출/차단 판정
- `docs/rag-search-flow-chat-vs-react.md` — 3-Mode 채팅 구조
- `server/scripts/e2e-hr-skill/README.md`, `server/scripts/e2e-embed-hr-skill/README.md`

### okrservice (`$OKRSERVICE/`)
- `docs/teamplgpt-hr-client-tools-workorder.md` — R1 연동 계약 (§ 번호가 위 §7의 근거)
- `docs/teamplgpt-hr-endpoint-realign-workorder.md` — allowlist 동기화 선례

### kiwibox (`$KIWIBOX/`, 읽기 전용)
- `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` — endpoint 카탈로그 정본
- `kiwibox/src/main/resources/kiwibox/sqlmap/**/*_SQL.xml` — 응답 컬럼 정본
- `spec-db/Table|Function|SQL/*.md` — 스키마·함수 문서
- `spec-db/permission-catalog`, `common-code-catalog` — 권한·공통코드

---

## 10. 신규 팀원 첫날 빠른 시작

```bash
# 0. §0 사전 준비(3개 리포 clone + 에이전트 경로 등록) 완료 가정
# 1. 서버 기동
docker start anythingllm-postgres
cd $TEAMPLGPT && yarn dev:server                    # :3001

# 2. E2E 전건 (정상 상태 기준선 확보)
npm run e2e:hr-skill                                # @agent 면
npm run e2e:embed-hr-skill                          # embed 면

# 3. 격리 실행/디버깅
npm run e2e:hr-skill -- --only=Q5,Q6
HR_DEBUG_TOOL_IO=true yarn dev:server               # tool-io 로그 관찰
```

첫 과제 추천: `scenarios.json`의 Q1~Q8 시나리오와 그 note를 읽고, 각 시나리오가 §8 사례집의 어느 사고를 방지하는지 매핑해볼 것. 이 시스템의 방어 구조가 그대로 보인다.
