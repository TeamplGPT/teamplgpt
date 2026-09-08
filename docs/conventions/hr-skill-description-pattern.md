# HR Skill `plugin.json` description 작성 표준

**버전** v1.4 (2026-09-08) · **상태** 영구 convention (archive 대상 아님)

> **v1.4 (2026-09-08): P0-2/P1-1 재설계 반영 — v1.3은 2026-08-10 시점 역추출로 현행과 불일치.**
> 2026-09-03~04에 HR skill 7종의 description이 "키워드 매핑표 + `[CRITICAL]` 반복" 방식에서 "정체성 / 의도 서술 / 경계" 구조로 전면 재작성됐고, 모든 skill에 공통인 지시(본인 기준·즉시 호출·기간 되묻기 금지·year_month 형식·required 필수·코드성 인자 선행 조회)는 description 밖 시스템 프롬프트 가드 `hrSkillChatGuard()`로 이관됐다. v1.4는 그 결과물인 실물 `plugin.json` 7종, `server/utils/chats/index.js`의 가드, `server/evals/hr-routing/` 평가 하네스에서 다시 역추출한 것이다.
> 정본은 언제나 코드다 — 문서와 코드가 어긋나면 코드를 믿고 이 문서를 고친다.

---

## §1 목적과 범위

HR agent-skill의 LLM 행태는 `handler.js`가 아니라 `plugin.json`의 description과 시스템 프롬프트 가드로 제어한다. 이 문서는 그 description을 쓰는 규칙이다.

**대상** — `server/storage/plugins/agent-skills/hr-*/plugin.json` 7종 (`hr-attendance`, `hr-personnel`, `hr-salary`, `hr-year-end-tax`, `hr-approval`, `hr-certificate`, `hr-welfare`)

**핵심 원칙 4가지**

1. **handler.js 무수정** — LLM이 언제·어떤 파라미터로 tool을 부를지는 description과 가드에서 정한다. handler.js는 호출된 뒤의 일만 한다.
2. **Multi-Layer Defense** — L1(description) + L2(시스템 프롬프트 가드) + L3(평가 하네스·E2E) 세 층을 모두 채워야 완료다. 단, L1과 L2는 **역할이 분리**돼 있다. 공통 규칙은 L2에만 쓰고, description에는 그 skill 고유의 정보만 쓴다(§2 중복 금지).
3. **키워드가 아니라 의도** — description은 "이런 단어가 나오면 이 값"이 아니라 "사용자가 무엇을 알고 싶어할 때 이 값"으로 쓴다. 단어 나열은 구어체·우회 표현에서 샌다. 평가 하네스 태그 `colloquial`/`indirect`가 이 원칙의 회귀를 잡는다.
4. **경계는 위임처까지** — 인접 skill과 겹치는 지점은 "아니다"로 끝내지 말고 "어느 skill로 가라"까지 쓴다.

v1.3까지의 키워드 매핑표(`값=설명(키워드1/키워드2/…)`) 방식과 `[CRITICAL]` 3단 + `[재강조]` 골격은 폐기한다.

---

## §2 Location 지도

description 규율은 한 곳에 있지 않다. 바꿀 때는 아래를 함께 본다.

| Location | 위치 | 역할 |
|---|---|---|
| **A** | `plugin.json` 최상위 `description` | skill 선택. "이 질문이 이 skill인가" — 정체성·의도·경계 (§3) |
| **B** | `entrypoint.params.query_type.description` | query_type 선택. 의도 서술 + 폴백 (§4) |
| **C** | `entrypoint.params.query_type.enum` + `entrypoint.required` | 값 계약. A·B에 쓴 이름과 한 글자도 달라선 안 된다. `required`는 항상 `["query_type"]` (§5.1) |
| **D** | `examples[]` | few-shot. 파라미터 전달 형태를 보여준다 (§5.4) |
| **E** | 시스템 프롬프트 가드 — 채팅 경로 `server/utils/chats/index.js::hrSkillChatGuard()`, 에이전트 경로 `server/utils/agents/aibitat/providers/ai-provider.js::hrSkillPeriodGuard()` | L2. 모든 hr- skill에 공통인 지시. `@@hr-` prefix skill이 하나라도 활성일 때만 systemPrompt 뒤에 붙는다 |

### Location E — 공통 지시는 여기 산다

