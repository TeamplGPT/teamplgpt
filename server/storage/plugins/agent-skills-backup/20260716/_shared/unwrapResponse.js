/**
 * HR API 래퍼 응답을 unwrap하고 빈 데이터를 감지한다.
 *
 * 지원하는 응답 포맷:
 *   - 래퍼: { success: boolean, data: any, message: any }
 *   - 기존 에러: { code: "-1", message: "..." }
 *   - 기존 정상: 단일 객체 또는 배열
 *
 * @param {object} responseData - response.json() 결과
 * @returns {{ isEmpty: boolean, records: any }}
 *   - isEmpty: true면 데이터가 없음 (빈 배열, null, 또는 에러)
 *   - records: 실제 데이터 (배열 또는 단일 객체)
 */
function unwrapResponse(responseData) {
  // Case 1: 래퍼 형태 { success: boolean, data: any, message: any }
  if (
    responseData &&
    typeof responseData.success === "boolean" &&
    "data" in responseData
  ) {
    if (!responseData.success) {
      return { isEmpty: true, records: null };
    }
    const inner = responseData.data;
    if (inner === null || inner === undefined) {
      return { isEmpty: true, records: null };
    }
    if (Array.isArray(inner) && inner.length === 0) {
      return { isEmpty: true, records: [] };
    }
    return { isEmpty: false, records: inner };
  }

  // Case 2: 기존 에러 형태 { code: "-1" }
  if (
    responseData &&
    (responseData.code === "-1" || responseData.code === -1)
  ) {
    return { isEmpty: true, records: null };
  }

  // Case 3: 기존 정상 응답 (단일 객체 또는 배열) - passthrough
  return { isEmpty: false, records: responseData };
}

module.exports = { unwrapResponse };
