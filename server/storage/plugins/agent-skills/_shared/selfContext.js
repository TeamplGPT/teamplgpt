// _shared/selfContext.js
// "사용자가 말하지 않은 값"을 LLM에게 추측시키지 않고 **서버가 본인 컨텍스트에서 해석**한다.
//
// 같은 뿌리의 결함이 반복됐다(specs/022 P-SELF):
//   · "우리 팀원 누구야?" → 모델이 org_cd를 지어내 **엉뚱한 팀**(0111 조립설계팀)을 조회
//     (본인은 인사팀 0303. 조회 자체는 성공해 사용자가 오답을 알아채기 어렵다)
//   · "급여명세서 보여줘"  → pay_item을 모르면 답을 못 함 (최근 지급건 폴백으로 해결)
//   · "의료비 공제 내역"   → 기본 연도에 데이터가 없으면 빈손 (연도 폴백으로 해결)
//
// 원칙: 되묻지도 말고 추측시키지도 말고, **서버가 안다면 서버가 채운다.**
// 사번은 이미 `SELF_STAFF_ID_MARKER`가 이 역할을 한다. 이 모듈은 그 밖의 self 값을 맡는다.
//
// ⚠️ _shared는 require 캐시에 남는다 — 수정 후 서버 실제 재기동 필요.

const { hrFetch } = require("./hrSession");

/**
 * 본인 소속 조직코드. 사원증(getMBLPrtEmpCard) 응답의 orgCd를 쓴다.
 *
 * 조직코드는 사용자가 알 수 없고 LLM도 알 수 없다 — org_tree를 먼저 부르라고 지시해도
 * 모델이 건너뛰고 지어내면 **성공한 것처럼 보이는 오답**이 나온다. 서버가 채우는 편이 안전하다.
 *
 * @returns {Promise<string|null>} 조직코드. 조회 실패 시 null (호출부가 안내를 결정)
 */
async function resolveSelfOrgCd(ctx) {
  const { SELF_STAFF_ID_MARKER } = require("./hrSession");
  try {
    const { errorMessage, records, isEmpty } = await hrFetch(ctx, {
      path: "/getMBLPrtEmpCard.do",
      form: { searchStaffId: SELF_STAFF_ID_MARKER },
      gate: false,
    });
    if (errorMessage || isEmpty) return null;
    const row = Array.isArray(records) ? records[0] : records;
    const code = String(row?.orgCd ?? row?.ORG_CD ?? "").trim();
    return code || null;
  } catch (_) {
    return null;
  }
}

/**
 * 후보를 순서대로 시도해 **첫 번째로 데이터가 있는 것**을 고른다.
 *
 * "연도를 말하지 않았다"는 "최신 연도를 원한다"가 아니다. 최신에 데이터가 없으면
 * 빈손으로 끝나는 게 아니라 자료가 있는 시점을 보여주는 편이 질문 의도에 가깝다
 * (급여 pay_periods에서 같은 판단을 이미 적용했다).
 *
 * 사용자가 명시했으면 이 함수를 쓰지 말 것 — 그때는 그 값이 답이고, 없으면 없다고 해야 한다.
 *
 * @param {string[]} candidates 우선순위 순 후보(예: ["2025","2024","2023","2022"])
 * @param {(c:string)=>Promise<{isEmpty:boolean, errorMessage?:string}>} attempt
 * @returns {Promise<{picked:string|null, result:any}>}
 */
async function firstNonEmpty(candidates, attempt) {
  let last = null;
  for (const c of candidates) {
    const r = await attempt(c);
    last = r;
    if (r && r.errorMessage) return { picked: c, result: r }; // 오류는 즉시 전달
    if (r && !r.isEmpty) return { picked: c, result: r };
  }
  return { picked: null, result: last };
}

module.exports = { resolveSelfOrgCd, firstNonEmpty };
