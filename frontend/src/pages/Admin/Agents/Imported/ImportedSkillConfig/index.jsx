import System from "@/models/system";
import showToast from "@/utils/toast";
import { Gear, Plug } from "@phosphor-icons/react";
import { useEffect, useState, useRef } from "react";
import { sentenceCase } from "text-case";

// `sentenceCase` drops non-Latin characters (e.g. "HR 인사 직원 검색" → "Hr").
// Preserve raw name when any non-ASCII character is present.
function displayName(name = "") {
  if (typeof name !== "string" || !name) return name;
  return /[^\x00-\x7F]/.test(name) ? name : sentenceCase(name);
}

/**
 * Converts setup_args to inputs for the form builder
 * @param {object} setupArgs - The setup arguments object
 * @returns {object} - The inputs object
 */
function inputsFromArgs(setupArgs) {
  if (
    !setupArgs ||
    setupArgs.constructor?.call?.().toString() !== "[object Object]"
  ) {
    return {};
  }
  return Object.entries(setupArgs).reduce(
    (acc, [key, props]) => ({
      ...acc,
      [key]: props.hasOwnProperty("value")
        ? props.value
        : props?.input?.default || "",
    }),
    {}
  );
}

/**
 * Imported skill config component for imported skills only.
 * @returns {JSX.Element}
 */
