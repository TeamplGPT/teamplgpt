/* eslint-env jest, node */

/**
 * react/index.js LLM Log 단위 테스트
 *
 * streamReactChat()가 LLM 응답 후
 * WorkspaceChats.createLlmMessageLog()를 올바르게 호출하는지 검증합니다.
 */

const path = require("path");
const fs = require("fs");

// ─── Static Analysis: createLlmMessageLog 호출 존재 검증 ─────

describe("react/index.js LLM Log 정적 분석", () => {
  let fileContent;

  beforeAll(() => {
    const filePath = path.resolve(
      __dirname,
      "../../../../utils/chats/react/index.js"
    );
    fileContent = fs.readFileSync(filePath, "utf-8");
  });

  it("createLlmMessageLog 호출이 존재한다", () => {
    const matches = fileContent.match(/createLlmMessageLog\s*\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("createLlmMessageLog 호출이 try-catch로 보호된다", () => {
    const pattern =
      /try\s*\{[\s\S]*?createLlmMessageLog[\s\S]*?\}\s*catch/g;
    const matches = fileContent.match(pattern) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("로그 저장 시 필수 6개 필드를 모두 전달한다", () => {
    const requiredFields = [
      "systemPrompt",
      "userPrompt",
      "contextTexts",
      "chatHistory",
      "compressedMessages",
      "llmResponse",
    ];

    const callPattern =
      /createLlmMessageLog\s*\(\s*chat\.id\s*,\s*\{([\s\S]*?)\}\s*\)/g;
    const callBlocks = [];
    let match;
    while ((match = callPattern.exec(fileContent)) !== null) {
      callBlocks.push(match[1]);
    }

    expect(callBlocks.length).toBeGreaterThanOrEqual(1);

    callBlocks.forEach((block) => {
      requiredFields.forEach((field) => {
        expect(block).toMatch(new RegExp(`\\b${field}\\b`));
      });
    });
  });
});

// ─── React LLM Log 데이터 매핑 검증 ────────────────────────────

describe("react/index.js LLM Log 데이터 매핑", () => {
  let fileContent;

  beforeAll(() => {
    const filePath = path.resolve(
      __dirname,
      "../../../../utils/chats/react/index.js"
    );
    fileContent = fs.readFileSync(filePath, "utf-8");
  });

  it("systemPrompt를 직접 변수로 전달한다 (messages에서 추출하지 않음)", () => {
    const callPattern =
      /createLlmMessageLog\s*\(\s*chat\.id\s*,\s*\{([\s\S]*?)\}\s*\)/;
    const match = fileContent.match(callPattern);
    expect(match).toBeTruthy();
    // react에서는 systemPrompt 변수를 직접 사용 (messages.find 아님)
    expect(match[1]).toMatch(/systemPrompt[,\s\n]/);
    expect(match[1]).not.toMatch(/messages\.find/);
  });

  it("llmResponse로 finalAnswer를 전달한다", () => {
    const callPattern =
      /createLlmMessageLog\s*\(\s*chat\.id\s*,\s*\{([\s\S]*?)\}\s*\)/;
    const match = fileContent.match(callPattern);
    expect(match[1]).toMatch(/llmResponse:\s*finalAnswer/);
  });

  it("contextTexts로 pinnedContextTexts를 전달한다", () => {
    const callPattern =
      /createLlmMessageLog\s*\(\s*chat\.id\s*,\s*\{([\s\S]*?)\}\s*\)/;
    const match = fileContent.match(callPattern);
    expect(match[1]).toMatch(/contextTexts:\s*pinnedContextTexts/);
  });

  it("chatHistory로 rawHistory를 전달한다", () => {
    const callPattern =
      /createLlmMessageLog\s*\(\s*chat\.id\s*,\s*\{([\s\S]*?)\}\s*\)/;
    const match = fileContent.match(callPattern);
    expect(match[1]).toMatch(/chatHistory:\s*rawHistory/);
  });

  it("compressedMessages로 messages를 전달한다", () => {
    const callPattern =
      /createLlmMessageLog\s*\(\s*chat\.id\s*,\s*\{([\s\S]*?)\}\s*\)/;
    const match = fileContent.match(callPattern);
    expect(match[1]).toMatch(/compressedMessages:\s*messages/);
  });
});

// ─── Fail-silent 보장 및 위치 검증 ─────────────────────────────

describe("react/index.js LLM Log fail-silent 및 위치", () => {
  let fileContent;

  beforeAll(() => {
    const filePath = path.resolve(
      __dirname,
      "../../../../utils/chats/react/index.js"
    );
    fileContent = fs.readFileSync(filePath, "utf-8");
  });

  it("catch 블록에서 console.error로 에러를 로깅한다", () => {
    expect(fileContent).toMatch(
      /console\.error\(\s*"\[LLM Log\]/
    );
  });

  it("createLlmMessageLog 호출이 WorkspaceChats.new() 이후에 위치한다", () => {
    const newIdx = fileContent.indexOf("WorkspaceChats.new(");
    const logIdx = fileContent.indexOf("createLlmMessageLog(");
    expect(newIdx).toBeLessThan(logIdx);
  });

  it("createLlmMessageLog 호출이 finalizeResponseStream 전에 위치한다", () => {
    const logIdx = fileContent.indexOf("createLlmMessageLog(");
    const finalizeIdx = fileContent.indexOf("finalizeResponseStream", logIdx);
    expect(logIdx).toBeLessThan(finalizeIdx);
  });
});
