import CommunityHubImportItemSteps from "..";
import CTAButton from "@/components/lib/CTAButton";
import { Link } from "react-router-dom";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";

export default function Completed({ settings, setSettings, setStep }) {
  const { t } = useTranslation();
  return (
    <div className="flex-[2] flex flex-col gap-y-[18px] mt-10">
      <div className="bg-theme-bg-secondary rounded-xl flex-1 p-6">
        <div className="w-full flex flex-col gap-y-2 max-w-[700px]">
          <h2 className="text-base text-theme-text-primary font-semibold">
            {t("community_hub.import.complete.title")}
          </h2>
          <div className="flex flex-col gap-y-[25px] text-theme-text-secondary text-sm">
            <p>
              {t("community_hub.import.complete.success", {
                name: settings.item.name,
                type: settings.item.itemType,
              })}
            </p>
            {settings.item.itemType === "agent-flow" && (
              <Link
                to={paths.settings.agentSkills()}
                className="text-theme-text-primary hover:text-blue-500 hover:underline"
              >
                {t("community_hub.import.complete.view_in_agent_skills", {
                  name: settings.item.name,
                })}
              </Link>
            )}
            <p>
              {t("community_hub.import.complete.changes_not_reflected", {
                type: settings.item.itemType,
              })}
            </p>
          </div>
          <CTAButton
            className="text-dark-text w-full mt-[18px] h-[34px] hover:bg-accent"
            onClick={() => {
              setSettings({ item: null, itemId: null });
              setStep(CommunityHubImportItemSteps.itemId.key);
            }}
          >
            {t("community_hub.import.complete.import_another")}
          </CTAButton>
        </div>
      </div>
    </div>
  );
}
