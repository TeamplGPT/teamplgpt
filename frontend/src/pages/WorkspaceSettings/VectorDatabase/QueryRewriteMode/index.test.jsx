import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QueryRewriteMode from "./index";

describe("QueryRewriteMode", () => {
  const mockSetHasChanges = vi.fn();

  // ─── 단위 테스트: 렌더링 ─────────────────────────────────

  it("라벨 'Query Rewrite Mode'가 렌더링된다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "off" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    expect(screen.getByText("Query Rewrite Mode")).toBeDefined();
  });

  it("3개 옵션(Off, Rule-based, LLM-enhanced)이 모두 존재한다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "off" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    const select = screen.getByRole("combobox");
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(3);
    expect(options[0].value).toBe("off");
    expect(options[1].value).toBe("rule");
    expect(options[2].value).toBe("llm");
  });

  it("select의 name 속성이 'queryRewriteMode'이다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "off" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    const select = screen.getByRole("combobox");
    expect(select.getAttribute("name")).toBe("queryRewriteMode");
  });

  // ─── 단위 테스트: 기본값 ─────────────────────────────────

  it("workspace.queryRewriteMode 값이 초기 선택으로 반영된다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "rule" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    const select = screen.getByRole("combobox");
    expect(select.value).toBe("rule");
  });

  it("workspace.queryRewriteMode가 없으면 'off'가 기본값이다", () => {
    render(
      <QueryRewriteMode
        workspace={{}}
        setHasChanges={mockSetHasChanges}
      />
    );
    const select = screen.getByRole("combobox");
    expect(select.value).toBe("off");
  });

  it("workspace가 null이어도 'off'가 기본값이다", () => {
    render(
      <QueryRewriteMode
        workspace={null}
        setHasChanges={mockSetHasChanges}
      />
    );
    const select = screen.getByRole("combobox");
    expect(select.value).toBe("off");
  });

  // ─── 단위 테스트: 힌트 텍스트 ────────────────────────────

  it("off 선택 시 올바른 힌트가 표시된다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "off" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    expect(
      screen.getByText(/원문 그대로 벡터 검색에 사용합니다/)
    ).toBeDefined();
  });

  it("rule 선택 시 올바른 힌트가 표시된다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "rule" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    expect(
      screen.getByText(/동의어 확장, 불용어 제거/)
    ).toBeDefined();
  });

  it("llm 선택 시 올바른 힌트가 표시된다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "llm" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    expect(
      screen.getByText(/추가 LLM 호출이 발생합니다/)
    ).toBeDefined();
  });

  // ─── 통합 테스트: 사용자 인터랙션 ────────────────────────

  it("옵션 변경 시 setHasChanges(true)가 호출된다", () => {
    mockSetHasChanges.mockClear();
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "off" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "rule" } });
    expect(mockSetHasChanges).toHaveBeenCalledWith(true);
  });

  it("옵션 변경 시 select 값이 업데이트된다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "off" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "llm" } });
    expect(select.value).toBe("llm");
  });

  it("옵션 변경 시 힌트 텍스트가 업데이트된다", () => {
    render(
      <QueryRewriteMode
        workspace={{ queryRewriteMode: "off" }}
        setHasChanges={mockSetHasChanges}
      />
    );
    // 초기 힌트: off
    expect(
      screen.getByText(/원문 그대로 벡터 검색에 사용합니다/)
    ).toBeDefined();

    // rule로 변경
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "rule" } });
    expect(
      screen.getByText(/동의어 확장, 불용어 제거/)
    ).toBeDefined();
  });

  // ─── 통합 테스트: FormData 호환성 ────────────────────────

  it("form 내에서 FormData로 queryRewriteMode 값을 수집할 수 있다", () => {
    const { container } = render(
      <form>
        <QueryRewriteMode
          workspace={{ queryRewriteMode: "rule" }}
          setHasChanges={mockSetHasChanges}
        />
      </form>
    );
    const form = container.querySelector("form");
    const formData = new FormData(form);
    expect(formData.get("queryRewriteMode")).toBe("rule");
  });

  it("옵션 변경 후 FormData에 새 값이 반영된다", () => {
    const { container } = render(
      <form>
        <QueryRewriteMode
          workspace={{ queryRewriteMode: "off" }}
          setHasChanges={mockSetHasChanges}
        />
      </form>
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "llm" } });

    const form = container.querySelector("form");
    const formData = new FormData(form);
    expect(formData.get("queryRewriteMode")).toBe("llm");
  });
});
