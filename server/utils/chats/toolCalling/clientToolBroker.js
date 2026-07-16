const { v4: uuidv4 } = require("uuid");
const {
  writeResponseChunk,
  isResponseWritable,
} = require("../../helpers/chat/responses");

/**
 * ClientToolBroker — R1(부모 브리지 클라이언트 실행형) 프로토콜의 서버측 중개자.
 * 스펙: specs/003-hr-multiuser-session/plan.md
 *
 * 흐름:
 *   1. skill handler가 transport로 request(spec) 호출
 *   2. broker가 SSE `clientToolRequest` 이벤트를 위젯 스트림에 기록하고 pending 등록
 *   3. 위젯 → 부모 브리지(postMessage) → kiwibox fetch → 결과 회신
 *   4. POST /embed/:embedId/client-tool-result 가 resolveResult() 호출 → pending resolve
 *
 * 보안:
 *   - callId는 uuidv4 — 추측 불가
 *   - resolveResult는 embedUuid + sessionId 일치 검증 (타 세션이 결과 위조 주입 불가)
 *   - 요청 스트림 종료 시 disposeAll()로 잔여 pending reject (메모리 누수 방지)
 *   - 단일 프로세스 전제(인메모리 registry) — 다중 인스턴스 배포 시 sticky session 필요
 */

const DEFAULT_TIMEOUT_MS = 30_000;

/** @type {Map<string, {resolve: Function, reject: Function, embedUuid: string, sessionId: string, timer: NodeJS.Timeout}>} */
const pendingCalls = new Map();

class ClientToolBroker {
  /**
   * @param {object} opts
   * @param {import("express").Response} opts.response - SSE 스트림
   * @param {string} opts.uuid - 응답 chunk id
   * @param {string} opts.embedUuid - embed_configs.uuid
   * @param {string} opts.sessionId - embed session id
   * @param {number} [opts.timeoutMs]
   */
  constructor({ response, uuid, embedUuid, sessionId, timeoutMs }) {
    this.response = response;
    this.uuid = uuid;
    this.embedUuid = embedUuid;
    this.sessionId = sessionId;
    this.timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
    this.ownCallIds = new Set();
  }

  /**
   * 브리지에 kiwibox 호출을 위임하고 결과를 기다린다.
   * @param {object} spec - { path: string, method: "POST"|"GET", form: Object<string,string> }
   * @returns {Promise<{ok: boolean, status: number, body: string}>}
   */
  request(spec) {
    if (!isResponseWritable(this.response)) {
      return Promise.reject(
        new Error("client stream closed — cannot delegate tool call")
      );
    }
    const callId = uuidv4();
    this.ownCallIds.add(callId);

    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingCalls.delete(callId);
        this.ownCallIds.delete(callId);
        reject(new Error("client tool call timed out"));
      }, this.timeoutMs);
      pendingCalls.set(callId, {
        resolve,
        reject,
        embedUuid: this.embedUuid,
        sessionId: this.sessionId,
        timer,
      });
    });

    writeResponseChunk(this.response, {
      uuid: this.uuid,
      sources: [],
      type: "clientToolRequest",
      callId,
      spec,
      close: false,
      error: false,
    });

    return resultPromise;
  }

  /**
   * 결과 회신 endpoint에서 호출. embed/session 검증 후 pending resolve.
   * @param {object} params
   * @param {string} params.callId
   * @param {string} params.embedUuid
   * @param {string} params.sessionId
   * @param {{ok: boolean, status: number, body: string}} params.result
   * @returns {boolean} 매칭되어 resolve됐는지
   */
  static resolveResult({ callId, embedUuid, sessionId, result }) {
    const entry = pendingCalls.get(callId);
    if (!entry) return false;
    if (entry.embedUuid !== embedUuid || entry.sessionId !== sessionId) {
      return false;
    }
    clearTimeout(entry.timer);
    pendingCalls.delete(callId);
    entry.resolve({
      ok: result?.ok === true,
      status: Number(result?.status) || 0,
      body: typeof result?.body === "string" ? result.body : "",
    });
    return true;
  }

  /** 스트림 종료 시 이 broker 소유 pending 전부 정리. */
  disposeAll() {
    for (const callId of this.ownCallIds) {
      const entry = pendingCalls.get(callId);
      if (!entry) continue;
      clearTimeout(entry.timer);
      pendingCalls.delete(callId);
      entry.reject(new Error("stream ended before client tool result"));
    }
    this.ownCallIds.clear();
  }

  /** 테스트용 — 현재 pending 수 */
  static pendingCount() {
    return pendingCalls.size;
  }
}

module.exports = { ClientToolBroker, DEFAULT_TIMEOUT_MS };
