import React, { useState, useEffect, useRef } from "react";
import showToast from "@/utils/toast";
import { CaretDown, Gear } from "@phosphor-icons/react";
import MCPLogo from "@/media/agents/mcp-logo.svg";
import { titleCase } from "text-case";
import truncate from "truncate";
import MCPServers from "@/models/mcpServers";
import pluralize from "pluralize";
import { useTranslation } from "react-i18next";

function ManageServerMenu({ server, toggleServer, onDelete }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(server.running);
  const menuRef = useRef(null);
  const { t } = useTranslation();

  async function deleteServer() {
    if (!window.confirm(t("agent.mcp-servers.deleteConfirm"))) return;
    const { success, error } = await MCPServers.deleteServer(server.name);
    if (success) {
      showToast(t("agent.mcp-servers.deletedSuccessfully"), "success");
      onDelete(server.name);
    } else {
      showToast(error || t("agent.mcp-servers.failedToDelete"), "error");
    }
  }

  async function handleToggleServer() {
    if (
      !window.confirm(
        running
          ? t("agent.mcp-servers.stopConfirm")
          : t("agent.mcp-servers.startConfirm")
      )
    )
      return;

    const { success, error } = await MCPServers.toggleServer(server.name);
    if (success) {
      const newState = !running;
      setRunning(newState);
      toggleServer(server.name);
      showToast(
        t("agent.mcp-servers.toggleSuccess", {
          serverName: server.name,
          action: newState
            ? t("agent.mcp-servers.started")
            : t("agent.mcp-servers.stopped"),
        }),
        "success",
        { clear: true }
      );
    } else {
      showToast(error || t("agent.mcp-servers.failedToToggle"), "error", {
        clear: true,
      });
    }
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg text-white hover:bg-theme-action-menu-item-hover transition-colors duration-300"
      >
        <Gear className="h-5 w-5" weight="bold" />
      </button>
      {open && (
        <div className="absolute w-[150px] top-1 left-7 mt-1 border-[1.5px] border-white/40 rounded-lg bg-theme-action-menu-bg flex flex-col shadow-[0_4px_14px_rgba(0,0,0,0.25)] text-white z-99 md:z-10">
          <button
            type="button"
            onClick={handleToggleServer}
            className="border-none flex items-center rounded-lg gap-x-2 hover:bg-theme-action-menu-item-hover py-1.5 px-2 transition-colors duration-200 w-full text-left"
          >
            <span className="text-sm">
              {running
                ? t("agent.mcp-servers.stopMcpServer")
                : t("agent.mcp-servers.startMcpServer")}
            </span>
          </button>
          <button
            type="button"
            onClick={deleteServer}
            className="border-none flex items-center rounded-lg gap-x-2 hover:bg-theme-action-menu-item-hover py-1.5 px-2 transition-colors duration-200 w-full text-left"
          >
            <span className="text-sm">
              {t("agent.mcp-servers.deleteMcpServer")}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function ServerPanel({ server, toggleServer, onDelete }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="p-2">
        <div className="flex flex-col gap-y-[18px] max-w-[800px]">
          <div className="flex w-full justify-between">
            <div className="flex items-center gap-x-2">
              <img src={MCPLogo} className="w-6 h-6 light:invert" />
              <label htmlFor="name" className="text-white text-md font-bold">
                {titleCase(server.name.replace(/[_-]/g, " "))}
              </label>
              {server.tools.length > 0 && (
                <p className="text-theme-text-secondary text-sm">
                  {t("agent.mcp-servers.toolsAvailable", {
                    count: server.tools.length,
                  })}
                </p>
              )}
            </div>
            <ManageServerMenu
              key={server.name}
              server={server}
              toggleServer={toggleServer}
              onDelete={onDelete}
            />
          </div>
          <RenderServerConfig config={server.config} />
          <RenderServerStatus server={server} />
          <RenderServerTools tools={server.tools} />
        </div>
      </div>
    </>
  );
}

function RenderServerConfig({ config = null }) {
  const { t } = useTranslation();

  if (!config) return null;
  return (
    <div className="flex flex-col gap-y-2">
      <p className="text-theme-text-primary text-sm">
        {t("agent.mcp-servers.startupCommand")}
      </p>
      <div className="bg-theme-bg-primary rounded-lg p-4">
        <p className="text-theme-text-secondary text-sm text-left">
          <span className="font-bold">{t("agent.mcp-servers.command")}:</span>{" "}
          {config.command}
        </p>
        <p className="text-theme-text-secondary text-sm text-left">
          <span className="font-bold">{t("agent.mcp-servers.arguments")}:</span>{" "}
          {config.args ? config.args.join(" ") : t("agent.mcp-servers.none")}
        </p>
      </div>
    </div>
  );
}

function RenderServerStatus({ server }) {
  const { t } = useTranslation();
  if (server.running || !server.error) return null;
  return (
    <div className="flex flex-col gap-y-2">
      <p className="text-theme-text-primary text-sm">
        {t("agent.mcp-servers.notRunning")}
      </p>
      <div className="bg-theme-bg-primary rounded-lg p-4">
        <p className="text-red-500 text-sm font-mono">{server.error}</p>
      </div>
    </div>
  );
}

function RenderServerTools({ tools = [] }) {
  if (tools.length === 0) return null;
  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-col gap-y-2">
        {tools.map((tool) => (
          <ServerTool key={tool.name} tool={tool} />
        ))}
      </div>
    </div>
  );
}

function ServerTool({ tool }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className="flex flex-col gap-y-2 px-4 py-2 rounded-lg border border-theme-text-secondary"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <p className="text-theme-text-primary font-mono font-bold text-sm">
            {tool.name}
          </p>
          {!open && (
            <p className="text-theme-text-secondary text-sm">
              {truncate(tool.description, 70)}
            </p>
          )}
        </div>
        <div className="border-none text-theme-text-secondary hover:text-cta-button">
          <CaretDown size={16} />
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-y-2">
          <div className="flex flex-col gap-y-2">
            <p className="text-theme-text-secondary text-sm text-left">
              {tool.description}
            </p>
          </div>
          <div className="flex flex-col gap-y-2">
            <p className="text-theme-text-primary text-sm text-left">
              {t("agent.mcp-servers.toolCallArguments")}
            </p>
            <div className="flex flex-col gap-y-2">
              {Object.entries(tool.inputSchema?.properties || {}).map(
                ([key, value]) => (
                  <div key={key} className="flex items-center gap-x-2">
                    <p className="text-theme-text-secondary text-sm text-left font-bold">
                      {key}
                      {tool.inputSchema?.required?.includes(key) && (
                        <sup className="text-red-500">*</sup>
                      )}
                    </p>
                    <p className="text-theme-text-secondary text-sm text-left">
                      {value.type}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </button>
  );
}
