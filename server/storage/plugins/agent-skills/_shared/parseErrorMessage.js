/**
 * HR API 에러 응답에서 message 필드를 추출하여 사용자 친화적 메시지를 반환합니다.
 * JSON 파싱 실패 또는 message 필드가 없을 경우 fallbackMessage를 반환합니다.
 *
 * @param {Response} response - fetch 응답 객체 (!response.ok 상태)
 * @param {string} fallbackMessage - 파싱 실패 시 반환할 기본 에러 메시지
 * @returns {Promise<string>} 사용자에게 표시할 에러 메시지
 */
async function parseErrorMessage(response, fallbackMessage) {
  try {
    const errorBody = await response.json();
    if (errorBody && errorBody.message) {
      return `> ⚠️ ${errorBody.message}`;
    }
  } catch {}
  return fallbackMessage;
}

module.exports = { parseErrorMessage };
