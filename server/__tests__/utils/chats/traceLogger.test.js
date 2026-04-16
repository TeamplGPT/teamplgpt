/* eslint-env jest, node */

/**
 * traceLogger의 vsMode 라벨 산출 회귀 테스트
 * - 컬럼 값이 아닌 "실제 적용된 검색 모드"를 로그에 남기는지 검증
 */

const { ChatTraceLogger } = require("../../../utils/chats/traceLogger");

describe("ChatTraceLogger.traceStart → vsMode label", () => {
  let logs;
  let origLog;

  beforeEach(() => {
    logs = [];
    origLog = console.log;
    console.log = (msg) => logs.push(msg);
  });

  afterEach(() => {
    console.log = origLog;
  });

  const makeLogger = () =>
    new ChatTraceLogger("abcdef12-0000-0000-0000-000000000000", {
      chatMode: "chat",
    });

  test("TL1: pgvector workspace → vectorSearch: hybrid", () => {
    makeLogger().traceStart({
      query: "hi",
      workspace: { slug: "ws1", vectorDB: "pgvector" },
      chatHistoryCount: 0,
    });
    expect(logs.some((l) => /vectorSearch: hybrid/.test(l))).toBe(true);
  });

  test("TL1b: pgvector + vectorSearchMode='default' 컬럼값이어도 hybrid로 표기", () => {
    makeLogger().traceStart({
      query: "hi",
      workspace: {
        slug: "ws1",
        vectorDB: "pgvector",
        vectorSearchMode: "default",
      },
      chatHistoryCount: 0,
    });
    expect(logs.some((l) => /vectorSearch: hybrid/.test(l))).toBe(true);
  });

  test("TL2: lancedb + rerank → vectorSearch: rerank", () => {
    makeLogger().traceStart({
      query: "hi",
      workspace: {
        slug: "ws2",
        vectorDB: "lancedb",
        vectorSearchMode: "rerank",
      },
      chatHistoryCount: 0,
    });
    expect(logs.some((l) => /vectorSearch: rerank/.test(l))).toBe(true);
  });

  test("TL3: lancedb (no mode) → vectorSearch: default", () => {
    makeLogger().traceStart({
      query: "hi",
      workspace: { slug: "ws3", vectorDB: "lancedb" },
      chatHistoryCount: 0,
    });
    expect(logs.some((l) => /vectorSearch: default/.test(l))).toBe(true);
  });

  test("TL3b: chroma 등 미지원 DB → vectorSearch: default", () => {
    makeLogger().traceStart({
      query: "hi",
      workspace: {
        slug: "ws4",
        vectorDB: "chroma",
        vectorSearchMode: "rerank",
      },
      chatHistoryCount: 0,
    });
    expect(logs.some((l) => /vectorSearch: default/.test(l))).toBe(true);
  });
});
