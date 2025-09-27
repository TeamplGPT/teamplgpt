import { useTranslation } from "react-i18next";

export default function ChromaCloudOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-72">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.apiKey")}
          </label>
          <input
            type="password"
            name="ChromaCloudApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="ck-your-api-key-here"
            defaultValue={settings?.ChromaCloudApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col w-72">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.chromacloud.tenantId")}
          </label>
          <input
            name="ChromaCloudTenant"
            autoComplete="off"
            type="text"
            defaultValue={settings?.ChromaCloudTenant}
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="your-tenant-id-here"
            required={true}
          />
        </div>
      </div>

      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-72">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.chromacloud.databaseName")}
          </label>
          <input
            name="ChromaCloudDatabase"
            autoComplete="off"
            type="text"
            defaultValue={settings?.ChromaCloudDatabase}
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="your-database-name"
            required={true}
          />
        </div>
      </div>
    </div>
  );
}