채팅/query 모드(`stream.js`, `apiChatHandler.js`)의 systemPrompt는 `chatPrompt()`가 만들고, HR skill 활성 시 `hrSkillChatGuard()` 결과를 덧붙인다. 평가 하네스(`evals/hr-routing/run.js`)도 같은 `chatPrompt(null, null)`을 쓴다. 가드 본문의 블록:

| 블록 | 내용 |
|---|---|
| `[HR_DATE_CONTEXT]` | 오늘 날짜(Asia/Seoul) 주입. 상대 날짜 해석 기준 |
| `[HR_SKILL_COMMON]` 1~6 | ① 본인 기준 조회, 사번·이름 되묻기 금지 ② skill·query_type을 정했으면 즉시 tool 호출, 결과 추측 금지 ③ 기간 파라미터(year_month/cal_yy) 없으면 생략하고 즉시 호출, 연도 추론 금지 ④ year_month 전달 형식(연도 명시 시 `YYYYMM`/`YYYY-MM`/`YYYY년 M월`, 미명시 시 월 표현 그대로, 일 정보 무시) ⑤ required 파라미터는 enum이 하나여도 항상 채움 ⑥ 코드성 파라미터(pay_item/org_cd)는 선행 조회 결과의 코드값만 사용 |
| `[HR_TOOL_CALL_PRIORITY]` | workspace 프롬프트의 "모호성 검사 → 되묻기" 절차보다 HR 지시와 tool description이 우선 |
| `[ORDER]` | HR 요청의 첫 액션은 tool_call |
| `[HR_SALARY_TWO_STEP]` | hr-salary는 pay_item 미확보 시 무조건 `pay_periods` 선행 |
| `[HR_TABLE_OUTPUT]` / `[HR_TABLE_OUTPUT_ENRICHMENT]` | tool 결과 표 소비 방식 (footer 계약과 짝) |

**중복 금지 규칙** — `[HR_SKILL_COMMON]`에 있는 문장을 description에 다시 쓰지 않는다. "사번은 필요 없습니다", "되묻지 마세요", "즉시 tool-call하세요", year_month 형식 나열은 전부 L2 소관이다. description에서는 필요할 때 `[HR_SKILL_COMMON]을 따르세요`로 **참조**만 한다(§5.2). 두 곳에 같은 규칙을 쓰면 한쪽만 고쳐지는 드리프트가 생기고, description 길이만 늘어 고유 정보가 희석된다. 유일한 허용 예외는 hr-salary 2단계 규칙이다(§4.3).

**에이전트 경로** — 2026-09-08부터 `hrSkillPeriodGuard()`도 `server/utils/hrSkillGuard.js`의 공통 블록(`[HR_SKILL_COMMON]`~`[HR_SALARY_TWO_STEP]`)을 채팅 가드와 공유한다(채팅 경로만 `[HR_TABLE_OUTPUT]`류를 덧붙임). 공통 규칙은 그 모듈에서만 고친다. 다만 하네스가 검증하는 것은 여전히 채팅 경로다.

여기에 **tool 결과 footer**가 하나 더 붙는다 — `_shared/formatTable.js`의 `ANSWER_GUIDE`. 조회 결과를 어떻게 소비할지 제어한다. 문구 정본은 `specs/012-hr-answer-quality/contracts/footer-contract.md`.

---

## §3 Location A — 최상위 description 구조

세 부분을 이 순서로 쓴다. 7종 전부 이 구조다.

```
① 정체성   본인의 {대상}을 5240 HR 시스템에서 조회하는 skill입니다 — {제공 항목 나열}.
② 의도     '{우회 발화 1}', '{우회 발화 2}', '{우회 발화 3}'처럼 {도메인 용어} 없이 묻는 경우도 포함됩니다.
           (필요 시) {이 skill을 쓰는 상황 서술}. {제공 컬럼 요약}({민감정보 제외 명시}).
③ 경계     경계: {제공하지 않는 것}. {겹치는 의도}는 {위임할 skill}을 사용하세요.
```

### ① 정체성 — 한 문장

"본인의 … 조회하는 skill입니다"로 시작해 무엇을 다루는지 한 문장으로 끝낸다. 제공 항목은 대시(—) 뒤에 나열한다. "사번은 필요 없습니다"류 공통 문장은 넣지 않는다(§2).

