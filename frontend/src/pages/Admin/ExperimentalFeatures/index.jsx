import { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Admin from "@/models/admin";
import { FullScreenLoader } from "@/components/Preloader";
import { CaretRight, Flask } from "@phosphor-icons/react";
import { configurableFeatures } from "./features";
import ModalWrapper from "@/components/ModalWrapper";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { useTranslation, Trans } from "react-i18next";

export default function ExperimentalFeatures() {
  const { t } = useTranslation();
  const [featureFlags, setFeatureFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedFeature, setSelectedFeature] = useState(
    "experimental_live_file_sync"
  );

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      const { settings } = await Admin.systemPreferences();
      setFeatureFlags(settings?.feature_flags ?? {});
      setLoading(false);
    }
    fetchSettings();
  }, []);

  const refresh = async () => {
    const { settings } = await Admin.systemPreferences();
    setFeatureFlags(settings?.feature_flags ?? {});
  };

  if (loading) {
    return (
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] w-full h-full flex justify-center items-center"
      >
        <FullScreenLoader />
      </div>
    );
  }

  return (
    <FeatureLayout>
      <div className="flex-1 flex gap-x-6 p-4 mt-10">
        {/* Feature settings nav */}
        <div className="flex flex-col gap-y-[18px]">
          <div className="text-white flex items-center gap-x-2">
            <Flask size={24} />
            <p className="text-lg font-medium">
              {t("experimental_features.title")}
            </p>
          </div>
          {/* Feature list */}
          <FeatureList
            features={configurableFeatures}
            selectedFeature={selectedFeature}
            handleClick={setSelectedFeature}
            activeFeatures={Object.keys(featureFlags).filter(
              (flag) => featureFlags[flag]
            )}
          />
        </div>

        {/* Selected feature setting panel */}
        <FeatureVerification>
          <div className="flex-[2] flex flex-col gap-y-[18px] mt-10">
            <div className="bg-theme-bg-secondary text-white rounded-xl flex-1 p-4">
              {selectedFeature ? (
                <SelectedFeatureComponent
                  feature={configurableFeatures[selectedFeature]}
                  settings={featureFlags}
                  refresh={refresh}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-white/60">
                  <Flask size={40} />
                  <p className="font-medium">
                    {t("experimental_features.select-feature")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </FeatureVerification>
      </div>
    </FeatureLayout>
  );
}

function FeatureLayout({ children }) {
  return (
    <div
      id="workspace-feature-settings-container"
      className="w-screen h-screen overflow-hidden bg-theme-bg-container flex md:mt-0 mt-6"
    >
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] w-full h-full flex"
      >
        {children}
      </div>
    </div>
  );
}

function FeatureList({
  features = [],
  selectedFeature = null,
  handleClick = null,
  activeFeatures = [],
}) {
  const { t } = useTranslation();
  if (Object.keys(features).length === 0) return null;

  return (
    <div
      className={`bg-theme-bg-secondary text-white rounded-xl ${
        isMobile ? "w-full" : "min-w-[360px] w-fit"
      }`}
    >
      {Object.entries(features).map(([feature, settings], index) => (
        <div
          key={feature}
          className={`py-3 px-4 flex items-center justify-between ${
            index === 0 ? "rounded-t-xl" : ""
          } ${
            index === Object.keys(features).length - 1
              ? "rounded-b-xl"
              : "border-b border-white/10"
          } cursor-pointer transition-all duration-300 hover:bg-white/5 ${
            selectedFeature === feature
              ? "bg-white/10 light:bg-theme-bg-sidebar  "
              : ""
          }`}
          onClick={() => {
            if (settings?.href) window.location.replace(settings.href);
            else handleClick?.(feature);
          }}
        >
          <div className="text-sm font-light">{t(settings.title)}</div>
          <div className="flex items-center gap-x-2">
            {settings.autoEnabled ? (
              <>
                <div className="text-sm text-theme-text-secondary font-medium">
                  {t("experimental_features.on")}
                </div>
                <div className="w-[14px]" />
              </>
            ) : (
              <>
                <div className="text-sm text-theme-text-secondary font-medium">
                  {activeFeatures.includes(settings.key)
                    ? t("experimental_features.on")
                    : t("experimental_features.off")}
                </div>
                <CaretRight
                  size={14}
                  weight="bold"
                  className="text-theme-text-secondary"
                />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SelectedFeatureComponent({ feature, settings, refresh }) {
  const Component = feature?.component;
  return Component ? (
    <Component
      enabled={settings[feature.key]}
      feature={feature.key}
      onToggle={refresh}
    />
  ) : null;
}

function FeatureVerification({ children }) {
  const { t } = useTranslation();
  if (
    !window.localStorage.getItem("anythingllm_tos_experimental_feature_set")
  ) {
    function acceptTos(e) {
      e.preventDefault();

      window.localStorage.setItem(
        "anythingllm_tos_experimental_feature_set",
        "accepted"
      );
      showToast(
        t("experimental_features.terms.experimental-feature-set-enabled"),
        "success"
      );
      setTimeout(() => {
        window.location.reload();
      }, 2_500);
      return;
    }

    return (
      <>
        <ModalWrapper isOpen={true}>
          <div className="w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border overflow-hidden">
            <div className="relative p-6 border-b rounded-t border-theme-modal-border">
              <div className="flex items-center gap-2">
                <Flask size={24} className="text-theme-text-primary" />
                <h3 className="text-xl font-semibold text-white">
                  {t("experimental_features.terms.title")}
                </h3>
              </div>
            </div>
            <form onSubmit={acceptTos}>
              <div className="py-7 px-9 space-y-4 flex-col">
                <div className="w-full text-white text-md flex flex-col gap-y-4">
                  <p>
                    <Trans
                      i18nKey="experimental_features.terms.intro"
                      components={{
                        1: <b />,
                      }}
                    />
                  </p>

                  <div>
                    <p>{t("experimental_features.terms.usage_warning")}</p>
                    <ul className="list-disc ml-6 text-sm mt-2">
                      <li>{t("experimental_features.terms.warninglist1")}</li>
                      <li>{t("experimental_features.terms.warninglist2")}</li>
                      <li>{t("experimental_features.terms.warninglist3")}</li>
                      <li>{t("experimental_features.terms.warninglist4")}</li>
                      <li>{t("experimental_features.terms.warninglist5")}</li>
                      <li>{t("experimental_features.terms.warninglist6")}</li>
                    </ul>
                  </div>

                  <div>
                    <p>{t("experimental_features.terms.conditions")}</p>
                    <ul className="list-disc ml-6 text-sm mt-2">
                      <li>
                        {t("experimental_features.terms.conditionslist1")}
                      </li>
                      <li>
                        {t("experimental_features.terms.conditionslist2")}
                      </li>
                      <li>
                        {t("experimental_features.terms.conditionslist3")}
                      </li>
                      <li>
                        <Trans
                          i18nKey="experimental_features.terms.conditionslist4"
                          components={{
                            1: <b />,
                          }}
                        />
                      </li>
                      <li>
                        {t("experimental_features.terms.conditionslist5")}
                      </li>
                    </ul>
                  </div>

                  <p>
                    <p>
                      {/* 🔥 CHANGED: 링크가 포함된 텍스트를 Trans로 처리 */}
                      <Trans
                        i18nKey="experimental_features.terms.access_more_info"
                        components={{
                          1: (
                            <a
                              href="https://docs.anythingllm.com/beta-preview/overview"
                              className="underline text-blue-500"
                            />
                          ),
                          2: (
                            <a
                              href="mailto:team@mintplexlabs.com"
                              className="underline text-blue-500"
                            />
                          ),
                        }}
                      />
                    </p>
                  </p>
                </div>
              </div>
              <div className="flex w-full justify-between items-center p-6 space-x-2 border-t border-theme-modal-border rounded-b">
                <a
                  href={paths.home()}
                  className="transition-all duration-300 bg-transparent text-white hover:bg-red-500/50 light:hover:bg-red-300/50 px-4 py-2 rounded-lg text-sm border border-theme-modal-border"
                >
                  {t("experimental_features.terms.reject_and_close")}
                </a>
                <button
                  type="submit"
                  className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm border border-theme-modal-border"
                >
                  {t("experimental_features.terms.i_understand")}
                </button>
              </div>
            </form>
          </div>
        </ModalWrapper>
        {children}
      </>
    );
  }
  return <>{children}</>;
}
