import { useState } from "react";

const hint = {
  off: {
    title: "Off",
    description:
      "쿼리를 변환하지 않고 원문 그대로 벡터 검색에 사용합니다.",
  },
  rule: {
    title: "Rule-based",
    description:
      "동의어 확장, 불용어 제거, 대화 참조 해소를 규칙 기반으로 수행합니다. 추가 비용 없이 검색 품질을 개선합니다.",
  },
  llm: {
    title: "LLM-enhanced",
    description:
      "규칙 기반 처리 후 LLM이 대화 맥락을 반영하여 최종 쿼리를 생성합니다. 검색 정확도가 가장 높지만 추가 LLM 호출이 발생합니다.",
  },
};

export default function QueryRewriteMode({ workspace, setHasChanges }) {
  const [selection, setSelection] = useState(
    workspace?.queryRewriteMode ?? "off"
  );

  return (
    <div>
      <div className="flex flex-col">
        <label htmlFor="queryRewriteMode" className="block input-label">
          Query Rewrite Mode
        </label>
      </div>
      <select
        name="queryRewriteMode"
        value={selection}
        className="border-none bg-theme-settings-input-bg text-white text-sm mt-2 rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
        onChange={(e) => {
          setSelection(e.target.value);
          setHasChanges(true);
        }}
        required={true}
      >
        <option value="off">{hint.off.title}</option>
        <option value="rule">{hint.rule.title}</option>
        <option value="llm">{hint.llm.title}</option>
      </select>
      <p className="text-white text-opacity-60 text-xs font-medium py-1.5">
        {hint[selection]?.description}
      </p>
    </div>
  );
}