### ② 의도 서술 + 우회 표현 예시

핵심은 **열린 예시**다. 도메인 용어가 없는 구어체 발화를 2~3개 따옴표로 들고 "…처럼 {용어} 없이 묻는 경우도 포함됩니다"로 닫는다. 키워드를 슬래시로 나열하지 않는다.

- 예시는 실제 사용자가 할 법한 말투로 쓴다. 정규형("연차 잔여일 조회")은 examples[]가 맡으므로 여기엔 넣지 않는다.
- **평가 데이터셋(`evals/hr-routing/dataset.jsonl`)의 발화를 그대로 복사하지 않는다.** 같은 뜻을 다른 말로 쓴다(패러프레이즈). 데이터셋 발화를 description에 넣으면 하네스가 암기를 측정하게 돼 지표가 무의미해진다.
- 단일 목적 skill(§4.2)은 이 부분에 "…의 현황이 궁금할 때 사용하세요"처럼 사용 상황을 한 문장 더 둔다.

### ③ 경계 — 위임처를 명시

"경계:"로 시작한다. 두 종류를 구분해 쓴다.

| 종류 | 형태 | 예 |
|---|---|---|
| 위임 | `{의도}는 {skill}을 사용하세요` | 휴가 신청서의 결재 진행 상태 → hr-approval |
| 미제공 | `{항목}은 제공하지 않습니다` / `조회할 수 없으므로 tool을 호출하지 말고 지원하지 않는 항목이라고 안내하세요` | 경조금·의료비 지원·학자금 |

위임 대상은 skill 이름을 정확히 적는다. 가능하면 query_type까지(`hr-personnel(todo_count)`). 경계 문장은 2개 이상 skill이 같은 의도를 나눠 가질 때만 넣는다 — 기준표는 `server/evals/hr-routing/README.md`의 "모호어 분기 컨벤션"이다(§6.1).

`hr-welfare` 실물 — 미제공과 위임이 함께 있는 경우:

> 경계: 이 skill은 오직 "대출"만 다룹니다. 경조금(경조사 지원금)·의료비 지원·학자금 등 다른 복리후생 항목은 조회할 수 없으므로 그런 질문에는 이 tool을 호출하지 말고 지원하지 않는 항목이라고 안내하세요. 계좌 등 민감정보는 제공하지 않으며, 연말정산 공제는 hr-year-end-tax를 사용하세요.

### 넣지 않는 것

- 트리거 키워드 슬래시 나열 (`사용자가 A/B/C/…를 물으면`)
- `query_type 종류: …` 목록 — Location B의 일이다
- 기간 파라미터 전달 규칙 문장 — L2의 일이다
- `[CRITICAL]`, `[재강조]`, `[중복 조회 금지]` 태그

---

## §4 Location B — query_type description 구조

세 가지 형태가 있다. skill의 성격이 정한다.

### §4.1 다값형 — 의도 서술 + 폴백

query_type이 2개 이상인 skill(`hr-attendance`, `hr-personnel`, `hr-year-end-tax`, `hr-approval`). 형식은 고정이다.

```
조회 종류 (필수). 키워드가 아니라 사용자의 의도로 판단하세요:
{값1}={한글 설명} — {무엇}이 관심사일 때({보조 힌트}),
{값2}={한글 설명} — {무엇}이 관심사일 때,
…
종류가 불분명하면 {폴백 값}을 사용하세요.
```

규칙:

- 첫 문장 `조회 종류 (필수). 키워드가 아니라 사용자의 의도로 판단하세요:`는 고정이다. `(선택, 기본 …)`으로 쓰지 않는다 — required 승격(§5.1) 때문이다.
- 각 값은 `값=설명 — …가 관심사일 때` 꼴이다. 설명은 시스템 화면 이름이 아니라 사용자가 궁금해하는 것으로 쓴다. 괄호 안에 포함 항목이나 인접 값과의 구분 힌트를 짧게 둘 수 있다.
- 값이 서로 헷갈리는 짝(`annual_leave_balance` ↔ `leave_requests`, `pending` ↔ `drafted`)은 "내가 아니라 팀의", "남이 올려 내가 결재해야 하는"처럼 **차이 축**을 문장에 넣는다.
- 다른 skill로 보내야 하는 값이 있으면 괄호로 위임처를 적는다 — `todo_count=… '건수' — 몇 건인지 숫자가 관심사일 때(문서 목록·내용은 hr-approval)`.
- **폴백 문장은 필수다.** `종류가 불분명하면 X를 사용하세요.` X는 그 skill에서 가장 넓은 값(요약형·본인 기본정보형)으로 고른다. 여러 값을 아우르는 질문에 대한 지시가 필요하면 덧붙인다(`불분명하거나 여러 공제를 아우르면 summary`).
- `[CRITICAL]`, `[중복 조회 금지]`, 키워드 매핑표는 쓰지 않는다.

