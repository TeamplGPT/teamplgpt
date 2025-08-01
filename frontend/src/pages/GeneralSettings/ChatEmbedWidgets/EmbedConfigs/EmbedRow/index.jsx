import { useRef, useState } from "react";
import { DotsThreeOutline } from "@phosphor-icons/react";
import showToast from "@/utils/toast";
import { useModal } from "@/hooks/useModal";
import ModalWrapper from "@/components/ModalWrapper";
import Embed from "@/models/embed";
import paths from "@/utils/paths";
import { nFormatter } from "@/utils/numbers";
import EditEmbedModal from "./EditEmbedModal";
import CodeSnippetModal from "./CodeSnippetModal";
import moment from "moment";
import { useTranslation } from "react-i18next";

export default function EmbedRow({ embed }) {
  const { t } = useTranslation();
  const rowRef = useRef(null);
  const [enabled, setEnabled] = useState(Number(embed.enabled) === 1);
  const {
    isOpen: isSettingsOpen,
    openModal: openSettingsModal,
    closeModal: closeSettingsModal,
  } = useModal();
  const {
    isOpen: isSnippetOpen,
    openModal: openSnippetModal,
    closeModal: closeSnippetModal,
  } = useModal();

  const handleSuspend = async () => {
    if (!window.confirm(t("embeddable.disable_confirm"))) return false;

    const { success, error } = await Embed.updateEmbed(embed.id, {
      enabled: !enabled,
    });
    if (!success) showToast(error, "error", { clear: true });
    if (success) {
      showToast(
        t(enabled ? "embeddable.disable_success" : "embeddable.enable_success"),
        "success",
        { clear: true }
      );
      setEnabled(!enabled);
    }
  };
  const handleDelete = async () => {
    if (!window.confirm(t("embeddable.delete_confirm"))) return false;
    const { success, error } = await Embed.deleteEmbed(embed.id);
    if (!success) showToast(error, "error", { clear: true });
    if (success) {
      rowRef?.current?.remove();
      showToast(t("embeddable.delete_success"), "success", { clear: true });
    }
  };

  return (
    <>
      <tr
        ref={rowRef}
        className="bg-transparent text-white text-opacity-80 text-xs font-medium border-b border-white/10 h-10"
      >
        <th
          scope="row"
          className="px-6 whitespace-nowrap flex item-center gap-x-1"
        >
          <a
            href={paths.workspace.chat(embed.workspace.slug)}
            target="_blank"
            rel="noreferrer"
            className="text-white flex items-center hover:underline"
          >
            {embed.workspace.name}
          </a>
        </th>
        <th scope="row" className="px-6 whitespace-nowrap">
          {nFormatter(embed._count.embed_chats)}
        </th>
        <th scope="row" className="px-6 whitespace-nowrap">
          <ActiveDomains domainList={embed.allowlist_domains} />
        </th>
        <th
          scope="row"
          className="px-6 whitespace-nowrap text-theme-text-secondary !font-normal"
        >
          {
            // If the embed was created more than a day ago, show the date, otherwise show the time ago
            moment(embed.createdAt).diff(moment(), "days") > 0
              ? moment(embed.createdAt).format("MMM D, YYYY")
              : moment(embed.createdAt).fromNow()
          }
        </th>
        <td className="px-6 flex items-center gap-x-6 h-full mt-1">
          <button
            onClick={openSnippetModal}
            className="group text-xs font-medium text-theme-text-secondary px-2 py-1 rounded-lg hover:bg-theme-button-code-hover-bg"
          >
            <span className="group-hover:text-theme-button-code-hover-text">
              {t("embeddable.table.code")}
            </span>
          </button>
          <button
            onClick={handleSuspend}
            className="group text-xs font-medium text-theme-text-secondary px-2 py-1 rounded-lg hover:bg-theme-button-disable-hover-bg"
          >
            <span className="group-hover:text-theme-button-disable-hover-text">
              {enabled
                ? t("embeddable.table.disable")
                : t("embeddable.table.enable")}
            </span>
          </button>
          <button
            onClick={handleDelete}
            className="group text-xs font-medium text-theme-text-secondary px-2 py-1 rounded-lg hover:bg-theme-button-delete-hover-bg"
          >
            <span className="group-hover:text-theme-button-delete-hover-text">
              {t("embeddable.table.delete")}
            </span>
          </button>
          <button
            onClick={openSettingsModal}
            className="group text-xs font-medium text-theme-text-secondary px-2 py-1 rounded-lg hover:bg-theme-button-delete-hover-bg"
          >
            <span className="group-hover:text-theme-button-delete-hover-text">
              {t("embeddable.table.edit")}
            </span>
          </button>
        </td>
      </tr>
      <ModalWrapper isOpen={isSettingsOpen}>
        <EditEmbedModal embed={embed} closeModal={closeSettingsModal} />
      </ModalWrapper>
      <ModalWrapper isOpen={isSnippetOpen}>
        <CodeSnippetModal embed={embed} closeModal={closeSnippetModal} />
      </ModalWrapper>
    </>
  );
}

function ActiveDomains({ domainList }) {
  if (!domainList) return <p>all</p>;
  try {
    const domains = JSON.parse(domainList);
    return (
      <div className="flex flex-col gap-y-2">
        {domains.map((domain, index) => {
          return (
            <p key={index} className="font-mono !font-normal">
              {domain}
            </p>
          );
        })}
      </div>
    );
  } catch {
    return <p>all</p>;
  }
}
