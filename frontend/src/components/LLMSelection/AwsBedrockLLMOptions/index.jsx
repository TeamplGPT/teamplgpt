import { ArrowSquareOut, Info } from "@phosphor-icons/react";
import { AWS_REGIONS } from "./regions";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function AwsBedrockLLMOptions({ settings }) {
  const { t } = useTranslation();
  const [connectionMethod, setConnectionMethod] = useState(
    settings?.AwsBedrockLLMConnectionMethod ?? "iam"
  );

  console.log("connectionMethod", connectionMethod);
  return (
    <div className="w-full flex flex-col">
      {!settings?.credentialsOnly && (
        <div className="flex flex-col md:flex-row md:items-center gap-x-2 text-white mb-4 bg-blue-800/30 w-fit rounded-lg px-4 py-2">
          <div className="gap-x-2 flex items-center">
            <Info size={40} />
            <p className="text-base">
              {t("llm.providers.bedrock.alert")}
              <br />
              <a
                href="https://docs.anythingllm.com/setup/llm-configuration/cloud/aws-bedrock"
                target="_blank"
                rel="noreferrer"
                className="underline flex gap-x-1 items-center"
              >
                {t("llm.providers.bedrock.read_more")}
                <ArrowSquareOut size={14} />
              </a>
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-y-2 mb-2">
        <input
          type="hidden"
          name="AwsBedrockLLMConnectionMethod"
          value={connectionMethod}
        />
        <div className="flex flex-col w-full">
          <label className="text-theme-text-primary text-sm font-semibold block mb-3">
            {t("llm.providers.bedrock.use_session_token")}
          </label>
          <p className="text-theme-text-secondary text-sm">
            {t("llm.providers.bedrock.select_method")}
          </p>
        </div>
        <select
          name="AwsBedrockLLMConnectionMethod"
          value={connectionMethod}
          required={true}
          onChange={(e) => setConnectionMethod(e.target.value)}
          className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-fit p-2.5"
        >
          <option value="iam">
            {t("llm.providers.bedrock.iam_explicit_credentials")}
          </option>
          <option value="sessionToken">
            {t("llm.providers.bedrock.session_token")}
          </option>
          <option value="iam_role">
            {t("llm.providers.bedrock.iam_role")}
          </option>
        </select>
      </div>

      <div className="w-full flex items-center gap-[36px] my-1.5">
        {["iam", "sessionToken"].includes(connectionMethod) && (
          <>
            <div className="flex flex-col w-60">
              <label className="text-white text-sm font-semibold block mb-3">
                {t("llm.providers.bedrock.iam_access_id")}
              </label>
              <input
                type="password"
                name="AwsBedrockLLMAccessKeyId"
                className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder="AWS Bedrock IAM User Access ID"
                defaultValue={
                  settings?.AwsBedrockLLMAccessKeyId ? "*".repeat(20) : ""
                }
                required={true}
                autoComplete="new-password"
                spellCheck={false}
              />
            </div>
            <div className="flex flex-col w-60">
              <label className="text-white text-sm font-semibold block mb-3">
                {t("llm.providers.bedrock.iam_access_key")}
              </label>
              <input
                type="password"
                name="AwsBedrockLLMAccessKey"
                className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder="AWS Bedrock IAM User Access Key"
                defaultValue={
                  settings?.AwsBedrockLLMAccessKey ? "*".repeat(20) : ""
                }
                required={true}
                autoComplete="new-password"
                spellCheck={false}
              />
            </div>
          </>
        )}
        {connectionMethod === "sessionToken" && (
          <div className="flex flex-col w-60">
            <label className="text-theme-text-primary text-sm font-semibold block mb-3">
              {t("llm.providers.bedrock.session_token")}
            </label>
            <input
              type="password"
              name="AwsBedrockLLMSessionToken"
              className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
              placeholder={t("llm.providers.bedrock.session_token_placeholder")}
              defaultValue={
                settings?.AwsBedrockLLMSessionToken ? "*".repeat(20) : ""
              }
              required={true}
              autoComplete="new-password"
              spellCheck={false}
            />
          </div>
        )}
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("llm.providers.bedrock.aws_region")}
          </label>
          <select
            name="AwsBedrockLLMRegion"
            defaultValue={settings?.AwsBedrockLLMRegion || "us-west-2"}
            required={true}
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
          >
            {AWS_REGIONS.map((region) => {
              return (
                <option key={region.code} value={region.code}>
                  {region.name} ({region.code})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="w-full flex items-center gap-[36px] my-1.5">
        {!settings?.credentialsOnly && (
          <>
            <div className="flex flex-col w-60">
              <label className="text-white text-sm font-semibold block mb-3">
                {t("llm.providers.bedrock.model_id")}
              </label>
              <input
                type="text"
                name="AwsBedrockLLMModel"
                className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder={t("llm.providers.bedrock.model_id_placeholder")}
                defaultValue={settings?.AwsBedrockLLMModel}
                required={true}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="flex flex-col w-60">
              <label className="text-white text-sm font-semibold block mb-3">
                {t("llm.providers.bedrock.model_context_window")}
              </label>
              <input
                type="number"
                name="AwsBedrockLLMTokenLimit"
                className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder={t(
                  "llm.providers.bedrock.model_context_window_placeholder"
                )}
                min={1}
                onScroll={(e) => e.target.blur()}
                defaultValue={settings?.AwsBedrockLLMTokenLimit}
                required={true}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col w-60">
              <label className="text-white text-sm font-semibold block mb-3">
                {t("llm.providers.bedrock.model_max_output_tokens")}
              </label>
              <input
                type="number"
                name="AwsBedrockLLMMaxOutputTokens"
                className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                placeholder={t(
                  "llm.providers.bedrock.model_max_output_tokens_placeholder"
                )}
                min={1}
                onScroll={(e) => e.target.blur()}
                defaultValue={settings?.AwsBedrockLLMMaxOutputTokens}
                required={true}
                autoComplete="off"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