`hr-attendance` 실물 일부:

> annual_leave_balance=휴가 종류별 발생/사용/잔여 — 며칠 남았는지·쉴 수 있는지가 관심사일 때(연차·보상휴가·포상휴가 포함), timesheet=출퇴근 기록 — 몇 시에 출근/퇴근했는지 시각과 기록이 관심사일 때, … 종류가 불분명하면 annual_leave_balance를 사용하세요.

### §4.2 단일값형 — 항상 그 값을 전달

enum이 하나뿐인 skill(`hr-certificate`, `hr-welfare`).

```
조회 종류 (필수). 항상 '{값}'({한글 설명})을 전달하세요 — 이 skill의 유일한 값이며 절대 생략하지 마세요.
```

값이 하나라도 required에서 빼지 않는다(§5.1). 폴백 문장은 없다 — 값이 하나라 불분명할 수 없다.

### §4.3 선행 조회 의존형 — hr-salary 예외

`hr-salary`는 payslip/deductions/payslip_summary가 `pay_item`을 요구하고, `pay_item`은 `pay_periods` 결과의 CODE에서만 얻는다. 이 2단계 계약은 다음 세 곳에 **의도적으로 중복**돼 있다.

| 위치 | 문장 |
|---|---|
| Location A | `[중요] 급여명세 조회는 2단계입니다: …` |
| Location B | 각 값 뒤 `(pay_item 있을 때만 선택 가능)` + 끝에 `[CRITICAL] … 첫 호출은 예외 없이 pay_periods` |
| Location E | `[HR_SALARY_TWO_STEP]` |

이것이 §2 중복 금지의 유일한 허용 예외다. 선택 오류가 곧 API 실패(pay_item 없는 상세 호출)로 이어지고, 하네스 태그 `ambiguous`(공제·보험·연금 발화)가 이 경계를 가장 많이 시험하기 때문이다. hr-salary의 B에는 폴백 문장 대신 이 2단계 규칙이 서 있다. 새 skill이 같은 구조(코드 인자를 선행 조회에서만 얻음)를 갖게 되면 이 형태를 따르되, 문구는 hr-salary와 맞춘다.

---

## §5 파라미터·required·examples

### §5.1 required 승격 규칙

`entrypoint.required`는 **7종 모두 `["query_type"]`**이다. enum이 하나뿐인 skill도 예외가 아니다. v1.3의 "T-B는 빈 배열" 규칙은 폐기됐다. 근거는 L2 `[HR_SKILL_COMMON]` 5항("required 파라미터는 enum 값이 하나뿐이어도 생략하지 마세요")과 짝을 이루며, query_type이 빠진 호출을 handler 기본값으로 흡수하지 않고 LLM이 명시하게 만든다.

주기 파라미터(`year_month`, `cal_yy`)와 코드성 파라미터(`pay_item`, `org_cd`)는 required에 넣지 않는다 — 조건부 필수는 description으로 표현한다.

### §5.2 주기 파라미터 description

`year_month`는 5종(`hr-attendance`, `hr-personnel`, `hr-salary`, `hr-approval` + `cal_yy`를 쓰는 `hr-year-end-tax`)에 있다. 형식은 다섯 요소로 고정이다.

```
{한글명} (선택). 사용자가 기간을 언급한 경우에만 전달하고, 없으면 생략하세요({서버 기본값} 자동 적용).
형식·되묻기 금지 규칙은 시스템 지시 [HR_SKILL_COMMON]을 따르세요.
{적용 범위 — 어떤 query_type에서 쓰이는지}
```

