/* eslint-env jest, node */
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");

const mockHotdir = fs.mkdtempSync(path.join(os.tmpdir(), "codocs-hotdir-"));
let mockEmbed = null;

jest.mock("../../utils/files", () => {
  const p = require("path");
  return {
    hotdirPath: mockHotdir,
    normalizePath: (filepath = "") => {
      const result = p
        .normalize(filepath.trim())
        .replace(/^(\.\.(\/|\\|$))+/, "")
        .trim();
      if (["..", ".", "/"].includes(result)) throw new Error("Invalid path.");
      return result;
    },
  };
});
jest.mock("../../utils/middleware/embedMiddleware", () => ({
  validEmbedConfig: (_req, res, next) => {
    if (!mockEmbed) return res.sendStatus(404);
    res.locals.embedConfig = mockEmbed;
    next();
  },
}));
jest.mock("../../models/embedConfig", () => ({
  EmbedConfig: {
    parseAllowedHosts: (embed) =>
      embed.allowlist_domains ? JSON.parse(embed.allowlist_domains) : null,
  },
}));
jest.mock("../../models/embedCompanyDocument", () => {
  const actual = jest.requireActual("../../models/embedCompanyDocument");
  return {
    EmbedCompanyDocument: {
      ...actual.EmbedCompanyDocument,
      create: jest.fn(),
      listFor: jest.fn(),
      getOwned: jest.fn(),
      delete: jest.fn(),
    },
  };
});
jest.mock("../../utils/companyDocs/queue", () => ({
  enqueue: jest.fn(),
  isFull: jest.fn(() => false),
}));
jest.mock("../../utils/companyDocs/process", () => ({
  processCompanyDocument: jest.fn(),
  removeCompanyDocumentArtifacts: jest.fn(),
  dropNamespaceIfEmpty: jest.fn(),
  readCompanyDocumentContent: jest.fn(),
}));

const { EmbedCompanyDocument } = require("../../models/embedCompanyDocument");
const { enqueue, isFull } = require("../../utils/companyDocs/queue");
const {
  processCompanyDocument,
  removeCompanyDocumentArtifacts,
  dropNamespaceIfEmpty,
  readCompanyDocumentContent,
} = require("../../utils/companyDocs/process");
const {
  embedCompanyDocumentsEndpoints,
  COMPANY_DOC_MAX_BYTES,
} = require("../../endpoints/embedCompanyDocuments");

