import { useState, useEffect } from "react";
import System from "@/models/system";
import { useTranslation } from "react-i18next";

export default function MoonshotAiOptions({ settings }) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(settings?.MoonshotAiApiKey);
  const [moonshotAiKey, setMoonshotAiKey] = useState(
    settings?.MoonshotAiApiKey
  );

  return (
    <div className="flex gap-[36px] mt-1.5">
      <div className="flex flex-col w-72">
        <label className="text-white text-sm font-semibold block mb-3">
          {t("llm.providers.api_key")}
        </label>
        <input
          type="password"
          name="MoonshotAiApiKey"
          className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
          placeholder="Moonshot AI API Key"
          defaultValue={settings?.MoonshotAiApiKey ? "*".repeat(20) : ""}
          required={true}
          autoComplete="new-password"
          spellCheck={false}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => setMoonshotAiKey(inputValue)}
        />
      </div>
      {!settings?.credentialsOnly && (
        <MoonshotAiModelSelection settings={settings} apiKey={moonshotAiKey} />
      )}
    </div>
  );
}

function MoonshotAiModelSelection({ apiKey, settings }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    async function findCustomModels() {
      setLoading(true);
      const { models: availableModels } = await System.customModels(
        "moonshotai",
        typeof apiKey === "boolean" ? null : apiKey
      );

      if (availableModels?.length > 0) {
        setModels(availableModels);
      }

      setLoading(false);
    }
    findCustomModels();
  }, [apiKey]);

  if (!apiKey) {
    return (
      <div className="flex flex-col w-72">
        <label className="text-white text-sm font-semibold block mb-3">
          {t("llm.providers.chat_model_selection")}
        </label>
        <select
          name="MoonshotAiModelPref"
          disabled={true}
          className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
        >
          <option disabled={true} selected={true}>
            -- {t("llm.providers.enter_api_key")} --
          </option>
        </select>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col w-72">
        <label className="text-white text-sm font-semibold block mb-3">
          {t("llm.providers.chat_model_selection")}
        </label>
        <select
          name="MoonshotAiModelPref"
          disabled={true}
          className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
        >
          <option disabled={true} selected={true}>
            -- {t("llm.providers.loading_models")} --
          </option>
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-72">
      <label className="text-white text-sm font-semibold block mb-3">
        Chat Model Selection
      </label>
      <select
        name="MoonshotAiModelPref"
        required={true}
        className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
      >
        {models.map((model) => (
          <option
            key={model.id}
            value={model.id}
            selected={settings?.MoonshotAiModelPref === model.id}
          >
            {model.id}
          </option>
        ))}
      </select>
    </div>
  );
}
