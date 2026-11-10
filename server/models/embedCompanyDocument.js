const crypto = require("crypto");
const prisma = require("../utils/prisma");

const COMPANY_KEY_MAX = 200;
const UPLOADER_NAME_MAX = 100;

/**
 * 위젯에서 직원이 올린 회사별 사규 문서 (specs/021-widget-company-docs-rag).
 * 회사 구분 = 고객사 페이지의 companyData.name(trim) 원문. 같은 embed 안에서
 * company_hash가 같은 행만 서로 보인다. error 컬럼은 사유 코드(위젯이 번역).
 */
const EmbedCompanyDocument = {
  normalizeCompanyKey: function (name) {
    if (typeof name !== "string") return null;
    const key = name.trim();
    if (!key || key.length > COMPANY_KEY_MAX) return null;
    return key;
  },

  companyHash: function (key) {
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  },

  // embed id를 넣는다 — 목록·삭제가 embed 단위라 검색 범위도 같게 묶어야 한다
  namespaceFor: function (workspaceSlug, embedId, hash) {
    return `${workspaceSlug}-co-${embedId}-${hash}`;
  },

  toPublic: function (row) {
    return {
      id: row.id,
      filename: row.filename,
      uploaderName: row.uploader_name,
      status: row.status,
      error: row.error,
      createdAt: row.createdAt,
    };
  },

  create: async function ({ embedId, companyKey, filename, uploaderName }) {
    const uploader =
      typeof uploaderName === "string"
        ? uploaderName.trim().slice(0, UPLOADER_NAME_MAX)
        : "";
    return await prisma.embed_company_documents.create({
      data: {
        embed_id: Number(embedId),
        company_key: companyKey,
        company_hash: this.companyHash(companyKey),
        filename,
        uploader_name: uploader || null,
        status: "processing",
      },
    });
  },

  listFor: async function (embedId, hash) {
    return await prisma.embed_company_documents.findMany({
      where: { embed_id: Number(embedId), company_hash: hash },
      orderBy: { createdAt: "desc" },
    });
  },

  listByEmbed: async function (embedId) {
    return await prisma.embed_company_documents.findMany({
      where: { embed_id: Number(embedId) },
    });
  },

  get: async function (id) {
    return await prisma.embed_company_documents.findFirst({
      where: { id: Number(id) },
    });
  },

  getOwned: async function (id, embedId, hash) {
    const docId = Number(id);
    if (!Number.isInteger(docId) || docId <= 0) return null;
    return await prisma.embed_company_documents.findFirst({
      where: { id: docId, embed_id: Number(embedId), company_hash: hash },
    });
  },

  // 처리 도중 행이 삭제됐으면 null
  updateStatus: async function (id, data) {
    try {
      return await prisma.embed_company_documents.update({
        where: { id: Number(id) },
        data: { ...data, lastUpdatedAt: new Date() },
      });
    } catch (error) {
      if (error?.code !== "P2025") console.error(error.message);
      return null;
    }
  },

  delete: async function (id) {
    try {
      return await prisma.embed_company_documents.delete({
        where: { id: Number(id) },
      });
    } catch (error) {
      if (error?.code !== "P2025") console.error(error.message);
      return null;
    }
  },

  listProcessing: async function () {
    return await prisma.embed_company_documents.findMany({
      where: { status: "processing" },
      include: { embed_config: { include: { workspace: true } } },
    });
  },
};

module.exports = { EmbedCompanyDocument };