const HASH = EmbedCompanyDocument.companyHash("오이사공");
const BASE_EMBED = {
  id: 1,
  uuid: "embed-uuid",
  enabled: true,
  allow_company_documents: true,
  allowlist_domains: null,
  workspace: { slug: "ws" },
};

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  const router = express.Router();
  app.use("/api", router);
  embedCompanyDocumentsEndpoints(router);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/embed/embed-uuid/company-documents`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(mockHotdir, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEmbed = { ...BASE_EMBED };
  for (const f of fs.readdirSync(mockHotdir))
    fs.rmSync(path.join(mockHotdir, f));
  EmbedCompanyDocument.create.mockImplementation(async (data) => ({
    id: 11,
    embed_id: data.embedId,
    company_key: data.companyKey,
    company_hash: EmbedCompanyDocument.companyHash(data.companyKey),
    filename: data.filename,
    uploader_name: data.uploaderName || null,
    status: "processing",
    error: null,
    createdAt: "2026-11-10T01:00:00.000Z",
  }));
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

function form({
  companyName = "오이사공",
  name = "취업규칙.hwp",
  size = 4,
  uploaderName,
} = {}) {
  const fd = new FormData();
  if (companyName !== undefined) fd.append("companyName", companyName);
  if (uploaderName) fd.append("uploaderName", uploaderName);
  if (name) fd.append("file", new Blob([Buffer.alloc(size, 1)]), name);
  return fd;
}

const q = (name = "오이사공") => `?companyName=${encodeURIComponent(name)}`;

describe("gating", () => {
  it("403 when the embed does not allow company documents", async () => {
    mockEmbed.allow_company_documents = false;
    const res = await fetch(baseUrl + q());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "COMPANY_DOCS_DISABLED" });
  });

  it("403 when the embed is disabled", async () => {
    mockEmbed.enabled = false;
    expect((await fetch(baseUrl + q())).status).toBe(403);
  });

  it("401 when the origin is not in the allowlist", async () => {
    mockEmbed.allowlist_domains = JSON.stringify(["https://ok.example.com"]);
    const res = await fetch(baseUrl + q(), {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "ORIGIN_NOT_ALLOWED" });
    const ok = await fetch(baseUrl + q(), {
      headers: { Origin: "https://ok.example.com" },
    });
    EmbedCompanyDocument.listFor.mockResolvedValue([]);
    expect(ok.status).not.toBe(401);
  });

  it("400 when companyName is missing or blank", async () => {
    expect((await fetch(baseUrl)).status).toBe(400);
    const res = await fetch(baseUrl + q("   "));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "COMPANY_REQUIRED" });
  });
});

describe("GET", () => {
  it("lists only this company's documents in public shape", async () => {
    EmbedCompanyDocument.listFor.mockResolvedValue([
      {
        id: 3,
        filename: "a.pdf",
        uploader_name: "홍길동",
        status: "ready",
        error: null,
        doc_id: "secret",
        company_key: "오이사공",
        createdAt: "2026-11-10T01:00:00.000Z",
      },
    ]);
    const res = await fetch(baseUrl + q("  오이사공 "));
    expect(res.status).toBe(200);
    expect(EmbedCompanyDocument.listFor).toHaveBeenCalledWith(1, HASH);
    expect(await res.json()).toEqual({
      documents: [
        {
          id: 3,
          filename: "a.pdf",
          uploaderName: "홍길동",
          status: "ready",
          error: null,
          createdAt: "2026-11-10T01:00:00.000Z",
        },
      ],
    });
  });
});

describe("POST", () => {
  it("202 + queues processing with a uuid-prefixed hotdir file", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      body: form({ uploaderName: "홍길동" }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.document).toMatchObject({
      id: 11,
      filename: "취업규칙.hwp",
      uploaderName: "홍길동",
      status: "processing",
    });
    expect(EmbedCompanyDocument.create).toHaveBeenCalledWith({
      embedId: 1,
      companyKey: "오이사공",
      filename: "취업규칙.hwp",
      uploaderName: "홍길동",
    });

    const saved = fs.readdirSync(mockHotdir);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^[0-9a-f]{8}-취업규칙\.hwp$/);

    expect(enqueue).toHaveBeenCalledTimes(1);
    await enqueue.mock.calls[0][0]();
    expect(processCompanyDocument).toHaveBeenCalledWith({
      row: expect.objectContaining({ id: 11 }),
      hotdirFilename: saved[0],
      namespace: `ws-co-1-${HASH}`,
    });
  });

  it("strips directories from the uploaded file name", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      body: form({ name: "../../evil.pdf" }),
    });
    expect(res.status).toBe(202);
    expect(fs.readdirSync(mockHotdir)[0]).toMatch(/^[0-9a-f]{8}-evil\.pdf$/);
  });

  it.each([" . ", " ", "/"])(
    "rejects a file name that normalizes to nothing (%p) without crashing",
    async (name) => {
      const res = await fetch(baseUrl, {
        method: "POST",
        body: form({ name }),
      });
      expect(res.status).toBe(400);
      expect(fs.readdirSync(mockHotdir)).toHaveLength(0);
    }
  );

  it("removes control and bidi-override characters from the file name", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      body: form({ name: "계약\u202Eexe\u200F.pdf" }),
    });
    expect(res.status).toBe(202);
    expect(EmbedCompanyDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "계약exe.pdf" })
    );
  });

  it("shortens very long file names but keeps the extension", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      body: form({ name: `${"가".repeat(150)}.hwp` }),
    });
    expect(res.status).toBe(202);
    const saved = fs.readdirSync(mockHotdir)[0];
    expect(Buffer.byteLength(saved)).toBeLessThan(255);
    expect(saved.endsWith(".hwp")).toBe(true);
  });

  it("429 QUEUE_FULL when the processing queue is full, nothing saved", async () => {
    isFull.mockReturnValue(true);
    const res = await fetch(baseUrl, { method: "POST", body: form() });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "QUEUE_FULL" });
    expect(fs.readdirSync(mockHotdir)).toHaveLength(0);
    expect(EmbedCompanyDocument.create).not.toHaveBeenCalled();
    isFull.mockReturnValue(false);
  });

  it("400 FILE_REQUIRED without a file", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      body: form({ name: null }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "FILE_REQUIRED" });
  });

  it("400 UNSUPPORTED_TYPE for other extensions, nothing saved", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      body: form({ name: "a.exe" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "UNSUPPORTED_TYPE" });
    expect(fs.readdirSync(mockHotdir)).toHaveLength(0);
    expect(EmbedCompanyDocument.create).not.toHaveBeenCalled();
  });

  it("413 FILE_TOO_LARGE over 50MB, nothing saved", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      body: form({ name: "big.pdf", size: COMPANY_DOC_MAX_BYTES + 1 }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "FILE_TOO_LARGE" });
    expect(fs.readdirSync(mockHotdir)).toHaveLength(0);
  });

  it("400 COMPANY_REQUIRED removes the saved file", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      body: form({ companyName: " " }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "COMPANY_REQUIRED" });
    expect(fs.readdirSync(mockHotdir)).toHaveLength(0);
  });

  it("403 before saving anything when the embed does not allow it", async () => {
    mockEmbed.allow_company_documents = false;
    const res = await fetch(baseUrl, { method: "POST", body: form() });
    expect(res.status).toBe(403);
    expect(fs.readdirSync(mockHotdir)).toHaveLength(0);
  });
});

describe("DELETE", () => {
  it("cleans up with the row as it was at delete time (processing finished meanwhile)", async () => {
    EmbedCompanyDocument.getOwned.mockResolvedValue({
      id: 5,
      doc_id: null,
      location: null,
    });
    const deleted = { id: 5, doc_id: "d", location: `${HASH}/x.json` };
    EmbedCompanyDocument.delete.mockResolvedValue(deleted);
    const res = await fetch(`${baseUrl}/5${q()}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(removeCompanyDocumentArtifacts).toHaveBeenCalledWith(
      deleted,
      `ws-co-1-${HASH}`
    );
  });

  it("deletes an owned document and its vectors", async () => {
    const row = { id: 5, doc_id: "d", location: `${HASH}/x.json` };
    EmbedCompanyDocument.getOwned.mockResolvedValue(row);
    EmbedCompanyDocument.delete.mockResolvedValue(row);
    const res = await fetch(`${baseUrl}/5${q()}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(EmbedCompanyDocument.getOwned).toHaveBeenCalledWith("5", 1, HASH);
    expect(EmbedCompanyDocument.delete).toHaveBeenCalledWith(5);
    expect(removeCompanyDocumentArtifacts).toHaveBeenCalledWith(
      row,
      `ws-co-1-${HASH}`
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    await enqueue.mock.calls[0][0]();
    expect(dropNamespaceIfEmpty).toHaveBeenCalledWith(`ws-co-1-${HASH}`);
  });

  it("404 for another company's document", async () => {
    EmbedCompanyDocument.getOwned.mockResolvedValue(null);
    const res = await fetch(`${baseUrl}/5${q("다른회사")}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
    expect(EmbedCompanyDocument.delete).not.toHaveBeenCalled();
  });
});

