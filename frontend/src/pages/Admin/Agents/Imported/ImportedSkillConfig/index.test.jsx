/**
 * ImportedSkillConfig — Skill Settings (metadata) section
 *
 * Feature: hr-skill-web-search-toggle-ui (2026-04-25)
 *
 * - F1: metadata 부재 skill은 Skill Settings 섹션 미표시
 * - F2: metadata.enable_web_search=true → 토글 체크 + hint 표시
 * - F3: 토글 클릭 → updatePluginConfig 호출 (partial metadata payload)
 * - F4: API 실패 시 optimistic rollback + error toast
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ImportedSkillConfig from "./index";

vi.mock("@/models/system", () => ({
  default: {
    experimentalFeatures: {
      agentPlugins: {
        toggleFeature: vi.fn().mockResolvedValue(true),
        updatePluginConfig: vi.fn().mockResolvedValue(true),
        deletePlugin: vi.fn().mockResolvedValue(true),
      },
    },
  },
}));

vi.mock("@/utils/toast", () => ({ default: vi.fn() }));

import System from "@/models/system";
import showToast from "@/utils/toast";

const baseSkill = {
  hubId: "hr-personnel-search",
  name: "HR 인사 직원 검색",
  description: "직원 검색",
  author: "teamplgpt",
  author_url: "",
  active: true,
};

describe("ImportedSkillConfig — SkillMetadataSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // F1 ----------------------------------------------------------------
  it("F1: metadata 부재 skill은 Skill Settings 섹션 미표시", () => {
    render(
      <ImportedSkillConfig
        selectedSkill={baseSkill}
        setImportedSkills={vi.fn()}
      />
    );
    expect(
      screen.queryByTestId("skill-metadata-section")
    ).not.toBeInTheDocument();
  });

  // F2 ----------------------------------------------------------------
  it("F2: metadata.enable_web_search=true 시 토글 체크 + hint 표시", () => {
    const skill = {
      ...baseSkill,
      metadata: { enable_web_search: true },
    };
    render(
      <ImportedSkillConfig selectedSkill={skill} setImportedSkills={vi.fn()} />
    );

    expect(screen.getByTestId("skill-metadata-section")).toBeInTheDocument();
    expect(
      screen.getByText(/웹 검색 \(web_search_preview\)/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/저명도 지역에서 대학 목록이 부족하거나/)
    ).toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: "enable_web_search" });
    expect(toggle).toBeChecked();
  });

  // F3 ----------------------------------------------------------------
  it("F3: 토글 클릭 → updatePluginConfig 호출 with partial metadata payload", async () => {
    const skill = {
      ...baseSkill,
      metadata: { enable_web_search: true },
    };
    const setImportedSkills = vi.fn();

    render(
      <ImportedSkillConfig
        selectedSkill={skill}
        setImportedSkills={setImportedSkills}
      />
    );

    const toggle = screen.getByRole("checkbox", { name: "enable_web_search" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(
        System.experimentalFeatures.agentPlugins.updatePluginConfig
      ).toHaveBeenCalledWith("hr-personnel-search", {
        metadata: { enable_web_search: false },
      });
    });

    await waitFor(() => {
      expect(setImportedSkills).toHaveBeenCalled();
    });
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("disabled"),
      "success",
      expect.any(Object)
    );
  });

  // F4 ----------------------------------------------------------------
  it("F4: API 실패 시 optimistic rollback + error toast", async () => {
    System.experimentalFeatures.agentPlugins.updatePluginConfig.mockResolvedValueOnce(
      false
    );

    const skill = {
      ...baseSkill,
      metadata: { enable_web_search: true },
    };

    render(
      <ImportedSkillConfig
        selectedSkill={skill}
        setImportedSkills={vi.fn()}
      />
    );

    const toggle = screen.getByRole("checkbox", { name: "enable_web_search" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update"),
        "error",
        expect.any(Object)
      );
    });

    // rollback — 토글 다시 체크 상태
    const toggleAfter = screen.getByRole("checkbox", {
      name: "enable_web_search",
    });
    expect(toggleAfter).toBeChecked();
  });

  // F5 (bonus) --------------------------------------------------------
  it("F5: 비-boolean metadata 값은 'Non-boolean — edit via plugin.json' 표시", () => {
    const skill = {
      ...baseSkill,
      metadata: { some_string_key: "not-editable" },
    };
    render(
      <ImportedSkillConfig selectedSkill={skill} setImportedSkills={vi.fn()} />
    );

    expect(
      screen.getByText(/Non-boolean — edit via plugin\.json/)
    ).toBeInTheDocument();
  });
});
