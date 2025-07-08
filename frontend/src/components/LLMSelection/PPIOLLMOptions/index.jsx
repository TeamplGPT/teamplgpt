import System from "@/models/system";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function PPIOLLMOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-start gap-[36px] mt-1.5">
        <div className="flex flex-col w-60">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            {t("llm.providers.api_key")}
          </label>
          <input
            type="password"
            name="PPIOApiKey"
            className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="PPIO API Key"
            defaultValue={settings?.PPIOApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
        {!settings?.credentialsOnly && (
          <PPIOModelSelection settings={settings} />
        )}
      </div>
    </div>
  );
}

function PPIOModelSelection({ settings }) {
  const [groupedModels, setGroupedModels] = useState({});
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    async function fetchModels() {
      setLoading(true);
      const { models } = await System.customModels("ppio");
      if (models?.length > 0) {
        const modelsByOrganization = models.reduce((acc, model) => {
          acc[model.organization] = acc[model.organization] || [];
          acc[model.organization].push(model);
          return acc;
        }, {});
        setGroupedModels(modelsByOrganization);
      }
      setLoading(false);
    }
    fetchModels();
  }, []);

  if (loading || Object.keys(groupedModels).length === 0) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-theme-text-primary text-sm font-semibold block mb-3">
          {t("llm.providers.chat_model_selection")}
        </label>
        <select
          name="PPIOModelPref"
          required={true}
          disabled={true}
          className="bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:ring-primary-button focus:border-primary-button block w-full p-2.5"
        >
          <option disabled={true} selected={true}>
            -- {t("llm.providers.loading_models")} --
          </option>
        </select>
        <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
          {t("llm.providers.enter_valid_api_key")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <label className="text-theme-text-primary text-sm font-semibold block mb-3">
        {t("llm.providers.chat_model_selection")}
      </label>
      <select
        name="PPIOModelPref"
        required={true}
        className="border-none bg-theme-settings-input-bg text-theme-text-primary border-theme-border text-sm rounded-lg block w-full p-2.5"
      >
        {Object.keys(groupedModels)
          .sort()
          .map((organization) => (
            <optgroup key={organization} label={organization}>
              {groupedModels[organization].map((model) => (
                <option
                  key={model.id}
                  value={model.id}
                  selected={settings?.PPIOModelPref === model.id}
                >
                  {model.name}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
    </div>
  );
}
