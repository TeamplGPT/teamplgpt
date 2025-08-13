import React, { useState } from "react";
import System from "@/models/system";
import showToast from "@/utils/toast";
import { useTranslation } from "react-i18next";

export default function YoutubeOptions() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("auto");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);

    try {
      setLoading(true);
      showToast(t("connectors.youtube.fetching_transcript"), "info", {
        clear: true,
        autoClose: false,
      });

      const { data, error } = await System.dataConnectors.youtube.transcribe({
        url: form.get("url"),
        language: form.get("language"),
      });

      if (!!error) {
        showToast(error, "error", { clear: true });
        setLoading(false);
        return;
      }

      showToast(
        t("connectors.youtube.transcription_success", {
          title: data.title,
          author: data.author,
          destination: data.destination,
        }),
        "success",
        { clear: true }
      );
      e.target.reset();
      setLoading(false);
      return;
    } catch (e) {
      console.error(e);
      showToast(e.message, "error", { clear: true });
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full">
      <div className="flex flex-col w-full px-1 md:pb-6 pb-16">
        <form className="w-full" onSubmit={handleSubmit}>
          <div className="w-full flex flex-col py-2">
            <div className="w-full flex flex-col gap-4">
              <div className="flex flex-col pr-10">
                <div className="flex flex-col gap-y-1 mb-4">
                  <label className="text-white text-sm font-bold">
                    {t("connectors.youtube.URL")}
                  </label>
                  <p className="text-xs font-normal text-theme-text-secondary">
                    {t("connectors.youtube.URL_explained_start")}
                    <a
                      href="https://support.google.com/youtube/answer/6373554"
                      rel="noreferrer"
                      target="_blank"
                      className="underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("connectors.youtube.URL_explained_link")}
                    </a>
                    {t("connectors.youtube.URL_explained_end")}
                  </p>
                </div>
                <input
                  type="url"
                  name="url"
                  className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                  placeholder="https://youtube.com/watch?v=abc123"
                  required={true}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col pr-10">
                <div className="flex flex-col gap-y-1 mb-4">
                  <label className="text-white text-sm font-bold">
                    {t("connectors.youtube.language")}
                  </label>
                  <p className="text-xs font-normal text-theme-text-secondary">
                    {t("connectors.youtube.language_explained")}
                  </p>
                </div>
                <select
                  name="language"
                  className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  <option value="auto">
                    {t("connectors.youtube.auto_detect")}
                  </option>
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                  <option value="zh">中文</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="pt">Português</option>
                  <option value="ru">Русский</option>
                  <option value="ar">العربية</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-y-2 w-full pr-10">
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full justify-center border-none px-4 py-2 rounded-lg text-dark-text light:text-white text-sm font-bold items-center flex gap-x-2 bg-theme-home-button-primary hover:bg-theme-home-button-primary-hover disabled:bg-theme-home-button-primary-hover disabled:cursor-not-allowed"
            >
              {loading
                ? t("connectors.youtube.collecting_transcript")
                : t("connectors.youtube.collect_transcript")}
            </button>
            {loading && (
              <p className="text-xs text-theme-text-secondary max-w-sm">
                {t("connectors.youtube.task_explained")}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
