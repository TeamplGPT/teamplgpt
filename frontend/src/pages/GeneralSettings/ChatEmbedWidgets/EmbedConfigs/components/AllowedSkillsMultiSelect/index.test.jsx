import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AllowedSkillsMultiSelect from "./index";

vi.mock("@/models/admin", () => ({
  default: {
    systemPreferencesByFields: vi.fn(),
  },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/utils/paths", () => ({
  default: {
    settings: {
      agentSkills: () => "/settings/agents",
    },
  },
}));

import Admin from "@/models/admin";

const mockPlugins = {
  hrAttendance: {
    active: true,
    name: "HR 근태 조회",
    hubId: "hr-attendance",
    description: "직원 근태 조회",
  },
  hrSalary: {
    active: true,
    name: "HR 급여 조회",
    hubId: "hr-salary",
  },
  hrPersonnel: {
    active: true,
    name: "HR 인사정보 조회",
    hubId: "hr-personnel",
  },
  hrPersonnelInactive: {
    active: false,
    name: "HR 인사정보 조회",
    hubId: "hr-personnel",
  },
};

function mockPluginsResponse(list) {
  Admin.systemPreferencesByFields.mockResolvedValue({
    settings: { imported_agent_skills: list },
  });
}

describe("AllowedSkillsMultiSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("로딩 중 '스킬 목록 로딩 중...'이 표시된다", () => {
    Admin.systemPreferencesByFields.mockReturnValue(new Promise(() => {}));
    render(<AllowedSkillsMultiSelect />);
    expect(screen.getByText("스킬 목록 로딩 중...")).toBeInTheDocument();
  });

  it("active=true 플러그인만 렌더된다 (비활성 필터링)", async () => {
    mockPluginsResponse([
      mockPlugins.hrAttendance,
      mockPlugins.hrSalary,
      mockPlugins.hrPersonnelInactive,
    ]);
    render(<AllowedSkillsMultiSelect />);
    await waitFor(() => {
      expect(screen.getByText("HR 근태 조회")).toBeInTheDocument();
    });
    expect(screen.getByText("HR 급여 조회")).toBeInTheDocument();
    expect(screen.queryByText("HR 인사정보 조회")).not.toBeInTheDocument();
  });

  it("defaultValue의 CSV가 초기 체크박스 상태로 복원된다", async () => {
    mockPluginsResponse([mockPlugins.hrAttendance, mockPlugins.hrSalary]);
    render(
      <AllowedSkillsMultiSelect defaultValue="hr-attendance,hr-salary" />
    );
    await waitFor(() => {
      expect(screen.getByText("HR 근태 조회")).toBeInTheDocument();
    });
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it("체크박스 토글 시 onChange에 hubId 배열이 전달된다", async () => {
    mockPluginsResponse([mockPlugins.hrAttendance, mockPlugins.hrSalary]);
    const onChange = vi.fn();
    render(<AllowedSkillsMultiSelect onChange={onChange} />);
    await waitFor(() => screen.getByText("HR 근태 조회"));

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onChange).toHaveBeenLastCalledWith(["hr-attendance"]);

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(onChange).toHaveBeenLastCalledWith(["hr-attendance", "hr-salary"]);
  });

  it("모든 체크 해제 시 onChange(null) 호출 (전체 허용 semantic)", async () => {
    mockPluginsResponse([mockPlugins.hrAttendance]);
    const onChange = vi.fn();
    render(
      <AllowedSkillsMultiSelect
        defaultValue="hr-attendance"
        onChange={onChange}
      />
    );
    await waitFor(() => screen.getByText("HR 근태 조회"));

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("선택 없음 상태에 '선택 없음 = 전체 허용' 경고박스(role=alert)가 노출된다", async () => {
    mockPluginsResponse([mockPlugins.hrAttendance]);
    render(<AllowedSkillsMultiSelect />);
    await waitFor(() => screen.getByText("HR 근태 조회"));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("선택 없음 = 전체 허용");
  });

  it("선택이 있으면 경고박스가 사라진다", async () => {
    mockPluginsResponse([mockPlugins.hrAttendance]);
    render(<AllowedSkillsMultiSelect defaultValue="hr-attendance" />);
    await waitFor(() => screen.getByText("HR 근태 조회"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("활성 플러그인 0개 + inactive 0개일 때 안내 박스가 노출된다", async () => {
    mockPluginsResponse([]);
    render(<AllowedSkillsMultiSelect />);
    await waitFor(() => {
      expect(
        screen.getByText(/활성화된 HR 스킬이 없습니다/)
      ).toBeInTheDocument();
    });
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/settings/agents");
  });

  it("DB 값에 active=false인 hubId 포함 시 'inactive' 배지와 hubId 텍스트가 노출된다", async () => {
    mockPluginsResponse([mockPlugins.hrAttendance]);
    render(
      <AllowedSkillsMultiSelect defaultValue="hr-attendance,hr-personnel" />
    );
    await waitFor(() => screen.getByText("HR 근태 조회"));

    expect(screen.getByText("hr-personnel")).toBeInTheDocument();
    expect(screen.getByText("⚠ inactive")).toBeInTheDocument();
    expect(
      screen.getByText(/inactive 배지 항목은 현재 비활성화된 스킬입니다/)
    ).toBeInTheDocument();
  });

  it("inactive hubId 체크 해제 시 onChange에서 제거된다", async () => {
    mockPluginsResponse([mockPlugins.hrAttendance]);
    const onChange = vi.fn();
    render(
      <AllowedSkillsMultiSelect
        defaultValue="hr-attendance,hr-personnel"
        onChange={onChange}
      />
    );
    await waitFor(() => screen.getByText("HR 근태 조회"));

    const inactiveCheckbox = screen
      .getByText("hr-personnel")
      .closest("label")
      .querySelector("input[type=checkbox]");
    fireEvent.click(inactiveCheckbox);

    expect(onChange).toHaveBeenLastCalledWith(["hr-attendance"]);
  });

  it("API 실패 시 에러 메시지가 노출된다", async () => {
    Admin.systemPreferencesByFields.mockRejectedValue(
      new Error("network error")
    );
    render(<AllowedSkillsMultiSelect />);
    await waitFor(() => {
      expect(
        screen.getByText(/HR 스킬 목록을 불러오지 못했습니다/)
      ).toBeInTheDocument();
    });
  });

  it("체크박스는 label for/id 쌍으로 연결되어 있다 (접근성)", async () => {
    mockPluginsResponse([mockPlugins.hrAttendance]);
    render(<AllowedSkillsMultiSelect />);
    await waitFor(() => screen.getByText("HR 근태 조회"));
    const checkbox = screen.getAllByRole("checkbox")[0];
    expect(checkbox.id).toBe("allowed-skill-hr-attendance");
    const label = checkbox.closest("label");
    expect(label.getAttribute("for")).toBe("allowed-skill-hr-attendance");
  });
});
