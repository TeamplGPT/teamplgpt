import { useTranslation } from "react-i18next";
import { Link } from "@phosphor-icons/react";

export function GoogleSearchOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-white/60 my-2">
        <a
          href="https://programmablesearchengine.google.com/controlpanel/create"
          target="_blank"
          rel="noreferrer"
          className="border-none text-theme-text-secondary hover:text-cta-button"
        >
          {t("agent.skill.web-browsing.google-search-engine.description2")}{" "}
          <Link size={20} className="inline-block align-middle" />
        </a>
      </p>
      <div className="flex gap-x-4">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t(
              "agent.skill.web-browsing.google-search-engine.search-engine-id"
            )}
          </label>
          <input
            type="text"
            name="env::AgentGoogleSearchEngineId"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Google Search Engine Id"
            defaultValue={settings?.AgentGoogleSearchEngineId}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("agent.skill.web-browsing.google-search-engine.access-api-key")}
          </label>
          <input
            type="password"
            name="env::AgentGoogleSearchEngineKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Google Search Engine API Key"
            defaultValue={
              settings?.AgentGoogleSearchEngineKey ? "*".repeat(20) : ""
            }
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
    </>
  );
}

const SearchApiEngines = [
  { name: "Google Search", value: "google" },
  { name: "Google Maps", value: "google_maps" },
  { name: "Google Shopping", value: "google_shopping" },
  { name: "Google News", value: "google_news" },
  { name: "Google Jobs", value: "google_jobs" },
  { name: "Google Scholar", value: "google_scholar" },
  { name: "Google Finance", value: "google_finance" },
  { name: "Google Patents", value: "google_patents" },
  { name: "YouTube", value: "youtube" },
  { name: "Bing", value: "bing" },
  { name: "Bing News", value: "bing_news" },
  { name: "Amazon Product Search", value: "amazon_search" },
  { name: "Baidu", value: "baidu" },
];
export function SearchApiOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-white/60 my-2">
        <a
          href="https://www.searchapi.io/"
          target="_blank"
          rel="noreferrer"
          className="border-none text-theme-text-secondary hover:text-cta-button"
        >
          {t("agent.skill.web-browsing.searchapi.searchapi-link")}
          <Link size={20} className="inline-block align-middle ml-1" />
        </a>
      </p>
      <div className="flex gap-x-4">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("agent.skill.web-browsing.apikey")}
          </label>
          <input
            type="password"
            name="env::AgentSearchApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="SearchApi API Key"
            defaultValue={settings?.AgentSearchApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("agent.skill.web-browsing.engine")}
          </label>
          <select
            name="env::AgentSearchApiEngine"
            required={true}
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            defaultValue={settings?.AgentSearchApiEngine || "google"}
          >
            {SearchApiEngines.map(({ name, value }) => (
              <option key={name} value={value}>
                {name}
              </option>
            ))}
          </select>
          {/* <input
            type="text"
            name="env::AgentSearchApiEngine"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="SearchApi engine (Google, Bing...)"
            defaultValue={settings?.AgentSearchApiEngine || "google"}
            required={true}
            autoComplete="off"
            spellCheck={false}
          /> */}
        </div>
      </div>
    </>
  );
}

export function SerperDotDevOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-white/60 my-2">
        <a
          href="https://serper.dev"
          target="_blank"
          rel="noreferrer"
          className="border-none text-theme-text-secondary hover:text-cta-button"
        >
          {t("agent.skill.web-browsing.serper-dot-dev.serper-dev-link")}
          <Link size={20} className="inline-block align-middle ml-1" />
        </a>
      </p>
      <div className="flex gap-x-4">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("agent.skill.web-browsing.apikey")}
          </label>
          <input
            type="password"
            name="env::AgentSerperApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Serper.dev API Key"
            defaultValue={settings?.AgentSerperApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
    </>
  );
}

export function BingSearchOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-white/60 my-2">
        <a
          href="https://portal.azure.com/"
          target="_blank"
          rel="noreferrer"
          className="border-none text-theme-text-secondary hover:text-cta-button"
        >
          {t("agent.skill.web-browsing.bing-search.bing-search-link")}
          <Link size={20} className="inline-block align-middle ml-1" />
        </a>
      </p>
      <div className="flex gap-x-4">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("agent.skill.web-browsing.apikey")}
          </label>
          <input
            type="password"
            name="env::AgentBingSearchApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Bing Web Search API Key"
            defaultValue={settings?.AgentBingSearchApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
      <p className="text-sm text-white/60 my-2">
        {t("agent.skill.web-browsing.bing-search.description2")}
      </p>
      <ol className="list-decimal text-sm text-white/60 ml-6">
        <li>
          {t("agent.skill.web-browsing.bing-search.description3")}
          <a
            href="https://portal.azure.com/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-300 underline"
          >
            https://portal.azure.com/
          </a>
        </li>
        <li>{t("agent.skill.web-browsing.bing-search.description4")}</li>
        <li>{t("agent.skill.web-browsing.bing-search.description5")}</li>
        <li>{t("agent.skill.web-browsing.bing-search.description6")}</li>
        <li>{t("agent.skill.web-browsing.bing-search.description8")}</li>
      </ol>
    </>
  );
}

export function SerplySearchOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-white/60 my-2">
        <a
          href="https://serply.io"
          target="_blank"
          rel="noreferrer"
          className="border-none text-theme-text-secondary hover:text-cta-button"
        >
          {t("agent.skill.web-browsing.serply-engine.serply-link")}
          <Link size={20} className="inline-block align-middle ml-1" />
        </a>
      </p>
      <div className="flex gap-x-4">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("agent.skill.web-browsing.apikey")}
          </label>
          <input
            type="password"
            name="env::AgentSerplyApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Serply API Key"
            defaultValue={settings?.AgentSerplyApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
    </>
  );
}

export function SearXNGOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-x-4">
      <div className="flex flex-col w-60">
        <label className="text-white text-sm font-semibold block mb-3">
          {t("agent.skill.web-browsing.searxng-engine.searxng-url")}
        </label>
        <input
          type="url"
          name="env::AgentSearXNGApiUrl"
          className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
          placeholder="SearXNG API Base URL"
          defaultValue={settings?.AgentSearXNGApiUrl}
          required={true}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function TavilySearchOptions({ settings }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-white/60 my-2">
        <a
          href="https://tavily.com/"
          target="_blank"
          rel="noreferrer"
          className="border-none text-theme-text-secondary hover:text-cta-button"
        >
          {t("agent.skill.web-browsing.tavily-search.tavily-link")}
          <Link size={20} className="inline-block align-middle ml-1" />
        </a>
      </p>
      <div className="flex gap-x-4">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            {t("agent.skill.web-browsing.apikey")}
          </label>
          <input
            type="password"
            name="env::AgentTavilyApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Tavily API Key"
            defaultValue={settings?.AgentTavilyApiKey ? "*".repeat(20) : ""}
            required={true}
            autoComplete="new-password"
            spellCheck={false}
          />
        </div>
      </div>
    </>
  );
}

export function DuckDuckGoOptions() {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-white/60 my-2">
        {t("agent.skill.web-browsing.duckduckgo-engine.description2")}
      </p>
    </>
  );
}
