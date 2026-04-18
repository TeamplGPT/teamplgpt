/**
 * Regression snapshot tests for dateResolver.resolveDateParam.
 *
 * Purpose:
 *   Feature `hr-year-month-past-year-fix` does NOT modify dateResolver.js.
 *   These tests fix the current behavior so that any unintended future change
 *   in sugar-date or partial-numeric logic is caught immediately.
 *
 * Categories:
 *   1. Explicit-year formats (YYYYMM / YYYY-MM / YYYY/MM / YYYY년 M월 / YYYY.MM)
 *   2. Partial numeric (month-only) filled with current year
 *   3. Relative Korean expressions
 *   4. Snapshot of unsupported edge cases (2-digit year, day-in-year_month)
 *
 * Run:
 *   node --test _shared/__tests__/dateResolver.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveDateParam } = require("../dateResolver");

const now = new Date();
const curY = now.getFullYear();
const curM = String(now.getMonth() + 1).padStart(2, "0");

// ───────────────────────────────────────────────────────────
// 1. Explicit-year formats — sugar-date / pass-through
// ───────────────────────────────────────────────────────────
test("year_month: YYYYMM pass-through", () => {
  assert.equal(resolveDateParam("202501", "year_month"), "202501");
});

test("year_month: YYYY-MM", () => {
  assert.equal(resolveDateParam("2025-01", "year_month"), "202501");
});

test("year_month: YYYY/MM", () => {
  assert.equal(resolveDateParam("2025/01", "year_month"), "202501");
});

test("year_month: YYYY.MM", () => {
  assert.equal(resolveDateParam("2025.01", "year_month"), "202501");
});

test("year_month: YYYY년 M월", () => {
  assert.equal(resolveDateParam("2025년 1월", "year_month"), "202501");
});

test("year_month: YYYY년 MM월 (zero-pad)", () => {
  assert.equal(resolveDateParam("2025년 01월", "year_month"), "202501");
});

test("year_month: YYYY년M월 (no space)", () => {
  assert.equal(resolveDateParam("2025년3월", "year_month"), "202503");
});

test("year_month: past-year 12월", () => {
  assert.equal(resolveDateParam("2024년 12월", "year_month"), "202412");
});

test("base_date: YYYY-MM-DD", () => {
  assert.equal(resolveDateParam("2025-03-15", "base_date"), "20250315");
});

// ───────────────────────────────────────────────────────────
// 2. Partial numeric — current year fill
// ───────────────────────────────────────────────────────────
test("year_month: month-only numeric → current year", () => {
  assert.equal(resolveDateParam("3", "year_month"), `${curY}03`);
});

test("year_month: zero-padded month '03' → current year", () => {
  assert.equal(resolveDateParam("03", "year_month"), `${curY}03`);
});

// ───────────────────────────────────────────────────────────
// 3. Relative Korean expressions — backward compat
// ───────────────────────────────────────────────────────────
test("year_month: '지난달' (relative)", () => {
  // Previous month of current date.
  const prev = new Date(curY, now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, "0");
  assert.equal(resolveDateParam("지난달", "year_month"), `${y}${m}`);
});

// ───────────────────────────────────────────────────────────
// 4. Unsupported edge-case snapshots — freeze current behavior
//    These are NOT desired behaviors but intentionally kept to
//    detect silent changes in sugar-date / partial logic.
// ───────────────────────────────────────────────────────────
test("snapshot: '25년 1월' (2-digit year) → undefined (unsupported)", () => {
  assert.equal(resolveDateParam("25년 1월", "year_month"), undefined);
});

test("snapshot: '25/1' → sugar-date parses as Jan 25 → current year's 01", () => {
  // sugar-date interprets "25/1" as "January 25" (day=25, month=1) using current year.
  // Behavior frozen to catch unintended changes; LLM should never emit this form.
  assert.equal(resolveDateParam("25/1", "year_month"), `${curY}01`);
});

test("snapshot: '25년 1월 5일' (2-digit year + day) → undefined", () => {
  assert.equal(resolveDateParam("25년 1월 5일", "base_date"), undefined);
});
