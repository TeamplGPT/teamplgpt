/**
 * ChatTraceLogger — 채팅 파이프라인 구조화 로그 유틸리티.
 *
 * 각 질의에 고유 traceId를 부여하고, 파이프라인의 각 단계를
 * 동일 접두사로 콘솔 출력하여 Docker 로그에서 grep으로 추적 가능.
 *
 * 환경변수: CHAT_TRACE_LOG (기본 "true", "false"로 비활성화)
 */

const ENABLED = process.env.CHAT_TRACE_LOG !== "false";

class ChatTraceLogger {
  /**
   * @param {string} uuid - 채팅 UUID (앞 8자리를 traceId로 사용)
   * @param {object} options
   * @param {"chat"|"query"|"react"} options.chatMode
   */
  constructor(uuid, { chatMode = "chat" } = {}) {
    this.traceId = uuid.substring(0, 8);
    this.chatMode = chatMode;
    this.prefix =
      chatMode === "react"
        ? `[ReAct:${this.traceId}]`
        : `[Chat:${this.traceId}]`;
    this.startTime = Date.now();

    // 누적 통계
    this.llmCallCount = 0;
    this.searchCount = 0;
    this.toolCallCount = 0;
    this.totalLlmMs = 0;
    this.totalSearchMs = 0;
    this.iterationCount = 0;
    this.endReason = null;
  }

  /** 내부 로그 출력 — ENABLED가 false이면 no-op */
  _log(msg) {
    if (!ENABLED) return;
    console.log(`${this.prefix} ${msg}`);
  }

  _error(msg) {
    if (!ENABLED) return;
    console.error(`${this.prefix} ${msg}`);
  }

  // ─────────────────────────────────────
  //  공통 메서드 (전 모드)
  // ─────────────────────────────────────

  /**
   * ═══ TRACE_START ═══
   * @param {object} params
   * @param {string} params.query - 사용자 원본 질의
   * @param {object} params.workspace - 워크스페이스 객체
   * @param {number} params.chatHistoryCount - 채팅 히스토리 메시지 수
   * @param {number} [params.pinnedDocsCount=0]
   * @param {number} [params.parsedFilesCount=0] - chat/query 전용
   * @param {number} [params.maxIterations] - react 전용
   */
  traceStart({
    query,
    workspace,
    chatHistoryCount,
    pinnedDocsCount = 0,
    parsedFilesCount = 0,
    maxIterations,
  }) {
    const w = workspace;
    const vsMode = w?.vectorSearchMode || "default";
    const qrMode =
      this.chatMode === "react"
        ? "skipped"
        : w?.queryRewriteMode || "off";

    this._log("═══ TRACE_START ═══");
    this._log(`query: "${this._truncate(query, 100)}"`);

    if (this.chatMode === "react") {
      this._log(
        `workspace: ${w?.slug} | mode: ${this.chatMode} | vectorSearch: ${vsMode} | maxIter: ${maxIterations ?? w?.reactMaxIterations ?? 5} | queryRewrite: ${qrMode}`
      );
      this._log(
        `chatHistory: ${chatHistoryCount} messages | pinnedDocs: ${pinnedDocsCount}`
      );
    } else {
      this._log(
        `workspace: ${w?.slug} | mode: ${this.chatMode} | vectorSearch: ${vsMode} | queryRewrite: ${qrMode}`
      );
      this._log(
        `chatHistory: ${chatHistoryCount} messages | pinnedDocs: ${pinnedDocsCount} | parsedFiles: ${parsedFilesCount}`
      );
    }
  }

  /**
   * [SEARCH] — Vector 검색 결과 기록
   * @param {object} params
   * @param {string} params.query - 검색에 사용된 쿼리
   * @param {string} params.mode - hybrid/rerank/default
   * @param {number} params.resultCount - 검색 결과 건수
   * @param {number} params.durationMs
   * @param {boolean} [params.hasShared=false] - 공유 워크스페이스 사용 여부
   * @param {string} [params.error] - 검색 에러 메시지
   */
  search({ query, mode, resultCount, durationMs, hasShared = false, error }) {
    this.searchCount++;
    this.totalSearchMs += durationMs;
    if (error) {
      this._error(`[SEARCH] ERROR: ${error} (${durationMs}ms)`);
    } else {
      const sharedTag = hasShared ? " (incl. shared)" : "";
      this._log(
        `[SEARCH] query: "${this._truncate(query, 80)}" | mode: ${mode} | ${resultCount} docs${sharedTag} (${durationMs}ms)`
      );
    }
  }

