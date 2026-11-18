/**
 * "이전 대화만 요약 / 새로 조회하지 말고 요약 / 지금까지 뭐 물어봤지"처럼
 * **채팅 기록만** 쓰라는 요청인지 판별한다.
 * true면 워크스페이스·회사 문서 RAG(벡터 검색)를 돌리지 않는다.
 *
 * 주의: "근무현황 요약해줘"처럼 데이터 요약은 false — 대화/채팅 회상 의도가 있어야 한다.
 *
 * @param {string} message
 * @returns {boolean}
 */
function isChatHistoryOnlyRequest(message) {
  const text = String(message || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return false;

  // 대화 회상·되짚기 (요약 단어 없어도)
  if (
    /지금까지\s*(뭐|무엇)\s*(물어|말했|나눴)|방금\s*(말한|한\s*말|얘기)|다시\s*설명|대화\s*되짚|뭐\s*물어봤|무엇을\s*물어봤|what\s+did\s+i\s+(ask|say)|remind\s+me\s+what\s+we/i.test(
      text
    )
  ) {
    return true;
  }

  const wantsSummary = /요약|정리|summari[sz]e|recap/i.test(text);
  if (!wantsSummary) return false;

  // 조회·검색 금지 + 요약
  if (
    /새로\s*조회하지\s*말|다시\s*조회하지\s*말|조회\s*하지\s*말|문서\s*검색하지\s*말|검색하지\s*말|찾지\s*말/.test(
      text
    )
  ) {
    return true;
  }

  // 이전/이 대화·채팅 기록 요약
  if (
    /(이전|이|지금|현재)\s*대화|대화\s*내용|채팅\s*(내용|기록)|대화\s*기록|chat\s*history|(previous|this|our)\s+(conversation|chat|dialogue)/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/** RAG를 끈 뒤 모델이 문서 컨텍스트를 대화로 오인하지 않게 붙이는 지시 */
const CHAT_HISTORY_ONLY_GUIDE =
  "[CHAT_HISTORY_ONLY] 사용자는 이전 대화(채팅 기록)만 요약·정리·되짚어 달라고 했습니다. " +
  "제공된 문서·지식베이스·회사 규정 조각을 대화 내용인 것처럼 요약하지 마세요. " +
  "채팅 히스토리에 실제로 나온 내용만 답하세요. 히스토리에 없으면 없다고 말하세요. " +
  "문서 검색(rag-memory·vector search)을 호출하지 마세요.";

/** systemPrompt에 대화-only 가이드를 붙인다 */
function withChatHistoryOnlyGuide(systemPrompt, chatHistoryOnly) {
  if (!chatHistoryOnly) return systemPrompt;
  const base = String(systemPrompt || "");
  return base ? `${base}\n\n${CHAT_HISTORY_ONLY_GUIDE}` : CHAT_HISTORY_ONLY_GUIDE;
}

module.exports = {
  isChatHistoryOnlyRequest,
  CHAT_HISTORY_ONLY_GUIDE,
  withChatHistoryOnlyGuide,
};
