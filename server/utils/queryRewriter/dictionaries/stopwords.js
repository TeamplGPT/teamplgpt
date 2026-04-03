/**
 * Korean Stopwords for Query Optimization
 *
 * These words are removed from the query before vector search
 * to improve embedding quality. Only removes words that add no
 * semantic value for document retrieval.
 *
 * Categories:
 * - Filler phrases: 인사말, 요청 표현
 * - Particles that dilute embedding: 조사, 어미 (단, 의미 있는 조사는 유지)
 * - Politeness markers: 존칭, 경어 표현
 */

// Filler phrases to remove (regex patterns)
const FILLER_PATTERNS = [
  /^안녕하세요[.,]?\s*/,
  /^안녕[.,]?\s*/,
  /^감사합니다[.,]?\s*/,
  /^수고하세요[.,]?\s*/,
  /^혹시\s*/,
  /\s*알려\s*주세요\.?$/,
  /\s*알려\s*줘\.?$/,
  /\s*보여\s*주세요\.?$/,
  /\s*보여\s*줘\.?$/,
  /\s*말해\s*주세요\.?$/,
  /\s*말해\s*줘\.?$/,
  /\s*확인해\s*주세요\.?$/,
  /\s*확인해\s*줘\.?$/,
  /\s*부탁합니다\.?$/,
  /\s*부탁해\.?$/,
  /\s*궁금합니다\.?$/,
  /\s*궁금해요?\.?$/,
  /\s*알고\s*싶어요?\.?$/,
  /\s*알고\s*싶습니다\.?$/,
  /\s*좀\s*/,
  /\s*제발\s*/,
];

// Single-word stopwords (exact match after tokenization)
const STOPWORDS = new Set([
  // 접속사/부사
  "그리고",
  "그런데",
  "하지만",
  "그래서",
  "또한",
  "또",
  "그냥",
  "좀",
  "혹시",
  "만약",
  "아마",
  "정말",
  "진짜",
  "매우",
  "너무",
  "아주",
  "조금",
  "다시",
  "잠깐",
  // 대명사 (참조 해소 후 남은 것)
  "저",
  "제",
  "나",
  "내",
  "우리",
  // 지시어는 참조 해소에서 처리하므로 여기선 제거하지 않음
]);

/**
 * Remove filler phrases and stopwords from input
 * @param {string} input - User query
 * @returns {string} Cleaned query
 */
function removeStopwords(input) {
  if (!input || typeof input !== "string") return input;

  let cleaned = input;

  // Step 1: Remove filler phrases (regex)
  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  // Step 2: Remove single-word stopwords
  cleaned = cleaned
    .split(/\s+/)
    .filter((word) => !STOPWORDS.has(word))
    .join(" ");

  // Step 3: Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // If cleaning removed everything, return original
  return cleaned.length > 0 ? cleaned : input;
}

module.exports = { removeStopwords, FILLER_PATTERNS, STOPWORDS };
