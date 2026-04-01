const { HR_SYNONYMS } = require("../dictionaries/hrSynonyms");
const { removeStopwords } = require("../dictionaries/stopwords");

/**
 * Pronouns and demonstratives that indicate the query references
 * something from a previous conversation turn.
 */
const REFERENCE_PATTERNS = [
  /그\s*사람/,
  /그\s*직원/,
  /그\s*분/,
  /이\s*사람/,
  /해당\s*직원/,
  /위\s*직원/,
  /본인/,
  /같은\s*사람/,
];

/**
 * Short query threshold - queries shorter than this are likely
 * follow-up questions that need context from chat history.
 */
const SHORT_QUERY_THRESHOLD = 8;

/**
 * Expand synonyms found in the input using the HR dictionary.
 * Appends related terms in parentheses to broaden vector search.
 *
 * Example: "연차 잔여일수" → "연차 연차휴가 유급휴가 연가 잔여일수"
 *
 * @param {string} input - User query
 * @returns {string} Query with expanded synonyms
 */
function expandSynonyms(input) {
  if (!input || typeof input !== "string") return input;

  const words = input.split(/\s+/);
  const expandedWords = new Set(words);

  for (const word of words) {
    // Direct match
    if (HR_SYNONYMS[word]) {
      for (const syn of HR_SYNONYMS[word]) {
        expandedWords.add(syn);
      }
      continue;
    }

    // Partial match - check if word contains a synonym key
    for (const [key, synonyms] of Object.entries(HR_SYNONYMS)) {
      if (word.includes(key) && word !== key) {
        for (const syn of synonyms) {
          expandedWords.add(syn);
        }
      }
    }
  }

  return Array.from(expandedWords).join(" ");
}

/**
 * Resolve conversational references (pronouns, omitted subjects)
 * using recent chat history. Extracts key nouns from the last
 * user message and prepends them to the current query.
 *
 * Example:
 *   history: [{ role: "user", content: "홍길동 근태 조회해줘" }]
 *   input: "그 사람 급여도 보여줘"
 *   → "홍길동 급여도 보여줘"
 *
 * @param {string} input - Current user query
 * @param {Array} chatHistory - Recent chat messages [{role, content}, ...]
 * @returns {string} Query with resolved references
 */
function resolveReferences(input, chatHistory = []) {
  if (!input || !chatHistory || chatHistory.length === 0) return input;

  const hasReference = REFERENCE_PATTERNS.some((p) => p.test(input));
  const isShortQuery = input.length < SHORT_QUERY_THRESHOLD;

  if (!hasReference && !isShortQuery) return input;

  // Find the most recent user messages (up to 2 turns back)
  const recentUserMessages = chatHistory
    .filter(
      (msg) =>
        msg.role === "user" && typeof msg.content === "string" && msg.content
    )
    .slice(-2);

  if (recentUserMessages.length === 0) return input;

  // Extract keywords from recent user messages
  const contextKeywords = extractContextKeywords(
    recentUserMessages.map((m) => m.content).join(" ")
  );

  if (contextKeywords.length === 0) return input;

  // Replace pronouns/references with extracted context
  let resolved = input;
  if (hasReference) {
    for (const pattern of REFERENCE_PATTERNS) {
      resolved = resolved.replace(pattern, contextKeywords[0]);
    }
  } else if (isShortQuery) {
    // For short queries, prepend context keywords
    resolved = `${contextKeywords.join(" ")} ${resolved}`;
  }

  return resolved;
}

/**
 * Extract meaningful keywords from text.
 * Focuses on: names (사원번호 patterns), HR domain nouns.
 *
 * @param {string} text - Source text
 * @returns {string[]} Extracted keywords
 */
