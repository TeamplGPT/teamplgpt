# HR Skill `plugin.json` description 작성 표준

**버전** v1.3 (2026-08-10 재작성본) · **상태** 영구 convention (archive 대상 아님)

> **재작성 경위** — v1.2까지 이 문서는 `docs/` gitignore 안에서 로컬 파일로만 존재했고 2026-07-15 무렵 워킹트리에서 유실됐다. git 사본이 없어 복원이 불가능했다.
> v1.3은 실물 `plugin.json` 7종과 `ai-provider.js` L2 가드에서 역추출한 재작성본이다. 정본은 언제나 코드다 — 문서와 코드가 어긋나면 코드를 믿고 이 문서를 고친다.
> `.gitignore`에 `!docs/conventions/` 예외를 뚫어 이제 추적된다.

---

## §1 목적과 범위

HR agent-skill의 LLM 행태는 `handler.js`가 아니라 `plugin.json`의 description으로 제어한다. 이 문서는 그 description을 쓰는 규칙이다.

**대상** — `server/storage/plugins/agent-skills/hr-*/plugin.json` 7종

**핵심 원칙 3가지**

1. **handler.js 무수정** — LLM이 언제·어떤 파라미터로 tool을 부를지는 전부 description에서 정한다. handler.js는 호출된 뒤의 일만 한다.
2. **Multi-Layer Defense** — description 한 층으로는 확률적으로 샌다. L1(description) + L2(코드 가드) + L3(E2E 시나리오) 세 층을 모두 채워야 완료다.
3. **되묻지 않는다** — 주기 파라미터가 발화에 없으면 생략하고 즉시 tool-call한다. 사용자에게 연도·기간을 되묻는 순간 회귀다.

---

## §2 5-Location 지도

description 규율은 한 곳에 있지 않다. 바꿀 때는 아래 5곳을 함께 본다.

| Location | 위치 | 역할 |
|---|---|---|
| **A** | `plugin.json` 최상위 `description` | skill 선택. "이 질문이 이 skill인가" |
| **B** | `entrypoint.params.query_type.description` | query_type 선택. 매핑표가 여기 산다 |
| **C** | `entrypoint.params.query_type.enum` | 값 계약. A·B에 쓴 이름과 한 글자도 달라선 안 된다 |
| **D** | `examples[]` | few-shot. 주기 파라미터 전달 형태를 여기서 보여준다 |
| **E** | `ai-provider.js::hrSkillPeriodGuard()` | L2 코드 가드. `@@hr-` prefix skill 활성 시에만 systemPrompt에 주입 |

Location E는 `plugin.json` 밖이다. `server/utils/agents/aibitat/providers/ai-provider.js:373`. 비-HR workspace에는 어떤 시점에도 주입되지 않는다.

여기에 **tool 결과 footer**가 하나 더 붙는다 — `_shared/formatTable.js`의 `ANSWER_GUIDE`. 조회 결과를 어떻게 소비할지 제어한다. 문구 정본은 `specs/012-hr-answer-quality/contracts/footer-contract.md`.

---

## §3 T-B Template — 주기 파라미터가 없다

단일 목적 조회 skill에 쓴다. `hr-certificate`, `hr-welfare`가 여기 해당한다.

### Location A (최상위 description)

```
본인 {대상}({세부 항목 나열})을 5240 HR 시스템에서 조회합니다.
항상 대화 중인 본인 기준으로 조회되며 사번은 필요 없습니다.
사용자가 {트리거 키워드 8~10개 슬래시 구분}를 물으면 이 skill을 사용하세요.
{제공 항목 요약}({민감정보 제외 명시}).
query_type 종류: {값}({한글 설명}).
{경계 문장 — 인접 skill과 헷갈릴 때만}
```

`hr-welfare` 실물 — 마지막 경계 문장이 이렇게 붙는다.

> 의료비·학자금·경조금·연말정산은 이 skill이 아닙니다(의료비/학자금은 미지원, 연말정산 공제는 hr-year-end-tax).

경계 문장은 2개 이상 skill이 같은 단어를 나눠 가질 때만 넣는다. 없는데 넣으면 잡음이다.

### Location B (query_type description)

