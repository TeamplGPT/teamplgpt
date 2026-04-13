/**
 * LLM-based Conversational Query Rewriting
 *
 * Uses the workspace's LLM provider to rewrite queries with
 * conversation context awareness. Resolves complex references,
 * disambiguates intent, and normalizes to HR domain terminology.
 *
 * Design decisions:
 * - Temperature 0 for deterministic output
 * - 3-second timeout with rule-based fallback
 * - Only recent 3 turns (6 messages) for context
 * - Non-streaming completion to minimize overhead
 */

const LLM_REWRITE_TIMEOUT_MS = 3000;
const MAX_HISTORY_TURNS = 3; // 3 turns = 6 messages (user + assistant)

const REWRITE_SYSTEM_PROMPT = `당신은 HR 챗봇의 검색 쿼리 최적화 전문가입니다.
사용자의 질문과 최근 대화 맥락을 분석하여, 벡터 검색에 최적화된 검색 쿼리를 생성하세요.

규칙:
1. 대명사와 생략된 주어/목적어를 이전 대화에서 찾아 명시적으로 해소하세요
2. HR 전문 용어로 정규화하세요 (예: "월급" → "급여", "쉬는 날" → "연차휴가")
3. 핵심 키워드를 유지하면서 불필요한 조사/어미/인사말을 제거하세요
4. 원래 의도를 변경하지 마세요
5. 검색에 불필요한 감정 표현이나 부탁 표현을 제거하세요
6. 답변이 아닌 검색 쿼리만 출력하세요 (한 문장, 50자 이내)
7. 사원번호나 이름이 대화에 언급되었으면 반드시 포함하세요`;

/**
 * Rewrite a query using the LLM with conversation context.
 *
 * @param {string} input - Current query (may be pre-processed by rule-based)
 * @param {Array} chatHistory - Recent chat messages [{role, content}, ...]
 * @param {Object} LLMConnector - LLM provider instance
 * @returns {Promise<string>} Rewritten query, or original on failure
 */
async function llmRewrite(input, chatHistory, LLMConnector) {
  if (!LLMConnector || !input) return input;

  // Take only recent turns to minimize token usage
  const recentHistory = chatHistory.slice(-(MAX_HISTORY_TURNS * 2));

  const messages = [
    { role: "system", content: REWRITE_SYSTEM_PROMPT },
    ...recentHistory
      .filter((h) => h.content != null)
      .map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content:
          typeof h.content === "string"
            ? h.content.slice(0, 300) // Truncate long messages
            : (JSON.stringify(h.content) ?? "").slice(0, 300),
      })),
    {
      role: "user",
      content: `원본 질문: "${input}"\n\n위 질문을 벡터 검색에 최적화된 쿼리로 재작성하세요. 쿼리만 출력하세요.`,
    },
  ];

  const result = await Promise.race([
    LLMConnector.getChatCompletion(messages, {
      temperature: 0,
    }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("LLM rewrite timeout")),
        LLM_REWRITE_TIMEOUT_MS
      )
    ),
  ]);

  const rewritten = result?.textResponse?.trim();

  // Validate: non-empty, not too long, not a full sentence answer
  if (!rewritten || rewritten.length === 0) return input;
  if (rewritten.length > 200) return input; // Likely generated an answer, not a query
  if (rewritten.includes("답변") || rewritten.includes("알려드리"))
    return input;

  return rewritten;
}

module.exports = {
  llmRewrite,
  REWRITE_SYSTEM_PROMPT,
  LLM_REWRITE_TIMEOUT_MS,
};