| 요소 | 내용 | 이유 |
|---|---|---|
| 선택 표시 | `(선택)` | required 아님 |
| 조건 | 언급한 경우에만 전달, 없으면 생략 | L2 3항의 요약 |
| 기본값 | `이번 달 자동 적용` / `최신 지원 연도 자동 적용` | 서버 기본값이 뭔지 밝힌다 |
| 위임 | `[HR_SKILL_COMMON]을 따르세요` | 형식 나열·되묻기 금지 3단은 여기 쓰지 않는다 |
| 적용 범위 | `schedule_day에서만 사용`, `payslip 계열은 pay_item으로 지급 건이 특정되므로 year_month 불요` | 안 쓰는 query_type에 붙는 걸 막는다 |

연 단위 변형(`cal_yy`)은 어휘만 바뀐다. 허용 형식(`'YYYY'` 또는 `'작년'/'재작년'`)과 **유한한 지원 범위**(`지원 연도: 2022~2025`)는 skill 고유 정보이므로 description에 쓴다. 지원 연도는 Location A에도 한 번 나온다.

전달 형식의 정본은 L2 4항이고, 서버 쪽 수용 범위는 `_shared/dateResolver.js`다 — 정확형(`YYYYMM`) 통과, 1~2자리 숫자는 월로 해석해 현재 연도 보정, 그 외 한국어 표현(`3월`, `지난달`)은 sugar-date ko 로케일로 해석, 해석 불가면 `undefined`로 서버 기본값 위임.

### §5.3 코드성 파라미터 description

`pay_item`(hr-salary), `org_cd`(hr-personnel). 세 가지를 반드시 쓴다.

1. 어느 query_type에서 필수/선택인지 — `(payslip/deductions/payslip_summary에서 필수)`, `(org_members에서 필수, org_tree에서 선택)`
2. 값의 출처 — `반드시 query_type=pay_periods 조회 결과의 코드값(CODE …)만 사용하세요`
3. 모를 때의 절차 — `모르면 먼저 … 로 조회한 뒤 그 결과의 …로 호출하세요`

"사용자에게 되묻지 말라·추측하지 말라"는 L2 6항이 담당하므로 반복하지 않는다.

### §5.4 Location D — examples

- 모든 query_type 값에 최소 1건. 정규형 발화로 쓴다(우회 표현은 Location A ②가 맡는다).
- 주기 파라미터가 있는 skill은 전달 형태 4종을 넣는다.

| 형태 | 예 |
|---|---|
| 생략 | `{"query_type": "timesheet"}` |
| 월만 | `{"query_type": "timesheet", "year_month": "2"}` |
| 상대 표현 | `{"query_type": "timesheet", "year_month": "지난달"}` |
| 연월 명시 | `{"query_type": "timesheet", "year_month": "202501"}` |

- 일(day) 입도 함정을 한 건 못 박는다 — "2월 27일자 출퇴근 내역" → `year_month: "2"`.
- 코드성 파라미터가 있으면 선행 조회 결과를 받은 뒤의 후속 발화("그 건 공제내역")와 자리표시 코드(`"20260625NN"`, `"ORG123"`)로 2단계 흐름을 보여준다.
- **eval 발화 복사 금지**는 examples에도 적용된다(§3 ②).

---

## §6 적용 현황 매트릭스

2026-09-08 기준. 실물 `plugin.json` 대조 결과.

| skill | ver | query_type 수 | 주기 파라미터 | 코드성 파라미터 | required | examples | B 형태 | 폴백 값 | 경계 위임처 |
|---|---|---|---|---|---|---|---|---|---|
| `hr-attendance` | 2.1.0 | 8 | `year_month` | — | `query_type` | 14 | 다값형 | `annual_leave_balance` | hr-approval, hr-salary |
| `hr-personnel` | 2.2.0 | 8 | `year_month` | `org_cd` | `query_type` | 12 | 다값형 | `profile` | hr-year-end-tax, hr-approval |
| `hr-salary` | 2.2.0 | 6 | `year_month` | `pay_item` | `query_type` | 8 | 선행 조회 의존형 | (2단계 규칙) | hr-year-end-tax |
| `hr-year-end-tax` | 2.1.0 | 9 | `cal_yy` | — | `query_type` | 12 | 다값형 | `summary` | hr-salary |
| `hr-approval` | 1.0.0 | 5 | `year_month` | — | `query_type` | 8 | 다값형 | `pending` | hr-personnel, hr-attendance |
| `hr-certificate` | 1.0.0 | 1 | — | — | `query_type` | 4 | 단일값형 | — | (발급 신청 불가 명시) |
| `hr-welfare` | 1.0.0 | 1 | — | — | `query_type` | 4 | 단일값형 | — | hr-year-end-tax, 미지원 항목 안내 |

