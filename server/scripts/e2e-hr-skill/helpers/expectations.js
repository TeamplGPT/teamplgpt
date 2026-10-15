/**
 * 시나리오 기대값(expect.*) 컴파일과 1회 실행 판정.
 *
 * runner.js에서 분리(specs/016 코드 리뷰 L4 — 파일 800줄 한도). 판정 순서·실패 사유 문구는
 * 분리 전과 같다. 필드 정의: README.md "시나리오 스키마", 012 contracts/e2e-assertion-schema.md.
 */

"use strict";

// 모델이 실제 함수 호출(tool_call) 대신 그 모양을 흉내 낸 JSON을 답변 텍스트로
// 적어버리는 누출(예: {"name":"work_status","arguments":{...}})을 감지한다.
// ```viz 블록({"type":"workstatus","data":...})과는 키가 겹치지 않아 오탐이 없다.
const LEAKED_TOOLCALL_PATTERN =
  /"name"\s*:\s*"[\w.-]+"\s*,\s*"(arguments|input)"\s*:/;

// expect.<key>(string[])를 정규식 배열로 컴파일한다. 키가 없으면 undefined(검증 생략).
function compilePatternList(s, key) {
  const list = s.expect[key];
  if (list == null) return undefined;
  if (!Array.isArray(list) || list.some((p) => typeof p !== "string")) {
    throw new Error(`Scenario ${s.id}: expect.${key} must be string[]`);
  }
  return list.map((p) => {
    try {
      return new RegExp(p);
    } catch (e) {
      throw new Error(
        `Scenario ${s.id}: invalid ${key} regex "${p}": ${e.message}`
      );
    }
  });
}

function compileMockUrl(s) {
  const pattern = s.expect.mock_url_pattern;
  if (pattern != null && typeof pattern !== "string") {
    throw new Error(
      `Scenario ${s.id}: expect.mock_url_pattern must be string or null`
    );
  }
  if (!pattern) return undefined;
  try {
    return new RegExp(pattern);
  } catch (e) {
    throw new Error(`Scenario ${s.id}: invalid regex "${pattern}": ${e.message}`);
  }
}

/**
 * 시나리오의 정규식 기대값을 컴파일한다. 잘못된 값이면 Error를 던진다.
 * @returns {object} 시나리오에 덧붙일 `_*Regex(es)` 필드
 */
function compileExpectations(s) {
  return {
    _mockUrlRegex: compileMockUrl(s),
    // kiwibox .do 계열: 파라미터가 POST body(urlencoded)에 있어 URL 대신 body를 검증
    _mockBodyRegexes: compilePatternList(s, "mock_body_pattern"),
    // 015-hr-yearly-period: 월별 순차 호출 검증 — mock_body_pattern은 마지막 요청만 보므로,
    // 시나리오 중 기록된 모든 .do 요청 body 중 하나라도 맞으면 충족(패턴마다 독립 판정)
    _mockBodyAnyRegexes: compilePatternList(s, "mock_body_pattern_any"),
    // 016-hr-other-employee-block: "이 요청은 절대 없어야 함" — 기록된 어떤 .do 요청 body와도
    // 맞으면 FAIL (예: 미결함 selectGubun=3 조회가 일어나지 않았음을 확인)
    _mockBodyNoneRegexes: compilePatternList(s, "mock_body_pattern_none"),
    // 012-hr-answer-quality: 최종 답변 텍스트 검증 (옵셔널 — 미존재 시 스킵)
    _answerRegexes: compilePatternList(s, "answer_pattern"),
    _answerNotRegexes: compilePatternList(s, "answer_not_pattern"),
  };
}

// 패턴마다 독립 판정 — predicate(정규식)가 참인 패턴 원문만 남긴다
function patternsWhere(patterns, regexes, predicate) {
  return patterns.filter((p, i) => predicate(regexes[i]));
}