```
조회 종류 (선택, 기본 {기본값}). [CRITICAL] {주제} 관련 질문이면 즉시 이 tool을 호출하세요.
텍스트로만 답변을 생성하거나 결과를 추측하지 마세요.
{키워드 6~8개}가 나타나면 되묻지 말고 {값}으로 즉시 tool-call하세요.
매핑표: {값}={한글 설명}({키워드 슬래시 나열}).
```

`[CRITICAL]`은 1회. T-B는 `[재강조]`를 쓰지 않는다.

### required

T-B는 `entrypoint.required`를 **빈 배열**로 둔다. enum 값이 하나뿐이라 기본값으로 흡수된다.

---

## §4 T-A Template — 주기 파라미터가 있다

`hr-attendance`, `hr-salary`, `hr-personnel`, `hr-year-end-tax`, `hr-approval` 5종이 여기 해당한다.

§3의 A·B를 그대로 쓰되 아래를 더한다.

### Location A 추가분

최상위 description에 전달 규칙 한 문장을 박는다.

> 조회 기간은 year_month 하나로만 전달하며, 언급하지 않으면 생략하세요(이번 달 자동 적용).

### Location B 추가분 — `[중복 조회 금지]`

query_type이 6개를 넘으면 description 끝에 붙인다.

> [중복 조회 금지] 한 질문에는 가장 적합한 query_type 하나만 호출하세요. 같은 정보를 얻으려고 여러 query_type을 중복·병렬 호출하지 마세요. 서로 다른 정보를 묻는 복합 질문은 예외입니다.

### 주기 파라미터 description — `[CRITICAL]` 3단 + `[재강조]`

**이 골격은 필수다.** 한 단이라도 빠지면 되묻기 회귀가 재발한다.

```
{한글명} (선택).
[CRITICAL] ①절대로 사용자에게 {연도/기간}을 되묻지 마세요.
           ②기간 없이도 즉시 tool-call을 실행하세요.
           ③연도를 추론해 추가하지도 마세요.
{입도 주의 — 월 단위면 "월 단위 조회이므로 일(day) 정보는 무시됩니다"}
전달 규칙: 연도 명시 시 'YYYYMM'(예: '202503') / 'YYYY-MM' / 'YYYY년 M월' 중 하나.
          연도 미명시 시 월만 '3', '11', '2월', '지난달' 등으로 그대로 전달—현재 연도가 자동으로 적용됩니다.
          미지정 시 생략—이번 달이 자동 적용됩니다.
[재강조] 기간이 사용자 발화에 없으면 되묻지 말고 {파라미터명}을 생략하고 즉시 tool-call하세요.
{적용 범위 — 어떤 query_type에서 쓰이는지}
```

3단의 정체:

| 단 | 문장 | 막는 실패 |
|---|---|---|
| ① | 되묻지 마세요 | 확인 질문 생성 |
| ② | 기간 없이도 즉시 tool-call | 파라미터 대기 상태로 멈춤 |
| ③ | 연도를 추론해 추가하지 마세요 | 환각 연도 주입 |

`[재강조]`는 ①+②의 압축 반복이다. 길이가 긴 description에서 앞머리 지시가 희석되는 걸 막는다. 생략하지 않는다.

### 연 단위 변형 (`cal_yy`)

`hr-year-end-tax`는 월이 아니라 귀속연도를 받는다. 골격은 같고 어휘만 바뀐다.

> 귀속연도 (선택). [CRITICAL] 절대로 사용자에게 연도를 되묻지 마세요. 연도 없이도 즉시 tool-call하세요. 전달 규칙: 사용자가 연도를 명시한 경우에만 'YYYY'(예: '2024') 또는 '작년'/'재작년'으로 전달. 미지정 시 생략—최신 지원 연도가 자동 적용됩니다. 지원 연도: 2022~2025. [재강조] 연도가 발화에 없으면 되묻지 말고 cal_yy를 생략하고 즉시 tool-call하세요.

지원 연도처럼 범위가 유한하면 명시한다. 서버 기본값이 뭔지도 쓴다.

### 적용 범위 문장

주기 파라미터가 일부 query_type에만 쓰이면 끝에 밝힌다. 안 쓰는 곳에 붙는 걸 막는다.

- `hr-personnel` — "schedule_day에서만 사용."
- `hr-salary` — "pay_periods/salary_statement/daylabor에서 사용(월 기준). payslip 계열은 pay_item으로 지급 건이 특정되므로 year_month 불요."

### Location D (examples)

T-A는 주기 파라미터 예시를 최소 4종 넣는다.