export default function ImportedSkillConfig({
  selectedSkill, // imported skill config object
  setImportedSkills, // function to set imported skills since config is file-write
}) {
  const [config, setConfig] = useState(selectedSkill);
  const [hasChanges, setHasChanges] = useState(false);
  const [inputs, setInputs] = useState(
    inputsFromArgs(selectedSkill?.setup_args)
  );
  const [metadata, setMetadata] = useState(selectedSkill?.metadata || {});

  const hasSetupArgs =
    selectedSkill?.setup_args &&
    Object.keys(selectedSkill.setup_args).length > 0;
  const hasMetadata =
    selectedSkill?.metadata &&
    Object.keys(selectedSkill.metadata).length > 0;

  async function updateMetadata(key, value) {
    const prevMetadata = { ...metadata };
    const newMetadata = { ...metadata, [key]: value };

    setMetadata(newMetadata);
    setConfig({ ...config, metadata: newMetadata });

    const success =
      await System.experimentalFeatures.agentPlugins.updatePluginConfig(
        config.hubId,
        { metadata: { [key]: value } }
      );

    if (!success) {
      setMetadata(prevMetadata);
      setConfig({ ...config, metadata: prevMetadata });
      showToast(`Failed to update ${key}.`, "error", { clear: true });
      return;
    }

    setImportedSkills((prev) =>
      prev.map((s) =>
        s.hubId === config.hubId ? { ...s, metadata: newMetadata } : s
      )
    );
    showToast(
      `${key} ${value ? "enabled" : "disabled"}.`,
      "success",
      { clear: true }
    );
  }

  async function toggleSkill() {
    const updatedConfig = { ...selectedSkill, active: !config.active };
    await System.experimentalFeatures.agentPlugins.updatePluginConfig(
      config.hubId,
      { active: !config.active }
    );
    setImportedSkills((prev) =>
      prev.map((s) => (s.hubId === config.hubId ? updatedConfig : s))
    );
    setConfig(updatedConfig);
    showToast(
      `Skill ${updatedConfig.active ? "activated" : "deactivated"}.`,
      "success",
      { clear: true }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = [];
    const updatedConfig = { ...config };

    for (const [key, value] of Object.entries(inputs)) {
      const settings = config.setup_args[key];
      if (settings.required && !value) {
        errors.push(`${key} is required to have a value.`);
        continue;
      }
      if (typeof value !== settings.type) {
        errors.push(`${key} must be of type ${settings.type}.`);
        continue;
      }
      updatedConfig.setup_args[key].value = value;
    }

    if (errors.length > 0) {
      errors.forEach((error) => showToast(error, "error"));
      return;
    }

    await System.experimentalFeatures.agentPlugins.updatePluginConfig(
      config.hubId,
      updatedConfig
    );
    setConfig(updatedConfig);
    setImportedSkills((prev) =>
      prev.map((skill) =>
        skill.hubId === config.hubId ? updatedConfig : skill
      )
    );
    showToast("Skill config updated successfully.", "success");
    setHasChanges(false);
  }

  useEffect(() => {
    setHasChanges(
      JSON.stringify(inputs) !==
        JSON.stringify(inputsFromArgs(selectedSkill.setup_args))
    );
  }, [inputs]);

  return (
    <>
      <div className="p-2">
        <div className="flex flex-col gap-y-[18px] max-w-[500px]">
          <div className="flex items-center gap-x-2">
            <Plug size={24} weight="bold" className="text-white" />
            <label htmlFor="name" className="text-white text-md font-bold">
              {displayName(config.name)}
            </label>
            <label className="border-none relative inline-flex items-center ml-auto cursor-pointer">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={config.active}
                onChange={() => toggleSkill()}
              />
              <div className="peer-disabled:opacity-50 pointer-events-none peer h-6 w-11 rounded-full bg-[#CFCFD0] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border-none after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-[#32D583] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-transparent"></div>
              <span className="ml-3 text-sm font-medium"></span>
            </label>
            <ManageSkillMenu
              config={config}
              setImportedSkills={setImportedSkills}
            />
          </div>
          <p className="text-white text-opacity-60 text-xs font-medium py-1.5">
            {config.description} by{" "}
            <a
              href={config.author_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:underline"
            >
              {config.author}
            </a>
          </p>

          {hasSetupArgs ? (
            <div className="flex flex-col gap-y-2">
              {Object.entries(config.setup_args).map(([key, props]) => (
                <div key={key} className="flex flex-col gap-y-1">
                  <label htmlFor={key} className="text-white text-sm font-bold">
                    {key}
                  </label>
                  <input
                    type={props?.input?.type || "text"}
                    required={props?.input?.required}
                    defaultValue={
                      props.hasOwnProperty("value")
                        ? props.value
                        : props?.input?.default || ""
                    }
                    onChange={(e) =>
                      setInputs({ ...inputs, [key]: e.target.value })
                    }
                    placeholder={props?.input?.placeholder || ""}
                    className="border-solid bg-transparent border border-white light:border-black rounded-md p-2 text-white text-sm"
                  />
                  <p className="text-white text-opacity-60 text-xs font-medium py-1.5">
                    {props?.input?.hint}
                  </p>
                </div>
              ))}
              {hasChanges && (
                <button
                  onClick={handleSubmit}
                  type="button"
                  className="bg-blue-500 text-white light:text-white rounded-md p-2"
                >
                  Save
                </button>
              )}
            </div>
          ) : (
            !hasMetadata && (
              <p className="text-white text-opacity-60 text-sm font-medium py-1.5">
                There are no options to modify for this skill.
              </p>
            )
          )}

          {hasMetadata && (
            <SkillMetadataSection
              metadata={metadata}
              onChange={updateMetadata}
            />
          )}
        </div>
      </div>
    </>
  );
}

const METADATA_LABELS = {
  enable_web_search: {
    title: "웹 검색 (web_search_preview)",
    hint: "끄면 LLM 자체 지식만 사용합니다. 저명도 지역에서 대학 목록이 부족하거나 폐교/통합 정보가 부정확할 수 있습니다.",
  },
};

function SkillMetadataSection({ metadata, onChange }) {
  return (
    <div
      data-testid="skill-metadata-section"
      className="flex flex-col gap-y-3 pt-4 mt-2 border-t border-white/10"
    >
      <label className="text-white text-sm font-bold">Skill Settings</label>
      {Object.entries(metadata).map(([key, value]) => {
        if (typeof value !== "boolean") {
          return (
            <div
              key={key}
              className="flex items-center justify-between"
              data-testid={`metadata-row-${key}`}
            >
              <span className="text-white text-sm">{key}</span>
              <span className="text-white/50 text-xs">
                Non-boolean — edit via plugin.json
              </span>
            </div>
          );
        }
        const meta = METADATA_LABELS[key];
        return (
          <div
            key={key}
            className="flex flex-col gap-y-1"
            data-testid={`metadata-row-${key}`}
          >
            <div className="flex items-center justify-between">
              <label className="text-white text-sm">{meta?.title || key}</label>
              <label className="border-none relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={value}
                  onChange={(e) => onChange(key, e.target.checked)}
                  aria-label={key}
                />
                <div className="peer-disabled:opacity-50 pointer-events-none peer h-6 w-11 rounded-full bg-[#CFCFD0] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border-none after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-[#32D583] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-transparent"></div>
              </label>
            </div>
            {meta?.hint && (
              <p className="text-white text-opacity-60 text-xs font-medium">
                {meta.hint}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ManageSkillMenu({ config, setImportedSkills }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  async function deleteSkill() {
    if (
      !window.confirm(
        "Are you sure you want to delete this skill? This action cannot be undone."
      )
    )
      return;
    const success = await System.experimentalFeatures.agentPlugins.deletePlugin(
      config.hubId
    );
    if (success) {
      setImportedSkills((prev) => prev.filter((s) => s.hubId !== config.hubId));
      showToast("Skill deleted successfully.", "success");
      setOpen(false);
    } else {
      showToast("Failed to delete skill.", "error");
    }
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (!config.hubId) return null;
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg text-white hover:bg-theme-action-menu-item-hover transition-colors duration-300"
      >
        <Gear className="h-5 w-5" weight="bold" />
      </button>
      {open && (
        <div className="absolute w-[100px] -top-1 left-7 mt-1 border-[1.5px] border-white/40 rounded-lg bg-theme-action-menu-bg flex flex-col shadow-[0_4px_14px_rgba(0,0,0,0.25)] text-white z-99 md:z-10">
          <button
            type="button"
            onClick={deleteSkill}
            className="border-none flex items-center rounded-lg gap-x-2 hover:bg-theme-action-menu-item-hover py-1.5 px-2 transition-colors duration-200 w-full text-left"
          >
            <span className="text-sm">Delete Skill</span>
          </button>
        </div>
      )}
    </div>
  );
}
