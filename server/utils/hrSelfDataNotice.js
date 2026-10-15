/**
 * HR tool 결과의 "본인 데이터" 안내와 실행 계층 차단 (specs/016 contracts/self-data-notice.md).
 *
 * HR skill은 대상자를 항상 로그인한 본인으로 고정해 조회한다. 그래서 "김기현 연차 알려줘"에
 * tool이 호출되면 본인 연차가 돌아오고, 모델이 그 값을 김기현의 것처럼 답하는 사고가 있었다
 * (실사용 위젯). 전체 허용 위젯은 첫 응답에 tool 호출이 강제돼(embed shouldForceToolChoice)
 * "tool 없이 거절" 지시만으로는 막을 수 없다 — 결과에 본인 데이터임을 밝혀 모델이 거절하게 한다.
 *
 * 붙이는 곳: chat/query·embed는 toolCalling/loop.js, @agent는 agents/imported.js.
 * handler 출력은 바꾸지 않는다(015 골든 유지).
 *
 * @module hrSelfDataNotice
 */

const path = require("path");
const { truncateToolResult, DEFAULT_MAX_CHARS } = require("./agents/aibitat/utils/truncate");

// 둘째 문단(수치·근거)은 research R14 — "어떻게 산정된거야?"에 결과에 없는 항목 분해·재계산·산정
// 근거를 지어내던 문제(예: "기본 15일 + 보상 5일 + 포상 3일", 잔여 22일인데 "잔여 21.5일").
const SELF_DATA_NOTICE =
  "> [본인 데이터] 위 결과는 로그인한 사용자 본인 계정으로 5240 HR 시스템에서 조회한 것입니다. " +
  "질문이 다른 직원(이름·사번·호칭으로 지칭 — '그럼 ○○은?'처럼 앞 질문에 이어 묻거나, 앞서 거절된 다른 직원 질문을 '다시 조회해봐'처럼 다시 요청하는 경우 포함)이나 " +
  "다른 직원이 올린 결재 문서·팀 휴가자처럼 다른 사람의 정보에 관한 것이라면 그 부분에는 이 결과를 쓰지 말고 " +
  "'다른 직원의 정보는 조회할 수 없어요'라고 답하세요. 본인에 대한 질문이면 이 결과로 답하세요. " +
  "답변의 수치는 이 결과에 있는 값(또는 그 값들의 단순 합계·개수)만 쓰고, 결과에 이미 있는 값과 다른 수치를 계산해 내지 마세요. " +
  "결과에 없는 항목별 분해나 산정 근거(근속연수·직위·회사 정책·법정 기준 등)는 추측('~로 보입니다')으로도 말하지 마세요. " +
  "계산이 맞는지·법적으로 문제없는지도 이 결과로는 알 수 없으니 판단하지 마세요. " +
  "산정 방식·근거를 묻는 질문이면 답변을 '5240 HR 시스템에서 조회한 값이에요.'로 시작해 결과에 있는 값으로만 설명하고, " +
  "'세부 산정 기준은 HR 담당자에게 확인해 주세요.'로 끝내세요. " +
  "이 안내 문구 자체는 답변에 포함하지 마세요.";

// 조직도는 허용된 다른 직원 정보다. 다만 특정 직원 한 명을 지칭한 질문에는 쓰지 않는다(spec D9).
const ORG_CHART_NOTICE =
  "> [조직도] 팀·조직 단위의 조직도 질문에만 이 결과를 쓰세요. " +
  "사용자가 특정 직원 한 명을 지칭해 그 사람의 정보(소속·직위 포함)를 물었다면 이 결과로 답하지 말고 " +
  "'다른 직원의 정보는 조회할 수 없어요'라고 답하세요. 이 안내 문구 자체는 답변에 포함하지 마세요.";

