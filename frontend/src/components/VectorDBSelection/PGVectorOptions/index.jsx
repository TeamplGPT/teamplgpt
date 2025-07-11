import { Info } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import { useTranslation } from "react-i18next";

export default function PGVectorOptions({ settings }) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-center gap-[36px] mt-1.5">
        <div className="flex flex-col w-96">
          <div className="flex items-center gap-x-1 mb-3">
            <label className="text-white text-sm font-semibold block">
              {t("vector.provider.pgvector.connectionString")}
            </label>
            <Info
              size={16}
              className="text-theme-text-secondary cursor-pointer"
              data-tooltip-id="pgvector-connection-string-tooltip"
              data-tooltip-place="right"
            />
            <Tooltip
              delayHide={300}
              id="pgvector-connection-string-tooltip"
              className="max-w-md z-99"
              clickable={true}
            >
              <p className="text-md whitespace-pre-line break-words">
                <span
                  dangerouslySetInnerHTML={{
                    __html: t("vector.provider.pgvector.tooltip.intro"),
                  }}
                />
                <br />
                <br />
                {t("vector.provider.pgvector.tooltip.permissions")}
                <ul className="list-disc list-inside">
                  <li>{t("vector.provider.pgvector.tooltip.permission_db")}</li>
                  <li>
                    {t("vector.provider.pgvector.tooltip.permission_schema")}
                  </li>
                  <li>
                    {t("vector.provider.pgvector.tooltip.permission_create")}
                  </li>
                </ul>
                <br />
                <b>{t("vector.provider.pgvector.tooltip.pgvector")}</b>
              </p>
            </Tooltip>
          </div>
          <input
            type="text"
            name="PGVectorConnectionString"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="postgresql://username:password@host:port/database"
            defaultValue={
              settings?.PGVectorConnectionString ? "*".repeat(20) : ""
            }
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col w-80">
          <div className="flex items-center gap-x-1 mb-3">
            <label className="text-white text-sm font-semibold block">
              {t("vector.provider.pgvector.tableName")}
            </label>
            <Info
              size={16}
              className="text-theme-text-secondary cursor-pointer"
              data-tooltip-id="pgvector-table-name-tooltip"
              data-tooltip-place="right"
            />
            <Tooltip
              delayHide={300}
              id="pgvector-table-name-tooltip"
              className="max-w-md z-99"
              clickable={true}
            >
              <p className="text-md whitespace-pre-line break-words">
                {t("vector.provider.pgvector.tooltip.desc_1")}
                <br />
                <br />
                <span
                  dangerouslySetInnerHTML={{
                    __html: t("vector.provider.pgvector.tooltip.desc_2"),
                  }}
                />
                <br />
                <br />
                <b>{t("vector.provider.pgvector.tooltip.desc_3")}</b>
              </p>
            </Tooltip>
          </div>
          <input
            type="text"
            name="PGVectorTableName"
            autoComplete="off"
            defaultValue={settings?.PGVectorTableName}
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="vector_table"
          />
        </div>
      </div>
    </div>
  );
}
