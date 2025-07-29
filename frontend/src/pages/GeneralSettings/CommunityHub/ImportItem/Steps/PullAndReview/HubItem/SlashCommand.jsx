import CTAButton from "@/components/lib/CTAButton";
import CommunityHubImportItemSteps from "../..";
import showToast from "@/utils/toast";
import paths from "@/utils/paths";
import CommunityHub from "@/models/communityHub";
import { Trans, useTranslation } from "react-i18next";

export default function SlashCommand({ item, setStep }) {
  const { t } = useTranslation();

  async function handleSubmit() {
    try {
      const { error } = await CommunityHub.applyItem(item.importId);
      if (error) throw new Error(error);
      showToast(
        t("community_hub.import.review.slash_command.success", {
          command: item.command,
        }),
        "success"
      );
      setStep(CommunityHubImportItemSteps.completed.key);
    } catch (e) {
      console.error(e);
      showToast(
        t(
          `community_hub.import.review.slash_command.errors.${e.errorCode || "UNKNOWN"}`,
          { error: e.message }
        ),
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col mt-4 gap-y-4">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-base text-theme-text-primary font-semibold">
          {t("community_hub.import.review.slash_command.title")} "{item.name}"
        </h2>
        {item.creatorUsername && (
          <p className="text-white/60 text-xs font-mono">
            {t("community_hub.import.review.slash_command.creator")}{" "}
            <a
              href={paths.communityHub.profile(item.creatorUsername)}
              target="_blank"
              className="hover:text-blue-500 hover:underline"
              rel="noreferrer"
            >
              @{item.creatorUsername}
            </a>
          </p>
        )}
      </div>
      <div className="flex flex-col gap-y-[25px] text-white/80 light:text-theme-text-secondary text-sm">
        <p>
          {t("community_hub.import.review.slash_command.description")}
          <br />
          <br />
          <Trans
            i18nKey="community_hub.import.review.slash_command.description_2"
            values={{ command: item.command }}
            components={{
              code: (
                <code className="font-mono bg-zinc-900 light:bg-slate-200 px-1 py-0.5 rounded-md text-sm" />
              ),
            }}
          />
        </p>

        <div className="flex flex-col gap-y-2 mt-2">
          <div className="w-full text-theme-text-primary text-md gap-x-2 flex items-center">
            <p className="text-white/60 light:text-theme-text-secondary w-fit font-mono bg-zinc-900 light:bg-slate-200 px-2 py-1 rounded-md text-sm whitespace-pre-line">
              {item.command}
            </p>
          </div>

          <div className="w-full text-theme-text-primary text-md flex flex-col gap-y-2">
            <p className="text-white/60 light:text-theme-text-secondary font-mono bg-zinc-900 light:bg-slate-200 p-4 rounded-md text-sm whitespace-pre-line max-h-[calc(200px)] overflow-y-auto">
              {item.prompt}
            </p>
          </div>
        </div>
      </div>
      <CTAButton
        className="text-dark-text w-full mt-[18px] h-[34px] hover:bg-accent"
        onClick={handleSubmit}
      >
        {t("community_hub.import.review.slash_command.import")}
      </CTAButton>
    </div>
  );
}
