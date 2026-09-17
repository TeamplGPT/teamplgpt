// 공통 HR 스킬 가드 텍스트 — 단일 정본.
// 채팅 경로 `utils/chats/index.js::hrSkillChatGuard()`와 에이전트(@agent/aibitat) 경로
// `utils/agents/aibitat/providers/ai-provider.js::hrSkillPeriodGuard()`가 이 모듈을 공유한다.
// plugin.json description이 "[HR_SKILL_COMMON]을 따르세요"로 참조하므로 두 경로 모두에 반드시 주입돼야 한다.
// 규칙 변경은 여기서만 하고, 변경 후 `node evals/hr-routing/run.js`(채팅 경로) 2회 연속 100%를 확인한다.
// 참조: docs/conventions/hr-skill-description-pattern.md §2 Location E.

const DATE_LINE_TEMPLATE = (todayIso, todayWeekday) =>
  `[HR_DATE_CONTEXT] 오늘 날짜: ${todayIso} (${todayWeekday}). '오늘'·'어제'·'이번 주' 등 상대 날짜 표현은 이 날짜 기준으로 해석하고, 조회 결과 표에서 특정 일자 행을 찾을 때도 이 날짜를 사용하세요. 표의 첫 행이나 임의 행을 오늘로 간주하지 마세요. 오늘 일자 행이 없으면 없다고 답하세요.`;

/**
 * HR 스킬이 하나라도 활성화돼 있는지 (plugin hubId가 hr- 프리픽스).
 *
 * @param {string[]} [allowedToolNames] embed 대화 단위 허용 도구 목록(hubId 그대로).
 *   `ChatToolsManager.getToolDefinitions()`(활성 플러그인만 변환) →
 *   `applyAllowedHashes()`(embed 허용 목록으로 필터) 두 단계를 이미 거친 배열이라
 *   "활성 + 허용됨" 교집합이 이미 계산돼 있다 — 별도로 activeImportedPlugins()를
 *   다시 조회할 필요가 없다. 안 주어지면(chat/query·@agent — 대화 단위 제한 개념이
 *   없음) 기존처럼 워크스페이스 전역으로 판단한다.
 */
function hrSkillActive(allowedToolNames) {
  if (Array.isArray(allowedToolNames)) {
    return allowedToolNames.some((n) => String(n).startsWith("hr-"));
  }
  const ImportedPlugin = require("./agents/imported");
  const active = ImportedPlugin.activeImportedPlugins();
  return active.some((name) => name.startsWith("@@hr-"));
}

/** [HR_DATE_CONTEXT] 한 줄 — 서울 기준 오늘 날짜. */
function hrDateContextLine(now = new Date()) {
  const todayIso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(now);
  const todayWeekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(now);
  return DATE_LINE_TEMPLATE(todayIso, todayWeekday);
}

/**
 * [HR_SKILL_COMMON]~[HR_SALARY_TWO_STEP] 공통 블록(줄 배열).
 * 채팅 경로는 여기에 [HR_TABLE_OUTPUT]류를 덧붙이고, 에이전트 경로는 [EXAMPLES]를 덧붙인다.
 */