// 위젯 본문 보기 (okrservice specs/005-company-doc-view)
describe("GET content", () => {
  const READY_ROW = {
    id: 7,
    embed_id: 1,
    company_key: "오이사공",
    company_hash: HASH,
    filename: "2026 취업규칙.pdf",
    uploader_name: "홍길동",
    status: "ready",
    error: null,
    doc_id: "secret-doc",
    location: `${HASH}/rules.json`,
    createdAt: "2026-11-10T01:00:00.000Z",
  };
  const contentUrl = (id, name) => `${baseUrl}/${id}/content${q(name)}`;

  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns the public document and the text the chatbot reads", async () => {
    EmbedCompanyDocument.getOwned.mockResolvedValue(READY_ROW);
    readCompanyDocumentContent.mockReturnValue("제16조(근로시간) 09:30");
    const res = await fetch(contentUrl(7));
    expect(res.status).toBe(200);
    expect(EmbedCompanyDocument.getOwned).toHaveBeenCalledWith("7", 1, HASH);
    expect(readCompanyDocumentContent).toHaveBeenCalledWith(READY_ROW);
    const body = await res.json();
    expect(body).toEqual({
      document: {
        id: 7,
        filename: "2026 취업규칙.pdf",
        uploaderName: "홍길동",
        status: "ready",
        error: null,
        createdAt: "2026-11-10T01:00:00.000Z",
      },
      content: "제16조(근로시간) 09:30",
    });
    expect(JSON.stringify(body)).not.toMatch(/rules\.json|secret-doc|company/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("401 when the origin is not in the allowlist", async () => {
    mockEmbed = {
      ...BASE_EMBED,
      allowlist_domains: JSON.stringify(["https://allowed.example.com"]),
    };
    const res = await fetch(contentUrl(7), {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(401);
    expect(EmbedCompanyDocument.getOwned).not.toHaveBeenCalled();
  });

  it("404 NOT_FOUND for another company's or embed's document, without reading it", async () => {
    EmbedCompanyDocument.getOwned.mockResolvedValue(null);
    const res = await fetch(contentUrl(7, "다른회사"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
    expect(EmbedCompanyDocument.getOwned).toHaveBeenCalledWith(
      "7",
      1,
      EmbedCompanyDocument.companyHash("다른회사")
    );
    expect(readCompanyDocumentContent).not.toHaveBeenCalled();
  });

  it("answers a malformed id the same as a missing document", async () => {
    EmbedCompanyDocument.getOwned.mockImplementation(
      jest.requireActual("../../models/embedCompanyDocument").EmbedCompanyDocument
        .getOwned
    );
    for (const id of ["abc", "-1", "0"]) {
      const res = await fetch(contentUrl(id));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "NOT_FOUND" });
    }
    expect(readCompanyDocumentContent).not.toHaveBeenCalled();
  });

  it("400 COMPANY_REQUIRED without a company", async () => {
    const res = await fetch(`${baseUrl}/7/content${q("  ")}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "COMPANY_REQUIRED" });
  });

  it("403 when the embed does not allow company documents", async () => {
    mockEmbed = { ...BASE_EMBED, allow_company_documents: false };
    const res = await fetch(contentUrl(7));
    expect(res.status).toBe(403);
    expect(EmbedCompanyDocument.getOwned).not.toHaveBeenCalled();
  });

  it("409 NOT_READY while processing or after a failure", async () => {
    for (const status of ["processing", "failed"]) {
      EmbedCompanyDocument.getOwned.mockResolvedValue({ ...READY_ROW, status });
      const res = await fetch(contentUrl(7));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "NOT_READY" });
    }
    expect(readCompanyDocumentContent).not.toHaveBeenCalled();
  });

  it("404 CONTENT_MISSING when a ready document has no readable text", async () => {
    EmbedCompanyDocument.getOwned.mockResolvedValue(READY_ROW);
    readCompanyDocumentContent.mockReturnValue(null);
    const res = await fetch(contentUrl(7));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "CONTENT_MISSING" });
  });
});