// skill handler(_shared/otherEmployee.js)의 거절 문구와 같아야 한다 — 테스트로 묶는다.
// 플러그인 폴더는 운영에서 STORAGE_DIR 아래(리포 밖)일 수 있어 여기서 require하지 않는다.
const OTHER_EMPLOYEE_REFUSAL =
  '> ⚠️ 다른 직원의 정보는 조회할 수 없어요. 본인 정보는 "내 연차 알려줘"처럼 물어봐 주세요.';

// HR tool은 전부 본인 데이터만 가져온다. 다른 직원 질문에도 "일단 tool을 부르는" 경향 때문에 본인 조회를
// 고르고 그 값을 그 사람 것처럼 답했다 — 강제 호출 위젯의 "그럼 노지용은?"(research R14), 강제가 없는
// 필터 위젯의 "노지용 이번 달 연장근무"(R15). HR tool이 있으면 이 "거절" 선택지를 함께 준다 — 실행하지
// 않고 거절한다.
const REFUSAL_TOOL_NAME = "hr-other-employee-refusal";
const REFUSAL_TOOL_DESCRIPTION =
  "로그인한 본인이 아닌 다른 직원(이름·사번·호칭으로 지칭하거나, '그럼 ○○은?'처럼 앞 질문에 이어 다른 사람을 묻는 경우, " +
  "앞서 거절된 다른 직원 질문을 '다시 조회해봐'처럼 다시 요청하는 경우 포함)의 정보를 묻는 질문이면 HR 조회 tool 대신 이 tool을 호출하세요. " +
  "본인 정보도 함께 물었다면 본인 정보 조회 tool과 이 tool을 함께 호출하세요. " +
  "본인 정보만 묻는 질문, 조직도(팀·조직 단위 — 팀원·팀장이 누구인지 포함), 결재 대기·할일 '건수' 질문, 인사말·일반 대화에는 호출하지 마세요.";

// 다른 직원을 검색하는 skill — git에서는 제거됐지만 운영 storage에 남아 있을 수 있다(코드 리뷰 M4).
// 실행하지 않고 거절한다. 거절 선택지도 같은 경로로 거절 문구를 돌려준다.
const BLOCKED_TOOL_NAMES = new Set(["hr-personnel-search", REFUSAL_TOOL_NAME]);

const ORG_CHART_QUERY_TYPES = new Set(["org_tree", "org_members"]);

// aibitat는 tool 결과를 8,000자로 자른 뒤 표시 줄을 덧붙인다. 안내가 잘려 나가지 않게
// 결과를 먼저 줄이고 안내를 붙인다(코드 리뷰 M1). 잘림 표시 줄 몫으로 여유를 둔다.
const TRUNCATION_MARKER_ROOM = 120;

// ToolExecutor는 tool 이름을 경로로 정규화해 skill 폴더를 찾는다(ImportedPlugin.loadPluginByHubId —
// trim + path.normalize + path.resolve). "hr-personnel-search/"·"./hr-personnel-search"처럼 바꿔
// 불러도 같은 skill이 실행되므로, 판정도 실제로 열리는 폴더 이름 기준으로 한다(코드 리뷰 재검토).
function skillIdOf(toolName) {
  if (typeof toolName !== "string") return undefined;
  return path.basename(path.normalize(toolName.trim()).replace(/[\\/]+$/, ""));
}

function isHrTool(toolName) {
  return Boolean(skillIdOf(toolName)?.startsWith("hr-"));
}

function isBlockedTool(toolName) {
  return BLOCKED_TOOL_NAMES.has(skillIdOf(toolName));
}

function queryTypeOf(args) {
  if (args && typeof args === "object") return args.query_type;
  if (typeof args !== "string") return undefined;
  try {
    return JSON.parse(args)?.query_type;
  } catch {
    return undefined;
  }
}

function isOrgChart(toolName, args) {
  return skillIdOf(toolName) === "hr-personnel" && ORG_CHART_QUERY_TYPES.has(queryTypeOf(args));
}

