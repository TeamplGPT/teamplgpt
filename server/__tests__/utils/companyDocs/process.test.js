const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codocs-"));
const mockDocumentsPath = path.join(tmpRoot, "documents");
const mockHotdirPath = path.join(tmpRoot, "hotdir");

const mockProcessDocument = jest.fn();
const mockAddDocumentToNamespace = jest.fn();
const mockDeleteDocumentFromNamespace = jest.fn();
const mockNamespaceCount = jest.fn();
const mockHasNamespace = jest.fn();
const mockDeleteNamespace = jest.fn();
const mockVectorsDelete = jest.fn();
const mockPurgeVectorCache = jest.fn();

// utils/files 원본과 같은 경로 검사 (원본은 로드 시 STORAGE_DIR를 요구)
jest.mock("../../../utils/files", () => {
  const p = require("path");
  return {
    documentsPath: mockDocumentsPath,
    hotdirPath: mockHotdirPath,
    isWithin: (outer, inner) => {
      if (outer === inner) return false;
      const rel = p.relative(outer, inner);
      return !rel.startsWith("../") && rel !== "..";
    },
    normalizePath: (filepath = "") => {
      const result = p
        .normalize(filepath.trim())
        .replace(/^(\.\.(\/|\\|$))+/, "")
        .trim();
      if (["..", ".", "/"].includes(result)) throw new Error("Invalid path.");
      return result;
    },
    purgeVectorCache: (...args) => mockPurgeVectorCache(...args),
  };
});
jest.mock("../../../utils/collectorApi", () => ({
  CollectorApi: jest.fn().mockImplementation(() => ({
    processDocument: (...args) => mockProcessDocument(...args),
  })),
}));
jest.mock("../../../utils/helpers", () => ({
  getVectorDbClass: () => ({
    addDocumentToNamespace: (...args) => mockAddDocumentToNamespace(...args),
    deleteDocumentFromNamespace: (...args) =>
      mockDeleteDocumentFromNamespace(...args),
    namespaceCount: (...args) => mockNamespaceCount(...args),
    hasNamespace: (...args) => mockHasNamespace(...args),
    "delete-namespace": (...args) => mockDeleteNamespace(...args),
  }),
}));
jest.mock("../../../models/vectors", () => ({
  DocumentVectors: { delete: (...args) => mockVectorsDelete(...args) },
}));
jest.mock("../../../models/embedCompanyDocument", () => {
  const actual = jest.requireActual("../../../models/embedCompanyDocument");
  return {
    EmbedCompanyDocument: {
      ...actual.EmbedCompanyDocument,
      get: jest.fn(),
      updateStatus: jest.fn(),
      listProcessing: jest.fn(),
      listByEmbed: jest.fn(),
    },
  };
});

const {
  EmbedCompanyDocument,
} = require("../../../models/embedCompanyDocument");
const {
  processCompanyDocument,
  removeCompanyDocumentArtifacts,
  dropNamespaceIfEmpty,
  removeCompanyDocsForEmbed,
  failureCode,
  companyDocsPath,
  COMPANY_DOC_ERRORS,
} = require("../../../utils/companyDocs/process");
const { enqueue, recoverOnBoot } = require("../../../utils/companyDocs/queue");

const HASH = EmbedCompanyDocument.companyHash("오이사공");
const ROW = {
  id: 7,
  embed_id: 1,
  company_key: "오이사공",
  company_hash: HASH,
  filename: "취업규칙.hwp",
  status: "processing",
};
const NAMESPACE = `ws-co-1-${HASH}`;

function collectorWrites(name, pageContent = "제1조 목적") {
  const folder = path.join(mockDocumentsPath, "custom-documents");
  fs.mkdirSync(folder, { recursive: true });
  const location = `custom-documents/${name}`;
  fs.writeFileSync(
    path.join(mockDocumentsPath, location),
    JSON.stringify({ title: "abcd1234-취업규칙.hwp", pageContent })
  );
  return { location, pageContent };
}

