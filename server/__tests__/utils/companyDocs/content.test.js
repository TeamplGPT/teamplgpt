const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codocs-content-"));
const mockDocumentsPath = path.join(tmpRoot, "documents");

// utils/files 원본과 같은 경로 검사 (원본은 로드 시 STORAGE_DIR를 요구)
jest.mock("../../../utils/files", () => {
  const p = require("path");
  return {
    documentsPath: mockDocumentsPath,
    hotdirPath: p.join(mockDocumentsPath, "..", "hotdir"),
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
    purgeVectorCache: jest.fn(),
  };
});
jest.mock("../../../utils/collectorApi", () => ({ CollectorApi: jest.fn() }));
jest.mock("../../../utils/helpers", () => ({ getVectorDbClass: jest.fn() }));
jest.mock("../../../models/vectors", () => ({ DocumentVectors: {} }));
jest.mock("../../../models/embedCompanyDocument", () => ({
  EmbedCompanyDocument: {},
}));

const {
  companyDocsPath,
  readCompanyDocumentContent,
} = require("../../../utils/companyDocs/process");

const HASH = "aaaaaaaaaaaaaaaa";
const OTHER_HASH = "bbbbbbbbbbbbbbbb";

function writeDoc(relative, data) {
  const target = path.join(companyDocsPath(), relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof data === "string" ? data : JSON.stringify(data)
  );
}

function row(location, company_hash = HASH) {
  return { id: 1, company_hash, location };
}

beforeAll(() => {
  writeDoc(`${HASH}/rules.json`, { pageContent: "제16조(근로시간) 09:30", title: "x" });
  writeDoc(`${HASH}/broken.json`, "{not json");
  writeDoc(`${HASH}/nocontent.json`, { title: "x" });
  writeDoc(`${OTHER_HASH}/secret.json`, { pageContent: "B사 사규" });
  fs.mkdirSync(mockDocumentsPath, { recursive: true });
  fs.writeFileSync(
    path.join(mockDocumentsPath, "outside.json"),
    JSON.stringify({ pageContent: "회사 폴더 밖" })
  );
});

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe("readCompanyDocumentContent", () => {
  it("returns the stored pageContent of the company's own document", async () => {
    expect(await readCompanyDocumentContent(row(`${HASH}/rules.json`))).toBe(
      "제16조(근로시간) 09:30"
    );
  });

  it("refuses a location outside the row's company folder", async () => {
    expect(
      await readCompanyDocumentContent(row(`${OTHER_HASH}/secret.json`))
    ).toBeNull();
  });

  it("refuses paths that climb out of the company folder", async () => {
    expect(
      await readCompanyDocumentContent(row(`${HASH}/../${OTHER_HASH}/secret.json`))
    ).toBeNull();
    expect(
      await readCompanyDocumentContent(row(`${HASH}/../../documents/outside.json`))
    ).toBeNull();
    expect(
      await readCompanyDocumentContent(row(`../documents/outside.json`))
    ).toBeNull();
  });

  it("refuses look-alike sibling folders and the company folder itself", async () => {
    writeDoc(`${HASH}x/look.json`, { pageContent: "비슷한 이름 폴더" });
    writeDoc(`${HASH}-evil/look.json`, { pageContent: "비슷한 이름 폴더" });
    expect(await readCompanyDocumentContent(row(`${HASH}x/look.json`))).toBeNull();
    expect(await readCompanyDocumentContent(row(`${HASH}-evil/look.json`))).toBeNull();
    expect(await readCompanyDocumentContent(row(`${HASH}`))).toBeNull();
    expect(await readCompanyDocumentContent(row(`${HASH}/`))).toBeNull();
  });

  it("returns null for a missing file, broken JSON or no text", async () => {
    expect(await readCompanyDocumentContent(row(`${HASH}/gone.json`))).toBeNull();
    expect(await readCompanyDocumentContent(row(`${HASH}/broken.json`))).toBeNull();
    expect(
      await readCompanyDocumentContent(row(`${HASH}/nocontent.json`))
    ).toBeNull();
  });

  it("returns null without a location or company", async () => {
    expect(await readCompanyDocumentContent(row(null))).toBeNull();
    expect(await readCompanyDocumentContent(row(`${HASH}/rules.json`, ""))).toBeNull();
    expect(await readCompanyDocumentContent(null)).toBeNull();
  });
});
