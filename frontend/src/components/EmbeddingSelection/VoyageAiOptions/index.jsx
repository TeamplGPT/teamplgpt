import { useTranslation } from "react-i18next";

export default function VoyageAiOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <div className="w-full flex flex-col gap-y-4">
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-80">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("embedding.providers.api_key")}
          </label>
          <input
            type="password"
            name="VoyageAiApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Voyage AI API Key"
            defaultValue={settings?.VoyageAiApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-80">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("embedding.providers.model_preference")}
          </label>
          <select
            name="EmbeddingModelPref"
            required={true}
            defaultValue={settings?.EmbeddingModelPref}
            className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
          >
            <optgroup
              label={t("embedding.providers.available_embedding_models")}
            >
              {[
                "voyage-large-2-instruct",
                "voyage-finance-2",
                "voyage-multilingual-2",
                "voyage-law-2",
                "voyage-code-2",
                "voyage-large-2",
                "voyage-2",
                "voyage-3",
                "voyage-3-lite",
                "voyage-3-large",
                "voyage-code-3",
              ].map((model) => {
                return (
                  <option key={model} value={model}>
                    {model}
                  </option>
                );
              })}
            </optgroup>
          </select>
        </div>
      </div>
    </div>
  );
}
