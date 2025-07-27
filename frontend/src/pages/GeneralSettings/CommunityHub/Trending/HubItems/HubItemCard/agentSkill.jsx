import { Link } from "react-router-dom";
import paths from "@/utils/paths";
import pluralize from "pluralize";
import { VisibilityIcon } from "./generic";
import { useTranslation } from "react-i18next";

export default function AgentSkillHubCard({ item }) {
  const { t } = useTranslation();
  return (
    <>
      <Link
        key={item.id}
        to={paths.communityHub.importItem(item.importId)}
        className="bg-black/70 light:bg-slate-100 rounded-lg p-3 hover:bg-black/60 light:hover:bg-slate-200 transition-all duration-200 cursor-pointer group border border-transparent hover:border-slate-400"
      >
        <div className="flex gap-x-2 items-center">
          <p className="text-white text-sm font-medium">{item.name}</p>
          <VisibilityIcon visibility={item.visibility} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-white/60 text-xs mt-1">{item.description}</p>

          <p className="font-mono text-xs mt-1 text-white/60">
            {item.verified ? (
              <span className="text-green-500">
                {t("community_hub.trending.verified")}
              </span>
            ) : (
              <span className="text-red-500">
                {t("community_hub.trending.unverified")}
              </span>
            )}{" "}
            {t("community_hub.trending.skill")}
          </p>
          <p className="font-mono text-xs mt-1 text-white/60">
            {t("community_hub.trending.files-found", {
              count: item.manifest.files?.length || 0,
            })}
          </p>
        </div>
        <div className="flex justify-end mt-2">
          <Link
            to={paths.communityHub.importItem(item.importId)}
            className="text-primary-button hover:text-primary-button/80 text-sm font-medium px-3 py-1.5 rounded-md bg-black/30 light:bg-slate-200 group-hover:bg-black/50 light:group-hover:bg-slate-300 transition-all"
          >
            {t("community_hub.trending.import")} →
          </Link>
        </div>
      </Link>
    </>
  );
}
