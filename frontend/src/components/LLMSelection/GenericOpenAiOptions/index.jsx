import { useTranslation } from "react-i18next";

export default function GenericOpenAiOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-y-7">
      <div className="flex gap-[36px] mt-1.5 flex-wrap">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("llm.providers.base_url")}
          </label>
          <input
            type="url"
            name="GenericOpenAiBasePath"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="eg: https://proxy.openai.com"
            defaultValue={settings?.GenericOpenAiBasePath}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("llm.providers.api_key")}
          </label>
          <input
            type="password"
            name="GenericOpenAiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Generic service API Key"
            defaultValue={settings?.GenericOpenAiKey ? "*".repeat(20) : ""}
            required={false}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("llm.providers.generic_openai.chat_model_name")}
          </label>
          <input
            type="text"
            name="GenericOpenAiModelPref"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder={t(
              "llm.providers.generic_openai.model_id_used_for_chat_requests"
            )}
            defaultValue={settings?.GenericOpenAiModelPref}
            required={true}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex gap-[36px] flex-wrap">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("llm.providers.token_context_window")}
          </label>
          <input
            type="number"
            name="GenericOpenAiTokenLimit"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder={t("llm.providers.token_context_window_placeholder")}
            min={1}
            onScroll={(e) => e.target.blur()}
            defaultValue={settings?.GenericOpenAiTokenLimit}
            required={true}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("llm.providers.max_tokens")}
          </label>
          <input
            type="number"
            name="GenericOpenAiMaxTokens"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder={t(
              "llm.providers.generic_openai.max_tokens_per_request_placeholder"
            )}
            min={1}
            defaultValue={settings?.GenericOpenAiMaxTokens || 1024}
            required={true}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}