| 형태 | 예 |
|---|---|
| 생략 | `{"query_type": "timesheet"}` |
| 월만 | `{"query_type": "timesheet", "year_month": "2"}` |
| 상대 표현 | `{"query_type": "timesheet", "year_month": "지난달"}` |
| 연월 명시 | `{"query_type": "timesheet", "year_month": "202501"}` |

일(day) 입도 함정도 예시로 못 박는다 — `"2월 27일자 출퇴근 내역"` → `year_month: "2"`.

---

## §5 적용 현황 매트릭스

2026-08-10 기준. 실물 `plugin.json` 대조 결과.

| skill | ver | Template | 주기 파라미터 | 부가 파라미터 | query_type | required | examples | `[CRITICAL]` | `[재강조]` | 중복금지 |
|---|---|---|---|---|---|---|---|---|---|---|
| `hr-attendance` | 2.1.0 | T-A | `year_month` | — | 8 | `query_type` | 14 | 2 | 1 | ✓ |
| `hr-personnel` | 2.2.0 | T-A | `year_month` | `org_cd` | 8 | `query_type` | 12 | 3 | 1 | — |
| `hr-salary` | 2.2.0 | T-A | `year_month` | `pay_item` | 6 | `query_type` | 8 | 3 | 1 | — |
| `hr-year-end-tax` | 2.1.0 | T-A | `cal_yy` | — | 9 | `query_type` | 12 | 2 | 1 | — |
| `hr-approval` | 1.0.0 | T-A | `year_month` | — | 5 | `query_type` | 8 | 2 | 1 | — |
| `hr-certificate` | 1.0.0 | T-B | — | — | 1 | (빈 배열) | 4 | 1 | 0 | — |
| `hr-welfare` | 1.0.0 | T-B | — | — | 1 | (빈 배열) | 4 | 1 | 0 | — |

읽는 법 — T-A는 `[재강조]` 1회가 강제다. T-B는 0이 정상이다. 표에서 T-A인데 `[재강조]`가 0이면 회귀다.

### 경계 키워드

2개 이상 skill이 같은 단어를 쓰는 지점. 새 skill을 넣을 때 여기부터 본다.

| 단어 | 나눠 갖는 skill | 가르는 방법 |
|---|---|---|
| 휴가 | `hr-attendance` | 본인 잔여/사용은 attendance. 결재 상태는 approval |
| 신청내역 | `hr-certificate`·`hr-welfare`·`hr-approval` | 증명서/대출/결재로 목적어가 가른다 |
| 교육 | `hr-personnel`·`hr-year-end-tax` | 이력은 personnel, 공제는 year-end-tax |
| 대출·의료비·학자금 | `hr-welfare`·`hr-year-end-tax` | 사내대출은 welfare, 공제는 year-end-tax |
| 연말정산 | `hr-year-end-tax` 단독 | welfare description에 배제 문장을 명시 |

---

## §6 변경 절차

### §6.1 신규 주기 파라미터 체크리스트

`*_date`, `*_month`, `*_year`, `cal_*`, `from_*`, `to_*` 계열을 추가할 때 전부 통과시킨다.

- [ ] 파라미터 description에 `[CRITICAL]` 3단(①되묻지 마 ②없어도 즉시 호출 ③추론 금지)을 넣었다
- [ ] `[재강조]` 문장을 넣었고 파라미터명을 정확히 적었다
- [ ] 전달 규칙에 연도 명시형·미명시형·생략형 3가지를 모두 썼다
- [ ] 서버 기본값이 뭔지 description에 밝혔다
- [ ] 입도(월 단위인지 일 단위인지)를 밝혔다
- [ ] 어떤 query_type에서 쓰는지 적용 범위를 적었다
- [ ] Location A 최상위 description에 전달 규칙 한 문장을 넣었다
- [ ] Location D examples에 4종(생략·월만·상대·연월명시)을 넣었다
- [ ] Location E `hrSkillPeriodGuard()`의 파라미터 목록에 새 이름을 추가했다
- [ ] §5 매트릭스를 갱신했다
- [ ] E2E 시나리오를 append하고 FAIL을 먼저 확인했다 (§6.2)

### §6.2 회귀 검증 절차

description 문구만 바꿔도 이 순서를 지킨다. **빌드 통과는 완료가 아니다.**

