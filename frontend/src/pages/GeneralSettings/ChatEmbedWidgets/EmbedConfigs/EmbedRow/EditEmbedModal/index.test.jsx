import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditEmbedModal from "./index";

vi.mock("@/models/embed", () => ({
  default: { updateEmbed: vi.fn().mockResolvedValue({ success: true }) },
}));

vi.mock("@/models/admin", () => ({
  default: { systemPreferencesByFields: vi.fn() },
}));

vi.mock("@/models/workspace", () => ({
  default: { all: vi.fn().mockResolvedValue([{ id: 1, name: "HR" }]) },
}));

vi.mock("@/utils/toast", () => ({ default: vi.fn() }));

vi.mock("@/utils/request", () => ({
  safeJsonParse: (s, d) => {
    try {
      return JSON.parse(s);
    } catch {
      return d;
    }
  },
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

function mockApi() {
  Admin.systemPreferencesByFields.mockResolvedValue({
    settings: { imported_agent_skills: mockActivePlugins },
  });
}

const baseEmbed = {
  id: 12,
  workspace: { id: 1 },
  chat_mode: "query",
  allowlist_domains: null,
  max_chats_per_day: 100,
  max_chats_per_session: 50,
  message_limit: 20,
  allow_model_override: false,
  allow_temperature_override: false,
  allow_prompt_override: false,
  allow_tool_calling: false,
  allowed_skill_hashes: null,
};

function getToolCallingToggle(container) {
  return container.querySelector('input[name="allow_tool_calling"]');
}

function submitForm(container) {
  fireEvent.submit(container.querySelector("form"));
}

describe("EditEmbedModal — Option B 3-state submission matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it("토글 OFF로 저장 시 allowed_skill_hashes 키를 전송하지 않는다 (DB preserve)", async () => {
    const { container } = render(
      <EditEmbedModal embed={baseEmbed} closeModal={vi.fn()} />
    );
    submitForm(container);
    await waitFor(() => expect(Embed.updateEmbed).toHaveBeenCalled());
    const [, data] = Embed.updateEmbed.mock.calls[0];
    expect(data.allow_tool_calling).toBe(false);
    expect(data).not.toHaveProperty("allowed_skill_hashes");
  });

  it("토글 ON + 미선택 → allow_tool_calling=true, allowed_skill_hashes=null", async () => {
    const { container } = render(
      <EditEmbedModal embed={baseEmbed} closeModal={vi.fn()} />
    );
    fireEvent.click(getToolCallingToggle(container));
    await waitFor(() => screen.getByText("HR 근태 조회"));

    submitForm(container);
    await waitFor(() => expect(Embed.updateEmbed).toHaveBeenCalled());

    const [, data] = Embed.updateEmbed.mock.calls[0];
    expect(data.allow_tool_calling).toBe(true);
    expect(data.allowed_skill_hashes).toBeNull();
  });

  it("토글 ON + 선택 2개 → allow_tool_calling=true, allowed_skill_hashes=CSV", async () => {
    const { container } = render(
      <EditEmbedModal embed={baseEmbed} closeModal={vi.fn()} />
    );
    fireEvent.click(getToolCallingToggle(container));
    await waitFor(() => screen.getByText("HR 근태 조회"));

    fireEvent.click(screen.getByLabelText(/HR 근태 조회/));
    fireEvent.click(screen.getByLabelText(/HR 급여 조회/));

    submitForm(container);
    await waitFor(() => expect(Embed.updateEmbed).toHaveBeenCalled());

    const [, data] = Embed.updateEmbed.mock.calls[0];
    expect(data.allow_tool_calling).toBe(true);
    expect(data.allowed_skill_hashes).toBe("hr-attendance,hr-salary");
  });

  it("DB allowed_skill_hashes='hr-attendance' → 초기 체크박스 복원", async () => {
    const embed = {
      ...baseEmbed,
      allow_tool_calling: true,
      allowed_skill_hashes: "hr-attendance",
    };
    render(<EditEmbedModal embed={embed} closeModal={vi.fn()} />);
    await waitFor(() => screen.getByText("HR 근태 조회"));
    expect(screen.getByLabelText(/HR 근태 조회/)).toBeChecked();
    expect(screen.getByLabelText(/HR 급여 조회/)).not.toBeChecked();
  });

  it("ON+선택 → 토글 OFF로 전환 후 저장 시 allowed_skill_hashes 키 미전송 (preserve)", async () => {
    const embed = {
      ...baseEmbed,
      allow_tool_calling: true,
      allowed_skill_hashes: "hr-attendance",
    };
    const { container } = render(
      <EditEmbedModal embed={embed} closeModal={vi.fn()} />
    );
    await waitFor(() => screen.getByText("HR 근태 조회"));

    fireEvent.click(getToolCallingToggle(container));
    submitForm(container);
    await waitFor(() => expect(Embed.updateEmbed).toHaveBeenCalled());

    const [, data] = Embed.updateEmbed.mock.calls[0];
    expect(data.allow_tool_calling).toBe(false);
    expect(data).not.toHaveProperty("allowed_skill_hashes");
  });

  it("embed.id가 updateEmbed 첫 인자로 전달된다", async () => {
    const { container } = render(
      <EditEmbedModal embed={baseEmbed} closeModal={vi.fn()} />
    );
    submitForm(container);
    await waitFor(() => expect(Embed.updateEmbed).toHaveBeenCalled());
    const [id] = Embed.updateEmbed.mock.calls[0];
    expect(id).toBe(12);
  });

  it("DB에 inactive hubId 포함 시 배지 노출 + 저장 시 값 preserve", async () => {
    const embed = {
      ...baseEmbed,
      allow_tool_calling: true,
      allowed_skill_hashes: "hr-attendance,hr-personnel",
    };
    const { container } = render(
      <EditEmbedModal embed={embed} closeModal={vi.fn()} />
    );
    await waitFor(() => screen.getByText("HR 근태 조회"));

    expect(screen.getByText("hr-personnel")).toBeInTheDocument();
    expect(screen.getByText("⚠ inactive")).toBeInTheDocument();

    submitForm(container);
    await waitFor(() => expect(Embed.updateEmbed).toHaveBeenCalled());
    const [, data] = Embed.updateEmbed.mock.calls[0];
    expect(data.allowed_skill_hashes).toBe("hr-attendance,hr-personnel");
  });

  it("기존 7 필드 회귀 — allow_prompt_override 토글 동작 유지", async () => {
    const { container } = render(
      <EditEmbedModal embed={baseEmbed} closeModal={vi.fn()} />
    );
    const promptToggle = container.querySelector(
      'input[name="allow_prompt_override"]'
    );
    fireEvent.click(promptToggle);

    submitForm(container);
    await waitFor(() => expect(Embed.updateEmbed).toHaveBeenCalled());
    const [, data] = Embed.updateEmbed.mock.calls[0];
    expect(data.allow_prompt_override).toBe(true);
  });
});
