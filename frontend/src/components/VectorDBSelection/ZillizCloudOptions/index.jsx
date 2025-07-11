import { useTranslation } from "react-i18next";

export default function ZillizCloudOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-4">
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-80">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.zilliz.clusterEndpoint")}
          </label>
          <input
            type="text"
            name="ZillizEndpoint"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="https://sample.api.gcp-us-west1.zillizcloud.com"
            defaultValue={settings?.ZillizEndpoint}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col w-80">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.zilliz.apiToken")}
          </label>
          <input
            type="password"
            name="ZillizApiToken"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Zilliz cluster API Token"
            defaultValue={settings?.ZillizApiToken ? "*".repeat(20) : ""}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
