/**
 * Unit tests for hrSession helpers (specs/011-hr-endpoint-catalog-realign T005).
 *
 * Categories:
 *   1. parseKiwiboxBody unwrap priority: result → DATA → Map → codeList → data → passthrough
 *   2. Session-expiry (HTML) / non-JSON handling
 *   3. todayDashed format
 *   4. monthsAgoFirstYmd boundary (year rollover)
 *
 * Run:
 *   node --test _shared/__tests__/hrSession.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseKiwiboxBody,
  todayDashed,
  monthsAgoFirstYmd,
} = require("../hrSession");

// ───────────────────────────────────────────────────────────
// 1. unwrap priority
// ───────────────────────────────────────────────────────────
test("unwrap: result[]", () => {
  const r = parseKiwiboxBody(JSON.stringify({ result: [{ a: 1 }] }));
  assert.deepEqual(r.records, [{ a: 1 }]);
});

test("unwrap: DATA[]", () => {
  const r = parseKiwiboxBody(JSON.stringify({ Message: "", DATA: [{ a: 1 }] }));
  assert.deepEqual(r.records, [{ a: 1 }]);
});

test("unwrap: Map{} (SALPayslipNewMgrMap 단건)", () => {
  const r = parseKiwiboxBody(
    JSON.stringify({ Map: { jtotAmt: "3,193,000" } })
  );
  assert.deepEqual(r.records, { jtotAmt: "3,193,000" });
});

test("unwrap: codeList[] (CommonCode 콤보)", () => {
  const r = parseKiwiboxBody(
    JSON.stringify({ codeList: [{ codeNm: "2026-06-19 급여", code: "20260619P" }] })
  );
  assert.equal(r.records[0].code, "20260619P");
});

test("unwrap: data[]", () => {
  const r = parseKiwiboxBody(JSON.stringify({ data: [{ a: 1 }] }));
  assert.deepEqual(r.records, [{ a: 1 }]);
});

test("unwrap: passthrough (래퍼 없음)", () => {
  const r = parseKiwiboxBody(JSON.stringify([{ a: 1 }]));
  assert.deepEqual(r.records, [{ a: 1 }]);
});

test("unwrap: 우선순위 — result가 DATA보다 우선", () => {
  const r = parseKiwiboxBody(JSON.stringify({ result: [1], DATA: [2] }));
  assert.deepEqual(r.records, [1]);
});

test("empty: DATA:[] → isEmpty", () => {
  const r = parseKiwiboxBody(JSON.stringify({ Message: "", DATA: [] }));
  assert.equal(r.isEmpty, true);
});

test("empty: codeList:[] → isEmpty (해당월 급여 없음)", () => {
  const r = parseKiwiboxBody(JSON.stringify({ codeList: [] }));
  assert.equal(r.isEmpty, true);
});

// ───────────────────────────────────────────────────────────
// 2. session expiry / non-JSON
// ───────────────────────────────────────────────────────────
test("HTML 응답 → 세션 만료 안내", () => {
  const r = parseKiwiboxBody("<html><body>login</body></html>");
  assert.match(r.errorMessage, /세션이 만료/);
});

test("non-JSON 응답 → 해석 불가 안내", () => {
  const r = parseKiwiboxBody("oops not json");
  assert.match(r.errorMessage, /해석할 수 없습니다/);
});

// ───────────────────────────────────────────────────────────
// 3. todayDashed
// ───────────────────────────────────────────────────────────
test("todayDashed: YYYY-MM-DD 형식", () => {
  assert.match(todayDashed(), /^\d{4}-\d{2}-\d{2}$/);
});

// ───────────────────────────────────────────────────────────
// 4. monthsAgoFirstYmd
// ───────────────────────────────────────────────────────────
test("monthsAgoFirstYmd(0): 이번 달 1일", () => {
  const d = new Date();
  const expected = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}01`;
  assert.equal(monthsAgoFirstYmd(0), expected);
});

test("monthsAgoFirstYmd(18): 형식 + 연도 하락", () => {
  const v = monthsAgoFirstYmd(18);
  assert.match(v, /^\d{6}01$/);
  const y = Number(v.slice(0, 4));
  assert.ok(y < new Date().getFullYear());
});

test("monthsAgoFirstYmd(12): 정확히 1년 전 같은 달", () => {
  const d = new Date();
  const expected = `${d.getFullYear() - 1}${String(d.getMonth() + 1).padStart(2, "0")}01`;
  assert.equal(monthsAgoFirstYmd(12), expected);
});
