# Contract: 본인 데이터 안내 (`server/utils/hrSelfDataNotice.js`)

## 인터페이스

```text
withSelfDataNotice(toolName, args, result) → string | any
wrapHrRuntime(toolName, runtime) → runtime   // @agent용: handler를 감싼 새 runtime 객체
isBlockedTool(toolName) → boolean            // 실행 계층 차단 skill
상수: SELF_DATA_NOTICE · ORG_CHART_NOTICE · OTHER_EMPLOYEE_REFUSAL
```

## 부착 규칙

- `toolName`이 `hr-`로 시작하고 `result`가 문자열일 때만 붙인다. 그 외에는 `result`를 그대로 반환한다.
- 조회 결과가 아닌 응답에는 붙이지 않는다. 이런 응답에 "본인 계정으로 조회한 것"이라고 붙이면 틀린 말이 된다(코드 리뷰 반영). 대상:
  - `Error`로 시작하는 실행 오류
  - 거절 문구(`OTHER_EMPLOYEE_REFUSAL`)와 정확히 같은 응답
  - "query_type이 올바르지 않습니다"를 포함한 응답
  - 그 밖의 `> ⚠️` 가드 결과(세션 만료 등)에는 붙인다. 데이터 앞에 경고가 붙는 응답이 있어서 접두만으로는 조회 결과가 아님을 판정할 수 없다.
- 안내 종류:
  - 기본: `SELF_DATA_NOTICE`
  - 조직도: `toolName === "hr-personnel"`이고 `args.query_type` ∈ {`org_tree`, `org_members`}이면 `ORG_CHART_NOTICE`. 조직도는 허용된 다른 직원 정보지만 특정 직원 한 명을 지칭한 질문에는 쓰지 않는다(spec D9 — 코드 리뷰 반영 전에는 조직도에 아무것도 붙이지 않았다).
- `args`는 객체 또는 JSON 문자열이다. 파싱에 실패하면 예외 없이 조직도가 아닌 것으로 본다.
- 결과 **끝**에 붙인다: `${result}\n\n${NOTICE}`. 앞에 붙이면 `loop.js`의 `startsWith("Error")`·`startsWith("> ⚠️")` 판정이 깨진다.
- 입력 문자열을 바꾸지 않는다(새 문자열 반환).

## 문구 (고정)

```text
> [본인 데이터] 위 결과는 로그인한 사용자 본인 계정으로 5240 HR 시스템에서 조회한 것입니다. 질문이 다른 직원(이름·사번·호칭으로 지칭 — '그럼 ○○은?'처럼 앞 질문에 이어 묻거나, 앞서 거절된 다른 직원 질문을 '다시 조회해봐'처럼 다시 요청하는 경우 포함)이나 다른 직원이 올린 결재 문서·팀 휴가자처럼 다른 사람의 정보에 관한 것이라면 그 부분에는 이 결과를 쓰지 말고 '다른 직원의 정보는 조회할 수 없어요'라고 답하세요. 본인에 대한 질문이면 이 결과로 답하세요. 답변의 수치는 이 결과에 있는 값(또는 그 값들의 단순 합계·개수)만 쓰고, 결과에 이미 있는 값과 다른 수치를 계산해 내지 마세요. 결과에 없는 항목별 분해나 산정 근거(근속연수·직위·회사 정책·법정 기준 등)는 추측('~로 보입니다')으로도 말하지 마세요. 계산이 맞는지·법적으로 문제없는지도 이 결과로는 알 수 없으니 판단하지 마세요. 산정 방식·근거를 묻는 질문이면 답변을 '5240 HR 시스템에서 조회한 값이에요.'로 시작해 결과에 있는 값으로만 설명하고, '세부 산정 기준은 HR 담당자에게 확인해 주세요.'로 끝내세요. 이 안내 문구 자체는 답변에 포함하지 마세요.
```

