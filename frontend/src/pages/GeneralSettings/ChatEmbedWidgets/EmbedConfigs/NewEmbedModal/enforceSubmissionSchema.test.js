import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/models/workspace", () => ({ default: { all: vi.fn() } }));
vi.mock("@/models/embed", () => ({ default: { newEmbed: vi.fn() } }));
vi.mock("react-tag-input-component", () => ({ TagsInput: () => null }));
vi.mock("../components/AllowedSkillsMultiSelect", () => ({
  default: () => null,
}));

import { enforceSubmissionSchema } from "./index";

function makeForm(entries = []) {
  return {
    entries: () => entries[Symbol.iterator](),
  };
}

describe("enforceSubmissionSchema", () => {
  beforeEach(() => vi.clearAllMocks());

  it("빈 FormData → 모든 nullable 키 기본값 적용", () => {
    const data = enforceSubmissionSchema(makeForm([]));
    expect(data).toEqual({
      allowlist_domains: null,
      allow_model_override: false,
      allow_temperature_override: false,
      allow_prompt_override: false,
      message_limit: 20,
      allow_tool_calling: false,
    });
  });

  it("checkbox 'on' 값은 boolean true 로 변환된다", () => {
    const data = enforceSubmissionSchema(
      makeForm([
        ["allow_model_override", "on"],
        ["allow_tool_calling", "on"],
      ])
    );
    expect(data.allow_model_override).toBe(true);
    expect(data.allow_tool_calling).toBe(true);
  });

  it("allow_tool_calling 미체크 시 기본값 false 적용", () => {
    const data = enforceSubmissionSchema(makeForm([["chat_mode", "chat"]]));
    expect(data.allow_tool_calling).toBe(false);
  });

  it("allowed_skill_hashes 키는 schema 에서 처리하지 않는다 (Option B)", () => {
    const data = enforceSubmissionSchema(makeForm([]));
    expect(data).not.toHaveProperty("allowed_skill_hashes");
  });

  it("빈 문자열 값은 skip 된다 (기존 동작)", () => {
    const data = enforceSubmissionSchema(
      makeForm([
        ["allowlist_domains", ""],
        ["chat_mode", "query"],
      ])
    );
    expect(data.allowlist_domains).toBe(null);
    expect(data.chat_mode).toBe("query");
  });

  it("기존 5개 nullable 기본값이 회귀 없이 유지된다", () => {
    const data = enforceSubmissionSchema(makeForm([]));
    expect(data.allowlist_domains).toBe(null);
    expect(data.allow_model_override).toBe(false);
    expect(data.allow_temperature_override).toBe(false);
    expect(data.allow_prompt_override).toBe(false);
    expect(data.message_limit).toBe(20);
  });

  it("명시적으로 제공된 값은 기본값을 덮어쓰지 않는다", () => {
    const data = enforceSubmissionSchema(
      makeForm([
        ["message_limit", "50"],
        ["allow_model_override", "on"],
      ])
    );
    expect(data.message_limit).toBe("50");
    expect(data.allow_model_override).toBe(true);
  });
});
