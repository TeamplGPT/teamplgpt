import System from "@/models/system";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function CometApiLLMOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-start gap-[36px] mt-1.5">
        <div className="flex flex-col w-72">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            CometAPI {t("llm.providers.api_key")}
          </label>
          <input
            type="password"
            name="CometApiLLMApiKey"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="CometAPI API Key"
            defaultValue={settings?.CometApiLLMApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
        {!settings?.credentialsOnly && (
          <CometApiModelSelection settings={settings} />
        )}
      </div>
      <AdvancedControls settings={settings} />
    </div>
  );
}

function AdvancedControls({ settings }) {
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => setShowAdvancedControls(!showAdvancedControls)}
          className="border-none text-theme-text-primary hover:text-theme-text-secondary flex items-center text-sm"
        >
          {showAdvancedControls
            ? t("llm.providers.hide_advanced_settings")
            : t("llm.providers.show_advanced_settings")}
          {showAdvancedControls ? (
            <CaretUp size={14} className="ml-1" />
          ) : (
            <CaretDown size={14} className="ml-1" />
          )}
        </button>
      </div>
      <div hidden={!showAdvancedControls}>
        <div className="flex flex-col w-72">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            {t("llm.providers.stream_timeout")}
          </label>
          <input
            type="number"
            name="CometApiLLMTimeout"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder={t("llm.providers.stream_timeout_description")}
            defaultValue={settings?.CometApiLLMTimeout ?? 3_000}
            autoComplete="off"
            onScroll={(e) => e.target.blur()}
            min={500}
            step={1}
          />
          <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
            {t("llm.providers.stream_timeout_description")}
          </p>
        </div>
      </div>
    </div>
  );
}

function CometApiModelSelection({ settings }) {
  // TODO: For now, CometAPI models list is noisy; show a flat, deduped list without grouping.
  // Revisit after CometAPI model list API provides better categorization/metadata.
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    async function findCustomModels() {
      setLoading(true);
      const { models: fetched = [] } = await System.customModels("cometapi");
      if (fetched?.length > 0) {
        // De-duplicate by id (case-insensitive) and sort by name for readability
        const seen = new Set();
        const unique = [];
        for (const m of fetched) {
          const key = String(m.id || m.name || "").toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(m);
          }
        }
        unique.sort((a, b) =>
          String(a.name || a.id).localeCompare(String(b.name || b.id))
        );
        setModels(unique);
      } else {
        setModels([]);
      }
      setLoading(false);
    }
    findCustomModels();
  }, []);

  if (loading || models.length === 0) {
    return (
      <div className="flex flex-col w-72">
        <label className="text-theme-text-primary text-sm font-semibold block mb-3">
          {t("llm.providers.chat_model_selection")}
        </label>
        <input
          type="text"
          name="CometApiLLMModelPref"
          className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg block w-full p-2.5"
          placeholder={`-- ${t("llm.providers.loading_models")} --`}
          disabled
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-72">
      <label className="text-theme-text-primary text-sm font-semibold block mb-3">
        {t("llm.providers.chat_model_selection")}
      </label>
      <input
        type="text"
        name="CometApiLLMModelPref"
        list="cometapi-models-list"
        required
        className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg block w-full p-2.5"
        placeholder="Type or select a model"
        defaultValue={settings?.CometApiLLMModelPref || ""}
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id="cometapi-models-list">
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </datalist>
      <p className="text-xs leading-[18px] font-base text-theme-text-primary text-opacity-60 mt-2">
        You can type the model id directly or pick from suggestions.
      </p>
    </div>
  );
}
