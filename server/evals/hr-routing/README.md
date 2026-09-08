# HR 스킬 라우팅 평가 하네스

사용자 발화가 올바른 HR skill / `query_type`으로 라우팅되는지 측정하는 평가 도구입니다.
스킬 description·시스템 프롬프트(guard)·examples를 수정할 때마다 이 평가를 돌려
**정확도가 올랐는지/회귀했는지 수치로 확인**하는 것이 목적입니다.

## 동작 방식

프로덕션 채팅 경로(`utils/chats/stream.js`)와 동일한 구성으로 LLM에 1턴 요청을 보냅니다:

- tool 정의: `ChatToolsManager.getToolDefinitions("openai-responses")` — 실제 plugin.json 기반
- 시스템 프롬프트: `chatPrompt(null, null)` (기본 프롬프트 + `hrSkillChatGuard`)
- 발화별 tool 필터: `routeHrToolsForMessage`
- 요청 형식: OpenAI Responses API (`utils/AiProviders/openAi`의 `getChatCompletion`과 동일 필드)

LLM의 **첫 응답에서 어떤 tool을 호출했는지만** 채점하며, tool을 실제로 실행하지는 않습니다
(HR 시스템 세션·DB 불필요, OpenAI API 키만 필요).

## 실행

server 디렉토리에서:

```bash
node evals/hr-routing/run.js                  # 전체 실행
node evals/hr-routing/run.js --dry            # LLM 호출 없이 프롬프트/tool 구성만 검증
node evals/hr-routing/run.js --tags colloquial,typo   # 특정 태그만
node evals/hr-routing/run.js --grep 연차 --limit 5    # 발화/id 필터
node evals/hr-routing/run.js --model gpt-5.1 --concurrency 4
node evals/hr-routing/run.js --verbose        # PASS 케이스도 출력
```

- API 키/모델은 `.env.development`의 `OPEN_AI_KEY` / `OPEN_MODEL_PREF`를 사용합니다.
- 리포트는 `evals/hr-routing/reports/<timestamp>.json|.md`로 저장됩니다
  (전체 정확도, 태그별/스킬별 정확도, 혼동 페어, 실패 케이스 목록).

## 데이터셋 (`dataset.jsonl`)

한 줄에 케이스 하나:

```json
{"id":"att-alb-02","tags":["colloquial"],"utterance":"나 올해 휴가 며칠이나 남았지?","expect":[[{"skill":"hr-attendance","query_type":"annual_leave_balance"}]]}
```

- `expect`는 **대안 집합의 배열**입니다. 각 대안은 기대 호출 목록이며, 실제 호출과
  순서 무관 완전 일치하면 통과입니다. 어느 한 대안이라도 맞으면 PASS.
  - 단일 호출: `[[{...}]]`
  - 복합 질문(multi-intent): `[[{...},{...}]]`
  - 둘 다 정답 인정: `[[{A}],[{B}]]`
  - **tool을 호출하지 않는 것이 정답**(negative): `[[]]`
- 기대 호출 필드:
  - `skill` (필수): tool 이름 = plugin `hubId`
  - `query_type` (선택): 생략하면 skill만 맞으면 통과
  - `params_regex` (선택): `{"year_month":"2025.?0?1"}` — 실제 인자 값 정규식 검사
- `tags` 분류: `normalized`(정규형), `colloquial`(구어체), `indirect`(우회 표현),
  `typo`(오타), `slang`(줄임말), `formal`(격식체), `date`(기간 파라미터),
  `boundary`(스킬 간 경계), `multi`(복합 질문), `negative`(tool 미호출이 정답),
  `knowledge`(규정/지식 질문), `ambiguous`(모호어 분기 쌍 — P1-2),
  `production`(운영 피드백 편입 — P1-4; 다른 태그와 중복 부여 가능)

### 케이스 추가 가이드

- 새 query_type을 추가하면 **정규형 1개 + 비정규형 2개 이상**을 함께 추가하세요.
- 운영 로그에서 오라우팅/미라우팅 발화를 발견하면 그대로 케이스로 편입하세요
  (개인정보 제거 후). 실사용 분포를 따라가는 것이 평가셋의 가치를 결정합니다.
- 정답이 논쟁적인 발화는 대안 집합(`[[A],[B]]`)으로 허용 범위를 명시하세요.

## 모호어 분기 컨벤션 (P1-2)

데이터셋과 description이 따르는 도메인 중의어의 정답 기준. `ambiguous` 태그
케이스가 이 표를 회귀 검증한다. 새 케이스·description 수정 시 이 기준을 따를 것.