  /**
   * [SEARCH] skipped — 검색 생략 시
   * @param {string} reason
   */
  searchSkipped(reason) {
    this._log(`[SEARCH] skipped (${reason})`);
  }

  /**
   * [CONTEXT] — chat/query 전용, 컨텍스트 조립 결과
   * @param {object} params
   * @param {number} params.pinnedCount
   * @param {number} params.searchCount
   * @param {number} params.backfillCount - fillSourceWindow에서 추가된 수
   * @param {number} params.totalCount - 최종 contextTexts 수
   */
  context({ pinnedCount, searchCount, backfillCount, totalCount }) {
    this._log(
      `[CONTEXT] pinned: ${pinnedCount} | search: ${searchCount} | backfill: ${backfillCount} | total contextTexts: ${totalCount}`
    );
  }

  /**
   * [COMPRESS] — 메시지 압축 결과 (chat/query 전용)
   * @param {number} afterCount - 압축 후 메시지 수
   */
  compress(afterCount) {
    this._log(`[COMPRESS] messages: ${afterCount}`);
  }

  /**
   * [LLM] 호출 시작
   * @param {object} params
   * @param {number} params.messageCount - LLM에 전달되는 메시지 수
   * @param {boolean} [params.streaming=false]
   */
  llmStart({ messageCount, streaming = false }) {
    this.llmCallCount++;
    const streamTag = streaming ? "streaming " : "";
    this._log(
      `[LLM] ${streamTag}call #${this.llmCallCount} started (messages: ${messageCount})`
    );
    this._llmStartTime = Date.now();
  }

  /**
   * [LLM] 호출 완료
   * @param {object} params
   * @param {number} [params.responseLength=0] - 응답 문자 수
   * @param {boolean} [params.isEmpty=false] - 빈 응답 여부
   * @returns {number} LLM 호출 소요시간 (ms)
   */
  llmEnd({ responseLength = 0, isEmpty = false } = {}) {
    const dur = Date.now() - (this._llmStartTime || Date.now());
    this.totalLlmMs += dur;
    if (isEmpty) {
      this._error(
        `[LLM] call #${this.llmCallCount} completed (${dur}ms) — EMPTY RESPONSE`
      );
    } else {
      this._log(
        `[LLM] call #${this.llmCallCount} completed (${dur}ms, ${responseLength} chars)`
      );
    }
    return dur;
  }

  /**
   * [TOOL_CALL] — tool calling 이벤트 기록
   * @param {object} params
   * @param {string} params.name - tool(plugin) 이름
   * @param {object|string} params.arguments - tool 호출 인자
   * @param {number} params.round - tool calling 라운드 번호
   */
  toolCall({ name, arguments: args, round }) {
    this.toolCallCount++;
    const argsStr =
      typeof args === "string" ? args : JSON.stringify(args || {});
    this._log(
      `[TOOL_CALL] #${this.toolCallCount} round=${round} | tool=${name} | args=${this._truncate(argsStr, 120)}`
    );
  }

  /**
   * [TOOL_RESULT] — tool 실행 결과 기록
   * @param {object} params
   * @param {string} params.name - tool 이름
   * @param {number} params.durationMs - 실행 소요시간
   * @param {boolean} [params.isError=false] - 에러 여부
   */
  toolCallEnd({ name, durationMs = 0, isError = false }) {
    if (isError) {
      this._error(`[TOOL_RESULT] tool=${name} ERROR (${durationMs}ms)`);
    } else {
      this._log(`[TOOL_RESULT] tool=${name} OK (${durationMs}ms)`);
    }
  }

