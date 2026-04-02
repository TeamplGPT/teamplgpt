/* eslint-env jest, node */

/**
 * apiChatHandler LLM Log 단위 테스트
 *
 * chatSync()와 streamChat()가 LLM 응답 후
 * WorkspaceChats.createLlmMessageLog()를 올바르게 호출하는지 검증합니다.
 */

const path = require("path");
const fs = require("fs");

// ─── Static Analysis: createLlmMessageLog 호출 존재 검증 ─────

describe("apiChatHandler LLM Log 정적 분석", () => {
  let fileContent;

  beforeAll(() => {
    const filePath = path.resolve(
      __dirname,
      "../../../utils/chats/apiChatHandler.js"
    );
    fileContent = fs.readFileSync(filePath, "utf-8");
  });

  it("createLlmMessageLog를 import 또는 참조한다", () => {
    // WorkspaceChats.createLlmMessageLog 호출이 존재하는지
    expect(fileContent).toMatch(/createLlmMessageLog/);
  });

  it("createLlmMessageLog 호출이 2회 이상 존재한다 (chatSync + streamChat)", () => {
    const matches = fileContent.match(/createLlmMessageLog\s*\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("모든 createLlmMessageLog 호출이 try-catch로 보호된다", () => {
    // createLlmMessageLog 앞에 try 블록이 있는지 확인
    const pattern =
      /try\s*\{[\s\S]*?createLlmMessageLog[\s\S]*?\}\s*catch/g;
    const matches = fileContent.match(pattern) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("chatSync에서 systemPrompt를 messages에서 추출한다", () => {
    // messages.find((m) => m.role === "system") 패턴 존재
    expect(fileContent).toMatch(
      /messages\.find\(\s*\(m\)\s*=>\s*m\.role\s*===\s*"system"\s*\)/
    );
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

    // createLlmMessageLog 호출 블록 추출
    const callPattern =
      /createLlmMessageLog\s*\(\s*chat\.id\s*,\s*\{([\s\S]*?)\}\s*\)/g;
    const callBlocks = [];
    let match;
    while ((match = callPattern.exec(fileContent)) !== null) {
      callBlocks.push(match[1]);
    }

    expect(callBlocks.length).toBeGreaterThanOrEqual(2);

    callBlocks.forEach((block, idx) => {
      requiredFields.forEach((field) => {
        expect(block).toMatch(
          new RegExp(`\\b${field}\\b`)
        );
      });
    });
  });
});

// ─── chatSync LLM Log 호출 검증 ────────────────────────────────

describe("apiChatHandler chatSync LLM Log 데이터 매핑", () => {
  let fileContent;

  beforeAll(() => {
    const filePath = path.resolve(
      __dirname,
      "../../../utils/chats/apiChatHandler.js"
    );
    fileContent = fs.readFileSync(filePath, "utf-8");
  });

  it("chatSync에서 llmResponse로 textResponse를 전달한다", () => {
    // chatSync 함수 범위 내에서 llmResponse: textResponse 확인
    // chatSync는 textResponse를 사용하고, streamChat은 completeText를 사용
    const chatSyncSection = fileContent.split("async function streamChat")[0];
    expect(chatSyncSection).toMatch(/llmResponse:\s*textResponse/);
  });

  it("chatSync에서 chatHistory로 rawHistory를 전달한다", () => {
    const chatSyncSection = fileContent.split("async function streamChat")[0];
    expect(chatSyncSection).toMatch(/chatHistory:\s*rawHistory/);
  });

  it("chatSync에서 compressedMessages로 messages를 전달한다", () => {
    const chatSyncSection = fileContent.split("async function streamChat")[0];
    expect(chatSyncSection).toMatch(/compressedMessages:\s*messages/);
  });

  it("chatSync에서 userPrompt로 message를 전달한다", () => {
    const chatSyncSection = fileContent.split("async function streamChat")[0];
    expect(chatSyncSection).toMatch(/userPrompt:\s*message/);
  });
});

// ─── streamChat LLM Log 호출 검증 ──────────────────────────────

describe("apiChatHandler streamChat LLM Log 데이터 매핑", () => {
  let fileContent;

  beforeAll(() => {
    const filePath = path.resolve(
      __dirname,
      "../../../utils/chats/apiChatHandler.js"
    );
    fileContent = fs.readFileSync(filePath, "utf-8");
  });

  it("streamChat에서 llmResponse로 completeText를 전달한다", () => {
    const streamChatSection = fileContent.split("async function streamChat")[1];
    expect(streamChatSection).toMatch(/llmResponse:\s*completeText/);
  });

  it("streamChat에서 chatHistory로 rawHistory를 전달한다", () => {
    const streamChatSection = fileContent.split("async function streamChat")[1];
    expect(streamChatSection).toMatch(/chatHistory:\s*rawHistory/);
  });

  it("streamChat에서 compressedMessages로 messages를 전달한다", () => {
    const streamChatSection = fileContent.split("async function streamChat")[1];
    expect(streamChatSection).toMatch(/compressedMessages:\s*messages/);
  });
});

// ─── Fail-silent 보장 검증 ─────────────────────────────────────

describe("apiChatHandler LLM Log fail-silent 보장", () => {
  let fileContent;

  beforeAll(() => {
    const filePath = path.resolve(
      __dirname,
      "../../../utils/chats/apiChatHandler.js"
    );
    fileContent = fs.readFileSync(filePath, "utf-8");
  });

  it("catch 블록에서 console.error로 에러를 로깅한다", () => {
    // [LLM Log] 태그로 에러 로깅
    expect(fileContent).toMatch(
      /console\.error\(\s*"\[LLM Log\]/
    );
  });

  it("createLlmMessageLog 호출이 WorkspaceChats.new() 이후에 위치한다", () => {
    // WorkspaceChats.new가 createLlmMessageLog보다 먼저 나타나는지
    const newIdx = fileContent.indexOf("WorkspaceChats.new(");
    const logIdx = fileContent.indexOf("createLlmMessageLog(");
    expect(newIdx).toBeLessThan(logIdx);
  });
});
