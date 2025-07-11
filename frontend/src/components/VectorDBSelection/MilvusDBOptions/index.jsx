import { useTranslation } from "react-i18next";

export default function MilvusDBOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-1/2">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.milvus.dbAddress")}
          </label>
          <input
            type="text"
            name="MilvusAddress"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="http://localhost:19530"
            defaultValue={settings?.MilvusAddress}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-80">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.milvus.username")}
          </label>
          <input
            type="text"
            name="MilvusUsername"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="username"
            defaultValue={settings?.MilvusUsername}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-80">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("vector.provider.milvus.password")}
          </label>
          <input
            type="password"
            name="MilvusPassword"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="password"
            defaultValue={settings?.MilvusPassword ? "*".repeat(20) : ""}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
