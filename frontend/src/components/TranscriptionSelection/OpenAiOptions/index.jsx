import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function OpenAiWhisperOptions({ settings }) {
  const [inputValue, setInputValue] = useState(settings?.OpenAiKey);
  const [_openAIKey, setOpenAIKey] = useState(settings?.OpenAiKey);
  const { t } = useTranslation();

  return (
    <div className="flex gap-x-7 gap-[36px] mt-1.5">
      <div className="flex flex-col w-80">
        <label className="text-white text-sm font-semibold block mb-3">
          {t("transcription.api_key")}
        </label>
        <input
          type="password"
          name="OpenAiKey"
          className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
          placeholder="OpenAI API Key"
          defaultValue={settings?.OpenAiKey ? "*".repeat(20) : ""}
          required={true}
          autoComplete="new-password"
          spellCheck={false}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => setOpenAIKey(inputValue)}
        />
      </div>
      <div className="flex flex-col w-80">
        <label className="text-white text-sm font-semibold block mb-3">
          {t("transcription.providers.openai.whisper_model")}
        </label>
        <select
          disabled={true}
          className="border-none flex-shrink-0 bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
        >
          <option disabled={true} selected={true}>
            Whisper Large
          </option>
        </select>
      </div>
    </div>
  );
}