읽는 법 — `[CRITICAL]`은 hr-salary Location B에만 1회 있는 것이 정상이다. 다른 곳에 나타나면 회귀다. required가 빈 배열이면 회귀다. 다값형인데 폴백 문장이 없으면 회귀다.

### §6.1 경계 기준표

skill 간 경계의 정답 기준은 `server/evals/hr-routing/README.md`의 **"모호어 분기 컨벤션" 표**가 정본이다. 공제·보험·연금 / 휴가 / 결재·미결 / 교육 / 가족 / 일정 / 대출 / 급여 8개 중의어에 대해 "이런 의도면 → 이 skill.query_type"을 정해 두었고, 데이터셋 태그 `ambiguous`(18건)·`boundary`(9건)가 이를 회귀 검증한다. description의 경계 문장(§3 ③)은 이 표와 일치해야 하며, 표를 바꾸면 양쪽 skill의 description과 데이터셋 케이스를 같은 커밋에서 고친다.

---

## §7 변경 절차

### §7.1 신규 query_type — 3-Location 동시 수정

A·B·C 세 곳을 **같은 커밋에서** 고친다. 한 곳만 고치면 조용히 깨진다.

1. **Location A** — 정체성 문장의 제공 항목 나열에 추가. 인접 skill과 겹치면 경계 문장도 보강.
2. **Location B** — `값=설명 — …가 관심사일 때` 항목 추가. 헷갈리는 기존 값이 있으면 차이 축을 양쪽에 쓴다. 폴백 값이 바뀌어야 하는지 판단.
3. **Location C** — enum에 추가. A·B의 문자열과 정확히 일치.
4. **Location D** — 정규형 예시 1건 이상. 주기 파라미터를 쓰는 값이면 생략형·명시형 2건.
5. **데이터셋** — `dataset.jsonl`에 정규형 1건 + 비정규형(`colloquial`/`indirect`) 2건 이상. 경계에 걸리면 `boundary` 케이스도.
6. §6 매트릭스 갱신.

A·B·C 일치 확인:

```bash
jq -r '.entrypoint.params.query_type.enum[]' plugin.json | while read v; do
  grep -q "$v=" <(jq -r '.entrypoint.params.query_type.description' plugin.json) || echo "B 누락: $v"
done
```

### §7.2 신규 주기·코드성 파라미터 체크리스트

`*_date`, `*_month`, `*_year`, `cal_*`, `from_*`, `to_*` 계열, 또는 선행 조회에서 얻는 코드 인자를 추가할 때 전부 통과시킨다.

- [ ] description이 §5.2(주기) 또는 §5.3(코드성)의 요소를 모두 갖췄다
- [ ] 되묻기 금지·형식 나열을 description에 쓰지 않고 `[HR_SKILL_COMMON]` 참조로 대신했다
- [ ] 서버 기본값과 적용 범위(query_type)를 밝혔다
- [ ] required에 넣지 않았다(조건부 필수는 description으로)
- [ ] Location D에 4종(생략·월만·상대·연월명시) 또는 2단계 흐름을 넣었다
- [ ] L2 `[HR_SKILL_COMMON]` 3·4·6항이 새 파라미터 이름을 포괄하는지 확인했다(포괄 못 하면 가드를 고친다 — description에 보충하지 않는다)
- [ ] 데이터셋 `date` 케이스에 `params_regex`를 넣었다 — **정규식은 서버가 수용하는 형식 전체를 커버**한다(예: `2025[-년]?\s*0?1(월|$)`은 `202501`/`2025-01`/`2025년 1월`을 모두 통과). `YYYYMM` 하나만 허용하는 정규식은 정상 호출을 실패로 채점한다
- [ ] §6 매트릭스를 갱신했다

### §7.3 회귀 검증 절차

description 문구만 바꿔도 이 순서를 지킨다. **빌드 통과는 완료가 아니다.**