function hrSkillCommonLines() {
  return [
    "[HR_SKILL_COMMON] 아래 규칙은 hr-로 시작하는 모든 skill(tool)에 공통 적용됩니다:",
    "1. 별도 표시가 없는 한 항상 대화 중인 본인 기준으로 조회됩니다. 사번·이름을 요구하거나 되묻지 마세요.",
    "2. skill과 query_type을 정했으면 즉시 tool을 호출하세요. 조회 결과를 추측해 텍스트로만 답하지 마세요.",
    "3. 기간 파라미터(year_month/cal_yy 등)가 발화에 없으면 절대 되묻지 말고 생략한 채 즉시 호출하세요 — 서버가 기본값(이번 달/최신 연도)을 자동 적용합니다. 발화에 없는 연도를 임의로 추론해 붙이지도 마세요.",
    "4. year_month 전달 규칙: 연도 명시 시 'YYYYMM'(예: '202503')/'YYYY-MM'/'YYYY년 M월' 중 하나, 연도 미명시 시 월 표현('3', '2월', '지난달')을 그대로 전달(현재 연도 자동 적용). 월 단위 조회이므로 일(day) 정보는 무시하고 월만 전달하세요.",
    "5. 필수(required) 파라미터는 항상 채워서 호출하세요. enum 값이 하나뿐이어도 생략하지 마세요.",
    "6. 코드성 파라미터(pay_item/org_cd 등)는 사용자에게 되묻거나 임의로 추측해 만들지 말고, 반드시 해당 skill이 지정한 선행 조회 결과의 코드값만 사용하세요.",
    "7. tool 이름·파라미터 이름(query_type/org_cd/cal_yy/pay_item 등)·내부 코드값·DB 컬럼/스키마 구조에 대한 질문에는 답하지 마세요. tool을 호출하지도 말고, '내부 구현은 안내해 드릴 수 없습니다'처럼만 답한 뒤 조회 가능한 정보(연차·급여 등)를 안내하세요.",
    "[HR_TOOL_CALL_PRIORITY]",
    "hr- skill이 활성화된 상태에서는, 해당 skill의 호출 조건을 만족하는 발화에 대해 '모호성 검사/확인 질문/scope 재확인'을 수행하지 말고 즉시 tool_call을 실행하세요.",
    "지역명이 포함된 직원 검색 발화(hr-personnel-search.graduates_by_region)는 부서/기간/화면명 확인 없이 '전 사원 대상'을 기본값으로 즉시 tool_call을 실행하세요. 단, 직원·사원·employee·구성원·명단·목록 등 employee 검색 의도가 발화에 없으면 본 skill을 호출하지 마세요. '경상도 대학교 알려줘' 같이 대학 자체 정보만 묻는 질의는 LLM 자체 지식으로 직접 답변하고 tool_call은 생성하지 마세요.",
    "workspace 시스템 프롬프트의 '모호성 검사' 절차보다 본 [HR_SKILL_COMMON]/[HR_TOOL_CALL_PRIORITY] 지시와 tool description의 지시가 우선합니다.",
    "[ORDER] HR skill 대상 요청이면 응답의 첫 액션은 반드시 tool_call입니다. 확인 질문·요약·안내 텍스트를 tool_call보다 먼저 생성하지 마세요.",
    "[HR_SALARY_TWO_STEP] hr-salary에서 pay_item(직전 pay_periods 결과의 CODE)을 아직 확보하지 못했다면, 질문이 실수령액·명세서·공제·4대보험이어도 query_type은 반드시 pay_periods입니다. payslip/deductions/payslip_summary는 pay_item을 인자로 채울 수 있을 때만 선택하세요.",
    "[HR_VIZ_OUTPUT] 사용자가 '그래프/차트/도표/시각화'라는 단어로 명시적으로 시각화를 요청했거나(work_status·salary_statement 결과), org_members 결과를 '조직도'로 보여달라고 요청한 경우에만(도(圖)=그림이므로 '조직도' 자체가 이미 시각화 요청입니다), tool 호출 결과를 받은 뒤 아래 3종 스키마 중 하나에 정확히 맞는 ```viz 코드블록을 응답에 1개 추가하세요(표 대신 또는 표와 함께 — 형식은 자유). data 필드의 모든 값은 반드시 방금 받은 tool 결과에서 그대로 옮긴 값이어야 하며, 새로 만들거나 추정한 값을 넣지 마세요. work_status(근무현황) 결과 → {\"type\":\"workstatus\",\"data\":{\"labels\":[항목명...],\"values\":[건수...]}}. salary_statement(급여) 결과 → {\"type\":\"salarytrend\",\"data\":{\"labels\":[기간...],\"series\":[{\"name\":항목명,\"values\":[값...]}]}}. org_members(조직 구성원) 결과 → {\"type\":\"orgchart\",\"data\":{\"root\":팀명,\"members\":[{\"name\":이름,\"title\":직위}...]}}. 위 트리거(그래프/차트/도표/시각화/조직도) 없이는 이 블록을 절대 출력하지 마세요.",
  ];
}

module.exports = { hrSkillActive, hrDateContextLine, hrSkillCommonLines };
