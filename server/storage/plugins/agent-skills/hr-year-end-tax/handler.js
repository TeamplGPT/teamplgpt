// hr-year-end-tax/handler.js
// 5240 HR(kiwibox) 연말정산(YTA) 직접 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/008·003).
// 근거: 카탈로그 §7 원칙제외 해제(사용자 지시) + kiwibox REW/YTA{연도} 소스 실측.
//  - 컨트롤러 연도별 분리: 경로 = /YTA{Name}Mgr{YYYY}.do (cal_yy는 경로 연도).
//  - self 강제: cmmSearchStaffId=$SELF_STAFF_ID.
//  - 주민번호(CTZ_NO 등)·계좌·내부 PK·코드값은 화이트리스트에서 전면 제외 (사용자 지시).
//  - result(결정세액)는 summary에 통합(YndList/YndCal은 조회 부적합 — 실측).
const { resolveDateParam } = require("../_shared/dateResolver");
const { hrFetch, SELF_STAFF_ID_MARKER } = require("../_shared/hrSession");
// 미지정 값은 서버가 해석 — 최신 연도가 비면 자료가 있는 연도로(specs/022 P-SELF)
const { firstNonEmpty } = require("../_shared/selfContext");

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
    // STAFF_NM은 본인 이름이라 전 행에 같은 값이 찍힌다 — 가족 이름은 FAM_NM이다.
    // 파라미터 누락으로 줄곧 0행이라 드러나지 않던 오류(2026-08-20).
    // 주민번호(FAM_CTZ_NO)·내부 식별자(FAM_ID)는 계속 제외한다.
    columns: {
      FAM_NM: "성명",
      AGE: "나이",
      SPOUSE_YN: "배우자여부",
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
    needs: ["searchStaffId"],
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
    needs: ["searchStaffId"],
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
    needs: ["searchStaffId"],
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
    needs: ["searchStaffId", "searchItemGroupCd"],
    itemGroupCd: "TAB_06", // ytaInDctMgrTab06.jsp hidden 입력값
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
      const resolved = resolveDateParam(cal_yy, "year"); // 'YYYY' or '작년' 등
      if (resolved && !SUPPORTED_YEARS.includes(resolved)) {
        return `> ⚠️ ${resolved}년 연말정산은 지원하지 않습니다. 지원 연도: ${SUPPORTED_YEARS.join(", ")}.`;
      }
      const yearGiven = resolved || null;
      // 연도를 말하지 않았다면 "최신 연도를 원한다"가 아니다. 최신에 자료가 없으면
      // "2025년 내역이 없습니다"로 끝나 사용자는 자료가 있는 해를 알 수 없다
      // (실측 2026-08-21: 의료비·신용카드가 2024년에만 있는데 2025로 조회해 빈손).
      // 급여 pay_periods와 같은 판단 — 자료가 있는 시점을 찾아 답하고 어느 해인지 밝힌다.
      const candidates = yearGiven ? [yearGiven] : SUPPORTED_YEARS;

      // 정본 SQL의 WHERE는 <if> 없이 CAL_KIND_CD 등을 걸기 때문에, 아래 파라미터가
      // 빠지면 조건이 NULL이 되어 **항상 0행**이다. 종전에는 cmd·cmmSearchStaffId만
      // 보내 2022~2025 전 연도·전 query_type이 0행이었다(2026-08-20 ntest 실측).
      // 조회별 필요 목록은 각 SQL의 <if> 밖 파라미터로 확인했다 — spec.needs 참조.
      const buildForm = (year) => ({
        cmd: spec.cmd,
        cmmSearchStaffId: SELF_STAFF_ID_MARKER, // self 강제
        // 정산구분(공통코드 YTA_CAL_KIND_CD 실조회: 1=연말정산 2=중도정산
        // 3=간이신고(상) 4=간이신고(하)). 본인 연말정산 조회이므로 1 고정 —
        // 2는 퇴사자 중도정산이라 이 skill의 질문 의도와 다르다.
        searchCalKindCd: "1",
        // 귀속연도는 **항상** 보낸다. SQL의 CAL_YY 조건은 <if searchCalYy>라 보낼 때만
        // 걸리고, 경로의 연도(/YTA…Mgr2023.do)는 컨트롤러 버전만 고를 뿐 데이터를 거르지
        // 않는다. 안 보내면 전 연도가 섞여 와서 "2023 연말정산 결과"에 2024년 수치를
        // 답하게 된다 — 실측(2026-08-20 ntest)에서 실제로 그랬다.
        searchCalYy: year,
        ...Object.fromEntries(
          (spec.needs || []).map((need) =>
            need === "searchStaffId"
              ? ["searchStaffId", SELF_STAFF_ID_MARKER]
              : ["searchItemGroupCd", spec.itemGroupCd]
          )
        ),
      });

      this.introspect(`${spec.label} 조회 중...`);
      const { picked, result } = await firstNonEmpty(candidates, (year) =>
        hrFetch(this, {
          path: `/${spec.name}${year}.do`,
          form: buildForm(year),
          gate: false,
        })
      );
      if (result && result.errorMessage) return result.errorMessage;
      if (!picked) {
        const scope = yearGiven
          ? `${yearGiven}년`
          : `지원 연도(${SUPPORTED_YEARS.join("·")}) 전체`;
        return `> ⚠️ **${spec.label}** — ${scope} 조회 결과가 없습니다.`;
      }

      this.introspect(`${spec.label} 조회 완료.`);
      return formatYta(result.records, `${spec.label} (${picked}년)`, spec.columns);
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
