import { useState } from "react";
import { createPortal } from "react-dom";
import ModalWrapper from "@/components/ModalWrapper";
import { WarningOctagon, X } from "@phosphor-icons/react";
import { DB_LOGOS } from "./DBConnection";

function assembleConnectionString({
  engine,
  username = "",
  password = "",
  host = "",
  port = "",
  database = "",
  encrypt = false,
}) {
  if ([username, password, host, database].every((i) => !!i) === false)
    return `Please fill out all the fields above.`;
  switch (engine) {
    case "postgresql":
      return `postgres://${username}:${password}@${host}:${port}/${database}`;
    case "mysql":
      return `mysql://${username}:${password}@${host}:${port}/${database}`;
    case "sql-server":
      return `mssql://${username}:${password}@${host}:${port}/${database}?encrypt=${encrypt}`;
    case "oracle":
      return `oracle://${username}:${password}@${host}:${port}/${database}`;
    default:
      return null;
  }
}

const DEFAULT_ENGINE = "postgresql";
const DEFAULT_CONFIG = {
  username: null,
  password: null,
  host: null,
  port: null,
  database: null,
  encrypt: false,
};

const DEFAULT_ORACLE_MODE = "thin";
const DEFAULT_ORACLE_LIBDIR = "";

export default function NewSQLConnection({ isOpen, closeModal, onSubmit }) {
  const [engine, setEngine] = useState(DEFAULT_ENGINE);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [oracleMode, setOracleMode] = useState(DEFAULT_ORACLE_MODE);
  const [oracleLibDir, setOracleLibDir] = useState(DEFAULT_ORACLE_LIBDIR);

  if (!isOpen) return null;

  function handleClose() {
    setEngine(DEFAULT_ENGINE);
    setConfig(DEFAULT_CONFIG);
    setOracleMode(DEFAULT_ORACLE_MODE);
    setOracleLibDir(DEFAULT_ORACLE_LIBDIR);
    closeModal();
  }

  function onFormChange() {
    const form = new FormData(document.getElementById("sql-connection-form"));
    setConfig({
      username: form.get("username").trim(),
      password: form.get("password"),
      host: form.get("host").trim(),
      port: form.get("port").trim(),
      database: form.get("database").trim(),
      encrypt: form.get("encrypt") === "true",
    });
  }

  async function handleUpdate(e) {
    e.preventDefault();
    e.stopPropagation();
    const form = new FormData(e.target);
    const baseConfig = {
      engine,
      database_id: form.get("name"),
      connectionString: assembleConnectionString({ engine, ...config }),
    };
    // Oracle일 때만 모드/경로 추가
    if (engine === "oracle") {
      baseConfig.mode = oracleMode;
      if (oracleMode === "thick") {
        baseConfig.thickLibDir = oracleLibDir;
      }
    }
    onSubmit(baseConfig);
    handleClose();
    return false;
  }

  // Cannot do nested forms, it will cause all sorts of issues, so we portal this out
  // to the parent container form so we don't have nested forms.
  return createPortal(
    <ModalWrapper isOpen={isOpen}>
      <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
        <div className="relative w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border">
          <div className="relative p-6 border-b rounded-t border-theme-modal-border">
            <div className="w-full flex gap-x-2 items-center">
              <h3 className="text-xl font-semibold text-white overflow-hidden overflow-ellipsis whitespace-nowrap">
                New SQL Connection
              </h3>
            </div>
            <button
              onClick={handleClose}
              type="button"
              className="absolute top-4 right-4 transition-all duration-300 bg-transparent rounded-lg text-sm p-1 inline-flex items-center hover:bg-theme-modal-border hover:border-theme-modal-border hover:border-opacity-50 border-transparent border"
            >
              <X size={24} weight="bold" className="text-white" />
            </button>
          </div>
          <form
            id="sql-connection-form"
            onSubmit={handleUpdate}
            onChange={onFormChange}
          >
            <div className="px-7 py-6">
              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                <p className="text-sm text-white/60">
                  Add the connection information for your database below and it
                  will be available for future SQL agent calls.
                </p>
                <div className="flex flex-col w-full">
                  <div className="border border-red-800 bg-zinc-800 light:bg-red-200/50 p-4 rounded-lg flex items-center gap-x-2 text-sm text-red-400 light:text-red-500">
                    <WarningOctagon size={28} className="shrink-0" />
                    <p>
                      <b>WARNING:</b> The SQL agent has been <i>instructed</i>{" "}
                      to only perform non-modifying queries. This{" "}
                      <b>does not</b> prevent a hallucination from still
                      deleting data. Only connect with a user who has{" "}
                      <b>READ_ONLY</b> permissions.
                    </p>
                  </div>

                  <label className="block mb-2 text-sm font-medium text-white mt-4">
                    Select your SQL engine
                  </label>
                  <div className="grid md:grid-cols-4 gap-4 grid-cols-2">
                    <DBEngine
                      provider="postgresql"
                      active={engine === "postgresql"}
                      onClick={() => setEngine("postgresql")}
                    />
                    <DBEngine
                      provider="mysql"
                      active={engine === "mysql"}
                      onClick={() => setEngine("mysql")}
                    />
                    <DBEngine
                      provider="sql-server"
                      active={engine === "sql-server"}
                      onClick={() => setEngine("sql-server")}
                    />
                    <DBEngine
                      provider="oracle"
                      active={engine === "oracle"}
                      onClick={() => setEngine("oracle")}
                    />
                  </div>
                </div>

                <div className="flex flex-col w-full">
                  <label className="block mb-2 text-sm font-medium text-white">
                    Connection name
                  </label>
                  <input
                    type="text"
                    name="name"
                    className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                    placeholder="a unique name to identify this SQL connection"
                    required={true}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col">
                    <label className="block mb-2 text-sm font-medium text-white">
                      Database user
                    </label>
                    <input
                      type="text"
                      name="username"
                      className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                      placeholder="root"
                      required={true}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="block mb-2 text-sm font-medium text-white">
                      Database user password
                    </label>
                    <input
                      type="text"
                      name="password"
                      className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                      placeholder="password123"
                      required={true}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block mb-2 text-sm font-medium text-white">
                      Server endpoint
                    </label>
                    <input
                      type="text"
                      name="host"
                      className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                      placeholder="the hostname or endpoint for your database"
                      required={true}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className="block mb-2 text-sm font-medium text-white">
                      Port
                    </label>
                    <input
                      type="text"
                      name="port"
                      className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                      placeholder="3306"
                      required={false}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="block mb-2 text-sm font-medium text-white">
                    Database
                  </label>
                  <input
                    type="text"
                    name="database"
                    className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                    placeholder="the database the agent will interact with"
                    required={true}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                {engine === "oracle" && (
                  <div className="flex flex-col w-full">
                    <label className="block mb-2 text-sm font-medium text-white mt-4">
                      Oracle 접속 모드
                    </label>
                    <div className="flex gap-x-4 mb-2">
                      <label className="flex items-center gap-x-2">
                        <input
                          type="radio"
                          name="oracleMode"
                          value="thin"
                          checked={oracleMode === "thin"}
                          onChange={() => setOracleMode("thin")}
                        />
                        Thin
                      </label>
                      <label className="flex items-center gap-x-2">
                        <input
                          type="radio"
                          name="oracleMode"
                          value="thick"
                          checked={oracleMode === "thick"}
                          onChange={() => setOracleMode("thick")}
                        />
                        Thick
                      </label>
                    </div>
                    {oracleMode === "thick" && (
                      <div className="flex flex-col">
                        <label className="block mb-2 text-sm font-medium text-white">
                          Oracle Instant Client 경로
                        </label>
                        <input
                          type="text"
                          name="oracleLibDir"
                          className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                          placeholder="/opt/oracle/instantclient_21_13"
                          value={oracleLibDir}
                          onChange={(e) => setOracleLibDir(e.target.value)}
                          required={oracleMode === "thick"}
                        />
                      </div>
                    )}
                  </div>
                )}
                {engine === "sql-server" && (
                  <div className="flex items-center justify-between">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="encrypt"
                        value="true"
                        className="sr-only peer"
                        onChange={onFormChange}
                        checked={config.encrypt}
                      />
                      <div className="w-11 h-6 bg-theme-settings-input-bg peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      <span className="ml-3 text-sm font-medium text-white">
                        Enable Encryption
                      </span>
                    </label>
                  </div>
                )}

                <p className="text-theme-text-secondary text-sm">
                  {assembleConnectionString({ engine, ...config })}
                </p>
              </div>
            </div>
            <div className="flex justify-between items-center mt-6 pt-6 border-t border-theme-modal-border px-7 pb-6">
              <button
                type="button"
                onClick={handleClose}
                className="transition-all duration-300 text-white hover:bg-zinc-700 light:hover:bg-theme-bg-primary px-4 py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="sql-connection-form"
                className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm"
              >
                Save connection
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalWrapper>,
    document.getElementById("workspace-agent-settings-container")
  );
}

function DBEngine({ provider, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col p-4 border border-white/40 bg-zinc-800 light:bg-theme-settings-input-bg rounded-lg w-fit hover:bg-zinc-700 ${
        active ? "!bg-blue-500/50" : ""
      }`}
    >
      <img
        src={DB_LOGOS[provider]}
        className="h-[100px] rounded-md"
        alt={provider}
      />
    </button>
  );
}