  /**
   * ═══ TRACE_END ═══
   * @param {object} params
   * @param {string} params.reason - 종료 사유
   * @param {number} [params.answerLength=0]
   * @param {number} [params.sourceCount=0]
   * @param {number} [params.iterations] - react 전용
   * @param {number} [params.maxIterations] - react 전용
   */
  traceEnd({
    reason,
    answerLength = 0,
    sourceCount = 0,
    iterations,
    maxIterations,
  }) {
    this.endReason = reason;
    const totalMs = Date.now() - this.startTime;
    const isError = ["search_error", "empty_llm_response", "error"].includes(
      reason
    );
    const isRefusal = ["query_no_context", "query_no_embeddings"].includes(
      reason
    );

    const logFn = isError ? "_error" : "_log";
    const tag = isError ? " (ERROR)" : isRefusal ? " (REFUSAL)" : "";

    this[logFn](`═══ TRACE_END${tag} ═══`);

    if (this.chatMode === "react") {
      this[logFn](
        `reason: ${reason} | iterations: ${iterations}/${maxIterations} | llmCalls: ${this.llmCallCount} | searches: ${this.searchCount}`
      );
      if (answerLength > 0) {
        this[logFn](
          `answer: ${answerLength} chars | sources: ${sourceCount} | totalTime: ${totalMs}ms`
        );
      } else {
        this[logFn](`totalTime: ${totalMs}ms`);
      }
    } else {
      if (answerLength > 0) {
        this[logFn](
          `reason: ${reason} | answer: ${answerLength} chars | sources: ${sourceCount} | totalTime: ${totalMs}ms`
        );
      } else {
        this[logFn](`reason: ${reason} | totalTime: ${totalMs}ms`);
      }
    }
  }

  /**
   * ═══ TRACE_SUMMARY ═══ — 전체 파이프라인 1줄 요약
   */
  traceSummary() {
    const totalMs = Date.now() - this.startTime;
    const parts = [`${this.chatMode} mode`];

    if (this.chatMode === "react") {
      parts.push(`${this.iterationCount} iter`);
    }
    if (this.llmCallCount > 0) {
      parts.push(`${this.llmCallCount} LLM(${this.totalLlmMs}ms)`);
    }
    if (this.searchCount > 0) {
      parts.push(`${this.searchCount} search(${this.totalSearchMs}ms)`);
    }
    if (this.toolCallCount > 0) {
      parts.push(`${this.toolCallCount} tools`);
    }
    if (
      this.endReason === "query_no_context" ||
      this.endReason === "query_no_embeddings"
    ) {
      parts.push("REFUSED");
    }
    parts.push(`total ${totalMs}ms`);

    this._log(`═══ TRACE_SUMMARY: ${parts.join(", ")} ═══`);
  }

  // ─────────────────────────────────────
  //  ReAct 전용 메서드
  // ─────────────────────────────────────

  /**
   * ─── Iteration N/M ───
   */
  iterationStart(iteration, maxIterations) {
    this.iterationCount = iteration;
    this._log(`─── Iteration ${iteration}/${maxIterations} ───`);
  }

  /**
   * [PARSE] — ReAct 파싱 결과
   * @param {object} parsed - parseReactOutput() 반환값
   */
  parseResult(parsed) {
    if (parsed.type === "final_answer") {
      const thoughtTag = parsed.thought
        ? ` | thought="${this._truncate(parsed.thought, 60)}"`
        : "";
      this._log(`[PARSE] type=final_answer${thoughtTag}`);
    } else if (parsed.type === "action") {
      const thoughtTag = parsed.thought
        ? ` | thought="${this._truncate(parsed.thought, 60)}"`
        : "";
      this._log(
        `[PARSE] type=action${thoughtTag} | action=${parsed.action} | query="${this._truncate(parsed.actionInput, 60)}"`
      );
    } else {
      this._log(`[PARSE] type=incomplete`);
    }
  }

  /**
   * [OBSERVATION] — 검색 결과 observation 길이
   * @param {number} length
   * @param {boolean} truncated
   */
  observation(length, truncated) {
    const truncTag = truncated ? ", truncated" : "";
    this._log(`[OBSERVATION] ${length} chars${truncTag}`);
  }

  // ─────────────────────────────────────
  //  유틸리티
  // ─────────────────────────────────────

  _truncate(str, maxLen) {
    if (!str) return "";
    if (typeof str !== "string") return String(str);
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + "...";
  }
}

module.exports = { ChatTraceLogger };
