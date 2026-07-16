const {
  ClientToolBroker,
} = require("../clientToolBroker");

function makeResponseStub() {
  const chunks = [];
  return {
    chunks,
    writableEnded: false,
    writable: true,
    write(raw) {
      chunks.push(raw);
      return true;
    },
  };
}

function lastChunkOf(response) {
  const raw = response.chunks[response.chunks.length - 1];
  // SSE 포맷: "data: {...}\n\n"
  return JSON.parse(raw.replace(/^data: /, ""));
}

describe("ClientToolBroker", () => {
  test("request는 clientToolRequest SSE 이벤트를 기록하고 결과 회신으로 resolve된다", async () => {
    const response = makeResponseStub();
    const broker = new ClientToolBroker({
      response,
      uuid: "chat-uuid",
      embedUuid: "embed-1",
      sessionId: "sess-1",
    });

    const promise = broker.request({ path: "/x.do", method: "POST", form: {} });
    const evt = lastChunkOf(response);
    expect(evt.type).toBe("clientToolRequest");
    expect(evt.callId).toBeTruthy();
    expect(evt.spec.path).toBe("/x.do");

    const matched = ClientToolBroker.resolveResult({
      callId: evt.callId,
      embedUuid: "embed-1",
      sessionId: "sess-1",
      result: { ok: true, status: 200, body: '{"result":[]}' },
    });
    expect(matched).toBe(true);
    await expect(promise).resolves.toEqual({
      ok: true,
      status: 200,
      body: '{"result":[]}',
    });
  });

  test("embedUuid/sessionId 불일치 결과는 거부된다 (위조 주입 차단)", async () => {
    const response = makeResponseStub();
    const broker = new ClientToolBroker({
      response,
      uuid: "u",
      embedUuid: "embed-1",
      sessionId: "sess-1",
      timeoutMs: 100,
    });
    const promise = broker.request({ path: "/x.do", form: {} });
    const evt = lastChunkOf(response);

    expect(
      ClientToolBroker.resolveResult({
        callId: evt.callId,
        embedUuid: "embed-OTHER",
        sessionId: "sess-1",
        result: { ok: true, status: 200, body: "" },
      })
    ).toBe(false);
    expect(
      ClientToolBroker.resolveResult({
        callId: evt.callId,
        embedUuid: "embed-1",
        sessionId: "sess-OTHER",
        result: { ok: true, status: 200, body: "" },
      })
    ).toBe(false);

    await expect(promise).rejects.toThrow(/timed out/);
  });

  test("모르는 callId는 matched=false", () => {
    expect(
      ClientToolBroker.resolveResult({
        callId: "nope",
        embedUuid: "e",
        sessionId: "s",
        result: { ok: true, status: 200, body: "" },
      })
    ).toBe(false);
  });

  test("타임아웃 시 reject되고 pending에서 제거된다", async () => {
    const response = makeResponseStub();
    const broker = new ClientToolBroker({
      response,
      uuid: "u",
      embedUuid: "e",
      sessionId: "s",
      timeoutMs: 30,
    });
    const before = ClientToolBroker.pendingCount();
    const promise = broker.request({ path: "/x.do", form: {} });
    await expect(promise).rejects.toThrow(/timed out/);
    expect(ClientToolBroker.pendingCount()).toBe(before);
  });

  test("disposeAll은 잔여 pending을 reject한다 (스트림 종료 정리)", async () => {
    const response = makeResponseStub();
    const broker = new ClientToolBroker({
      response,
      uuid: "u",
      embedUuid: "e",
      sessionId: "s",
    });
    const promise = broker.request({ path: "/x.do", form: {} });
    broker.disposeAll();
    await expect(promise).rejects.toThrow(/stream ended/);
  });

  test("스트림이 이미 닫혔으면 request는 즉시 reject", async () => {
    const response = makeResponseStub();
    response.writableEnded = true;
    const broker = new ClientToolBroker({
      response,
      uuid: "u",
      embedUuid: "e",
      sessionId: "s",
    });
    await expect(broker.request({ path: "/x.do", form: {} })).rejects.toThrow(
      /stream closed/
    );
  });
});