1. **케이스 먼저** — `dataset.jsonl`에 이번 수정이 고치려는 발화를 추가한다(운영 로그 출처면 `production` 태그, 마스킹 후).
2. **FAIL 확인** — `node evals/hr-routing/run.js --grep <id>`. 수정 전에 통과하면 케이스가 무의미하다.
3. **description 수정**
4. **경계 발화 재검증** — 수정한 skill만 보지 않는다. `--tags boundary,ambiguous`로 인접 skill 케이스를 먼저 돌린다(아래 §7.4 첫 번째 규칙).
5. **전체 2회 연속 100%** — `node evals/hr-routing/run.js`를 조건 변경 없이 두 번 연속 실행해 두 번 모두 전건 통과여야 완료다. LLM 편차 때문에 1회 통과는 우연일 수 있다.
6. 리포트는 `evals/hr-routing/reports/<timestamp>.json|.md`에 남는다. 혼동 페어가 반복되면 두 description에 경계 문장을 보강한다.

E2E(`npm run e2e:hr-skill`, `server/scripts/e2e-hr-skill/`)는 handler·파라미터 계약이 바뀌어 실제 API 호출 형태를 봐야 할 때 추가로 돌린다. 되묻기 판정(`asked`)은 거기서 한다.

### §7.4 규칙으로 승격된 교훈

2026-09-03~04 재설계 과정에서 반복 확인된 사실이다. 절차가 아니라 규칙으로 둔다.

1. **한 skill의 description 강화는 인접 skill 케이스를 빨아들인다.** 어떤 skill의 의도 서술을 넓히면 경계에 있던 발화가 그쪽으로 끌려간다. 그래서 수정 대상 skill의 케이스만 확인하고 끝내지 않는다 — 경계 발화(`boundary`·`ambiguous`)로 재검증하고, 하네스 전체를 2회 연속 100%로 닫는다.
2. **예시 작성 시 eval 발화를 그대로 복사하지 않는다.** Location A의 우회 표현 예시든 examples[]든, 데이터셋 문장을 넣으면 하네스가 일반화가 아니라 암기를 측정하게 된다. 패러프레이즈한다.
3. **`params_regex`는 서버 허용 형식 전체를 커버한다.** L2가 허용하는 여러 표기(`YYYYMM`/`YYYY-MM`/`YYYY년 M월`, 월만, 상대 표현)를 LLM이 어느 것으로 보내든 서버(`dateResolver.js`)는 받는다. 채점 정규식이 그중 하나만 인정하면 정상 동작을 실패로 기록한다.

---

## §8 알려진 드리프트

v1.4 작성 시점에 확인된 코드-문서 불일치. 고칠 때 이 문서도 함께 갱신한다.

1. ~~**에이전트 경로 가드가 구식이다**~~ — **2026-09-08 해소.** 공통 블록을 `server/utils/hrSkillGuard.js`로 추출해 `hrSkillChatGuard()`/`hrSkillPeriodGuard()`가 공유. 구 `[HR_PERIOD_PARAM_STRICT]`(skill 4종 하드코딩)와 `work_plan_weekly`/`base_date` 예시는 제거, `[EXAMPLES]`는 현행 enum(timesheet/overtime/summary)으로 교체. 에이전트 경로의 실효는 E2E(`@agent` 시나리오)로 별도 확인 필요.
2. **가드·라우터가 존재하지 않는 skill을 참조한다** — `hrSkillChatGuard()`의 `[HR_TOOL_CALL_PRIORITY]`와 `utils/chats/toolCalling/hrRouting.js`가 `hr-personnel-search`(graduates_by_region)를 다루지만 `storage/plugins/agent-skills/`에 그 skill이 없다.
3. **상위 문서들이 v1.3 용어를 쓴다** — `CLAUDE.md`/`AGENTS.md`(§3 T-B/§4 T-A, `[CRITICAL]` 3단 + `[재강조]` 필수), `HR-SKILL-GUIDE.md`(매핑표·`[CRITICAL]`·3-Location을 A=매핑표/B=param/C=examples로 설명), `WORKFLOW-GUIDE.md`, `.specify/memory/constitution.md`(§5 방식 준용)가 폐기된 템플릿을 지시한다. 이 문서의 절 번호도 바뀌었다(§3·§4는 이제 Location A·B 구조, §6이 매트릭스, §7이 변경 절차).
4. **E2E 시나리오와 하네스의 이중 체계** — `server/scripts/e2e-hr-skill/scenarios.json`(46건)과 `evals/hr-routing/dataset.jsonl`(137건)이 별도로 산다. 시나리오가 현행 description 기준으로 재점검됐는지는 이번 작성에서 대조하지 않았다.
5. **하네스 README의 태그 목록 누락** — README "데이터셋" 절의 `tags` 분류에 실제 사용 중인 `ambiguous`·`production`이 빠져 있다(같은 README의 모호어 표와 P1-4 절에는 등장).

