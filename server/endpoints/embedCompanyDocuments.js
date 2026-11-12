const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { hotdirPath, normalizePath } = require("../utils/files");
const { validEmbedConfig } = require("../utils/middleware/embedMiddleware");
const { EmbedConfig } = require("../models/embedConfig");
const { EmbedCompanyDocument } = require("../models/embedCompanyDocument");
const { enqueue, isFull } = require("../utils/companyDocs/queue");
const {
  processCompanyDocument,
  removeCompanyDocumentArtifacts,
  dropNamespaceIfEmpty,
  readCompanyDocumentContent,
} = require("../utils/companyDocs/process");

/**
 * 위젯 회사별 사규 문서 API (specs/021-widget-company-docs-rag,
 * contracts/embed-company-docs-api.md). 회사 구분은 위젯이 보내는
 * companyName(trim) — 인증 없이 이름만으로 구분한다(D4·D5, 사칭 위험 수용).
 */

const COMPANY_DOC_MAX_BYTES = 50 * 1024 * 1024;

// collector ACCEPTED_MIMES 전체 + .jpeg (위젯 companyDocs.ts와 같은 목록)
const COMPANY_DOC_EXTENSIONS = [
  ".pdf",
  ".hwp",
  ".hwpx",
  ".docx",
  ".pptx",
  ".xlsx",
  ".odt",
  ".odp",
  ".txt",
  ".md",
  ".org",
  ".adoc",
  ".rst",
  ".csv",
  ".json",
  ".html",
  ".epub",
  ".mbox",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".mp3",
  ".wav",
  ".mp4",
  ".mpeg",
];

// 한글 3바이트 기준 uuid 접두사 포함 255바이트 파일명 상한 안에 들도록 자른다
const FILENAME_STEM_MAX_CHARS = 70;
const UNSAFE_FILENAME_CHARS =
  /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

// multer fileFilter는 busboy 이벤트 안에서 동기로 불려 throw가 프로세스를 죽인다 — 예외 대신 null
function originalFilename(file) {
  try {
    const decoded = Buffer.from(file.originalname, "latin1").toString("utf8");
    const name = path
      .basename(normalizePath(decoded.replace(UNSAFE_FILENAME_CHARS, "")))
      .trim();
    const ext = path.extname(name);
    const stem = Array.from(name.slice(0, name.length - ext.length));
    if (stem.length === 0) return null;
    return stem.slice(0, FILENAME_STEM_MAX_CHARS).join("") + ext;
  } catch {
    return null;
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, hotdirPath),
    filename: (_req, file, cb) => {
      const name = originalFilename(file);
      if (!name) return cb(new Error("INVALID_FILENAME"));
      file.originalname = name;
      cb(null, `${uuidv4().slice(0, 8)}-${name}`);
    },
  }),
  limits: { fileSize: COMPANY_DOC_MAX_BYTES, files: 1 },
  fileFilter: (request, file, cb) => {
    const name = originalFilename(file);
    const ext = name ? path.extname(name).toLowerCase() : "";
    if (COMPANY_DOC_EXTENSIONS.includes(ext)) return cb(null, true);
    request.companyDocUnsupported = true;
    cb(null, false);
  },
}).single("file");

function handleUpload(request, response, next) {
  upload(request, response, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ error: "FILE_TOO_LARGE" });
      return;
    }
    response.status(400).json({ error: "FILE_REQUIRED" });
  });
}

function companyDocsAllowed(request, response, next) {
  const embed = response.locals.embedConfig;
  response.setHeader("Access-Control-Allow-Origin", "*");
  if (!embed?.enabled || !embed?.allow_company_documents) {
    response.status(403).json({ error: "COMPANY_DOCS_DISABLED" });
    return;
  }
  const allowedHosts = EmbedConfig.parseAllowedHosts(embed);
  if (
    allowedHosts !== null &&
    !allowedHosts.includes(request.headers.origin ?? "")
  ) {
    response.status(401).json({ error: "ORIGIN_NOT_ALLOWED" });
    return;
  }
  next();
}

// 파일을 디스크에 쓰기 전에 거른다 — 대기열이 차면 업로드 자체를 받지 않는다
function queueHasRoom(_request, response, next) {
  if (isFull()) {
    response.status(429).json({ error: "QUEUE_FULL" });
    return;
  }
  next();
}

// 회사 키·해시·namespace를 locals에 싣는다. 없으면 null
function resolveCompany(response, rawName) {
  const key = EmbedCompanyDocument.normalizeCompanyKey(rawName);
  if (!key) return null;
  const hash = EmbedCompanyDocument.companyHash(key);
  const embed = response.locals.embedConfig;
  return {
    key,
    hash,
    namespace: EmbedCompanyDocument.namespaceFor(
      embed.workspace.slug,
      embed.id,
      hash
    ),
  };
}

