process.env.STORAGE_DIR = "test-storage"; // needed for tests to run
const fs = require("fs");
const os = require("os");
const path = require("path");

jest.mock("../../utils/files", () => ({
  createdDate: jest.fn(() => "2026-11-10"),
  trashFile: jest.fn(),
  writeToServerDocuments: jest.fn(({ data }) => ({
    ...data,
    location: "custom-documents/test.json",
  })),
}));
jest.mock("../../utils/tokenizer", () => ({
  tokenizeString: jest.fn(() => 1),
}));

const FIXTURES = path.resolve(__dirname, "fixtures");

// asHwp hands the file to trashFile — work on a copy so fixtures survive.
function copyFixture(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ashwp-"));
  const target = path.join(dir, name);
  fs.copyFileSync(path.join(FIXTURES, name), target);
  return target;
}

describe("asHwp", () => {
  beforeEach(() => jest.clearAllMocks());

  it("HWP 5.0 문서의 본문과 표 셀 텍스트를 추출한다", async () => {
    const asHwp = require("../../processSingleFile/convert/asHwp");
    const { writeToServerDocuments, trashFile } = require("../../utils/files");
    const fullFilePath = copyFixture("employment-subsidy-2026-52.hwp");

    const result = await asHwp({ fullFilePath, filename: "규정.hwp" });

    expect(result.success).toBe(true);
    const { pageContent, docSource } = writeToServerDocuments.mock.calls[0][0].data;
    expect(pageContent).toContain("제1조(목적)");
    expect(pageContent).toContain("우선지원대상기업");
    expect(pageContent).toContain("960만원");
    expect(docSource).toBe("hwp file uploaded by the user.");
    expect(trashFile).toHaveBeenCalledWith(fullFilePath);
  });

  it("HWPX 문서의 표를 markdown 표로 남긴다", async () => {
    const asHwp = require("../../processSingleFile/convert/asHwp");
    const { writeToServerDocuments } = require("../../utils/files");
    const fullFilePath = copyFixture("company-rules.hwpx");

    const result = await asHwp({ fullFilePath, filename: "취업규칙.hwpx" });

    expect(result.success).toBe(true);
    const { pageContent, docSource } = writeToServerDocuments.mock.calls[0][0].data;
    expect(pageContent).toMatch(/\|\s*본인 결혼\s*\|\s*5일\s*\|/);
    expect(pageContent).toContain("분기당 1인 7만원");
    expect(docSource).toBe("hwpx file uploaded by the user.");
  });

  it("깨진 파일은 실패 사유와 함께 정리한다", async () => {
    const asHwp = require("../../processSingleFile/convert/asHwp");
    const { writeToServerDocuments, trashFile } = require("../../utils/files");
    const fullFilePath = copyFixture("broken.hwp");

    const result = await asHwp({ fullFilePath, filename: "broken.hwp" });

    expect(result.success).toBe(false);
    expect(result.documents).toEqual([]);
    expect(result.reason).toMatch(/^\[[A-Z_]+\]/);
    expect(writeToServerDocuments).not.toHaveBeenCalled();
    expect(trashFile).toHaveBeenCalledWith(fullFilePath);
  });

  describe.each([
    ["DRM_PROTECTED", { success: false, code: "DRM_PROTECTED", error: "drm" }],
    ["ENCRYPTED", { success: false, code: "ENCRYPTED", error: "pw" }],
  ])("kordoc이 %s를 돌려주면", (code, parseResult) => {
    it("오류 코드를 사유 앞에 붙인다", async () => {
      jest.resetModules();
      jest.doMock("kordoc", () => ({
        parseHwp: jest.fn(async () => parseResult),
        parseHwpx: jest.fn(async () => parseResult),
      }));
      const asHwp = require("../../processSingleFile/convert/asHwp");
      const { trashFile } = require("../../utils/files");
      const fullFilePath = copyFixture("broken.hwp");

      const result = await asHwp({ fullFilePath, filename: "x.hwp" });

      expect(result).toEqual({
        success: false,
        reason: `[${code}] Could not parse x.hwp.`,
        documents: [],
      });
      expect(trashFile).toHaveBeenCalledWith(fullFilePath);
      jest.dontMock("kordoc");
    });
  });

  it("본문이 비면 No text content 사유를 돌려준다", async () => {
    jest.resetModules();
    jest.doMock("kordoc", () => ({
      parseHwp: jest.fn(async () => ({ success: true, markdown: "  \n " })),
      parseHwpx: jest.fn(),
    }));
    const asHwp = require("../../processSingleFile/convert/asHwp");
    const fullFilePath = copyFixture("broken.hwp");

    const result = await asHwp({ fullFilePath, filename: "empty.hwp" });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("No text content found in empty.hwp.");
    jest.dontMock("kordoc");
  });
});
