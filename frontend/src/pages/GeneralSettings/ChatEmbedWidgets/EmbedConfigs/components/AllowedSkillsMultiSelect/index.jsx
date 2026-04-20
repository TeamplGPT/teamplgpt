import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Admin from "@/models/admin";
import paths from "@/utils/paths";

function parseCsv(defaultValue) {
  if (!defaultValue) return [];
  return defaultValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AllowedSkillsMultiSelect({
  defaultValue = null,
  onChange,
  disabled = false,
}) {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(() => parseCsv(defaultValue));

  useEffect(() => {
    let cancelled = false;
    async function fetchPlugins() {
      try {
        const res = await Admin.systemPreferencesByFields([
          "imported_agent_skills",
        ]);
        if (cancelled) return;
        const all = res?.settings?.imported_agent_skills ?? [];
        setPlugins(all.filter((p) => p.active === true));
      } catch (e) {
        if (cancelled) return;
        setLoadError(
          "HR 스킬 목록을 불러오지 못했습니다. 페이지를 새로고침해주세요."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPlugins();
    return () => {
      cancelled = true;
    };
  }, []);

  const inactiveHubIds = selected.filter(
    (hid) => !plugins.some((p) => p.hubId === hid)
  );

  const toggle = (hubId) => {
    const next = selected.includes(hubId)
      ? selected.filter((h) => h !== hubId)
      : [...selected, hubId];
    setSelected(next);
    onChange?.(next.length === 0 ? null : next);
  };

  if (loading) {
    return (
      <p className="text-theme-text-secondary text-xs">스킬 목록 로딩 중...</p>
    );
  }

  if (loadError) {
    return <p className="text-red-400 text-xs">{loadError}</p>;
  }

  if (plugins.length === 0 && inactiveHubIds.length === 0) {
    return (
      <div className="p-3 border border-theme-modal-border rounded text-xs text-theme-text-secondary">
        활성화된 HR 스킬이 없습니다.{" "}
        <Link
          to={paths.settings.agentSkills()}
          className="underline text-white"
        >
          관리자 &gt; 에이전트 스킬
        </Link>{" "}
        페이지에서 활성화 후 다시 시도해주세요.
      </div>
    );
  }

  const isEmptySelection = selected.length === 0;

  return (
    <div className="space-y-2" aria-disabled={disabled}>
      <label className="block text-sm font-medium text-white">
        허용할 HR 스킬을 선택하세요
      </label>

      <ul className="space-y-1">
        {plugins.map((p) => {
          const checkboxId = `allowed-skill-${p.hubId}`;
          return (
            <li key={p.hubId}>
              <label
                htmlFor={checkboxId}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={selected.includes(p.hubId)}
                  onChange={() => toggle(p.hubId)}
                  disabled={disabled}
                />
                <span className="text-sm text-white">{p.name}</span>
                <code className="text-xs text-theme-text-secondary">
                  ({p.hubId})
                </code>
              </label>
            </li>
          );
        })}

        {inactiveHubIds.map((hid) => {
          const checkboxId = `allowed-skill-inactive-${hid}`;
          return (
            <li key={hid}>
              <label
                htmlFor={checkboxId}
                className="flex items-center gap-2 cursor-pointer opacity-70"
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={true}
                  onChange={() => toggle(hid)}
                  disabled={disabled}
                />
                <code className="text-xs text-theme-text-secondary">{hid}</code>
                <span className="text-xs text-yellow-400 ml-1">
                  ⚠ inactive
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {isEmptySelection && !disabled && (
        <div
          role="alert"
          className="p-2 bg-yellow-900/20 border border-yellow-600/40 rounded text-xs text-yellow-200"
        >
          ⚠ 선택 없음 = 전체 허용. 안전을 위해 최소한의 스킬만 선택하세요.
        </div>
      )}

      {inactiveHubIds.length > 0 && (
        <p className="text-xs text-theme-text-secondary">
          ⓘ inactive 배지 항목은 현재 비활성화된 스킬입니다. 체크 해제 시
          목록에서 사라지며, 다시 추가하려면 관리자 스킬 페이지에서 활성화해
          주세요.
        </p>
      )}
    </div>
  );
}
