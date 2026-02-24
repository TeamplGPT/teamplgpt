import { useState } from "react";
import { useTranslation } from "react-i18next";
export default function ChatModeSelection({ workspace, setHasChanges }) {
  const [chatMode, setChatMode] = useState(workspace?.chatMode || "chat");
  const [reactMaxIterations, setReactMaxIterations] = useState(
    workspace?.reactMaxIterations ?? 5
  );
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex flex-col">
        <label htmlFor="chatMode" className="block input-label">
          {t("chat.mode.title")}
        </label>
      </div>

      <div className="flex flex-col gap-y-1 mt-2">
        <div className="w-fit flex gap-x-1 items-center p-1 rounded-lg bg-theme-settings-input-bg ">
          <input type="hidden" name="chatMode" value={chatMode} />
          <button
            type="button"
            disabled={chatMode === "chat"}
            onClick={() => {
              setChatMode("chat");
              setHasChanges(true);
            }}
            className="transition-bg duration-200 px-6 py-1 text-md text-white/60 disabled:text-white bg-transparent disabled:bg-[#687280] rounded-md"
          >
            {t("chat.mode.chat.title")}
          </button>
          <button
            type="button"
            disabled={chatMode === "query"}
            onClick={() => {
              setChatMode("query");
              setHasChanges(true);
            }}
            className="transition-bg duration-200 px-6 py-1 text-md text-white/60 disabled:text-white bg-transparent disabled:bg-[#687280] rounded-md"
          >
            {t("chat.mode.query.title")}
          </button>
          <button
            type="button"
            disabled={chatMode === "react"}
            onClick={() => {
              setChatMode("react");
              setHasChanges(true);
            }}
            className="transition-bg duration-200 px-6 py-1 text-md text-white/60 disabled:text-white bg-transparent disabled:bg-[#687280] rounded-md"
          >
            {t("chat.mode.react.title")}
          </button>
        </div>
        <p className="text-sm text-white/60">
          {chatMode === "chat" ? (
            <>
              <b>{t("chat.mode.chat.title")}</b>{" "}
              {t("chat.mode.chat.desc-start")}{" "}
              <i className="font-semibold">{t("chat.mode.chat.and")}</i>{" "}
              {t("chat.mode.chat.desc-end")}
            </>
          ) : chatMode === "query" ? (
            <>
              <b>{t("chat.mode.query.title")}</b>{" "}
              {t("chat.mode.query.desc-start")}{" "}
              <i className="font-semibold">{t("chat.mode.query.only")}</i>{" "}
              {t("chat.mode.query.desc-end")}
            </>
          ) : (
            <>
              <b>{t("chat.mode.react.title")}</b>{" "}
              {t("chat.mode.react.desc-start")}{" "}
              <i className="font-semibold">{t("chat.mode.react.search")}</i>{" "}
              {t("chat.mode.react.desc-end")}
            </>
          )}
        </p>

        {chatMode === "react" && (
          <div className="mt-4">
            <input
              type="hidden"
              name="reactMaxIterations"
              value={reactMaxIterations}
            />
            <label className="block input-label mb-1">
              {t("chat.mode.react.maxIterations.title")}
            </label>
            <p className="text-xs text-white/60 mb-2">
              {t("chat.mode.react.maxIterations.description")}
            </p>
            <input
              type="number"
              min={1}
              max={25}
              value={reactMaxIterations}
              onChange={(e) => {
                setReactMaxIterations(Number(e.target.value));
                setHasChanges(true);
              }}
              className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-[100px] p-2.5"
            />
          </div>
        )}
      </div>
    </div>
  );
}