function judgeMock(scenario, { mockUrl, mockBody, bodies }) {
  const ex = scenario.expect;
  if (scenario._mockUrlRegex) {
    if (!mockUrl) return "no mock URL captured (timing or tool-call non-HTTP)";
    if (!scenario._mockUrlRegex.test(mockUrl)) {
      return `mock URL did not match pattern ${ex.mock_url_pattern}`;
    }
  }
  // body 검증 (kiwibox urlencoded 필수 파라미터 — 전 패턴 매칭 필요)
  if (scenario._mockBodyRegexes) {
    if (mockBody == null) return "no mock body captured";
    const missed = patternsWhere(
      ex.mock_body_pattern,
      scenario._mockBodyRegexes,
      (re) => !re.test(mockBody)
    );
    if (missed.length > 0) {
      return `mock body missing pattern(s): ${missed.join(" | ")}`;
    }
  }
  if (scenario._mockBodyAnyRegexes) {
    const missed = patternsWhere(
      ex.mock_body_pattern_any,
      scenario._mockBodyAnyRegexes,
      (re) => !bodies.some((b) => re.test(b))
    );
    if (missed.length > 0) {
      return `no mock body (of ${bodies.length}) matched pattern(s): ${missed.join(" | ")}`;
    }
  }
  if (scenario._mockBodyNoneRegexes) {
    const hit = patternsWhere(
      ex.mock_body_pattern_none,
      scenario._mockBodyNoneRegexes,
      (re) => bodies.some((b) => re.test(b))
    );
    if (hit.length > 0) {
      return `forbidden mock body pattern(s) requested: ${hit.join(" | ")}`;
    }
  }
  return null;
}

// 012-hr-answer-quality: 최종 답변 검증. contracts/e2e-assertion-schema.md
function judgeAnswer(scenario, finalText) {
  const ex = scenario.expect;
  if (!scenario._answerRegexes && !scenario._answerNotRegexes) return null;
  if (finalText == null) return "no final answer captured";
  if (scenario._answerRegexes) {
    const missed = patternsWhere(
      ex.answer_pattern,
      scenario._answerRegexes,
      (re) => !re.test(finalText)
    );
    if (missed.length > 0) {
      return `answer missing pattern(s): ${missed.join(" | ")}`;
    }
  }
  if (scenario._answerNotRegexes) {
    const hit = patternsWhere(
      ex.answer_not_pattern,
      scenario._answerNotRegexes,
      (re) => re.test(finalText)
    );
    if (hit.length > 0) {
      return `answer contains forbidden pattern(s): ${hit.join(" | ")}`;
    }
  }
  return null;
}

function judgeHrCalls(ex, hrCalls) {
  if (ex.max_hr_calls != null && hrCalls > ex.max_hr_calls) {
    return `hr calls ${hrCalls} exceeded max ${ex.max_hr_calls}`;
  }
  if (ex.min_hr_calls != null && hrCalls < ex.min_hr_calls) {
    return `hr calls ${hrCalls} below min ${ex.min_hr_calls}`;
  }
  return null;
}

/**
 * 1회 실행 관찰값으로 판정한다. 첫 번째로 어긋난 기대의 사유를 반환하고, 모두 맞으면 null.
 * 순서: 요청 오류 → 스트림 누출 → tool 호출 여부 → mock URL·body → 최종 답변 → HR 호출 건수.
 *
 * @param {object} scenario - compileExpectations 결과가 덧붙은 시나리오
 * @param {{errorMsg, rawStreamText, toolCall, finalText, mockUrl, mockBody, bodies: string[]}} observed
 * @returns {string|null}
 */
function judgeRun(scenario, observed) {
  const ex = scenario.expect;
  const { errorMsg, rawStreamText, toolCall, finalText, bodies } = observed;
  if (errorMsg) return `request error: ${errorMsg}`;
  if (LEAKED_TOOLCALL_PATTERN.test(rawStreamText)) {
    return "raw stream leaked a tool-call-shaped JSON preamble (sanitized before storage but visible live — see hrSkillGuard.js rule 8)";
  }
  // tool_call: null이면 호출 여부를 보지 않는다
  if (ex.tool_call === true && !toolCall) {
    return "expected tool_call but LLM did not invoke any tool";
  }
  if (ex.tool_call === false && toolCall) {
    return "expected no tool_call but LLM invoked one";
  }
  return (
    judgeMock(scenario, observed) ??
    judgeAnswer(scenario, finalText) ??
    judgeHrCalls(ex, bodies.length)
  );
}

module.exports = { compileExpectations, judgeRun };