- "그 부분에는": 본인과 다른 직원이 섞인 질문("내 연차랑 김기현 연차")에서 본인 몫까지 거절하지 않게 한다(코드 리뷰 M3).
- "다른 직원이 올린 결재 문서·팀 휴가자": 이름 없이 남의 정보를 묻는 질문(K70 "나한테 결재 올린 문서")도 포함한다.
- 수치·산정 근거 문장(016 후속, research R14): "어떻게 산정된거야?"에 결과에 없는 항목 분해·재계산·산정 근거를 지어내던 문제를 막는다. 답변의 시작·끝 문장을 지정해야 출처 표시가 안정됐다(4/6 → 6/6).

```text
> [조직도] 팀·조직 단위의 조직도 질문에만 이 결과를 쓰세요. 사용자가 특정 직원 한 명을 지칭해 그 사람의 정보(소속·직위 포함)를 물었다면 이 결과로 답하지 말고 '다른 직원의 정보는 조회할 수 없어요'라고 답하세요. 이 안내 문구 자체는 답변에 포함하지 마세요.
```

## 실행 계층 차단 (코드 리뷰 M4)

- `hr-personnel-search`(직원 검색)는 git에서 제거됐지만 운영 storage에 남아 있을 수 있다. 그래서 실행하지 않고 `OTHER_EMPLOYEE_REFUSAL`을 돌려준다.
  - chat/query·embed: `loop.js`가 `ToolExecutor.execute`를 부르지 않는다. 거절 문구가 `> ⚠️`로 시작하므로 `resultIsGuardrail`은 true다.
  - @agent: `wrapHrRuntime`이 원래 handler를 부르지 않는다.
- 이름 판정은 실행기가 실제로 여는 skill 폴더 이름 기준이다. 실행기는 tool 이름을 경로로 정규화해 폴더를 찾기 때문에 `"hr-personnel-search/"`·`"./hr-personnel-search"`처럼 바꿔 불러도 같은 skill이 실행된다. 그래서 판정 전에 trim → `path.normalize` → 끝 `/` 제거 → basename으로 바꾼다. 안내 부착(`hr-` 판정)과 조직도 판정도 같은 기준이다(코드 리뷰 재검토, research R13).
- `OTHER_EMPLOYEE_REFUSAL`은 `_shared/otherEmployee.js`의 값과 같아야 한다. 운영에서는 플러그인 폴더가 리포 밖(STORAGE_DIR)에 있을 수 있어 require로 공유하지 않는다. 대신 두 값이 같은지 테스트로 확인한다.

## 다른 직원 질문 거절 선택지 (016 후속, research R14·R15)

- 전체 허용 위젯은 첫 응답에 tool 호출이 강제되는데, HR tool은 전부 본인 데이터만 가져온다. 그래서 "그럼 노지용은?"에도 본인 조회를 고르고 그 값을 다른 직원 것처럼 답했다(수정 전 5/5).
- `withHrRefusalTool(tools, format)`: HR tool이 있는 목록에 `hr-other-employee-refusal`을 덧붙인 **새 배열**을 반환한다.
  - 형식: openai-responses `{type, name, description, parameters}`, chat-completions `{type, function:{…}}`, anthropic `{name, description, input_schema}`
  - 인자 없음(`properties: {}`)
  - 이미 있으면 다시 붙이지 않는다. HR tool이 없으면 원래 배열을 그대로 반환한다.
- 붙이는 조건: `toolCallingLoop`에 넘어온 tool 목록에 HR tool이 있으면 강제 호출 여부와 무관하게 붙인다(R15). 경로는 채팅·embed(전체 허용·필터 위젯)이고, @agent는 이 loop를 거치지 않는다.
  - 처음(R14)에는 강제 호출 위젯에만 붙였다. 그런데 견고성 측정에서 강제가 없는 필터 위젯이 "노지용 이번 달 연장근무 얼마나 했어?"에 본인 연장근무를 답했다(3/3). 그래서 상시로 바꿨다.
  - 강제가 없으면 원래 tool 없이 거절할 수 있다. 하지만 HR처럼 보이는 질문에는 일단 tool을 부르는 경향이 있어, 거절 선택지가 그 자리를 받는다.
