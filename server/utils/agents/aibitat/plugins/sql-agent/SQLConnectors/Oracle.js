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

  constructor(
    config = {
      // Oracle connection string format:
      // oracle://username:password@host:port/service_name
      connectionString: null,
    }
  ) {
    this.connectionString = config.connectionString;
    this._client = null;
    this.#parseDatabase();
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
    this._client = await oracledb.getConnection(this.connectionConfig);
    this.#connected = true;
    return this._client;
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
    } finally {
      if (this._client) {
        await this._client.close();
        this.#connected = false;
      }
    }
    return result;
  }

  getTablesSql() {
    return `SELECT table_name FROM user_tables ORDER BY table_name`;
  }

  getTableSchemaSql(table_name) {
    return `SELECT column_name, data_type, data_length, nullable, data_default FROM user_tab_columns WHERE table_name = '${table_name.toUpperCase()}' ORDER BY column_id`;
  }
}

module.exports.OracleConnector = OracleConnector; 