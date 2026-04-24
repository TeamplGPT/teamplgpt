// hr-personnel-search/handler.js
const { parseErrorMessage } = require("../_shared/parseErrorMessage");
const { unwrapResponse } = require("../_shared/unwrapResponse");
const {
  normalizeData,
  renderTable,
  renderSummary,
} = require("../_shared/formatTable");

const ENDPOINT = "/api/v1/personnel/search/graduates";
const MAX_RESULTS = 50;

const QUERY_LABELS = {
  graduates_by_region: "지역-대학-졸업자 검색",
};

module.exports.runtime = {
  handler: async function ({ query_type, university_names, region }) {
    try {
      if (!query_type || !QUERY_LABELS[query_type]) {
        const types = Object.keys(QUERY_LABELS).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }

      if (!Array.isArray(university_names) || university_names.length === 0) {
        return "> ⚠️ 대학교 목록이 비어 있습니다. 지역명을 명확히 해주세요.";
      }

      const normalizedUniversities = university_names
        .map((u) => (typeof u === "string" ? u.trim() : ""))
        .filter(Boolean);
      if (normalizedUniversities.length === 0) {
        return "> ⚠️ 대학교 목록이 비어 있습니다. 지역명을 명확히 해주세요.";
      }

      const baseUrl =
        this.runtimeArgs["HR_API_BASE_URL"] || "http://kiwibox-hr-api:8000";
      const url = `${baseUrl}${ENDPOINT}`;
      const body = { university_names: normalizedUniversities };
      if (region && typeof region === "string" && region.trim()) {
        body.region = region.trim();
      }

      const label = QUERY_LABELS[query_type];
      this.introspect(
        `${label} 중 (${normalizedUniversities.length}개 대학교${region ? `, 지역: ${region}` : ""})...`
      );

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return await parseErrorMessage(
          response,
          `> ⚠️ HR API 호출 실패 (HTTP ${response.status}).`
        );
      }

      const data = await response.json();
      const { isEmpty, records } = unwrapResponse(data);

      if (isEmpty) {
        return `> ⚠️ **${label}** 결과가 존재하지 않습니다 (지역: ${region || "-"}, 검색 대학 ${normalizedUniversities.length}개).`;
      }

      this.introspect(`${label} 완료.`);
      return formatGraduates(records, label, region);
    } catch (e) {
      this.logger("Error in hr-personnel-search", e.message);
      if (e.name === "TimeoutError")
        return "> ⚠️ HR API 서버 응답 시간이 초과되었습니다.";
      return `> ⚠️ 직원 검색 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

function formatGraduates(data, label, region) {
  const { rows: allRows, summary } = normalizeData(data);

  let md = `## HR ${label}${region ? ` - ${region}` : ""}\n\n`;
  if (!allRows || allRows.length === 0)
    return md + "> 조회된 데이터가 없습니다.";

  const truncated = allRows.length > MAX_RESULTS;
  const rows = truncated ? allRows.slice(0, MAX_RESULTS) : allRows;

  md += renderTable(rows);
  const totalCount = summary?.total ?? allRows.length;
  md += `\n> 총 **${totalCount}건** 중 **${rows.length}건** 표시`;
  if (truncated) {
    md += ` (상위 ${MAX_RESULTS}건 cap 적용)`;
  }
  if (summary) {
    const summaryWithoutTotal = Object.fromEntries(
      Object.entries(summary).filter(([k]) => k !== "total")
    );
    if (Object.keys(summaryWithoutTotal).length > 0) {
      md += `\n${renderSummary(summaryWithoutTotal)}`;
    }
  }
  return md;
}
