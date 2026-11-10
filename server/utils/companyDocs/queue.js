const { recoverInterruptedDocuments } = require("./process");

// 회사 문서 변환·임베딩은 한 번에 1건만 — 임베딩 API·collector 부하를 묶어 둔다.
// 대기열은 프로세스 메모리에 있으므로 서버 인스턴스 1개 전제다
const pending = [];
let running = false;
// 대기 중 업로드 파일이 hotdir를 채우지 않게 상한(최대 50MB × 20)
const MAX_PENDING = 20;
// collector가 응답하지 않아도 뒤 작업이 막히지 않게 한다. 넘긴 작업은 백그라운드에서 마저 끝난다
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function drain() {
  if (running) return;
  running = true;
  while (pending.length) {
    const { job, resolve, timeoutMs } = pending.shift();
    try {
      await withTimeout(Promise.resolve().then(job), timeoutMs);
    } catch (e) {
      console.error("[companyDocs] queued job failed:", e.message);
    }
    resolve();
  }
  running = false;
}

function enqueue(job, timeoutMs = JOB_TIMEOUT_MS) {
  return new Promise((resolve) => {
    pending.push({ job, resolve, timeoutMs });
    drain();
  });
}

function isFull() {
  return pending.length >= MAX_PENDING;
}

async function recoverOnBoot() {
  try {
    await recoverInterruptedDocuments();
  } catch (e) {
    console.error("[companyDocs] boot recovery failed:", e.message);
  }
}

module.exports = { enqueue, isFull, recoverOnBoot };
