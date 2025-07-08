import React, { useEffect, useState } from "react";
import System from "@/models/system";
import PreLoader from "@/components/Preloader";
import { OLLAMA_COMMON_URLS } from "@/utils/constants";
import { CaretDown, CaretUp, Info } from "@phosphor-icons/react";
import useProviderEndpointAutoDiscovery from "@/hooks/useProviderEndpointAutoDiscovery";
import { Tooltip } from "react-tooltip";
import { useTranslation } from "react-i18next";

export default function OllamaLLMOptions({ settings }) {
  const { t } = useTranslation();

  const {
    autoDetecting: loading,
    basePath,
    basePathValue,
    authToken,
    authTokenValue,
    showAdvancedControls,
    setShowAdvancedControls,
    handleAutoDetectClick,
  } = useProviderEndpointAutoDiscovery({
    provider: "ollama",
    initialBasePath: settings?.OllamaLLMBasePath,
    ENDPOINTS: OLLAMA_COMMON_URLS,
  });
  const [performanceMode, setPerformanceMode] = useState(
    settings?.OllamaLLMPerformanceMode || "base"
  );
  const [maxTokens, setMaxTokens] = useState(
    settings?.OllamaLLMTokenLimit || 4096
  );

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-start gap-[36px] mt-1.5">
        <OllamaLLMModelSelection
          settings={settings}
          basePath={basePath.value}
          authToken={authToken.value}
        />
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-2">
            {t("llm.providers.ollama.model_token_limit")}
          </label>
          <input
            type="number"
            name="OllamaLLMTokenLimit"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="4096"
            defaultChecked="4096"
            min={1}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            onScroll={(e) => e.target.blur()}
            required={true}
            autoComplete="off"
          />
          <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
            {t("llm.providers.ollama.model_token_limit_description")}
          </p>
        </div>
      </div>
      <div className="flex justify-start mt-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowAdvancedControls(!showAdvancedControls);
          }}
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
        <div className="flex flex-col">
          <div className="w-full flex items-start gap-4">
            <div className="flex flex-col w-60">
              <div className="flex justify-between items-center mb-2">
                <label className="text-white text-sm font-semibold">
                  Ollama {t("llm.providers.base_url")}
                </label>
                {loading ? (
                  <PreLoader size="6" />
                ) : (
                  <>
                    {!basePathValue.value && (
                      <button
                        onClick={handleAutoDetectClick}
                        className="bg-primary-button text-xs font-medium px-2 py-1 rounded-lg hover:bg-secondary hover:text-white shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
                      >
                        {t("llm.providers.auto_detect")}
                      </button>
                    )}
                  </>
                )}
              </div>
              <input
                type="url"
                name="OllamaLLMBasePath"
                className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder="http://127.0.0.1:11434"
                value={basePathValue.value}
                required={true}
                autoComplete="off"
                spellCheck={false}
                onChange={basePath.onChange}
                onBlur={basePath.onBlur}
              />
              <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
                {t("llm.providers.ollama.base_url_description")}
              </p>
            </div>
            <div className="flex flex-col w-60">
              <label className="text-white text-sm font-semibold mb-2 flex items-center">
                {t("llm.providers.ollama.performance_mode")}
                <Info
                  size={16}
                  className="ml-2 text-white"
                  data-tooltip-id="performance-mode-tooltip"
                />
              </label>
              <select
                name="OllamaLLMPerformanceMode"
                required={true}
                className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
                value={performanceMode}
                onChange={(e) => setPerformanceMode(e.target.value)}
              >
                <option value="base">
                  {t("llm.providers.ollama.base_mode")}
                </option>
                <option value="maximum">
                  {t("llm.providers.ollama.maximum_mode")}
                </option>
              </select>
              <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
                {t("llm.providers.ollama.performance_mode_description")}
              </p>
              <Tooltip
                id="performance-mode-tooltip"
                place="bottom"
                className="tooltip !text-xs max-w-xs"
              >
                <p className="text-red-500">
                  <strong>{t("llm.providers.ollama.note")}</strong>{" "}
                  {t("llm.providers.ollama.note_description")}
                </p>
                <br />
                <p>
                  <strong>{t("llm.providers.ollama.base_mode")}:</strong>{" "}
                  {t("llm.providers.ollama.base_mode_description")}
                </p>
                <br />
                <p>
                  <strong>{t("llm.providers.ollama.maximum_mode")}:</strong>{" "}
                  <span
                    dangerouslySetInnerHTML={{
                      __html: t(
                        "llm.providers.ollama.maximum_mode_description"
                      ),
                    }}
                  />
                </p>
              </Tooltip>
            </div>
            <div className="flex flex-col w-60">
              <label className="text-white text-sm font-semibold block mb-2">
                {t("llm.providers.ollama.keep_alive")}
              </label>
              <select
                name="OllamaLLMKeepAliveSeconds"
                required={true}
                className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
                defaultValue={settings?.OllamaLLMKeepAliveSeconds ?? "300"}
              >
                <option value="0">{t("llm.providers.ollama.no_cache")}</option>
                <option value="300">
                  {t("llm.providers.ollama.five_minutes")}
                </option>
                <option value="3600">
                  {t("llm.providers.ollama.one_hour")}
                </option>
                <option value="-1">{t("llm.providers.ollama.forever")}</option>
              </select>
              <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
                {t("llm.providers.ollama.keep_alive_description")}
                <a
                  className="underline text-blue-300"
                  href="https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-keep-a-model-loaded-in-memory-or-make-it-unload-immediately"
                  target="_blank"
                  rel="noreferrer"
                >
                  {" "}
                  {t("llm.providers.ollama.learn_more")} &rarr;
                </a>
              </p>
            </div>
          </div>
          <div className="w-full flex items-start gap-4">
            <div className="flex flex-col w-100">
              <label className="text-white text-sm font-semibold">
                {t("llm.providers.ollama.auth_token")}
              </label>
              <div className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
                <div
                  dangerouslySetInnerHTML={{
                    __html: t("llm.providers.ollama.auth_token_description"),
                  }}
                />
                <div
                  className="mt-1"
                  dangerouslySetInnerHTML={{
                    __html: t("llm.providers.ollama.auth_token_description_2"),
                  }}
                />
              </div>
              <input
                type="password"
                name="OllamaLLMAuthToken"
                className="border-none bg-theme-settings-input-bg mt-2 text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg outline-none block w-full p-2.5"
                placeholder="Ollama Auth Token"
                defaultValue={
                  settings?.OllamaLLMAuthToken ? "*".repeat(20) : ""
                }
                value={authTokenValue.value}
                onChange={authToken.onChange}
                onBlur={authToken.onBlur}
                required={false}
                autoComplete="new-password"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OllamaLLMModelSelection({
  settings,
  basePath = null,
  authToken = null,
}) {
  const [customModels, setCustomModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    async function findCustomModels() {
      if (!basePath) {
        setCustomModels([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { models } = await System.customModels(
          "ollama",
          authToken,
          basePath
        );
        setCustomModels(models || []);
      } catch (error) {
        console.error("Failed to fetch custom models:", error);
        setCustomModels([]);
      }
      setLoading(false);
    }
    findCustomModels();
  }, [basePath, authToken]);

  if (loading || customModels.length == 0) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-white text-sm font-semibold block mb-2">
          {t("llm.providers.ollama.model")}
        </label>
        <select
          name="OllamaLLMModelPref"
          disabled={true}
          className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
        >
          <option disabled={true} selected={true}>
            {!!basePath
              ? t("llm.providers.loading_available_models")
              : t("llm.providers.ollama.enter_ollama_url_first")}
          </option>
        </select>
        <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
          {t("llm.providers.ollama.model_description")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-60">
      <label className="text-white text-sm font-semibold block mb-2">
        {t("llm.providers.ollama.model")}
      </label>
      <select
        name="OllamaLLMModelPref"
        required={true}
        className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
      >
        {customModels.length > 0 && (
          <optgroup label="Your loaded models">
            {customModels.map((model) => {
              return (
                <option
                  key={model.id}
                  value={model.id}
                  selected={settings.OllamaLLMModelPref === model.id}
                >
                  {model.id}
                </option>
              );
            })}
          </optgroup>
        )}
      </select>
      <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
        {t("llm.providers.ollama.model_description_2")}
      </p>
    </div>
  );
}
