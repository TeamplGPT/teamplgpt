const oracledb = require("oracledb");
const { ConnectionStringParser } = require("./utils");
class OracleConnector {
  #connected = false;
  database_id = "";
  connectionConfig = {
    user: null,
    password: null,
    connectString: null,
  };
  mode = "thin"; // 기본값
  thickLibDir = null;

  constructor(
    config = {
      connectionString: null,
      mode: "thin", // "thin" 또는 "thick"
      thickLibDir: null, // thick 모드일 때 Instant Client 경로
    }
  ) {
    this.connectionString = config.connectionString;
    this.mode = config.mode || "thin";
    this.thickLibDir = config.thickLibDir || null;
    this._client = null;
    this.#parseDatabase();

    if (this.mode === "thick") {
      try {
        if (this.thickLibDir) {
          const resolvedPath = this.thickLibDir.startsWith("~")
            ? require("os").homedir() + this.thickLibDir.slice(1)
            : this.thickLibDir;

          oracledb.initOracleClient({ libDir: resolvedPath });
        } else {
          oracledb.initOracleClient();
        }
      } catch (err) {
        console.warn(
          "[OracleConnector] Warning during thick mode initialization:",
          err.message
        );
      }
    }
  }

  #parseDatabase() {
    const connectionParser = new ConnectionStringParser({ scheme: "oracle" });
    const parsed = connectionParser.parse(this.connectionString);

    this.database_id = parsed?.endpoint;
    this.connectionConfig = {
      user: parsed?.username,
      password: parsed?.password,
      connectString: `${parsed?.hosts[0]?.host}:${parsed?.hosts[0]?.port}/${parsed?.endpoint}`,
    };
  }

  async connect() {
    try {
      this._client = await oracledb.getConnection(this.connectionConfig);
      this.#connected = true;
      return this._client;
    } catch (err) {
      console.error("[OracleConnector] Failed to connect to Oracle DB:", err);
      throw err;
    }
  }

  /**
   *
   * @param {string} queryString the SQL query to be run
   * @returns {import(".").QueryResult}
   */
  async runQuery(queryString = "") {
    const result = { rows: [], count: 0, error: null };
    try {
      if (!this.#connected) await this.connect();

      const query = await this._client.execute(queryString);
      result.rows = query.rows;
      result.count = query.rowsAffected || query.rows?.length || 0;
    } catch (err) {
      console.log(this.constructor.name, err);
      result.error = err.message;
      console.error(
        "[OracleConnector] Error occurred during query execution ",
        result.error
      );
    } finally {
      if (this._client) {
        await this._client.close();
        this.#connected = false;
      }
    }
    return result;
  }

  getTablesSql() {
    return `SELECT OBJECT_NAME FROM ALL_OBJECTS WHERE OBJECT_TYPE = 'TABLE' ORDER BY OBJECT_NAME`;
  }

  getTableSchemaSql(table_name) {
    return `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, DATA_DEFAULT FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = '${table_name.toUpperCase()}' ORDER BY COLUMN_NAME`;
  }
}

module.exports.OracleConnector = OracleConnector;
