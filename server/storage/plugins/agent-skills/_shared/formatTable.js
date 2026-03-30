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

module.exports = { formatCellValue, normalizeData, renderTable, renderSummary };
