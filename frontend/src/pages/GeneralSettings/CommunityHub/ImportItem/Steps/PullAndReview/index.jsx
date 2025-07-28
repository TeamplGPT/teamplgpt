import CommunityHub from "@/models/communityHub";
import CommunityHubImportItemSteps from "..";
import CTAButton from "@/components/lib/CTAButton";
import { useEffect, useState } from "react";
import HubItemComponent from "./HubItem";
import { useTranslation } from "react-i18next";

function useGetCommunityHubItem({ importId, updateSettings }) {
  const { t } = useTranslation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchItem() {
      if (!importId) return;
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const { error, item } = await CommunityHub.getItemFromImportId(importId);
      if (error) setError(error);
      setItem(item);
      updateSettings((prev) => ({ ...prev, item }));
      setLoading(false);
    }
    fetchItem();
  }, [importId]);

  return { item, loading, error };
}

export default function PullAndReview({ settings, setSettings, setStep }) {
  const { t } = useTranslation();
  const { item, loading, error } = useGetCommunityHubItem({
    importId: settings.itemId,
    updateSettings: setSettings,
  });
  const ItemComponent =
    HubItemComponent[item?.itemType] || HubItemComponent["unknown"];

  return (
    <div className="flex-[2] flex flex-col gap-y-[18px] mt-10">
      <div className="bg-theme-bg-secondary rounded-xl flex-1 p-6">
        <div className="w-full flex flex-col gap-y-2 max-w-[700px]">
          <h2 className="text-base text-theme-text-primary font-semibold">
            {t("community_hub.import.review.title")}
          </h2>

          {loading && (
            <div className="flex h-[200px] min-w-[746px] rounded-lg animate-pulse">
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-sm text-theme-text-secondary">
                  {t("community_hub.import.review.pulling")}
                </p>
              </div>
            </div>
          )}
          {!loading && error && (
            <>
              <div className="flex flex-col gap-y-2 mt-8">
                <p className="text-red-500">
                  {t("community_hub.import.review.error")}
                </p>
                <p className="text-red-500/80 text-sm font-mono">{error}</p>
              </div>
              <CTAButton
                className="text-dark-text w-full mt-[18px] h-[34px] hover:bg-accent"
                onClick={() => {
                  setSettings({ itemId: null, item: null });
                  setStep(CommunityHubImportItemSteps.itemId.key);
                }}
              >
                {t("community_hub.import.review.try_again")}
              </CTAButton>
            </>
          )}
          {!loading && !error && item && (
            <ItemComponent
              item={item}
              settings={settings}
              setSettings={setSettings}
              setStep={setStep}
            />
          )}
        </div>
      </div>
    </div>
  );
}
