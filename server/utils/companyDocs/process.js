const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { CollectorApi } = require("../collectorApi");
const { getVectorDbClass } = require("../helpers");
const {
  documentsPath,
  hotdirPath,
  isWithin,
  normalizePath,
  purgeVectorCache,
} = require("../files");
const { DocumentVectors } = require("../../models/vectors");
const { EmbedCompanyDocument } = require("../../models/embedCompanyDocument");

// 실패 사유 코드 — 문구는 위젯이 언어별로 보여 준다 (contracts/embed-company-docs-api.md)
const COMPANY_DOC_ERRORS = {
  DRM: "DRM",
  ENCRYPTED: "ENCRYPTED",
  NO_TEXT: "NO_TEXT",
  GENERIC: "GENERIC",
  INTERRUPTED: "INTERRUPTED",
};

// documents/ 밖에 둔다 — 관리자 문서 선택기(viewLocalFiles)에 노출되지 않게
function companyDocsPath() {
  return path.resolve(documentsPath, "..", "company-documents");
}

function cacheKeyFor(location) {
  return `company-documents/${location}`;
}

function failureCode(reason = "") {
  const text = String(reason || "");
  if (text.includes("[DRM_PROTECTED]")) return COMPANY_DOC_ERRORS.DRM;
  if (text.includes("[ENCRYPTED]")) return COMPANY_DOC_ERRORS.ENCRYPTED;
  if (/no text content/i.test(text)) return COMPANY_DOC_ERRORS.NO_TEXT;
  return COMPANY_DOC_ERRORS.GENERIC;
}

function removeWithin(root, relativePath) {
  if (!relativePath) return;
  const target = path.resolve(root, normalizePath(relativePath));
  if (!isWithin(root, target)) return;
  if (fs.existsSync(target) && fs.lstatSync(target).isFile()) fs.rmSync(target);
}

// collector가 documents/ 아래에 쓴 JSON(들)을 회사 폴더의 JSON 하나로 옮긴다
function moveCollectorOutput(documents, hash, title) {
  const parts = [];
  let base = null;
  for (const doc of documents) {
    const source = path.resolve(documentsPath, normalizePath(doc.location));
    if (!isWithin(documentsPath, source) || !fs.existsSync(source)) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(source, "utf8"));
    } finally {
      fs.rmSync(source, { force: true });
    }
    if (!base) base = { name: path.basename(source), data };
    if (data.pageContent) parts.push(data.pageContent);
  }
  if (!base) return null;

  const location = `${hash}/${base.name}`;
  const target = path.resolve(companyDocsPath(), location);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const data = { ...base.data, title, pageContent: parts.join("\n\n") };
  fs.writeFileSync(target, JSON.stringify(data));
  return { location, data };
}

// 위젯 본문 보기(okrservice specs/005): 챗봇이 읽는 글 = 저장된 pageContent.
// 그 행의 회사 폴더 안 파일만 연다 — DB 값이 잘못돼도 다른 회사 파일은 읽지 않는다
// 큰 문서도 다른 요청을 막지 않게 비동기로 읽는다
async function readCompanyDocumentContent(row) {
  if (!row?.location || !row?.company_hash) return null;
  try {
    const companyRoot = path.resolve(companyDocsPath(), row.company_hash);
    const target = path.resolve(companyDocsPath(), normalizePath(row.location));
    if (!isWithin(companyRoot, target)) return null;
    const { pageContent } = JSON.parse(
      await fs.promises.readFile(target, "utf8")
    );
    return typeof pageContent === "string" ? pageContent : null;
  } catch {
    return null;
  }
}

async function removeCompanyDocumentArtifacts(row, namespace) {
  if (row.doc_id) {
    try {
      await getVectorDbClass().deleteDocumentFromNamespace(
        namespace,
        row.doc_id
      );
      await DocumentVectors.delete({ docId: row.doc_id });
    } catch (e) {
      console.error("[companyDocs] vector cleanup failed:", e.message);
    }
  }
  if (row.location) {
    removeWithin(companyDocsPath(), row.location);
    await purgeVectorCache(cacheKeyFor(row.location));
  }
}

// 회사의 마지막 문서가 지워지면 빈 namespace(LanceDB 테이블)도 지운다.
// 큐 안에서 실행해야 처리 중인 추가 작업과 겹치지 않는다
async function dropNamespaceIfEmpty(namespace) {
  try {
    const VectorDb = getVectorDbClass();
    if (!(await VectorDb.hasNamespace(namespace))) return;
    if ((await VectorDb.namespaceCount(namespace)) > 0) return;
    await VectorDb["delete-namespace"]({ namespace });
  } catch (e) {
    console.error("[companyDocs] namespace cleanup failed:", e.message);
  }
}

// embed 삭제 직전에 호출 — 행은 embed cascade로 지워지므로 벡터·JSON만 정리하고
// 비울 namespace 목록을 돌려준다
async function removeCompanyDocsForEmbed(embed) {
  if (!embed?.workspace?.slug) return [];
  const namespaces = new Set();
  for (const row of await EmbedCompanyDocument.listByEmbed(embed.id)) {
    const namespace = EmbedCompanyDocument.namespaceFor(
      embed.workspace.slug,
      embed.id,
      row.company_hash
    );
    namespaces.add(namespace);
    await removeCompanyDocumentArtifacts(row, namespace);
  }
  return [...namespaces];
}

