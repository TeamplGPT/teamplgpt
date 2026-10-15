/**
 * 다른 직원 정보 차단 (specs/016 contracts/blocked-query-types.md).
 *
 * 다른 직원 정보는 조직도(조직 구조 + 팀원 이름·소속·직위·직책)를 빼고 제공하지 않는다.
 * 아래 query_type은 다른 직원 데이터를 돌려주는 조회라 제공을 중단했다. plugin.json
 * enum에서 지웠어도 오래된 대화·캐시된 tool 정의·직접 호출로 들어올 수 있어, handler
 * 진입부에서 HR 호출 없이 고정 문구로 거절한다(L2).
 *
 * @module otherEmployee
 */

// "> ⚠️" 접두 — tool 루프(loop.js)가 가드 메시지로 식별하는 시그니처와 같다.
// 문장은 시스템 지시 [HR_SKILL_COMMON] 10항의 거절 문장과 같다. server/utils/hrSelfDataNotice.js에도
// 같은 값이 있다(플러그인 폴더는 운영에서 리포 밖일 수 있어 require로 공유하지 않음 — 테스트로 일치 확인).
const OTHER_EMPLOYEE_REFUSAL =
  '> ⚠️ 다른 직원의 정보는 조회할 수 없어요. 본인 정보는 "내 연차 알려줘"처럼 물어봐 주세요.';

const BLOCKED_QUERY_TYPES = Object.freeze({
  "hr-attendance": new Set(["vacation_calendar"]), // 조직 휴가캘린더 — 팀원 휴가·사유
  "hr-personnel": new Set(["birthday"]), // 생일자 명단 — 성명·소속·직위·생일
  // 결재함은 본인 기안함(drafted)만. 미결·기결·참조는 남이 올린 문서이고,
  // 반려함도 "내가 결재자로서 반려한 남의 문서"다(EAPRequestMgr_SQL appl_kind=6).
  "hr-approval": new Set(["pending", "completed", "rejected", "referenced"]),
});

/**
 * @param {string} skill - plugin hubId (예: "hr-attendance")
 * @param {string} queryType
 * @returns {boolean}
 */
function isBlockedQueryType(skill, queryType) {
  return Boolean(BLOCKED_QUERY_TYPES[skill]?.has(queryType));
}

module.exports = { OTHER_EMPLOYEE_REFUSAL, isBlockedQueryType };
