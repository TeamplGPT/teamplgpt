import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import useUser from "@/hooks/useUser";
import Workspace from "@/models/workspace";

export default function SharedWorkspaceToggle({ workspace, setHasChanges }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const [existingShared, setExistingShared] = useState(null);
  const [isShared, setIsShared] = useState(workspace?.isShared || false);

  useEffect(() => {
    async function checkExistingShared() {
      const shared = await Workspace.getShared();
      if (shared && shared.id !== workspace?.id) {
        setExistingShared(shared);
      }
    }
    checkExistingShared();
  }, [workspace?.id]);

  useEffect(() => {
    setIsShared(workspace?.isShared || false);
  }, [workspace?.isShared]);

  // Only show for admin users
  if (!user || user?.role !== "admin") return null;

  const isDisabled = existingShared !== null && !isShared;

  function handleToggle(e) {
    const newValue = e.target.checked;

    if (newValue && !isShared) {
      // Turning ON - confirm
      if (!window.confirm(t("general.shared.convertOnWarning"))) {
        e.preventDefault();
        return;
      }
    } else if (!newValue && isShared) {
      // Turning OFF - confirm
      if (!window.confirm(t("general.shared.convertOffWarning"))) {
        e.preventDefault();
        return;
      }
    }

    setIsShared(newValue);
    setHasChanges(true);
  }

  return (
    <div className="mt-4 mb-8">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-base leading-6 font-bold text-white">
          {t("general.shared.title")}
        </h2>
        <p className="text-xs leading-[18px] font-base text-white/60">
          {isShared
            ? t("general.shared.warning")
            : t("general.shared.toggle")}
        </p>
      </div>
      <div className="mt-2">
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="hidden" name="isShared" value={isShared ? "true" : "false"} />
          <input
            type="checkbox"
            checked={isShared}
            disabled={isDisabled}
            onChange={handleToggle}
            className="peer sr-only"
          />
          <div className="pointer-events-none peer h-6 w-11 rounded-full bg-stone-400 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:shadow-xl after:border after:border-gray-100 after:bg-white after:box-shadow-md after:transition-all after:content-[''] peer-checked:bg-lime-300 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800"></div>
          <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
            {t("general.shared.toggle")}
          </span>
        </label>
        {isDisabled && (
          <p className="mt-2 text-xs text-red-400">
            {t("general.shared.alreadyExists")}
          </p>
        )}
      </div>
    </div>
  );
}
