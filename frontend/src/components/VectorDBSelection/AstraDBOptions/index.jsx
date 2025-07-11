import { useTranslation } from "react-i18next";

export default function AstraDBOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-96">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.astra.endpoint")}
          </label>
          <input
            type="url"
            name="AstraDBEndpoint"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Astra DB API endpoint"
            defaultValue={settings?.AstraDBEndpoint}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col w-96">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.astra.applicationToken")}
          </label>
          <input
            type="password"
            name="AstraDBApplicationToken"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="AstraCS:..."
            defaultValue={
              settings?.AstraDBApplicationToken ? "*".repeat(20) : ""
            }
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
