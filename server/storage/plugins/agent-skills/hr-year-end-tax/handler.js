// hr-year-end-tax/handler.js
// 5240 HR(kiwibox) 연말정산(YTA) 직접 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/008·003).
// 근거: 카탈로그 §7 원칙제외 해제(사용자 지시) + kiwibox REW/YTA{연도} 소스 실측.
//  - 컨트롤러 연도별 분리: 경로 = /YTA{Name}Mgr{YYYY}.do (cal_yy는 경로 연도).
//  - self 강제: cmmSearchStaffId=$SELF_STAFF_ID (InDct 4종은 searchStaffId — SQL이 그 이름으로만 읽음).
//  - 주민번호(CTZ_NO 등)·계좌·내부 PK·코드값은 화이트리스트에서 전면 제외 (사용자 지시).
//  - result(결정세액)는 summary에 통합(YndList/YndCal은 조회 부적합 — 실측).
const { resolveDateParam } = require("../_shared/dateResolver");
const { resolveYearPeriod } = require("../_shared/periodResolver");
const { periodProblem } = require("../_shared/periodCheck");
const { hrFetch, SELF_STAFF_ID_MARKER } = require("../_shared/hrSession");

// 지원 귀속연도 (최신이 기본). 신규 연도 배포 시 배열에 추가.
const SUPPORTED_YEARS = ["2025", "2024", "2023", "2022"];
const DEFAULT_YEAR = SUPPORTED_YEARS[0];

// query_type → { name(경로 Mgr명), cmd, columns(화이트리스트) }
const QUERY_MAP = {
  summary: {
    name: "YTASummaryMgr",
    cmd: "getYTASummaryMgrList",
    label: "연말정산 요약(공제·결정세액)",
    columns: {
      TX_DIV: "과세구분",
      CAL_YM: "정산연월",
      TAX_AMT1: "급여과세",
      UN_TAX_AMT1: "급여비과세",
      TAX_AMT2: "상여과세",
      UN_TAX_AMT2: "상여비과세",
      REDC_AMT: "감면세액",
      TOT_AMT: "합계",
      P_INCOME_TAX_AMT: "결정소득세",
      P_RESIDENCE_AMT: "결정지방소득세",
      P_NONGTEUK_AMT: "농어촌특별세",
      ORG_NM: "소속",
      BZPLCE_NM: "사업장",
    },
  },
  medical: {
    inputAmounts: true, // 공제 대상으로 신고한 지출·사용·납입액 — 공제액 아님
    name: "YTAYndMedDtlMgr",
    cmd: "getYTAYndMedDtlMgrList",
    label: "의료비 공제내역",
    columns: {
      STAFF_NM: "성명",
      MEDI_BZPLCE_NM: "의료기관",
      MEDI_CNT: "건수",
      SUM_AMT: "의료비 지출액",
      PREGNANT_YN: "임신여부",
    },
  },
  family: {
    name: "YTAYtaFamilySttusMgr",
    cmd: "getYTAYtaFamilySttusMgrList",
    label: "부양가족 현황",
    columns: {
      STAFF_NM: "성명",
      AGE: "나이",
    },
  },
  previous_employer: {
    name: "YTAYndBefWrkDtlMgr",
    cmd: "getYTAYndBefWrkDtlMgrList",
    label: "종전근무지 내역",
    columns: {
      BIZ_PLACE_NM: "종전근무지",
      CUTSTA_YMD: "근무시작",
      CUTEND_YMD: "근무종료",
      BONUS_AMT: "상여",
      INCOME_TAX_AMT: "소득세",
      RESIDENCE_AMT: "지방소득세",
      NONGTEUK_AMT: "농어촌특별세",
      ITEM_NM: "항목",
      NON_TAX_AMT: "비과세",
    },
  },
  donation: {
    inputAmounts: true, // 공제 대상으로 신고한 지출·사용·납입액 — 공제액 아님
    name: "YTAYndGivPayDtlMgr",
    cmd: "getYTAYndGivPayDtlMgrList",
    label: "기부금 공제내역",
    columns: {
      DON_TYPE_CD_NM: "기부유형",
      DON_BZPLCE_NM: "기부처",
      DON_AMT1: "공제대상 기부금액",
      DON_APPL_AMT: "기부장려금 신청금액",
      DON_SUM: "기부금 합계",
    },
  },
  // 소득공제 입력 화면(YTAInDctMgr) 탭별 항목 — Tab08 신용카드 / Tab13 보험 / Tab15 교육 / Tab06 연금
  // InDct 계열 SQL은 사번을 cmmSearchStaffId가 아닌 searchStaffId로 읽는다(무조건 필터).
  credit_card: {
    inputAmounts: true, // 공제 대상으로 신고한 지출·사용·납입액 — 공제액 아님
    name: "YTAInDctMgr",
    cmd: "getYTAInDctMgrTab08List",
    label: "신용카드 공제내역",
    staffParam: "searchStaffId",
    columns: {
      FAM_NM: "사용자",
      CARD_AMT: "카드 사용액(국세청)",
      CARD_ETC_AMT: "카드 사용액(그 밖의 자료)",
      FIRST_HELF_AMT: "상반기 사용액(추가공제율)",
      SECOND_HELF_AMT: "하반기 사용액(추가공제율)",
    },
  },
  insurance: {
    inputAmounts: true, // 공제 대상으로 신고한 지출·사용·납입액 — 공제액 아님
    name: "YTAInDctMgr",
    cmd: "getYTAInDctMgrTab13List",
    label: "보장성보험 공제내역",
    staffParam: "searchStaffId",
    columns: {
      FAM_NM: "대상",
      INSU_AMT: "보험료(국세청)",
      INSU_ETC_AMT: "보험료(그 밖의 자료)",
    },
  },
  education: {
    inputAmounts: true, // 공제 대상으로 신고한 지출·사용·납입액 — 공제액 아님
    name: "YTAInDctMgr",
    cmd: "getYTAInDctMgrTab15List",
    label: "교육비 공제내역",
    staffParam: "searchStaffId",
    columns: {
      FAM_NM: "대상",
      EDU_AMT: "교육비(국세청)",
      EDU_ETC_AMT: "교육비(그 밖의 자료)",
    },
  },
  savings: {
    inputAmounts: true, // 공제 대상으로 신고한 지출·사용·납입액 — 공제액 아님
    name: "YTAInDctMgr",
    cmd: "getYTAInDctMgrTab06List",
    label: "연금저축 공제내역",
    staffParam: "searchStaffId",
    // Tab06 SQL은 ITEM_GROUP_CD = #{searchItemGroupCd}도 무조건 필터 — 화면 hidden 값 TAB_06(2022~2025 동일).
    fixed: { searchItemGroupCd: "TAB_06" },
    columns: {
      // 계좌(BANK_CD/ACC_NO)·코드값 제외 — 납입 정보만
      PAY_CNT: "납입횟수",
      PAY_AMT: "납입금액",
    },
  },
};

