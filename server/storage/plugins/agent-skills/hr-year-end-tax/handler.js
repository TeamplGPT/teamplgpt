// hr-year-end-tax/handler.js
// 5240 HR(kiwibox) 연말정산(YTA) 직접 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/008·003).
// 근거: 카탈로그 §7 원칙제외 해제(사용자 지시) + kiwibox REW/YTA{연도} 소스 실측.
//  - 컨트롤러 연도별 분리: 경로 = /YTA{Name}Mgr{YYYY}.do (cal_yy는 경로 연도).
//  - self 강제: cmmSearchStaffId=$SELF_STAFF_ID.
//  - 주민번호(CTZ_NO 등)·계좌·내부 PK·코드값은 화이트리스트에서 전면 제외 (사용자 지시).
//  - result(결정세액)는 summary에 통합(YndList/YndCal은 조회 부적합 — 실측).
const { resolveDateParam } = require("../_shared/dateResolver");
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
    name: "YTAYndMedDtlMgr",
    cmd: "getYTAYndMedDtlMgrList",
    label: "의료비 공제내역",
    columns: {
      STAFF_NM: "성명",
      MEDI_BZPLCE_NM: "의료기관",
      MEDI_CNT: "건수",
      SUM_AMT: "합계금액",
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
    name: "YTAYndGivPayDtlMgr",
    cmd: "getYTAYndGivPayDtlMgrList",
    label: "기부금 공제내역",
    columns: {
      DON_TYPE_CD_NM: "기부유형",
      DON_BZPLCE_NM: "기부처",
      DON_AMT1: "기부금액",
      DON_APPL_AMT: "공제적용액",
      DON_SUM: "합계",
    },
  },
  // 소득공제 입력 화면(YTAInDctMgr) 탭별 항목 — Tab08 신용카드 / Tab13 보험 / Tab15 교육 / Tab06 연금
  credit_card: {
    name: "YTAInDctMgr",
    cmd: "getYTAInDctMgrTab08List",
    label: "신용카드 공제내역",
    columns: {
      FAM_NM: "사용자",
      CARD_AMT: "신용카드",
      CARD_ETC_AMT: "기타카드",
      FIRST_HELF_AMT: "상반기",
      SECOND_HELF_AMT: "하반기",
    },
  },
  insurance: {
    name: "YTAInDctMgr",
    cmd: "getYTAInDctMgrTab13List",
    label: "보장성보험 공제내역",
    columns: {
      FAM_NM: "대상",
      INSU_AMT: "보험료",
      INSU_ETC_AMT: "기타보험료",
    },
  },
  education: {
    name: "YTAInDctMgr",
    cmd: "getYTAInDctMgrTab15List",
    label: "교육비 공제내역",
    columns: {
      FAM_NM: "대상",
      EDU_AMT: "교육비",
      EDU_ETC_AMT: "기타교육비",
    },
  },
  savings: {
    name: "YTAInDctMgr",
    cmd: "getYTAInDctMgrTab06List",
    label: "연금저축 공제내역",
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

      // cal_yy → 지원 연도. 미지정 시 최신. 지원 목록 밖이면 안내.
      let year = DEFAULT_YEAR;
      const resolved = resolveDateParam(cal_yy, "year"); // 'YYYY' or '작년' 등
      if (resolved) {
        if (!SUPPORTED_YEARS.includes(resolved)) {
          return `> ⚠️ ${resolved}년 연말정산은 지원하지 않습니다. 지원 연도: ${SUPPORTED_YEARS.join(", ")}.`;
        }
        year = resolved;
      }

      const form = {
        cmd: spec.cmd,
        cmmSearchStaffId: SELF_STAFF_ID_MARKER, // self 강제
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
      return formatYta(records, `${spec.label} (${year}년)`, spec.columns);
    } catch (e) {
      this.logger("Error in hr-year-end-tax", e.message);
      return `> ⚠️ 연말정산 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

// 화이트리스트 렌더 — 주민번호·계좌·내부 PK·코드값 제외 (hr-approval 패턴)
function formatYta(records, label, columnLabels) {
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

  const { renderTable } = require("../_shared/formatTable");
  md += renderTable(normalized);
  md += `\n> 총 **${normalized.length}건** 조회됨`;
  return md;
}
