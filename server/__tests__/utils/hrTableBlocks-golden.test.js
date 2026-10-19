/**
 * 기존 HR handler 출력(골든 스냅샷 전부)에 표 블록 추출 규칙을 적용한다 (specs/018 T004).
 * - 표가 있는 출력 → 블록이 생기고, 블록 안에 모델용 지시·내부 참조·파라미터 이름이 없다
 * - 표가 없는 출력 → null
 */
const fs = require("fs");
const path = require("path");
const { extractTableBlock } = require("../../utils/hrTableBlocks");

const SNAP_DIR = path.resolve(__dirname, "../storage/plugins/agent-skills/__snapshots__");
const FILES = ["period-golden.test.js.snap", "period-golden-extra.test.js.snap"];

function loadSnapshots(file) {
  const exports = {};
  // eslint-disable-next-line no-new-func
  new Function("exports", fs.readFileSync(path.join(SNAP_DIR, file), "utf8"))(exports);
  return exports;
}

// 스냅샷 키: "… hr-attendance overtime year_month=3월 1" → skill 이름, 값: pretty-format 객체 문자열
function cases() {
  const out = [];
  for (const file of FILES) {
    for (const [key, value] of Object.entries(loadSnapshots(file))) {
      const skill = (key.match(/\b(hr-[a-z-]+)\b/) || [])[1];
      const m = value.match(/"output": "([\s\S]*)",\n}\s*$/);
      if (!skill || !m) continue;
      out.push([key, skill, m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")]);
    }
  }
  return out;
}

const ALL = cases();
const hasTable = (text) => /^\|.*\|\s*$/m.test(text) && /^\|[\s:|-]+\|\s*$/m.test(text);
const FORBIDDEN = /^> \[|\[응답 지침\]|답변에 포함하지 마세요|내부 참조|\b(query_type|pay_item|org_cd|cal_yy|year_month)\b|^## /m;

describe("골든 출력 전체 — 표 블록 추출", () => {
  it("케이스를 읽었다", () => {
    expect(ALL.length).toBeGreaterThan(100);
  });

  it.each(ALL)("%s", (_, skill, output) => {
    const block = extractTableBlock(skill, output);
    if (!hasTable(output)) {
      expect(block).toBeNull();
      return;
    }
    expect(block).not.toBeNull();
    expect(block).not.toMatch(FORBIDDEN);
    // 원문의 표 줄은 블록에 글자 그대로 모두 있다
    for (const line of output.split("\n").filter((l) => l.startsWith("|"))) {
      expect(block).toContain(line);
    }
  });
});
