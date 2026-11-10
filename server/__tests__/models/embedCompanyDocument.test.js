const { EmbedCompanyDocument } = require("../../models/embedCompanyDocument");
const prisma = require("../../utils/prisma");

jest.mock("../../utils/prisma", () => ({
  embed_company_documents: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
}));

describe("EmbedCompanyDocument helpers", () => {
  it("normalizeCompanyKey trims and rejects empty values", () => {
    expect(EmbedCompanyDocument.normalizeCompanyKey("  오이사공 ")).toBe(
      "오이사공"
    );
    expect(EmbedCompanyDocument.normalizeCompanyKey("   ")).toBeNull();
    expect(EmbedCompanyDocument.normalizeCompanyKey("")).toBeNull();
    expect(EmbedCompanyDocument.normalizeCompanyKey(null)).toBeNull();
    expect(EmbedCompanyDocument.normalizeCompanyKey(42)).toBeNull();
  });

  it("normalizeCompanyKey rejects names longer than 200 chars", () => {
    expect(EmbedCompanyDocument.normalizeCompanyKey("가".repeat(200))).toBe(
      "가".repeat(200)
    );
    expect(
      EmbedCompanyDocument.normalizeCompanyKey("가".repeat(201))
    ).toBeNull();
  });

  it("companyHash is 16 hex chars, stable for the same name", () => {
    const a = EmbedCompanyDocument.companyHash("오이사공");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(EmbedCompanyDocument.companyHash("오이사공")).toBe(a);
  });

  it("companyHash differs when the spelling differs", () => {
    const a = EmbedCompanyDocument.companyHash("오이사공");
    expect(EmbedCompanyDocument.companyHash("(주)오이사공")).not.toBe(a);
    expect(EmbedCompanyDocument.companyHash("오이사 공")).not.toBe(a);
  });

  it("namespaceFor separates embeds sharing a workspace, ascii only", () => {
    const hash = EmbedCompanyDocument.companyHash("한글회사");
    expect(EmbedCompanyDocument.namespaceFor("my-ws", 7, hash)).toBe(
      `my-ws-co-7-${hash}`
    );
    expect(EmbedCompanyDocument.namespaceFor("my-ws", 8, hash)).not.toBe(
      EmbedCompanyDocument.namespaceFor("my-ws", 7, hash)
    );
    expect(EmbedCompanyDocument.namespaceFor("my-ws", 7, hash)).toMatch(
      /^[a-z0-9-]+$/
    );
  });

  it("toPublic exposes only the contract fields", () => {
    const createdAt = new Date("2026-11-10T01:00:00Z");
    expect(
      EmbedCompanyDocument.toPublic({
        id: 3,
        embed_id: 1,
        company_key: "오이사공",
        company_hash: "abc",
        filename: "취업규칙.hwp",
        uploader_name: "홍길동",
        status: "ready",
        error: null,
        doc_id: "uuid",
        location: "embed-company-abc/x.json",
        createdAt,
        lastUpdatedAt: createdAt,
      })
    ).toEqual({
      id: 3,
      filename: "취업규칙.hwp",
      uploaderName: "홍길동",
      status: "ready",
      error: null,
      createdAt,
    });
  });
});

describe("EmbedCompanyDocument queries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("listFor filters by embed and company hash, newest first", async () => {
    prisma.embed_company_documents.findMany.mockResolvedValue([{ id: 1 }]);
    const rows = await EmbedCompanyDocument.listFor(5, "h1");
    expect(rows).toEqual([{ id: 1 }]);
    expect(prisma.embed_company_documents.findMany).toHaveBeenCalledWith({
      where: { embed_id: 5, company_hash: "h1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("getOwned requires id, embed and company hash to all match", async () => {
    prisma.embed_company_documents.findFirst.mockResolvedValue(null);
    expect(await EmbedCompanyDocument.getOwned(9, 5, "h1")).toBeNull();
    expect(prisma.embed_company_documents.findFirst).toHaveBeenCalledWith({
      where: { id: 9, embed_id: 5, company_hash: "h1" },
    });
  });

  it("getOwned rejects non-integer ids without querying", async () => {
    expect(await EmbedCompanyDocument.getOwned("abc", 5, "h1")).toBeNull();
    expect(prisma.embed_company_documents.findFirst).not.toHaveBeenCalled();
  });

  it("create stores processing status with trimmed uploader name", async () => {
    prisma.embed_company_documents.create.mockImplementation(({ data }) => ({
      id: 1,
      ...data,
    }));
    const row = await EmbedCompanyDocument.create({
      embedId: 5,
      companyKey: "오이사공",
      filename: "a.pdf",
      uploaderName: "  홍길동  ",
    });
    expect(row).toMatchObject({
      embed_id: 5,
      company_key: "오이사공",
      company_hash: EmbedCompanyDocument.companyHash("오이사공"),
      filename: "a.pdf",
      uploader_name: "홍길동",
      status: "processing",
    });
  });

  it("create stores null for blank uploader and caps length at 100", async () => {
    prisma.embed_company_documents.create.mockImplementation(
      ({ data }) => data
    );
    const blank = await EmbedCompanyDocument.create({
      embedId: 5,
      companyKey: "오이사공",
      filename: "a.pdf",
      uploaderName: "  ",
    });
    expect(blank.uploader_name).toBeNull();
    const long = await EmbedCompanyDocument.create({
      embedId: 5,
      companyKey: "오이사공",
      filename: "a.pdf",
      uploaderName: "가".repeat(150),
    });
    expect(long.uploader_name).toHaveLength(100);
  });

  it("updateStatus returns null when the row was deleted meanwhile", async () => {
    prisma.embed_company_documents.update.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "P2025" })
    );
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await EmbedCompanyDocument.updateStatus(1, { status: "ready" })
    ).toBeNull();
    console.error.mockRestore();
  });

  it("listProcessing returns processing rows with their workspace", async () => {
    prisma.embed_company_documents.findMany.mockResolvedValue([{ id: 1 }]);
    expect(await EmbedCompanyDocument.listProcessing()).toEqual([{ id: 1 }]);
    expect(prisma.embed_company_documents.findMany).toHaveBeenCalledWith({
      where: { status: "processing" },
      include: { embed_config: { include: { workspace: true } } },
    });
  });

  it("delete returns the row as it was deleted, null if already gone", async () => {
    prisma.embed_company_documents.delete.mockResolvedValueOnce({
      id: 3,
      doc_id: "d",
    });
    expect(await EmbedCompanyDocument.delete(3)).toEqual({
      id: 3,
      doc_id: "d",
    });
    prisma.embed_company_documents.delete.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { code: "P2025" })
    );
    expect(await EmbedCompanyDocument.delete(3)).toBeNull();
  });
});
