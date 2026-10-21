// _shared/staffParams.js
// 본인 사번 관문 — HR 요청의 대상 직원 칸은 반드시 있고, 값은 본인 마커여야 한다.
//
// kiwibox SQL 다수는 대상 직원(cmmSearchStaffId 등)이 비면 "본인소속조회"/"null 이면 전체"로
// 요청자의 조회 권한 범위 직원 전체를 돌려준다(근무현황 TAAWrkTimeStatusMgr, 연장근무
// TAADclzWorkOtSchdul·MBLDclzWorkOtSchdul, 증명서 CTIMcrtfIssuMgr의 staffIdNm LIKE '값%' 등).
// 그래서 사번 칸이 빠진 요청은 아예 보내지 않는다 — 항상 본인 것만 조회된다.
//
// 같은 규칙이 브리지 두 곳(okrservice hrBridge.ts, extras/kiwibox-bridge/teamplgpt-hr-bridge.js)에도
// 있다(다층 방어). 목록 = 각 HR handler가 경로마다 보내는 사번 키(specs/017 보안 리뷰 전수 조사).
// handler의 사번 키를 바꾸면 세 곳을 같이 고친다.

// 값이 본인 마커여야 하는 키(대상 직원을 정하는 칸)
const STAFF_PARAM_KEYS = ["staffId", "cmmSearchStaffId", "searchStaffId", "searchId", "staffIdNm"];

const REQUIRED_STAFF_PARAMS = Object.freeze({
  "/TAAWrkTimeStatusMgr.do": ["cmmSearchStaffId"],
  "/TAADclzWorkSearchCldr.do": ["cmmSearchStaffId", "searchId"],
  "/TAADclzWorkOtSchdul.do": ["cmmSearchStaffId"],
  "/getMBLDclzWorkOtSchdul.do": ["cmmSearchStaffId"],
  "/getMBLDclzWorkOtSchdulPerson.do": ["cmmSearchStaffId"],
  "/TAADclzVcatnList.do": ["staffId", "cmmSearchStaffId"],
  "/getMBLPrtEmpCard.do": ["searchStaffId"],
  "/getMBLPrtEmpCardPop.do": ["searchStaffId"],
  "/PRCHrBassiemMgrTab220.do": ["staffId", "cmmSearchStaffId", "searchStaffId"],
  "/CommonCode.do": ["staffId"],
  "/SALSalaryBassMgr.do": ["staffId"],
  "/SALSalaryDtstmnMgr.do": ["cmmSearchStaffId"],
  "/SALDaylabMgr.do": ["cmmSearchStaffId"],
  "/CTIMcrtfIssuMgr.do": ["staffIdNm"],
  "/LONLoanReqstListMgr.do": ["cmmSearchStaffId"],
  // 월 근무시간(5240 홈 "월별 근무현황", specs/019) — SQL은 요청한 값과 같은 직원을 고를 뿐 본인인지 확인하지 않는다(019 보안 리뷰 참고-1)
  "/Home.do": ["cmmSearchStaffId"],
});

// 연말정산은 경로에 연도가 붙는다(/YTA{컨트롤러}{연도}.do) — InDctMgr만 searchStaffId
const YTA_PATH_RE = /^\/YTA(\w+?)(\d{4})\.do$/;

/** @returns {string[]} 이 경로에 반드시 있어야 하는 사번 키(없으면 빈 배열) */
function requiredStaffKeys(path) {
  const yta = YTA_PATH_RE.exec(String(path));
  if (yta) return yta[1] === "InDctMgr" ? ["searchStaffId"] : ["cmmSearchStaffId"];
  return Object.prototype.hasOwnProperty.call(REQUIRED_STAFF_PARAMS, path) ? REQUIRED_STAFF_PARAMS[path] : [];
}

const SELF_CHECK_MESSAGE =
  "> ⚠️ 본인 정보를 확인할 수 없어 조회하지 않았습니다. 잠시 후 다시 시도해 주세요.";

/**
 * @param {string} path
 * @param {Object<string,string>} form
 * @param {string} marker - 본인 마커($SELF_STAFF_ID)
 * @returns {string|null} 막아야 하면 사용자 안내 문구, 통과면 null
 */
function selfStaffProblem(path, form, marker) {
  const has = (k) => Object.prototype.hasOwnProperty.call(form, k);
  const missing = requiredStaffKeys(path).some((k) => !has(k));
  const notSelf = STAFF_PARAM_KEYS.some((k) => has(k) && form[k] !== marker);
  return missing || notSelf ? SELF_CHECK_MESSAGE : null;
}

module.exports = {
  STAFF_PARAM_KEYS,
  REQUIRED_STAFF_PARAMS,
  requiredStaffKeys,
  selfStaffProblem,
  SELF_CHECK_MESSAGE,
};
