/**
 * Shared markdown table formatter for HR API responses.
 *
 * Handles three response shapes:
 *   1) Flat array: [{ col: val }, ...] -> table rows directly
 *   2) Flat object: { key: primitive, ... } -> key-value table
 *   3) Nested object: { items: [...], summary_field: val } -> items as table + summary below
 *
 * Any cell value that is an object/array is auto-flattened.
 *
 * @module formatTable
 */

/**
 * Format a single cell value for markdown table display.
 * @param {*} v - Cell value
 * @param {boolean} [bold=false] - Wrap numbers in bold
 * @returns {string}
 */
function formatCellValue(v, bold = false) {
  if (v === null || v === undefined) return "-";
  if (Array.isArray(v)) {
    if (v.length === 0) return "-";
    // Array of primitives -> comma-separated
    if (typeof v[0] !== "object") return v.join(", ");
    // Array of objects -> count summary
    return `(${v.length}건)`;
  }
  if (typeof v === "object") {
    // Flatten simple objects to "key: value" pairs
    const entries = Object.entries(v);
    if (entries.length <= 3) {
      return entries.map(([k, val]) => `${k}: ${val ?? "-"}`).join(", ");
    }
    return `(${entries.length}개 항목)`;
  }
  if (typeof v === "number" && bold) {
    return `**${v.toLocaleString("ko-KR")}**`;
  }
  if (typeof v === "number") {
    return v.toLocaleString("ko-KR");
  }
  return String(v);
}

/**
 * Normalize API response data into { rows, summary } structure.
 *
 * @param {*} data - unwrapResponse().records result
 * @returns {{ rows: Array, summary: Object|null }}
 *
 * @example
 *   // Flat array
 *   normalize([{a:1},{a:2}])
 *   // { rows: [{a:1},{a:2}], summary: null }
 *
 *   // Nested { items: [...], total: N }
 *   normalize({ items: [{a:1}], total: 5 })
 *   // { rows: [{a:1}], summary: { total: 5 } }
 *
 *   // Flat object (single record)
 *   normalize({ name: "홍길동", age: 30 })
 *   // { rows: [{ name: "홍길동", age: 30 }], summary: null }
 */
function normalizeData(data) {
  // Already an array -> flat rows
  if (Array.isArray(data)) {
    return { rows: data, summary: null };
  }

  // Object with "items" array -> nested structure
  if (data && typeof data === "object" && Array.isArray(data.items)) {
    const summary = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "items") continue;
      if (k === "code" || k === "message") continue;
      summary[k] = v;
    }
    return {
      rows: data.items,
      summary: Object.keys(summary).length > 0 ? summary : null,
    };
  }

  // Flat object (single record) -> wrap in array
  if (data && typeof data === "object") {
    return { rows: [data], summary: null };
  }

  return { rows: [], summary: null };
}

/**
 * Render rows as a markdown table.
 *
 * @param {Array} rows - Array of record objects
 * @param {Object} [options]
 * @param {boolean} [options.boldNumbers=false] - Bold numeric values
 * @param {string[]} [options.excludeKeys=[]] - Keys to exclude from table
 * @returns {string} Markdown table string (empty string if no rows)
 */
function renderTable(rows, options = {}) {
  const md = renderTableRaw(rows, options);
  return md ? md + ANSWER_GUIDE : md;
}

// footer 미부착 내부 렌더 — renderWhitelisted가 "총 N건" 줄 뒤에 footer를 한 번만
// 붙일 수 있도록 분리 (specs/012-hr-answer-quality contracts/footer-contract.md).
function renderTableRaw(rows, options = {}) {
  const { boldNumbers = false, excludeKeys = ["code", "message"] } = options;

  if (!rows || rows.length === 0) return "";

  const keys = Object.keys(rows[0]).filter((k) => !excludeKeys.includes(k));
  if (keys.length === 0) return "";

  let md = `| ${keys.join(" | ")} |\n`;
  md += `| ${keys.map(() => "------").join(" | ")} |\n`;

  for (const rec of rows) {
    const row = keys.map((k) => formatCellValue(rec[k], boldNumbers));
    md += `| ${row.join(" | ")} |\n`;
  }

  return md;
}

// LLM 대상 응답 지침 footer — 조회 데이터 표의 통짜 재출력(echo) 억제.
// 고정 분량 숫자 금지, 질문 유형 적응 3분기 (specs/012 FR-001).
// 문구 정본: specs/012-hr-answer-quality/contracts/footer-contract.md
const ANSWER_GUIDE = `
---
[응답 지침] 위 표는 조회 데이터이며 그대로 출력하라는 지시가 아닙니다.
- 특정 값을 묻는 질문: 해당 값과 이해에 필요한 맥락만 답변
- 내역·현황을 묻는 질문: 질문과 관련된 행·열만 추려 제시(표 사용 가능)
- 사용자가 전체/상세/표를 명시 요청한 경우: 전체 표 제공
이 지침 문구 자체를 답변에 포함하지 마세요.
`;

/**
 * Render summary fields as a markdown blockquote.
 *
 * @param {Object} summary - Key-value pairs
 * @returns {string} Markdown string
 */
function renderSummary(summary) {
  if (!summary || Object.keys(summary).length === 0) return "";

  const parts = Object.entries(summary).map(
    ([k, v]) => `**${k}**: ${formatCellValue(v, true)}`
  );
  return `> ${parts.join(" | ")}`;
}

/**
 * 화이트리스트 컬럼만 골라 한글 라벨로 렌더한다. 내부 PK·코드값·주민번호 등 노이즈/민감
 * 컬럼을 제외하고, kiwibox 응답이 배열이든 단일 객체든 균일 처리한다. 응답 키 대소문자·
 * camelCase 변형을 모두 대응(egovMap 소문자 대비). hr-approval/certificate/personnel과 동일 패턴.
 *
 * @param {any} records - kiwibox 언랩 결과(배열 또는 객체)
 * @param {Object<string,string>} columnLabels - { 원본키: 한글라벨 } 순서대로
 * @returns {string} markdown 표 (없으면 빈 문자열)
 */
function renderWhitelisted(records, columnLabels) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  if (list.length === 0) return "";

  const camel = (s) =>
    s.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const pick = (row) => {
    const out = {};
    for (const [col, lab] of Object.entries(columnLabels)) {
      const v = row[col] ?? row[col.toLowerCase()] ?? row[camel(col)];
      if (v !== undefined && v !== null && String(v).trim() !== "")
        out[lab] = v;
    }
    return out;
  };

  const picked = list.map(pick).filter((r) => Object.keys(r).length > 0);
  if (picked.length === 0) return "";

  // 문서별 컬럼 편차 대비 union 키(정의 순서 유지)
  const ordered = Object.values(columnLabels);
  const present = new Set();
  for (const r of picked) for (const k of Object.keys(r)) present.add(k);
  const headerKeys = ordered.filter((l) => present.has(l));
  const normalized = picked.map((r) => {
    const row = {};
    for (const k of headerKeys) row[k] = r[k] ?? "";
    return row;
  });

  return (
    renderTableRaw(normalized) +
    `\n> 총 **${normalized.length}건** 조회됨` +
    ANSWER_GUIDE
  );
}

module.exports = {
  formatCellValue,
  normalizeData,
  renderTable,
  renderSummary,
  renderWhitelisted,
  ANSWER_GUIDE,
};