- 실행: 이름이 `BLOCKED_TOOL_NAMES`에 들어 있어, `loop.js`가 `ToolExecutor`를 부르지 않고 `OTHER_EMPLOYEE_REFUSAL`을 돌려준다(`resultIsGuardrail` true).
- 설명 문구: 다른 직원 질문(이어서 묻는 경우 포함)이면 HR 조회 대신 호출한다. 본인 정보도 함께 물으면 본인 조회 tool과 함께 호출한다. 본인 정보만 묻는 질문, 조직도(팀·조직 단위 — 팀원·팀장이 누구인지 포함), 결재 대기·할일 '건수' 질문, 인사말·일반 대화에는 호출하지 않는다(코드 리뷰 — 건수 질문 오거절 사례).
- Responses 형식은 기존 tool 정의(ChatToolsManager)처럼 `strict: false`를 둔다.
- 설명에 "앞서 거절된 다른 직원 질문을 '다시 조회해봐'처럼 다시 요청하는 경우"를 포함한다(R15). 이 문장이 없을 때 두 위젯 모두 6/6 본인 연차를 답했다.

## @agent 결과 길이 (코드 리뷰 M1)

aibitat는 tool 결과를 `DEFAULT_MAX_CHARS`(8,000자)로 자른 뒤 잘림 표시 줄을 붙인다. 그대로 두면 끝에 붙인 안내가 잘려 나간다. 그래서 `wrapHrRuntime`은 결과를 먼저 `DEFAULT_MAX_CHARS − 안내 길이 − 120`자로 자르고 그 뒤에 안내를 붙인다. 그러면 aibitat 단계에서는 더 잘리지 않는다.

## 부착 지점

| 경로 | 위치 | 방식 |
|---|---|---|
| chat/query·embed | `server/utils/chats/toolCalling/loop.js` `executeAndAppend` | 차단 skill이면 실행하지 않고 거절한다. 그 밖에는 `ToolExecutor.execute` 결과로 오류·가드 판정(isError·guard 플래그)을 **먼저** 계산한다. 그다음 모델에 넘기는 값에만 `withSelfDataNotice`를 적용한다 |
| @agent | `server/utils/agents/imported.js` `plugin()` | `wrapHrRuntime(this.name, this.handler.runtime)`. 감싼 handler는 `original.call(this, args)`로 aibitat의 `this`를 보존한다 |

## 영향 없음

- `ToolExecutor.execute` 반환값: executor 테스트 유지
- handler 출력: 015 골든 유지

## 검증

- 단위(`server/__tests__/utils/hrSelfDataNotice.test.js`, `toolCalling/__tests__/loop.test.js`):
  - 부착 여부: 기본 안내·조직도 안내, 비 hr tool·비문자열 결과, 조회 결과가 아닌 응답 3종에는 부착하지 않음
  - 끝 위치, 가드 접두 유지, args 문자열·깨진 JSON, `this` 보존
  - 차단 skill 거절(실행 0회, 바꿔 부른 이름 포함), 긴 결과에서도 안내가 8,000자 안에 남음
  - 두 파일의 거절 문구가 같음
- @agent 연결(`server/__tests__/utils/agents/imported.hrNotice.test.js`): `ImportedPlugin.plugin().setup()`이 감싼 handler를 등록하는지 임시 plugin 폴더로 확인한다. 업스트림 머지로 연결이 빠지면 여기서 실패한다.
- E2E:
  - 다른 직원 연차 질문에 본인 수치가 그 사람 이름으로 나오지 않음: K69, EC-ALLOW-17 (answer_not_pattern)
  - 특정 직원 소속 질문 거절: K72(`tool_call: null` — @agent는 조직도를 자주 조회하고 [조직도] 안내로 거절), EC-ALLOW-19
  - 섞인 질문에서 본인 몫만 답함: EC-ALLOW-20(운영 위젯 조건). K73(@agent)은 알려진 한계로 full tier 추적(research R13)
  - 이어서 묻는 다른 직원 질문: EC-ALLOW-21·22, EC-FILTER-09, K74 (조회 없이 거절)
  - 산정 근거 질문: EC-ALLOW-23, K75 (출처 표시, 결과에 없는 근거·분해 없음)
