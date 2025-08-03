import System from "@/models/system";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function LiveSyncToggle({ enabled = false, onToggle }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(enabled);

  async function toggleFeatureFlag() {
    const updated =
      await System.experimentalFeatures.liveSync.toggleFeature(!status);
    if (!updated) {
      showToast(
        t("experimental_features.live-document-sync.failed-to-update-status"),
        "error",
        {
          clear: true,
        }
      );
      return false;
    }

    setStatus(!status);
    showToast(
      t(
        !status
          ? "experimental_features.live-document-sync.toggle-enabled"
          : "experimental_features.live-document-sync.toggle-disabled"
      ),
      "success",
      { clear: true }
    );
    onToggle();
  }

  return (
    <div className="p-4">
      <div className="flex flex-col gap-y-6 max-w-[500px]">
        <div className="flex items-center justify-between">
          <h2 className="text-theme-text-primary text-md font-bold">
            {t("experimental_features.live-document-sync.title")}
          </h2>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              onClick={toggleFeatureFlag}
              checked={status}
              className="peer sr-only pointer-events-none"
            />
            <div className="peer-disabled:opacity-50 pointer-events-none peer h-6 w-11 rounded-full bg-[#CFCFD0] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border-none after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-[#32D583] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-transparent"></div>
          </label>
        </div>
        <div className="flex flex-col space-y-4">
          <p className="text-theme-text-secondary text-sm">
            {t("experimental_features.live-document-sync.description")}
          </p>
          <p className="text-theme-text-secondary text-sm">
            {t("experimental_features.live-document-sync.description2")}
          </p>
          <p className="text-theme-text-secondary text-xs italic">
            {t("experimental_features.live-document-sync.description3")}
          </p>
        </div>
      </div>
      <div className="mt-8">
        <ul className="space-y-2">
          <li>
            <a
              href="https://docs.anythingllm.com/beta-preview/active-features/live-document-sync"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-400 light:text-blue-500 hover:underline flex items-center gap-x-1"
            >
              <ArrowSquareOut size={14} />
              <span>
                {t("experimental_features.live-document-sync.read-warning")}
              </span>
            </a>
          </li>
          <li>
            <Link
              to={paths.experimental.liveDocumentSync.manage()}
              className="text-sm text-blue-400 light:text-blue-500 hover:underline"
            >
              {t(
                "experimental_features.live-document-sync.manage-watched-documents"
              )}
              &rarr;
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