function extractContextKeywords(text) {
  if (!text) return [];

  const empNumbers = [];
  const names = [];
  let match;

  // Extract employee numbers first (higher priority for reference resolution)
  // Filter out date-like patterns (YYYYMMDD, YYYY) to avoid false positives
  const empNoPattern = /\b(\d{4,8})\b/g;
  while ((match = empNoPattern.exec(text)) !== null) {
    const num = match[1];
    // Skip date-like numbers: YYYYMMDD (20260401), YYYYMM (202604), YYYY (2026)
    if (isDateLikeNumber(num)) continue;
    empNumbers.push(num);
  }

  // Extract employee names (Korean names: 2-4 chars of Hangul)
  const namePattern = /([가-힣]{2,4})(?:\s*(?:씨|님|사원|직원|대리|과장|부장|차장|팀장|실장|이사|상무|전무|부사장|사장))?/g;
  while ((match = namePattern.exec(text)) !== null) {
    const candidate = match[1];
    // Filter out common non-name words
    if (!isCommonWord(candidate) && candidate.length >= 2) {
      names.push(candidate);
    }
  }

  // Employee numbers first, then names - deduplicate and limit
  return [...new Set([...empNumbers, ...names])].slice(0, 3);
}

/**
 * Check if a Korean word is a common word (not a person's name).
 * Used to filter out false positives in name extraction.
 */
const COMMON_WORDS = new Set([
  "조회",
  "검색",
  "확인",
  "알려",
  "보여",
  "급여",
  "월급",
  "연차",
  "근태",
  "인사",
  "정보",
  "기록",
  "사항",
  "내역",
  "결과",
  "현황",
  "목록",
  "상세",
  "전체",
  "오늘",
  "어제",
  "이번",
  "지난",
  "다음",
  "올해",
  "작년",
  "내년",
  "출근",
  "퇴근",
  "출장",
  "휴가",
  "발령",
  "승진",
  "연봉",
  "보수",
  "수당",
  "보험",
  "연금",
  "세금",
  "공제",
  "카드",
  "교육",
  "의료",
  "가족",
  "주소",
  "학력",
  "경력",
]);

function isCommonWord(word) {
  return COMMON_WORDS.has(word);
}

/**
 * Check if a number string looks like a date (YYYYMMDD, YYYYMM, or YYYY).
 * Prevents dates from being mistaken for employee numbers.
 *
 * @param {string} num - Number string to check
 * @returns {boolean} True if the number resembles a date
 */
function isDateLikeNumber(num) {
  if (!num) return false;
  const len = num.length;

  // YYYY (4 digits): 1900-2099
  if (len === 4) {
    const year = parseInt(num, 10);
    return year >= 1900 && year <= 2099;
  }

  // YYYYMM (6 digits): valid year + month 01-12
  if (len === 6) {
    const year = parseInt(num.slice(0, 4), 10);
    const month = parseInt(num.slice(4, 6), 10);
    return year >= 1900 && year <= 2099 && month >= 1 && month <= 12;
  }

  // YYYYMMDD (8 digits): valid year + month + day
  if (len === 8) {
    const year = parseInt(num.slice(0, 4), 10);
    const month = parseInt(num.slice(4, 6), 10);
    const day = parseInt(num.slice(6, 8), 10);
    return (
      year >= 1900 &&
      year <= 2099 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    );
  }

  return false;
}

/**
 * Apply the full rule-based rewriting pipeline.
 *
 * Pipeline order:
 * 1. Resolve conversational references (uses raw input for pronoun detection)
 * 2. Remove stopwords (clean filler)
 * 3. Expand synonyms (broaden search space)
 *
 * @param {string} input - Original user query
 * @param {Array} chatHistory - Recent chat messages
 * @returns {string} Rewritten query
 */
function applyRuleBasedRewriting(input, chatHistory = []) {
  if (!input || typeof input !== "string") return input;

  // 1. Resolve references first (needs raw pronouns)
  let rewritten = resolveReferences(input, chatHistory);

  // 2. Remove stopwords
  rewritten = removeStopwords(rewritten);

  // 3. Expand synonyms
  rewritten = expandSynonyms(rewritten);

  return rewritten;
}

module.exports = {
  expandSynonyms,
  resolveReferences,
  extractContextKeywords,
  isDateLikeNumber,
  applyRuleBasedRewriting,
};
