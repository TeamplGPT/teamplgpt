const fs = require("fs");
const path = require("path");
const { v4 } = require("uuid");
const {
  createdDate,
  trashFile,
  writeToServerDocuments,
} = require("../../utils/files");
const { tokenizeString } = require("../../utils/tokenizer");
const { default: slugify } = require("slugify");

/**
 * Hancom HWP 5.0 (.hwp) / OWPML (.hwpx) → markdown text via kordoc.
 * Tables are kept as markdown tables so rule tables survive chunking.
 * Failure reasons are prefixed with the kordoc error code (e.g. "[DRM_PROTECTED]")
 * so callers can map them to user-facing messages.
 */
async function asHwp({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
}) {
  const { parseHwp, parseHwpx } = require("kordoc");
  const isHwpx = path.extname(fullFilePath).toLowerCase() === ".hwpx";
  console.log(`-- Working ${filename} --`);

  let content = "";
  try {
    const buf = fs.readFileSync(fullFilePath);
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength
    );
    const result = isHwpx
      ? await parseHwpx(arrayBuffer)
      : await parseHwp(arrayBuffer);
    if (!result.success) {
      const code = result.code || "PARSE_ERROR";
      console.error(`Could not parse ${filename}: [${code}] ${result.error}`);
      trashFile(fullFilePath);
      return {
        success: false,
        reason: `[${code}] Could not parse ${filename}.`,
        documents: [],
      };
    }
    content = (result.markdown || "").trim();
  } catch (e) {
    console.error(`Could not parse ${filename}: ${e.message}`);
    trashFile(fullFilePath);
    return {
      success: false,
      reason: `[PARSE_ERROR] Could not parse ${filename}.`,
      documents: [],
    };
  }

  if (!content.length) {
    console.error(`Resulting text content was empty for ${filename}.`);
    trashFile(fullFilePath);
    return {
      success: false,
      reason: `No text content found in ${filename}.`,
      documents: [],
    };
  }

  const data = {
    id: v4(),
    url: "file://" + fullFilePath,
    title: metadata.title || filename,
    docAuthor: metadata.docAuthor || "no author found",
    description: metadata.description || "No description found.",
    docSource:
      metadata.docSource ||
      `${isHwpx ? "hwpx" : "hwp"} file uploaded by the user.`,
    chunkSource: metadata.chunkSource || "",
    published: createdDate(fullFilePath),
    wordCount: content.split(" ").length,
    pageContent: content,
    token_count_estimate: tokenizeString(content),
  };

  const document = writeToServerDocuments({
    data,
    filename: `${slugify(filename)}-${data.id}`,
    options: { parseOnly: options.parseOnly },
  });
  trashFile(fullFilePath);
  console.log(`[SUCCESS]: ${filename} converted & ready for embedding.\n`);
  return { success: true, reason: null, documents: [document] };
}

module.exports = asHwp;