function camel(snake) {
  return snake.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

module.exports.runtime = {
  handler: async function ({ query_type, cal_yy }) {
    try {
      if (!query_type || !QUERY_MAP[query_type]) {
        const types = Object.keys(QUERY_MAP).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }
      const spec = QUERY_MAP[query_type];
      // 귀속연도를 말했는데 해석하지 못하면 최신 연도로 바꿔 조회하지 않고 안내(2026-10-21, _shared/periodCheck)
      const periodMsg = periodProblem(cal_yy, "year");
      if (periodMsg) return periodMsg;

      // cal_yy → 지원 연도. 미지정 시 최신. 지원 목록 밖이면 안내.
      let year = DEFAULT_YEAR;
      // "재작년"·"이번년도"·"금년"은 dateResolver가 못 읽어 최신 연도(DEFAULT_YEAR)로 조용히
      // 바뀌었다 — 연도 표현은 periodResolver로 먼저 해석한다(specs/015). 그 외는 기존 그대로.
      const yearPeriod = resolveYearPeriod(cal_yy, { kind: "schedule" });
      const resolved = yearPeriod ? yearPeriod.year : resolveDateParam(cal_yy, "year"); // 'YYYY' or '작년' 등
      if (resolved) {
        if (!SUPPORTED_YEARS.includes(resolved)) {
          return `> ⚠️ ${resolved}년 연말정산은 지원하지 않습니다. 지원 연도: ${SUPPORTED_YEARS.join(", ")}.`;
        }
        year = resolved;
      }

      // 파라미터 근거(kiwibox REW/YTA{연도} SQL 실독, 2022~2025 동일 구조):
      //  - searchCalKindCd: 전 쿼리 CAL_KIND_CD 무조건 필터. '1'=연말정산/'2'=중도정산(schema 주석 YTA_CAL_KIND_CD).
      //  - searchCalYy: family/previous_employer/InDct 4종은 CAL_YY 무조건 필터(미전송 시 0건),
      //    summary/medical/donation은 <if>라 미전송 시 전 연도 행이 섞임 → 항상 경로 연도와 동일하게 전송.
      //  - 사번: Summary/Med/Family/BefWrk/GivPay는 cmmSearchStaffId, InDct 4종은 searchStaffId(spec.staffParam).
      const staffParam = spec.staffParam || "cmmSearchStaffId";
      const form = {
        cmd: spec.cmd,
        [staffParam]: SELF_STAFF_ID_MARKER, // self 강제
        searchCalYy: year,
        searchCalKindCd: "1",
        ...(spec.fixed || {}),
      };
      const path = `/${spec.name}${year}.do`;

      this.introspect(`${spec.label} (${year}년) 조회 중...`);
      const { errorMessage, records, isEmpty } = await hrFetch(this, {
        path,
        form,
        gate: false,
      });
      if (errorMessage) return errorMessage;
      if (isEmpty) {
        return `> ⚠️ **${spec.label}** (${year}년) 조회 결과가 없습니다.`;
      }

      this.introspect(`${spec.label} 조회 완료.`);
      return formatYta(records, `${spec.label} (${year}년)`, spec.columns, spec.inputAmounts ? INPUT_AMOUNT_NOTE : "");
    } catch (e) {
      this.logger("Error in hr-year-end-tax", e.message);
      return `> ⚠️ 연말정산 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

// 공제 자료 표(의료비·카드·보험료·교육비·기부금·연금저축)의 금액은 공제액이 아니라 지출·사용·납입액이다
// (kiwibox 소득공제신청 탭·의료비/기부금 명세서). 챗봇이 "의료비 공제로 404,000원 받았습니다"처럼
// 지출액을 공제액이라고 답했다(2026-11-18). 실제로 줄어든 세금은 summary(결정세액)에만 있다.
const INPUT_AMOUNT_NOTE =
  "\n> 이 금액은 공제 대상으로 신고한 금액이에요. 실제로 줄어든 세금은 연말정산 결과(결정세액)에서 확인할 수 있어요." +
  "\n> [답변 지침] 위 금액은 지출·사용·납입한 금액이에요. '공제받은 금액'·'공제액'·'환급액'·'반영된 공제'라고 말하지 말고 '신고한 ○○ 금액'으로 말하세요. 실제 공제 결과를 물으면 연말정산 결과(summary)를 조회하세요. 이 줄은 답변에 포함하지 마세요.";

// 화이트리스트 렌더 — 주민번호·계좌·내부 PK·코드값 제외 (hr-approval 패턴)
function formatYta(records, label, columnLabels, note = "") {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  let md = `## HR 연말정산 - ${label}\n\n`;
  if (list.length === 0) return md + "> 조회된 데이터가 없습니다.";

  const pick = (row) => {
    const out = {};
    for (const [col, lab] of Object.entries(columnLabels)) {
      const v = row[col] ?? row[col.toLowerCase()] ?? row[camel(col)];
      if (v !== undefined && v !== null && String(v).trim() !== "") out[lab] = v;
    }
    return out;
  };

  const picked = list.map(pick).filter((r) => Object.keys(r).length > 0);
  if (picked.length === 0) return md + "> 표시할 데이터가 없습니다.";

  const ordered = Object.values(columnLabels);
  const present = new Set();
  for (const r of picked) for (const k of Object.keys(r)) present.add(k);
  const headerKeys = ordered.filter((l) => present.has(l));
  const normalized = picked.map((r) => {
    const row = {};
    for (const k of headerKeys) row[k] = r[k] ?? "";
    return row;
  });

  // 건수·안내 줄은 공통 응답 지침(ANSWER_GUIDE)보다 앞에 둔다 — 지침 뒤는 표 블록·모델 입력에서 잘린다
  // (renderWhitelisted와 같은 순서, specs/012 footer-contract). 뒤에 붙였더니 "총 N건"과 안내가 사라졌다.
  const { renderTable, ANSWER_GUIDE } = require("../_shared/formatTable");
  const table = renderTable(normalized);
  const body = table.endsWith(ANSWER_GUIDE) ? table.slice(0, -ANSWER_GUIDE.length) : table;
  md += body + `\n> 총 **${normalized.length}건** 조회됨` + note + ANSWER_GUIDE;
  return md;
}
