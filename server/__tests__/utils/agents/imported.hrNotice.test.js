/**
 * @agent 경로 연결 — ImportedPlugin.plugin()이 hr-* handler를 감싸 aibitat에 등록하는지
 * (specs/016 contracts/self-data-notice.md "부착 지점"). 업스트림 머지로 연결이 빠지면 여기서 잡는다.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const STORAGE = fs.mkdtempSync(path.join(os.tmpdir(), "hr-notice-"));
const PLUGINS = path.join(STORAGE, "plugins", "agent-skills");

process.env.NODE_ENV = "test";
process.env.STORAGE_DIR = STORAGE;

jest.mock("../../../utils/collectorApi", () => ({
  CollectorApi: jest.fn().mockImplementation(() => ({})),
}));

function writePlugin(hubId, body) {
  const dir = path.join(PLUGINS, hubId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "handler.js"), `module.exports.runtime = { handler: ${body} };`);
}

writePlugin("hr-fake", "async function () { this.seen = true; return 'DATA'; }");
writePlugin("web-fake", "async function () { return 'DATA'; }");
writePlugin("hr-personnel-search", "async function () { return '김기현 | 서울'; }");

const ImportedPlugin = require("../../../utils/agents/imported");
const { SELF_DATA_NOTICE, OTHER_EMPLOYEE_REFUSAL } = require("../../../utils/hrSelfDataNotice");

function register(hubId) {
  const config = { hubId, description: "d", entrypoint: { params: {} } };
  let registered = null;
  const aibitat = { function: (fn) => (registered = fn) };
  new ImportedPlugin(config).plugin().setup(aibitat);
  return registered;
}

afterAll(() => fs.rmSync(STORAGE, { recursive: true, force: true }));

describe("ImportedPlugin.plugin() — hr 결과 안내 연결 (@agent)", () => {
  it("hr skill handler 결과 끝에 본인 데이터 안내가 붙고 aibitat의 this가 유지된다", async () => {
    const fn = register("hr-fake");
    expect(await fn.handler.call(fn, { query_type: "x" })).toBe(`DATA\n\n${SELF_DATA_NOTICE}`);
    expect(fn.seen).toBe(true);
  });

  it("hr가 아닌 skill 결과는 그대로다", async () => {
    const fn = register("web-fake");
    expect(await fn.handler.call(fn, {})).toBe("DATA");
  });

  it("차단 skill은 등록돼 있어도 실행되지 않고 거절한다", async () => {
    const fn = register("hr-personnel-search");
    expect(await fn.handler.call(fn, { query: "김기현" })).toBe(OTHER_EMPLOYEE_REFUSAL);
  });
});
