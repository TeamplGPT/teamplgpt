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
    console.log("[OracleConnector] 생성자 호출, config:", config);
    this.connectionString = config.connectionString;
    this.mode = config.mode || "thin";
    this.thickLibDir = config.thickLibDir || null;
    this._client = null;
    this.#parseDatabase();

    // UI에서 thick 모드로 지정한 경우에만 Thick 모드 활성화
    if (this.mode === "thick") {
      try {
        if (this.thickLibDir) {
          oracledb.initOracleClient({ libDir: this.thickLibDir });
          console.log(
            "[OracleConnector] Thick 모드 활성화, libDir:",
            this.thickLibDir
          );
        } else {
          oracledb.initOracleClient();
          console.log("[OracleConnector] Thick 모드 활성화 (libDir 미지정)");
        }
      } catch (err) {
        // 이미 초기화된 경우 등 예외 무시
        console.warn(
          "[OracleConnector] Thick 모드 초기화 중 경고:",
          err.message
        );
      }
    } else {
      console.log("[OracleConnector] Thin 모드로 동작");
    }
  }

  #parseDatabase() {
    console.log(
      "[OracleConnector] 데이터베이스 파싱 시작:",
      this.connectionString
    );
    const connectionParser = new ConnectionStringParser({ scheme: "oracle" });
    const parsed = connectionParser.parse(this.connectionString);

    this.database_id = parsed?.endpoint;
    this.connectionConfig = {
      user: parsed?.username,
      password: parsed?.password,
      connectString: `${parsed?.hosts[0]?.host}:${parsed?.hosts[0]?.port}/${parsed?.endpoint}`,
    };
    console.log(
      "[OracleConnector] 파싱 결과 connectionConfig:",
      this.connectionConfig
    );
  }

  async connect() {
    console.log(
      "[OracleConnector] Oracle DB 접속 시도:",
      this.connectionConfig,
      "mode:",
      this.mode
    );
    try {
      this._client = await oracledb.getConnection(this.connectionConfig);
      this.#connected = true;
      console.log("[OracleConnector] Oracle DB 접속 성공");
      return this._client;
    } catch (err) {
      console.error("[OracleConnector] Oracle DB 접속 실패:", err);
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

      console.log("[OracleConnector] 쿼리 실행:", queryString);
      const query = await this._client.execute(queryString);
      result.rows = query.rows;
      result.count = query.rowsAffected || query.rows?.length || 0;
      console.log("[OracleConnector] 쿼리 실행 결과:", result);
    } catch (err) {
      console.log(this.constructor.name, err);
      result.error = err.message;
      console.error("[OracleConnector] 쿼리 실행 중 에러:", err);
    } finally {
      if (this._client) {
        await this._client.close();
        this.#connected = false;
        console.log("[OracleConnector] Oracle DB 연결 해제");
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