beforeEach(() => {
  jest.clearAllMocks();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(mockHotdirPath, { recursive: true });
  EmbedCompanyDocument.get.mockResolvedValue({ ...ROW });
  EmbedCompanyDocument.updateStatus.mockImplementation(async (id, data) => ({
    ...ROW,
    ...data,
  }));
  mockAddDocumentToNamespace.mockResolvedValue({
    vectorized: true,
    error: null,
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe("failureCode", () => {
  it.each([
    ["[DRM_PROTECTED] Could not parse a.hwp.", "DRM"],
    ["[ENCRYPTED] Could not parse a.hwp.", "ENCRYPTED"],
    ["No text content found in a.pdf.", "NO_TEXT"],
    ["[CORRUPTED] Could not parse a.hwp.", "GENERIC"],
    [undefined, "GENERIC"],
  ])("%s", (reason, expected) => {
    expect(failureCode(reason)).toBe(expected);
  });

  it("stores language-neutral codes, not sentences", () => {
    expect(Object.values(COMPANY_DOC_ERRORS)).toEqual([
      "DRM",
      "ENCRYPTED",
      "NO_TEXT",
      "GENERIC",
      "INTERRUPTED",
    ]);
  });
});

describe("processCompanyDocument", () => {
  it("converts, moves the JSON out of documents/, vectorizes and marks ready", async () => {
    const { location } = collectorWrites("abcd1234-hwp-uuid.json");
    mockProcessDocument.mockResolvedValue({
      success: true,
      documents: [{ location }],
    });

    await processCompanyDocument({
      row: ROW,
      hotdirFilename: "abcd1234-취업규칙.hwp",
      namespace: NAMESPACE,
    });

    expect(mockProcessDocument).toHaveBeenCalledWith("abcd1234-취업규칙.hwp");
    expect(fs.existsSync(path.join(mockDocumentsPath, location))).toBe(false);
    const moved = path.join(companyDocsPath(), HASH, "abcd1234-hwp-uuid.json");
    expect(fs.existsSync(moved)).toBe(true);

    const [ns, data, cacheKey] = mockAddDocumentToNamespace.mock.calls[0];
    expect(ns).toBe(NAMESPACE);
    expect(data.pageContent).toBe("제1조 목적");
    expect(data.title).toBe("취업규칙.hwp");
    expect(data.docId).toEqual(expect.any(String));
    expect(cacheKey).toBe(`company-documents/${HASH}/abcd1234-hwp-uuid.json`);

    // 임베딩 전에 doc_id·location을 먼저 기록해 둔다 — 중간에 끊겨도 정리할 수 있게
    expect(EmbedCompanyDocument.updateStatus).toHaveBeenNthCalledWith(1, 7, {
      doc_id: data.docId,
      location: `${HASH}/abcd1234-hwp-uuid.json`,
    });
    expect(
      EmbedCompanyDocument.updateStatus.mock.invocationCallOrder[0]
    ).toBeLessThan(mockAddDocumentToNamespace.mock.invocationCallOrder[0]);
    expect(EmbedCompanyDocument.updateStatus).toHaveBeenNthCalledWith(2, 7, {
      status: "ready",
      error: null,
    });
  });

  it("joins multiple collector documents into one", async () => {
    const a = collectorWrites("a.json", "첫째");
    const b = collectorWrites("b.json", "둘째");
    mockProcessDocument.mockResolvedValue({
      success: true,
      documents: [{ location: a.location }, { location: b.location }],
    });

    await processCompanyDocument({
      row: ROW,
      hotdirFilename: "x",
      namespace: NAMESPACE,
    });

    expect(mockAddDocumentToNamespace.mock.calls[0][1].pageContent).toBe(
      "첫째\n\n둘째"
    );
    expect(fs.existsSync(path.join(mockDocumentsPath, b.location))).toBe(false);
  });

  it("marks failed with the user-facing reason when conversion fails", async () => {
    mockProcessDocument.mockResolvedValue({
      success: false,
      reason: "[DRM_PROTECTED] Could not parse a.hwp.",
      documents: [],
    });

    await processCompanyDocument({
      row: ROW,
      hotdirFilename: "a.hwp",
      namespace: NAMESPACE,
    });

    expect(mockAddDocumentToNamespace).not.toHaveBeenCalled();
    expect(EmbedCompanyDocument.updateStatus).toHaveBeenCalledWith(7, {
      status: "failed",
      error: "DRM",
    });
  });

  it("removes the hotdir file if the collector left it behind", async () => {
    fs.writeFileSync(path.join(mockHotdirPath, "left.pdf"), "x");
    mockProcessDocument.mockResolvedValue({
      success: false,
      reason: "down",
      documents: [],
    });

    await processCompanyDocument({
      row: ROW,
      hotdirFilename: "left.pdf",
      namespace: NAMESPACE,
    });

    expect(fs.existsSync(path.join(mockHotdirPath, "left.pdf"))).toBe(false);
  });

  it("marks failed and drops the JSON when vectorizing fails", async () => {
    const { location } = collectorWrites("v.json");
    mockProcessDocument.mockResolvedValue({
      success: true,
      documents: [{ location }],
    });
    mockAddDocumentToNamespace.mockResolvedValue({
      vectorized: false,
      error: "boom",
    });

    await processCompanyDocument({
      row: ROW,
      hotdirFilename: "v",
      namespace: NAMESPACE,
    });

    const docId = mockAddDocumentToNamespace.mock.calls[0][1].docId;
    expect(mockDeleteDocumentFromNamespace).toHaveBeenCalledWith(
      NAMESPACE,
      docId
    );
    expect(EmbedCompanyDocument.updateStatus).toHaveBeenLastCalledWith(7, {
      status: "failed",
      error: "GENERIC",
      doc_id: null,
      location: null,
    });
    expect(fs.existsSync(path.join(companyDocsPath(), HASH, "v.json"))).toBe(
      false
    );
  });

  it("does not vectorize when the row was deleted during conversion", async () => {
    const { location } = collectorWrites("gone.json");
    mockProcessDocument.mockResolvedValue({
      success: true,
      documents: [{ location }],
    });
    EmbedCompanyDocument.updateStatus.mockResolvedValueOnce(null);

    await processCompanyDocument({
      row: ROW,
      hotdirFilename: "gone",
      namespace: NAMESPACE,
    });

    expect(mockAddDocumentToNamespace).not.toHaveBeenCalled();
    expect(EmbedCompanyDocument.updateStatus).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(companyDocsPath(), HASH, "gone.json"))).toBe(
      false
    );
  });

  it("removes the vectors when the row was deleted while vectorizing", async () => {
    const { location } = collectorWrites("late.json");
    mockProcessDocument.mockResolvedValue({
      success: true,
      documents: [{ location }],
    });
    EmbedCompanyDocument.updateStatus
      .mockResolvedValueOnce({ ...ROW })
      .mockResolvedValueOnce(null);
    mockHasNamespace.mockResolvedValue(true);
    mockNamespaceCount.mockResolvedValue(0);

    await processCompanyDocument({
      row: ROW,
      hotdirFilename: "late",
      namespace: NAMESPACE,
    });

    const docId = mockAddDocumentToNamespace.mock.calls[0][1].docId;
    expect(mockDeleteDocumentFromNamespace).toHaveBeenCalledWith(
      NAMESPACE,
      docId
    );
    expect(mockVectorsDelete).toHaveBeenCalledWith({ docId });
    expect(mockNamespaceCount).toHaveBeenCalledWith(NAMESPACE);
    expect(fs.existsSync(path.join(companyDocsPath(), HASH, "late.json"))).toBe(
      false
    );
  });
});

describe("removeCompanyDocumentArtifacts", () => {
  it("deletes vectors, vector records, JSON and cache", async () => {
    const dir = path.join(companyDocsPath(), HASH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "r.json"), "{}");

    await removeCompanyDocumentArtifacts(
      { doc_id: "d1", location: `${HASH}/r.json` },
      NAMESPACE
    );

    expect(mockDeleteDocumentFromNamespace).toHaveBeenCalledWith(
      NAMESPACE,
      "d1"
    );
    expect(mockVectorsDelete).toHaveBeenCalledWith({ docId: "d1" });
    expect(mockPurgeVectorCache).toHaveBeenCalledWith(
      `company-documents/${HASH}/r.json`
    );
    expect(fs.existsSync(path.join(dir, "r.json"))).toBe(false);
  });

  it("refuses a location outside the company-documents folder", async () => {
    const outside = path.join(tmpRoot, "secret.json");
    fs.writeFileSync(outside, "{}");

    await removeCompanyDocumentArtifacts(
      { doc_id: null, location: "../secret.json" },
      NAMESPACE
    );

    expect(fs.existsSync(outside)).toBe(true);
  });

  it("does nothing for a row that never finished processing", async () => {
    await removeCompanyDocumentArtifacts(
      { doc_id: null, location: null },
      NAMESPACE
    );
    expect(mockDeleteDocumentFromNamespace).not.toHaveBeenCalled();
    expect(mockVectorsDelete).not.toHaveBeenCalled();
  });
});

describe("dropNamespaceIfEmpty", () => {
  it("drops an existing namespace with no vectors left", async () => {
    mockHasNamespace.mockResolvedValue(true);
    mockNamespaceCount.mockResolvedValue(0);
    await dropNamespaceIfEmpty(NAMESPACE);
    expect(mockDeleteNamespace).toHaveBeenCalledWith({ namespace: NAMESPACE });
  });

  it("keeps a namespace that still has vectors", async () => {
    mockHasNamespace.mockResolvedValue(true);
    mockNamespaceCount.mockResolvedValue(3);
    await dropNamespaceIfEmpty(NAMESPACE);
    expect(mockDeleteNamespace).not.toHaveBeenCalled();
  });

  it("does nothing when the namespace does not exist", async () => {
    mockHasNamespace.mockResolvedValue(false);
    await dropNamespaceIfEmpty(NAMESPACE);
    expect(mockDeleteNamespace).not.toHaveBeenCalled();
  });
});

describe("removeCompanyDocsForEmbed", () => {
  it("removes every company document's artifacts and returns their namespaces", async () => {
    const other = EmbedCompanyDocument.companyHash("다른회사");
    EmbedCompanyDocument.listByEmbed.mockResolvedValue([
      { id: 1, company_hash: HASH, doc_id: "d1", location: null },
      { id: 2, company_hash: HASH, doc_id: "d2", location: null },
      { id: 3, company_hash: other, doc_id: null, location: null },
    ]);

    const namespaces = await removeCompanyDocsForEmbed({
      id: 1,
      workspace: { slug: "ws" },
    });

    expect(namespaces.sort()).toEqual(
      [`ws-co-1-${HASH}`, `ws-co-1-${other}`].sort()
    );
    expect(mockDeleteDocumentFromNamespace).toHaveBeenCalledWith(
      `ws-co-1-${HASH}`,
      "d1"
    );
    expect(mockDeleteDocumentFromNamespace).toHaveBeenCalledWith(
      `ws-co-1-${HASH}`,
      "d2"
    );
    expect(mockDeleteDocumentFromNamespace).toHaveBeenCalledTimes(2);
  });

  it("returns nothing for an embed without a workspace", async () => {
    expect(await removeCompanyDocsForEmbed({ id: 1 })).toEqual([]);
    expect(EmbedCompanyDocument.listByEmbed).not.toHaveBeenCalled();
  });
});

describe("queue", () => {
  it("runs one job at a time in order", async () => {
    const events = [];
    const job = (name, ms) => async () => {
      events.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      events.push(`end ${name}`);
    };
    await Promise.all([
      enqueue(job("a", 20)),
      enqueue(job("b", 1)),
      enqueue(job("c", 1)),
    ]);
    expect(events).toEqual([
      "start a",
      "end a",
      "start b",
      "end b",
      "start c",
      "end c",
    ]);
  });

  it("keeps going after a job throws", async () => {
    const ran = [];
    await Promise.all([
      enqueue(async () => {
        throw new Error("x");
      }),
      enqueue(async () => ran.push("next")),
    ]);
    expect(ran).toEqual(["next"]);
  });

  it("moves on when a job exceeds its timeout", async () => {
    const ran = [];
    await Promise.all([
      enqueue(() => new Promise(() => {}), 20),
      enqueue(async () => ran.push("next")),
    ]);
    expect(ran).toEqual(["next"]);
  });

  it("recoverOnBoot removes partial vectors and fails rows left in processing", async () => {
    EmbedCompanyDocument.listProcessing.mockResolvedValue([
      {
        id: 9,
        embed_id: 1,
        company_hash: HASH,
        doc_id: "d9",
        location: null,
        embed_config: { workspace: { slug: "ws" } },
      },
      {
        id: 10,
        embed_id: 1,
        company_hash: HASH,
        doc_id: null,
        location: null,
        embed_config: { workspace: null },
      },
    ]);
    mockHasNamespace.mockResolvedValue(true);
    mockNamespaceCount.mockResolvedValue(0);

    await recoverOnBoot();

    expect(mockDeleteDocumentFromNamespace).toHaveBeenCalledWith(
      NAMESPACE,
      "d9"
    );
    expect(mockDeleteNamespace).toHaveBeenCalledWith({ namespace: NAMESPACE });
    for (const id of [9, 10])
      expect(EmbedCompanyDocument.updateStatus).toHaveBeenCalledWith(id, {
        status: "failed",
        error: "INTERRUPTED",
        doc_id: null,
        location: null,
      });
  });
});
