import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NewEmbedModal from "./index";

vi.mock("@/models/embed", () => ({
  default: { newEmbed: vi.fn() },
}));

vi.mock("@/models/admin", () => ({
  default: { systemPreferencesByFields: vi.fn() },
}));

vi.mock("@/models/workspace", () => ({
  default: { all: vi.fn().mockResolvedValue([{ id: 1, name: "HR" }]) },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
}));

vi.mock("@/utils/paths", () => ({
  default: { settings: { agentSkills: () => "/settings/agents" } },
}));

vi.mock("react-tag-input-component", () => ({
  TagsInput: ({ value, onChange }) => (
    <input
      data-testid="domains"
      defaultValue={(value || []).join(",")}
      onChange={(e) =>
        onChange(e.target.value.split(",").filter(Boolean))
      }
    />
  ),
}));

import Embed from "@/models/embed";
import Admin from "@/models/admin";

const mockActivePlugins = [
  { active: true, name: "HR 근태 조회", hubId: "hr-attendance" },
  { active: true, name: "HR 급여 조회", hubId: "hr-salary" },
];

function getToolCallingToggle(container) {
  return container.querySelector('input[name="allow_tool_calling"]');
}

function submitForm(container) {
  fireEvent.submit(container.querySelector("form"));
}

describe("NewEmbedModal — 신규 embed 생성 페이로드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Admin.systemPreferencesByFields.mockResolvedValue({
      settings: { imported_agent_skills: mockActivePlugins },
    });
    Embed.newEmbed.mockResolvedValue({ embed: null, error: null });
    delete window.location;
    window.location = { reload: vi.fn() };
  });

  it("기본값 — allow_tool_calling=false, allowed_skill_hashes 키 없음", async () => {
    const { container } = render(<NewEmbedModal closeModal={vi.fn()} />);
    submitForm(container);
    await waitFor(() => expect(Embed.newEmbed).toHaveBeenCalled());
    const [data] = Embed.newEmbed.mock.calls[0];
    expect(data.allow_tool_calling).toBe(false);
    expect(data).not.toHaveProperty("allowed_skill_hashes");
  });

  it("토글 ON + hr-attendance 선택 → CSV로 전송", async () => {
    const { container } = render(<NewEmbedModal closeModal={vi.fn()} />);
    fireEvent.click(getToolCallingToggle(container));
    await waitFor(() => screen.getByText("HR 근태 조회"));

    fireEvent.click(screen.getByLabelText(/HR 근태 조회/));

    submitForm(container);
    await waitFor(() => expect(Embed.newEmbed).toHaveBeenCalled());

    const [data] = Embed.newEmbed.mock.calls[0];
    expect(data.allow_tool_calling).toBe(true);
    expect(data.allowed_skill_hashes).toBe("hr-attendance");
  });

  it("토글 ON + 미선택 → allow_tool_calling=true, allowed_skill_hashes=null", async () => {
    const { container } = render(<NewEmbedModal closeModal={vi.fn()} />);
    fireEvent.click(getToolCallingToggle(container));
    await waitFor(() => screen.getByText("HR 근태 조회"));

    submitForm(container);
    await waitFor(() => expect(Embed.newEmbed).toHaveBeenCalled());

    const [data] = Embed.newEmbed.mock.calls[0];
    expect(data.allow_tool_calling).toBe(true);
    expect(data.allowed_skill_hashes).toBeNull();
  });

  it("AllowedSkillsMultiSelect는 토글 OFF 시 렌더되지 않는다", () => {
    render(<NewEmbedModal closeModal={vi.fn()} />);
    expect(screen.queryByText("HR 근태 조회")).not.toBeInTheDocument();
    expect(
      screen.queryByText("허용할 HR 스킬을 선택하세요")
    ).not.toBeInTheDocument();
  });
});
