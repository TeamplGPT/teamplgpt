import { useTranslation } from "react-i18next";

export default function WeaviateDBOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-96">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.weaviate.endpoint")}
          </label>
          <input
            type="url"
            name="WeaviateEndpoint"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="http://localhost:8080"
            defaultValue={settings?.WeaviateEndpoint}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col w-96">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.apiKey")}
          </label>
          <input
            type="password"
            name="WeaviateApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="sk-123Abcweaviate"
            defaultValue={settings?.WeaviateApiKey}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