| 중의어 | 이런 의도면 | 정답 라우팅 |
|---|---|---|
| 공제·보험·연금 | 월급에서 차감된 금액(4대보험/국민연금/건강보험/소득세) | hr-salary.pay_periods (2단계 첫 호출) |
| 공제·보험·연금 | 지출 항목의 공제 혜택·환급(의료비/보장성보험/기부금/카드/교육비/연금저축) | hr-year-end-tax.* |
| 휴가 | 잔여·발생 일수 | hr-attendance.annual_leave_balance |
| 휴가 | 과거 사용 내역·사유 | hr-attendance.leave_requests |
| 휴가 | 팀·조직의 휴가자 | hr-attendance.vacation_calendar |
| 휴가 | 신청서의 결재 진행 상태 | hr-approval.drafted |
| 결재·미결 | 문서 목록·내용 | hr-approval.* |
| 결재·미결 | 건수만("몇 건") | hr-personnel.todo_count |
| 교육 | 수강 이력·이수 시간 | hr-personnel.education |
| 교육 | 교육비 공제 | hr-year-end-tax.education |
| 가족 | 부양가족 공제·등록 현황 | hr-year-end-tax.family |
| 가족 | 그 외 가족 인적사항 | tool 미호출(미제공 안내) |
| 일정 | 개인 근무일정·근무표 | hr-attendance.work_calendar |
| 일정 | 회사·일자별 일정/생일 | hr-personnel.schedule_day |
| 대출 | 대출 용도의 증명서 발급·신청 | hr-certificate.requests |
| 대출 | 사내대출 자체(잔액/이율/상환) | hr-welfare.loan |
| 급여 | 특정 달의 명세·공제·실수령(단건 상세) | hr-salary.pay_periods → pay_item으로 상세 |
| 급여 | 여러 달의 수령액 추이 | hr-salary.salary_statement |

집행 위치: 스킬 간 경계는 각 plugin.json description의 경계 문단,
급여 2단계는 description + 시스템 guard `[HR_SALARY_TWO_STEP]`.

## 결과 해석

- **전체 정확도**: description 수정 전후 비교의 기준 지표.
- **태그별 정확도**: `normalized`는 높은데 `colloquial`/`indirect`가 낮다면
  키워드 매핑 의존이 심하다는 신호 — description을 의도 서술로 보강.
- **혼동 페어**: 특정 skill 쌍이 반복해서 섞이면 두 description에 경계 규칙
  (무엇이 아닌지, 어느 skill로 위임하는지)을 추가.
- LLM 호출이라 결과에 약간의 편차가 있습니다. 큰 수정 전후 비교는 전체 셋으로,
  미세 튜닝은 동일 조건 2~3회 실행 평균으로 판단하세요.

## 운영 로그 수확 (P1-4, harvest.js)

실사용 로그에서 라우팅/인자 실패 후보를 추출해 데이터셋을 보강하는 파이프라인.
전제: `workspace_llm_message_logs.tool_trace` 영속화(2026-09-04 마이그레이션)가
배포된 이후의 로그만 판정 가능 — 그 이전 로그는 `tool_trace`가 null이라
H1·H2·H3·H4·H5·H7 판정에서 제외된다(H6만 동작).

```bash
node evals/hr-routing/harvest.js                          # 최근 7일
node evals/hr-routing/harvest.js --since 2026-09-01 --until 2026-09-08
node evals/hr-routing/harvest.js --stats                  # 집계만(파일 미출력)
node evals/hr-routing/harvest.js --heuristics H1,H4 --verbose
```

휴리스틱 7종: H1 가드레일 발동("> ⚠️" 결과 — 인자 실패 확정) / H2 미라우팅
(HR 의도인데 hr-* 호출 0회) / H3 되묻기(H2 + 질문형 응답) / H4 hr-salary 2단계
위반(pay_periods 선행 없는 payslip·deductions·payslip_summary) / H5 헤맴(hr-*
3회 이상) / H6 유사 재시도(같은 스레드 10분 내 유사도 0.35+ 재질문 — 가장
노이즈가 큼, 반복 테스트 환경에서 다수 발생) / H7 부정 피드백(👎 + hr-* 사용).

출력: `evals/hr-routing/harvest/<timestamp>.jsonl` (gitignore 대상).
**원문 발화가 그대로 담기므로 dataset.jsonl 편입 전 이름·사번 마스킹 필수**,
검수 후 `production` 태그로 추가한다.

`tool_trace` 저장 규약: 배열이면 빈 배열도 `"[]"`로 저장(루프 실행·호출 0회 =
미라우팅 신호), tool 루프를 타지 않는 경로(react, chatSync)와 과거 로그는 null.

로컬 검증: `node evals/hr-routing/seed-harvest-fixtures.js`로 휴리스틱별
양성 7건 + 음성 3건(HR 무관 / 정상 2단계 / null trace)을 주입해 확인,
`--cleanup`으로 제거. 픽스처는 `api_session_id='harvest-fixture'`로 식별.