1. **시나리오 먼저** — `server/scripts/e2e-hr-skill/scenarios.json`에 append. 코드보다 먼저.
2. **FAIL 확인** — `npm run e2e:hr-skill --only=<신규ID>`. 여기서 통과하면 시나리오가 무의미하다는 뜻이니 시나리오를 고친다.
3. **description 수정**
4. **격리 재실행** — `--only=<신규ID>`. 되묻기성 회귀는 확률적이라 `repeat`를 10 이상으로 둔다.
5. **전건 실행** — `npm run e2e:hr-skill`. 부분 통과로 끝내지 않는다.
6. 결과는 `server/scripts/e2e-hr-skill/runs/{timestamp}/result.json`에 남는다.

사전 조건 — AnythingLLM 서버 `:3001` 기동(`yarn dev:all`). Mock HR API `:8000`은 runner가 자동 기동한다.

**되묻기 회귀 판정** — `asked > 0`이면 실패다. 응답이 맞아도 실패다.

---

## §7 3-Location 패턴 — 신규 query_type을 넣는다

query_type 하나를 추가하려면 A·B·C 세 곳을 **같은 커밋에서 동시에** 고친다. 한 곳만 고치면 조용히 깨진다.

### Location A — 최상위 `description`

두 군데를 고친다.

1. 트리거 키워드 나열에 새 자연어를 넣는다 (`사용자가 …/…/…를 물으면`)
2. `query_type 종류:` 목록에 `값(한글 설명)`을 넣는다

### Location B — `query_type.description` 매핑표

매핑표에 항목을 추가한다. 형식은 고정이다.

```
{값}={한글 설명}({키워드1/키워드2/키워드3/…})
```

기간 파라미터가 필요 없는 값이면 뒤에 못 박는다.

> —기간 파라미터 불필요, 즉시 tool-call

### Location C — `enum` 배열

값을 추가한다. **A·B에 쓴 문자열과 정확히 일치**해야 한다. 여기가 어긋나면 LLM은 enum에 없는 값을 만들어내고 handler는 그걸 못 받는다.

### 그리고 D·E

- **D** — `examples`에 신규 값 예시를 최소 1건. 주기 파라미터를 쓰는 값이면 2건(생략형·명시형).
- **E** — 주기 파라미터 동작이 달라지면 `hrSkillPeriodGuard()`의 `[EXAMPLES]` 줄을 함께 본다.

### 검증

```bash
# A·B·C 3-Location 일치 확인
jq -r '.entrypoint.params.query_type.enum[]' plugin.json | while read v; do
  grep -q "$v" <(jq -r '.description' plugin.json) || echo "A 누락: $v"
  grep -q "$v=" <(jq -r '.entrypoint.params.query_type.description' plugin.json) || echo "B 매핑표 누락: $v"
done
```

---

## §8 알려진 드리프트

재작성 시점에 확인된 코드-문서 불일치. 고칠 때 이 문서도 함께 갱신한다.

1. **Location E의 예시가 낡았다** — `ai-provider.js:393`의 `[EXAMPLES]`가 `work_plan_weekly`와 `base_date`를 든다. `hr-attendance`의 현재 enum·params에 둘 다 없다.
2. **Location E의 skill 목록이 4종에 멈춰 있다** — `ai-provider.js:367`(JSDoc)과 `:389`(가드 본문)가 attendance/salary/personnel/year-end-tax만 든다. 실물은 7종. 다만 활성 판정은 `@@hr-` prefix라 approval·certificate·welfare에도 실제로는 주입된다. 문구만 낡았다.
3. **`[중복 조회 금지]`가 `hr-attendance`에만 있다** — query_type이 8·9개인 `hr-personnel`·`hr-year-end-tax`에는 없다. 넣을지는 E2E로 판정한다.

---

## 관련 문서

| 문서 | 내용 |
|---|---|
| `CLAUDE.md` / `AGENTS.md` | 작업 라우팅. 트랙 2가 이 문서의 §6을 게이트로 쓴다 |
| `.specify/memory/constitution.md` | 헌장. Multi-Layer Defense 원칙 |
| `specs/012-hr-answer-quality/contracts/footer-contract.md` | tool 결과 footer 문구 정본 |
| `HR-SKILL-GUIDE.md` | HR skill 개발·검증 인수인계 |
| `server/scripts/e2e-hr-skill/` | E2E runner·시나리오 |
