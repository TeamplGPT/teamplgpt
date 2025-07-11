import { useTranslation } from "react-i18next";

export default function ChromaDBOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-1/2">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.chroma.endpoint")}
          </label>
          <input
            type="url"
            name="ChromaEndpoint"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="http://localhost:8000"
            defaultValue={settings?.ChromaEndpoint}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-96">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.chroma.apiHeader")}
          </label>
          <input
            name="ChromaApiHeader"
            autoComplete="off"
            type="text"
            defaultValue={settings?.ChromaApiHeader}
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="X-Api-Key"
          />
        </div>

        <div className="flex flex-col w-96">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.apiKey")}
          </label>
          <input
            name="ChromaApiKey"
            type="password"
            defaultValue={settings?.ChromaApiKey ? "*".repeat(20) : ""}
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="sk-myApiKeyToAccessMyChromaInstance"
            autoComplete="new-password"
          />
        </div>
      </div>
    </div>
  );
}