// 조회 결과가 아닌 응답(실행 오류·잘못된 인자·거절)에는 "본인 계정으로 조회한 것" 안내가 틀린 말이다
function isNonResult(result) {
  return (
    result.startsWith("Error") ||
    result === OTHER_EMPLOYEE_REFUSAL ||
    result.includes("query_type이 올바르지 않습니다")
  );
}

function refusalToolDefinition(format) {
  const parameters = { type: "object", properties: {}, additionalProperties: false };
  const meta = { name: REFUSAL_TOOL_NAME, description: REFUSAL_TOOL_DESCRIPTION };
  if (format === "chat-completions") return { type: "function", function: { ...meta, parameters } };
  if (format === "anthropic") return { ...meta, input_schema: parameters };
  // ChatToolsManager의 Responses 형식과 같게 strict: false(기본값 true면 스키마 검증 규칙이 달라진다)
  return { type: "function", ...meta, parameters, strict: false };
}

function toolNameOf(tool) {
  return tool?.name ?? tool?.function?.name;
}

/**
 * tool 호출이 강제될 때 쓸 tool 목록 — HR tool이 있으면 거절 선택지를 덧붙인 새 배열을 반환한다.
 *
 * @param {Array|null} tools - provider 형식 tool 정의
 * @param {"openai-responses"|"anthropic"|"chat-completions"} format
 * @returns {Array|null}
 */
function withHrRefusalTool(tools, format) {
  if (!Array.isArray(tools) || !tools.some((t) => isHrTool(toolNameOf(t)))) return tools;
  if (tools.some((t) => toolNameOf(t) === REFUSAL_TOOL_NAME)) return tools;
  return [...tools, refusalToolDefinition(format)];
}

/**
 * 결과 끝에 안내를 붙인 새 문자열을 반환한다. 대상이 아니면 결과를 그대로 반환한다.
 * 끝에 붙이는 이유: loop.js가 결과 첫머리("Error"/"> ⚠️")로 오류·가드를 판정한다.
 *
 * @param {string} toolName - plugin hubId
 * @param {object|string} args - tool 인자(객체 또는 JSON 문자열)
 * @param {*} result - tool 실행 결과
 * @returns {*}
 */
function withSelfDataNotice(toolName, args, result) {
  if (!isHrTool(toolName) || typeof result !== "string") return result;
  if (isNonResult(result)) return result;
  const notice = isOrgChart(toolName, args) ? ORG_CHART_NOTICE : SELF_DATA_NOTICE;
  return `${result}\n\n${notice}`;
}

/**
 * @agent용 — aibitat에 넘길 runtime의 handler를 감싼 새 runtime을 반환한다.
 * aibitat는 `fn.handler(args)`로 호출하므로 원래 handler를 같은 this로 호출한다.
 *
 * @param {string} toolName - plugin hubId
 * @param {{handler: Function}} runtime - handler.js의 module.exports.runtime
 * @returns {{handler: Function}}
 */
function wrapHrRuntime(toolName, runtime) {
  if (!isHrTool(toolName) || typeof runtime?.handler !== "function") return runtime;
  const original = runtime.handler;
  return {
    ...runtime,
    handler: async function (args) {
      if (isBlockedTool(toolName)) return OTHER_EMPLOYEE_REFUSAL;
      const result = await original.call(this, args);
      const budget = DEFAULT_MAX_CHARS - SELF_DATA_NOTICE.length - TRUNCATION_MARKER_ROOM;
      return withSelfDataNotice(toolName, args, truncateToolResult(result, budget));
    },
  };
}

module.exports = {
  SELF_DATA_NOTICE,
  ORG_CHART_NOTICE,
  OTHER_EMPLOYEE_REFUSAL,
  REFUSAL_TOOL_NAME,
  isBlockedTool,
  withHrRefusalTool,
  withSelfDataNotice,
  wrapHrRuntime,
};
