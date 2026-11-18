/**
 * "이전 대화만 요약 / 새로 조회하지 말고 요약 / 지금까지 뭐 물어봤지"처럼
 * **채팅 기록만** 쓰라는 요청인지 판별한다.
 * true면 워크스페이스·회사 문서 RAG(벡터 검색)와 HR tool 호출을 하지 않는다.
 *
 * 주의: "근무현황 요약해줘"처럼 데이터 요약은 false — 대화/채팅 회상 의도가 있어야 한다.
 * "규정 다시 설명해줘"처럼 주제만 다시 묻는 것도 false — RAG가 필요할 수 있다.
 *
 * @param {string} message
 * @returns {boolean}
 */
function isChatHistoryOnlyRequest(message) {
  const text = String(message || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return false;

  // 대화 회상·되짚기 (요약 단어 없어도) — "다시 설명"만으로는 잡지 않는다(규정/급여 FP 방지).
  // 방금/이전 대화 맥락이 있을 때만 다시 설명을 회상으로 본다.
  if (
    /지금까지\s*(뭐|무엇)\s*(물어|말했|나눴)|방금\s*(말한|한\s*말|얘기|내용)|대화\s*되짚|뭐\s*물어봤|무엇을\s*물어봤|what\s+did\s+i\s+(ask|say)|remind\s+me\s+what\s+we/i.test(
      text
    )
  ) {
    return true;
  }
  if (
    /(방금|이전\s*대화|이\s*대화|채팅\s*기록).{0,20}다시\s*설명|다시\s*설명.{0,20}(방금|이전\s*대화|이\s*대화)/i.test(
      text
    )
  ) {
    return true;
  }

  const wantsSummary = /요약|정리|summari[sz]e|recap/i.test(text);
  if (!wantsSummary) return false;

  // 조회·검색 금지 + 요약
  if (
    /새로\s*조회하지\s*말|다시\s*조회하지\s*말|조회\s*하지\s*말|문서\s*검색하지\s*말|검색하지\s*말|찾지\s*말|조회\s*말고|검색\s*말고/.test(
      text
    )
  ) {
    return true;
  }

  // 이전/이/지금/현재/지난/우리 대화·채팅 기록 요약
  // "대화 요약해줘"처럼 수식어 없는 경우도 회상으로 본다(데이터 요약은 보통 대상 명사가 앞섬).
  if (
    /(이전|이|지금(?:까지)?|현재|지난|직전|우리)\s*대화|대화\s*내용|채팅\s*(내용|기록)|대화\s*기록|(^|\s)대화\s*(만\s*)?(요약|정리)|(이\s*)?채팅\s*(만\s*)?(요약|정리)|chat\s*history|(previous|this|our)\s+(conversation|chat|dialogue|messages)|summarize\s+previous\s+messages/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/** RAG·HR tool을 끈 뒤 모델이 문서/신규 조회를 대화로 오인하지 않게 붙이는 지시 */
const CHAT_HISTORY_ONLY_GUIDE =
  "[CHAT_HISTORY_ONLY] 사용자는 이전 대화(채팅 기록)만 요약·정리·되짚어 달라고 했습니다. " +
  "제공된 문서·지식베이스·회사 규정 조각을 대화 내용인 것처럼 요약하지 마세요. " +
  "채팅 히스토리에 실제로 나온 내용만 답하세요. 히스토리에 없으면 없다고 말하세요. " +
  "문서 검색(rag-memory·vector search)과 HR 조회 tool(hr-*)을 호출하지 마세요.";

/** systemPrompt에 대화-only 가이드를 붙인다 */
function withChatHistoryOnlyGuide(systemPrompt, chatHistoryOnly) {
  if (!chatHistoryOnly) return systemPrompt;
  const base = String(systemPrompt || "");
  return base ? `${base}\n\n${CHAT_HISTORY_ONLY_GUIDE}` : CHAT_HISTORY_ONLY_GUIDE;
}

/**
 * history-only 요청이면 HR·rag-memory tool을 제거한다.
 * tools는 OpenAI tool 객체 배열이거나 agent skill 이름 문자열 배열일 수 있다.
 * @param {Array|null|undefined} tools
 * @param {string} message
 * @returns {Array|null|undefined}
 */
function filterToolsForChatHistoryOnly(tools, message) {
  if (!isChatHistoryOnlyRequest(message)) return tools;
  if (tools == null) return tools;
  if (!Array.isArray(tools)) return tools;

  return tools.filter((tool) => {
    if (typeof tool === "string") {
      const name = tool.replace(/^@@/, "");
      if (name === "rag-memory") return false;
      if (name.startsWith("hr-")) return false;
      return true;
    }
    const name = String(tool?.name || tool?.function?.name || "").replace(
      /^@@/,
      ""
    );
    if (!name) {
      // web_search_preview 등 name 없는 built-in은 유지하되 HR과 무관
      return tool?.type !== "function" || !String(tool?.type).startsWith("hr");
    }
    if (name === "rag-memory") return false;
    if (name.startsWith("hr-")) return false;
    return true;
  });
}

module.exports = {
  isChatHistoryOnlyRequest,
  CHAT_HISTORY_ONLY_GUIDE,
  withChatHistoryOnlyGuide,
  filterToolsForChatHistoryOnly,
};