function discardUpload(file) {
  if (!file?.path) return;
  fs.rmSync(file.path, { force: true });
}

function embedCompanyDocumentsEndpoints(app) {
  if (!app) return;

  app.get(
    "/embed/:embedId/company-documents",
    [validEmbedConfig, companyDocsAllowed],
    async (request, response) => {
      try {
        const company = resolveCompany(response, request.query.companyName);
        if (!company) {
          response.status(400).json({ error: "COMPANY_REQUIRED" });
          return;
        }
        const embed = response.locals.embedConfig;
        const rows = await EmbedCompanyDocument.listFor(embed.id, company.hash);
        response.status(200).json({
          documents: rows.map((row) => EmbedCompanyDocument.toPublic(row)),
        });
      } catch (e) {
        console.error("[companyDocs] list failed:", e.message);
        response.sendStatus(500);
      }
    }
  );

  // 본문 보기(okrservice specs/005): 다른 회사·embed 문서는 없는 문서와 같은 404
  app.get(
    "/embed/:embedId/company-documents/:id/content",
    [validEmbedConfig, companyDocsAllowed],
    async (request, response) => {
      // 사규 전문 — 중간 캐시·브라우저 캐시에 남기지 않는다(삭제 후에도 보이는 일 방지)
      response.setHeader("Cache-Control", "no-store");
      try {
        const company = resolveCompany(response, request.query.companyName);
        if (!company) {
          response.status(400).json({ error: "COMPANY_REQUIRED" });
          return;
        }
        const embed = response.locals.embedConfig;
        const row = await EmbedCompanyDocument.getOwned(
          request.params.id,
          embed.id,
          company.hash
        );
        if (!row) {
          response.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        if (row.status !== "ready") {
          response.status(409).json({ error: "NOT_READY" });
          return;
        }
        const content = await readCompanyDocumentContent(row);
        if (content === null) {
          console.warn(`[companyDocs] content missing for document ${row.id}`);
          response.status(404).json({ error: "CONTENT_MISSING" });
          return;
        }
        response.status(200).json({
          document: EmbedCompanyDocument.toPublic(row),
          content,
        });
      } catch (e) {
        console.error("[companyDocs] content failed:", e.message);
        response.sendStatus(500);
      }
    }
  );

  app.post(
    "/embed/:embedId/company-documents",
    [validEmbedConfig, companyDocsAllowed, queueHasRoom, handleUpload],
    async (request, response) => {
      try {
        if (!request.file) {
          response.status(400).json({
            error: request.companyDocUnsupported
              ? "UNSUPPORTED_TYPE"
              : "FILE_REQUIRED",
          });
          return;
        }
        const company = resolveCompany(response, request.body?.companyName);
        if (!company) {
          discardUpload(request.file);
          response.status(400).json({ error: "COMPANY_REQUIRED" });
          return;
        }

        const embed = response.locals.embedConfig;
        const row = await EmbedCompanyDocument.create({
          embedId: embed.id,
          companyKey: company.key,
          filename: request.file.originalname,
          uploaderName: request.body?.uploaderName,
        });
        const hotdirFilename = request.file.filename;
        enqueue(() =>
          processCompanyDocument({
            row,
            hotdirFilename,
            namespace: company.namespace,
          })
        );
        response
          .status(202)
          .json({ document: EmbedCompanyDocument.toPublic(row) });
      } catch (e) {
        console.error("[companyDocs] upload failed:", e.message);
        discardUpload(request.file);
        response.sendStatus(500);
      }
    }
  );

  app.delete(
    "/embed/:embedId/company-documents/:id",
    [validEmbedConfig, companyDocsAllowed],
    async (request, response) => {
      try {
        const company = resolveCompany(response, request.query.companyName);
        if (!company) {
          response.status(400).json({ error: "COMPANY_REQUIRED" });
          return;
        }
        const embed = response.locals.embedConfig;
        const row = await EmbedCompanyDocument.getOwned(
          request.params.id,
          embed.id,
          company.hash
        );
        if (!row) {
          response.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        // 조회 뒤 처리가 끝났을 수 있으니 삭제 시점의 행(doc_id·location)으로 정리한다
        const deleted = await EmbedCompanyDocument.delete(row.id);
        if (deleted)
          await removeCompanyDocumentArtifacts(deleted, company.namespace);
        enqueue(() => dropNamespaceIfEmpty(company.namespace));
        response.status(200).json({ success: true });
      } catch (e) {
        console.error("[companyDocs] delete failed:", e.message);
        response.sendStatus(500);
      }
    }
  );
}

module.exports = {
  embedCompanyDocumentsEndpoints,
  COMPANY_DOC_EXTENSIONS,
  COMPANY_DOC_MAX_BYTES,
};