---

## 변경 이력

### v1.3 → v1.4 (2026-09-08)

| 항목 | v1.3 (2026-08-10) | v1.4 |
|---|---|---|
| Location A 구조 | 트리거 키워드 슬래시 나열 + `query_type 종류:` 목록 + "사번 불요"·"year_month 하나로만 전달" 문장 | 정체성 한 문장 / 의도 서술 + 우회 표현 열린 예시 / 경계(위임처 명시) |
| Location B 구조 | `[CRITICAL]` 1회 + 키워드 매핑표 `값=설명(키워드/…)` + `[중복 조회 금지]` | "키워드가 아니라 의도로 판단" + `값=설명 — …가 관심사일 때` + 폴백 문장. 단일값형은 "항상 X 전달". hr-salary만 2단계 `[CRITICAL]` 유지 |
| 템플릿 구분 | T-A(주기 파라미터 있음) / T-B(없음) | 폐기. B 형태(다값형/단일값형/선행 조회 의존형)로 대체 |
| 주기 파라미터 description | `[CRITICAL]` 3단 + 형식 3종 나열 + `[재강조]` | 선택·조건·기본값·`[HR_SKILL_COMMON]` 위임·적용 범위 5요소 |
| required | T-B는 빈 배열 | 7종 모두 `["query_type"]` |
| Location E | `ai-provider.js::hrSkillPeriodGuard()` 단독 | 채팅 경로 `utils/chats/index.js::hrSkillChatGuard()`가 정본. 공통 지시 6항 목록화. description 중복 금지 규칙 신설 |
| 경계 기준 | 문서 내 "경계 키워드" 표 5행 | `evals/hr-routing/README.md` 모호어 분기 컨벤션 8개 중의어를 정본으로 참조 |
| 회귀 검증 | E2E 시나리오(`e2e:hr-skill`) 격리→전건 | 평가 하네스 `node evals/hr-routing/run.js` 경계 태그 재검증 → 전체 2회 연속 100%. E2E는 계약 변경 시 보조 |
| 신설 규칙 | — | 인접 skill 흡수 재검증 / eval 발화 복사 금지 / `params_regex` 전체 형식 커버 |
| 드리프트 | E 예시 구식, E skill 목록 4종, `[중복 조회 금지]` 편차 | 에이전트 가드 미이관, 부재 skill 참조, 상위 문서 v1.3 용어, E2E·하네스 이중 체계, README 태그 누락 |

### v1.3 (2026-08-10)

v1.2까지 gitignore 안에서 유실된 문서를 실물 `plugin.json` 7종과 `ai-provider.js` 가드에서 역추출해 재작성. `.gitignore`에 `!docs/conventions/` 예외 추가로 추적 시작.

---

## 관련 문서

| 문서 | 내용 |
|---|---|
| `server/evals/hr-routing/README.md` | 평가 하네스 사용법, 데이터셋 형식, 모호어 분기 컨벤션(경계 정본), 운영 로그 수확 |
| `server/utils/chats/index.js` | `hrSkillChatGuard()` — L2 공통 지시 정본 |
| `server/storage/plugins/agent-skills/_shared/dateResolver.js` | 주기 파라미터 서버 수용 형식 |
| `CLAUDE.md` / `AGENTS.md` | 작업 라우팅. 트랙 2가 이 문서의 변경 절차를 게이트로 쓴다(절 번호는 §8-3 참고) |
| `.specify/memory/constitution.md` | 헌장. Multi-Layer Defense 원칙 |
| `specs/012-hr-answer-quality/contracts/footer-contract.md` | tool 결과 footer 문구 정본 |
| `HR-SKILL-GUIDE.md` | HR skill 개발·검증 인수인계 |
| `server/scripts/e2e-hr-skill/` | E2E runner·시나리오(계약 변경 시 보조 검증) |
