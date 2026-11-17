const { validApiKey } = require("../../utils/middleware/validApiKey");
const { reqBody } = require("../../utils/http");
const { purgeCompanyDataByName } = require("../../utils/companyDocs/process");

const ALLOWED_REASONS = new Set([
  "contract_expired",
  "admin_terminated",
  "other",
]);

function apiCompanyDataEndpoints(app) {
  if (!app) return;

  app.post(
    "/v1/company-data/purge",
    [validApiKey],
    async (request, response) => {
      /*
      #swagger.tags = ['Company Data']
      #swagger.description = 'Purge all company-scoped widget documents for a company name (5240 contract end). Immediate, idempotent.'
      #swagger.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: 'object',
              required: ['companyName'],
              example: {
                companyName: "오이사공",
                reason: "contract_expired"
              }
            }
          }
        }
      }
      #swagger.responses[200] = {
        content: {
          "application/json": {
            schema: {
              type: 'object',
              example: {
                success: true,
                companyName: "오이사공",
                purged: true,
                details: { companyDocuments: 3, vectorNamespaces: 2 }
              }
            }
          }
        }
      }
      #swagger.responses[400] = {
        description: "COMPANY_REQUIRED"
      }
      #swagger.responses[403] = {
        description: "Invalid API key"
      }
      #swagger.responses[500] = {
        description: "PURGE_FAILED"
      }
     */
      try {
        const { companyName, reason } = reqBody(request);
        const result = await purgeCompanyDataByName(companyName);
        if (!result) {
          response.status(400).json({ error: "COMPANY_REQUIRED" });
          return;
        }

        const reasonTag =
          typeof reason === "string" && ALLOWED_REASONS.has(reason)
            ? reason
            : typeof reason === "string" && reason.trim()
              ? reason.trim().slice(0, 64)
              : "unspecified";

        console.log(
          `[company-data/purge] company="${result.companyName}" reason=${reasonTag} docs=${result.companyDocuments} namespaces=${result.vectorNamespaces}`
        );

        response.status(200).json({
          success: true,
          companyName: result.companyName,
          purged: true,
          details: {
            companyDocuments: result.companyDocuments,
            vectorNamespaces: result.vectorNamespaces,
          },
        });
      } catch (e) {
        console.error("[company-data/purge] failed:", e.message);
        response.status(500).json({ success: false, error: "PURGE_FAILED" });
      }
    }
  );
}

module.exports = { apiCompanyDataEndpoints };
