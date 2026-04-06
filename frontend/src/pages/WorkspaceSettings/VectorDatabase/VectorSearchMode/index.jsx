import { useState } from "react";
import { useTranslation } from "react-i18next";

// Supported vector DBs for advanced search modes
// lancedb: supports reranking, pgvector: supports hybrid search
const supportedVectorDBs = ["lancedb", "pgvector"];

export default function VectorSearchMode({ workspace, setHasChanges }) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState(
    workspace?.vectorSearchMode ?? "default"
  );
  if (!workspace?.vectorDB || !supportedVectorDBs.includes(workspace?.vectorDB))
    return null;

  const isPgvector = workspace?.vectorDB === "pgvector";
  const isLancedb = workspace?.vectorDB === "lancedb";

  return (
    <div>
      <div className="flex flex-col">
        <label htmlFor="name" className="block input-label">
          {t("vector-workspace.searchMode.title")}
        </label>
      </div>
      <select
        name="vectorSearchMode"
        value={selection}
        className="border-none bg-theme-settings-input-bg text-white text-sm mt-2 rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
        onChange={(e) => {
          setSelection(e.target.value);
          setHasChanges(true);
        }}
        required={true}
      >
        <option value="default">
          {t("vector-workspace.searchMode.default.title")}
        </option>
        {isLancedb && (
          <option value="rerank">
            {t("vector-workspace.searchMode.rerank.title")}
          </option>
        )}
        {isPgvector && (
          <option value="hybrid">
            {t("vector-workspace.searchMode.hybrid.title")}
          </option>
        )}
      </select>
      <p className="text-white text-opacity-60 text-xs font-medium py-1.5">
        {t(`vector-workspace.searchMode.${selection}.description`)}
      </p>
    </div>
  );
}