// 일부 들어갔을 수 있는 벡터까지 지우고 실패로 표시한다
async function failWithCleanup(row, namespace, artifacts, code = "GENERIC") {
  await removeCompanyDocumentArtifacts(artifacts, namespace);
  await EmbedCompanyDocument.updateStatus(row.id, {
    status: "failed",
    error: COMPANY_DOC_ERRORS[code],
    doc_id: null,
    location: null,
  });
}

// 재시작으로 끊긴 행: 남은 벡터·JSON을 지우고 실패로 표시한다(되살리지 않음 — 사용자가 다시 올린다)
async function recoverInterruptedDocuments() {
  for (const row of await EmbedCompanyDocument.listProcessing()) {
    const slug = row.embed_config?.workspace?.slug;
    const namespace = slug
      ? EmbedCompanyDocument.namespaceFor(slug, row.embed_id, row.company_hash)
      : null;
    if (namespace) {
      await failWithCleanup(row, namespace, row, "INTERRUPTED");
      await dropNamespaceIfEmpty(namespace);
    } else {
      await EmbedCompanyDocument.updateStatus(row.id, {
        status: "failed",
        error: COMPANY_DOC_ERRORS.INTERRUPTED,
        doc_id: null,
        location: null,
      });
    }
  }
}

async function processCompanyDocument({ row, hotdirFilename, namespace }) {
  let moved = null;
  let claimed = null;
  try {
    const result = await new CollectorApi().processDocument(hotdirFilename);
    const documents = result?.documents || [];
    if (!result?.success || documents.length === 0) {
      await EmbedCompanyDocument.updateStatus(row.id, {
        status: "failed",
        error: failureCode(result?.reason),
      });
      return;
    }

    moved = moveCollectorOutput(documents, row.company_hash, row.filename);
    if (!moved || !moved.data.pageContent) {
      if (moved) removeWithin(companyDocsPath(), moved.location);
      await EmbedCompanyDocument.updateStatus(row.id, {
        status: "failed",
        error: COMPANY_DOC_ERRORS.NO_TEXT,
      });
      return;
    }

    // 임베딩 전에 doc_id·location을 먼저 남긴다 — 도중에 끊겨도 부팅 복구·삭제가 정리할 수 있다
    const artifacts = { doc_id: uuidv4(), location: moved.location };
    if (!(await EmbedCompanyDocument.updateStatus(row.id, artifacts))) {
      removeWithin(companyDocsPath(), moved.location);
      return;
    }
    claimed = artifacts;

    const { vectorized } = await getVectorDbClass().addDocumentToNamespace(
      namespace,
      { ...moved.data, docId: artifacts.doc_id },
      cacheKeyFor(moved.location)
    );
    if (!vectorized) {
      await failWithCleanup(row, namespace, artifacts);
      return;
    }

    const updated = await EmbedCompanyDocument.updateStatus(row.id, {
      status: "ready",
      error: null,
    });
    if (!updated) {
      await removeCompanyDocumentArtifacts(artifacts, namespace);
      await dropNamespaceIfEmpty(namespace);
    }
  } catch (e) {
    console.error(
      `[companyDocs] processing failed for doc ${row.id}:`,
      e.message
    );
    if (claimed) await failWithCleanup(row, namespace, claimed);
    else {
      if (moved) removeWithin(companyDocsPath(), moved.location);
      await EmbedCompanyDocument.updateStatus(row.id, {
        status: "failed",
        error: COMPANY_DOC_ERRORS.GENERIC,
      });
    }
  } finally {
    removeWithin(hotdirPath, hotdirFilename);
  }
}

// 고객 종료(specs/022): 회사명으로 묶인 회사 문서·벡터·파일을 즉시 전부 삭제
async function purgeCompanyDataByName(companyName) {
  const key = EmbedCompanyDocument.normalizeCompanyKey(companyName);
  if (!key) return null;

  const hash = EmbedCompanyDocument.companyHash(key);
  const rows = await EmbedCompanyDocument.listByCompanyHash(hash);
  const namespaces = new Set();
  let companyDocuments = 0;

  for (const row of rows) {
    const slug = row.embed_config?.workspace?.slug;
    const namespace = slug
      ? EmbedCompanyDocument.namespaceFor(slug, row.embed_id, row.company_hash)
      : null;
    if (namespace) {
      namespaces.add(namespace);
      await removeCompanyDocumentArtifacts(row, namespace);
    } else if (row.location) {
      removeWithin(companyDocsPath(), row.location);
    }
    const deleted = await EmbedCompanyDocument.delete(row.id);
    if (deleted) companyDocuments += 1;
  }

  for (const namespace of namespaces) {
    await dropNamespaceIfEmpty(namespace);
  }

  // 같은 hash 폴더에 남은 파일이 있으면 통째로 지운다 (고아 JSON 대비)
  const companyDir = path.resolve(companyDocsPath(), hash);
  if (fs.existsSync(companyDir) && isWithin(companyDocsPath(), companyDir)) {
    fs.rmSync(companyDir, { recursive: true, force: true });
  }

  return {
    companyName: key,
    companyDocuments,
    vectorNamespaces: namespaces.size,
  };
}

module.exports = {
  processCompanyDocument,
  removeCompanyDocumentArtifacts,
  dropNamespaceIfEmpty,
  removeCompanyDocsForEmbed,
  recoverInterruptedDocuments,
  purgeCompanyDataByName,
  failureCode,
  companyDocsPath,
  readCompanyDocumentContent,
  COMPANY_DOC_ERRORS,
};
