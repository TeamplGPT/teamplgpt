/**
 * HR skill handler 실행 하네스 (specs/015) — 네트워크 없이 handler를 돌려
 * kiwibox 요청({path, form})과 반환 문자열을 그대로 기록한다.
 *
 * handler는 `this.clientToolTransport`가 있으면 R1 클라이언트 위임 경로를 탄다
 * (_shared/hrSession.js hrFetch). 여기서 그 전송을 가로채 응답을 주입한다.
 */
const path = require("path");

const SKILLS_DIR = path.resolve(
  __dirname,
  "../../../../../storage/plugins/agent-skills"
);

// 2026-10-15 정오(서울) — 계약 테스트 벡터(contracts/period-resolver.md)와 같은 기준일
const FIXED_NOW = new Date("2026-10-15T12:00:00+09:00");

// Date만 고정한다. 타이머·마이크로태스크까지 가짜로 바꾸면 handler의 await가 멈출 수 있다.
function freezeClock(now = FIXED_NOW) {
  jest.useFakeTimers({
    now,
    doNotFake: [
      "nextTick",
      "setImmediate",
      "clearImmediate",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "queueMicrotask",
      "hrtime",
      "performance",
    ],
  });
}

function loadHandler(skill) {
  return require(path.join(SKILLS_DIR, skill, "handler.js")).runtime.handler;
}

/**
 * @param {string} skill - 예: "hr-attendance"
 * @param {object} params - handler 인자
 * @param {(req: {path: string, form: object}) => object|{__raw: object}} respond
 *   본문으로 쓸 JSON 객체를 반환한다. `{ __raw: {ok, status, body} }`면 전송 결과를 그대로 쓴다.
 *   예외를 던지면 위임 오류로 처리된다.
 * @param {object} [runtimeArgs]
 * @returns {Promise<{calls: Array<{path: string, form: object}>, output: string}>}
 */
async function runHandler(skill, params, respond, runtimeArgs = {}) {
  const calls = [];
  const ctx = {
    runtimeArgs: { HR_WKAREA_CD: "1000", HR_SAL_APPL_CD: "", ...runtimeArgs },
    introspect: () => {},
    logger: () => {},
    clientToolTransport: async ({ path: p, form }) => {
      const req = { path: p, form: { ...form } };
      calls.push(req);
      const res = await respond(req);
      if (res && res.__raw) return res.__raw;
      return { ok: true, status: 200, body: JSON.stringify(res) };
    },
  };
  const output = await loadHandler(skill).call(ctx, params);
  return { calls, output };
}

module.exports = { SKILLS_DIR, FIXED_NOW, freezeClock, loadHandler, runHandler };
