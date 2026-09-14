// hr-personnel/handler.js
// 5240 HR(kiwibox) 조회 — R1 클라이언트 위임 정본 + 서버 폴백 (specs/002·003).
// 근거 카탈로그: $KIWIBOX/spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md §4.8~4.9
//   $KIWIBOX 경로를 모르면 사용자에게 묻거나 아래로 찾는다. 절대경로를 코드에 박지 말 것.
//   find ~ -maxdepth 7 -path "*spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md" 2>/dev/null
//   (절차 원본: HR-SKILL-GUIDE.md "0. 사전 준비")
//  - 사원증 계열 searchStaffId는 $SELF_STAFF_ID 마커 — 브리지/폴백이 본인 사번 치환 (self 강제).
//  - family(주민번호 반환 SCIRegDependent)는 카탈로그 §7 등록 금지 — 미노출.
const { resolveDateParam } = require("../_shared/dateResolver");
// 표시 보정은 _shared 공통 모듈 — handler별 사본 금지(specs/022 P0-2)
const { stripHtmlBreaks, applyCodeLabel } = require("../_shared/renderNormalize");
// 미지정 값은 LLM에게 추측시키지 않고 서버가 본인 컨텍스트에서 해석(specs/022 P-SELF)
const { resolveSelfOrgCd } = require("../_shared/selfContext");
const {
  hrFetch,
  monthRange,
  todayYmd,
  todayDashed,
  SELF_STAFF_ID_MARKER,
} = require("../_shared/hrSession");

// dateParam: "today"=searchSymd 오늘, "month-range"=staYmd/endYmd(월초~말일)
const ENDPOINT_MAP = {
  profile: {
    path: "/getMBLPrtEmpCard.do", staffParam: "searchStaffId", gate: false,
    // 내부 식별자(SERVAREA_ID/CORP_ID/STAFF_ID/*_CD/LOGIN_ID) 비노출 — 화이트리스트 렌더.
    // 반환 컬럼 정본: kiwibox MBLPrtEmpCard_SQL.xml getMBLPrtEmpCard select 절.
    columns: {
      NAME: "성명",
      ENAME: "영문명",
      CNAME: "한자명",
      STAFF_NO: "사번",
      CORP_NM: "회사",
      ORG_NM: "소속",
      POS_NM: "직위",
      CLS_NM: "직급",
      RES_NM: "직책",
      STAFF_TYPE_NM: "사원유형",
      WKTYPE_NM: "근무유형",
      STATUS_NM: "재직상태",
      CORP_TEL: "회사전화",
      HAND_PHONE: "휴대전화",
      MAIL_ID: "이메일",
    },
  },
  profile_detail: {
    path: "/getMBLPrtEmpCardPop.do", staffParam: "searchStaffId", gate: true,
    // STAFF_ID/MENU_CD/SEQ 내부 식별자 제외 (MBLPrtEmpCard_SQL.xml getMBLPrtEmpCardPop)
    columns: {
      MENU_NM: "항목",
      CONTENTS: "내용",
    },
    // 이 endpoint는 민감정보가 컬럼이 아니라 **행**에 담긴다. 컬럼 화이트리스트만으로는
    // 막을 수 없어(MENU_NM/CONTENTS 2컬럼에 17개 섹션이 실려 온다) 행 단위로 차단한다.
    // 실측: '◎ 가족' 행에 배우자·부모의 성명과 나이가 담겨 있었고, plugin.json은
    // "가족정보/부양가족은 제공하지 않습니다(개인정보 보호)"라고 선언 중이었다.
    blockRowsByLabel: {
      key: "MENU_NM",
      keywords: ["가족", "장애", "보훈"],
    },
  },
  // 이하 columns 근거: docs/03-analysis/hr-column-whitelist-audit.analysis.md
  // (MBLHrBassiemList_SQL·Main_SQL 대조)
  org_tree: {
    path: "/getMBLHrBassiemOrgList.do", staffParam: null, gate: false,
    dateParam: "today", orgParam: { name: "cmmSearchOrgCd", required: false },
    // ORG_CD·PRIOR_ORG_CD는 org_members 체이닝·트리 계층에 필수 — 의도적 노출 유지.
    // level(_LEVEL)/seqNo/staYmd/endYmd 차단.
    columns: {
      ORG_NM: "조직명",
      ORG_FNM: "조직전체명",
      CHIEF_INFO: "조직장",
      STAFF_CNT: "인원수",
      ORG_CD: "조직코드",
      PRIOR_ORG_CD: "상위조직코드",
    },
  },
  org_members: {
    path: "/getMBLHrBassiemMemberList.do", staffParam: null, gate: false,
    dateParam: "today", orgParam: { name: "searchOrgCd", required: true, selfDefault: true },
    // SQL(getMBLHrBassiemMemberList)의 sub_org_yn(searchTypeVal)은 'Y'/'N' 양자 분기라
    // 미전송(null) 시 OR 양쪽 모두 거짓 → 항상 0건. 직접 조직만 조회(N) 고정.
    fixed: { searchTypeVal: "N" },
    // detail/seqNo/empOrder/staffId/orgCd(3종)/posSeqNo/name(중복)/imgExYn 차단
    columns: {
      STAFF_NM: "성명",
      STAFF_NO: "사번",
      ORG_NM: "소속",
      POS_NM: "직위",
      RES_NM: "직책",
      CORP_NM: "회사",
      WORK_TYPE: "근무정보",
      WORK_INFO: "근무상황",
    },
  },
  todo_count: {
    path: "/getTodoIconCnt.do", staffParam: null, gate: false, // 범위 a — 세션 신원
    columns: {
      CNT1: "미확인 할일",
      CNT2: "미확인 쪽지",
      CNT3: "미결 결재",
    },
  },
  // getScheduleDay는 일자별 "건수"만 준다(집계 쿼리) — 무엇인지는 안 담겨 있다.
  // "생일자 몇 명" 같은 건수 질문에만 쓰고, "누구 생일인지"는 birthday를 쓴다.
  schedule_day: {
    path: "/getScheduleDay.do", staffParam: null, gate: false, // 범위 a
    dateParam: "month-range",
    columns: {
      MD: "날짜(월일)",
      HOLIDAY_YN: "공휴일여부",
      RESULT: "건수",
    },
  },
  birthday: {
    // 실측(getBirthDetailList.do, cmd 없음): ymd(생년월일)·staffNm·orgNm·einfo5(직위)·title.
    // 조회 범위는 kiwibox 설정(SRCH_BIRTH_AREA)이 통제 — skill이 임의로 넓히지 않는다.
    path: "/getBirthDetailList.do", staffParam: null, gate: false, // 범위 a
    dateParam: "month-range",
    columns: {
      YMD: "생일",
      STAFF_NM: "성명",
      ORG_NM: "소속",
      EINFO5: "직위",
    },
    // ymd는 생년월일(연도 포함)이라 그대로 두면 나이가 드러난다 — 월-일만 표시.
    maskYmdColumns: ["YMD"],
  },
  schedule_titles: {
    // 실측(getHRDetailList.do, cmd 없음): title 단일 필드(일정 제목+공휴일명,
    // 36자 초과 시 서버가 "..." 절단). ⚠ 날짜 필드가 없다 — 기간 내 제목 나열이며
    // 어느 날짜인지는 귀속되지 않는다. 특정 일자만 물으면 호출부가 그 하루로 좁힌다.
    // 실측(2026-09-14 ntest): 연휴는 하루=1행이라 같은 제목이 일수만큼 반복된다
    // ("추석" 3일이면 3행) — 중복을 그대로 보여주면 지저분하니 렌더 전에 합친다.
    path: "/getHRDetailList.do", staffParam: null, gate: false, // 범위 a
    dateParam: "month-range",
    columns: {
      TITLE: "일정/공휴일명",
    },
    dedupeColumn: "TITLE",
  },
  // contact_directory(/getContactList.do) 제거 — 실호출에서 HTTP 404.
  // 컨트롤러는 kiwibox 소스에 있으나(MainController) ntest 배포에는 매핑이 없다.
  // 카탈로그(cmmAiAssistantToolEndpoints.md)에도 미등재라 연동 근거 자체가 없다.
  // 배포·카탈로그 등재가 확인되면 그때 다시 추가한다.
  education: {
    // 인사카드 교육이력 탭 (EDUT_HST2, kiwibox AI self SQL과 동일 테이블 — specs/007)
    // 신판 카탈로그 §4 공통 BODY: 사번 3중 지정 + searchYmd (specs/011 D9)
    path: "/PRCHrBassiemMgrTab220.do", cmd: "getPRCHrBassiemMgrTab220List",
    staffParam: ["staffId", "cmmSearchStaffId", "searchStaffId"],
    gate: false, fixed: { checkHst: "N" }, dateParam: "today-dashed",
    // 코드값(*_CD)·내부 식별자 다수 → 화이트리스트 렌더 (columns)
    // 라벨은 정본 그리드(prcHrBassiemMgrTab220.jsp Header) 기준. EDU_POINT는 "학점",
    // EDU_MEMO는 "교육내용및교육소감"이고 "비고"는 별도 필드 NOTE다.
    columns: {
      EDU_NM: "교육명",
      STA_YMD: "시작일",
      END_YMD: "종료일",
      OFC_NM: "교육기관",
      CONTENTS_NM: "교육내용",
      EDU_TIME: "교육시간",
      EDU_POINT: "학점",
      FIN_CD: "수료여부",
      EDU_MEMO: "교육내용및교육소감",
      NOTE: "비고",
    },
    // FIN_CD는 코드값이라 그대로 두면 "1"이 렌더돼 의미가 전달되지 않는다.
    // 공통코드 EDU_FIN_CD 실조회: 1=수료, 2=미수료, 3=기타. 값이 없는 행은 컬럼째
    // 사라지는데, 빈칸은 LLM이 임의 해석하므로("모두 완료"로 단정한 실측 사례)
    // fallback으로 "미입력"을 명시해 판단 근거를 남긴다.
    codeLabels: {
      FIN_CD: { map: { 1: "수료", 2: "미수료", 3: "기타" }, fallback: "미입력" },
    },
  },
};

const QUERY_LABELS = {
  profile: "사원 기본정보(사원증)",
  profile_detail: "인사카드 상세",
  org_tree: "조직도",
  org_members: "조직원 목록",
  todo_count: "할일/미결 건수",
  schedule_day: "일정/생일/공휴일 건수",
  birthday: "생일자 명단",
  schedule_titles: "일정/공휴일 제목",
  education: "교육이력",
};

module.exports.runtime = {
  handler: async function ({ query_type, year_month, org_cd }) {
    try {
      if (!query_type || !ENDPOINT_MAP[query_type]) {
        const types = Object.keys(ENDPOINT_MAP).join(", ");
        return `> ⚠️ query_type이 올바르지 않습니다. 가능한 값: ${types}`;
      }

      const spec = ENDPOINT_MAP[query_type];
      const label = QUERY_LABELS[query_type];

      const form = {};
      if (spec.cmd) form.cmd = spec.cmd;
      for (const [k, v] of Object.entries(spec.fixed || {})) form[k] = v;

      // 대상 사번 self 강제 — 마커 치환은 브리지/폴백이 수행. 배열이면 다중 주입 (§4 공통 BODY)
      const staffParams = Array.isArray(spec.staffParam)
        ? spec.staffParam
        : spec.staffParam
          ? [spec.staffParam]
          : [];
      for (const p of staffParams) form[p] = SELF_STAFF_ID_MARKER;

      // 조직코드: 계층3 체이닝 — org_tree 결과값만 (plugin.json description에서 강제)
      if (spec.orgParam) {
        let org = String(org_cd || "").trim();
        // 조직코드를 안 줬으면 되묻지 말고 **본인 소속**으로 해석한다.
        // "우리 팀원 누구야?"에 모델이 코드를 지어내 엉뚱한 팀을 조회한 사례가 있었다
        // (본인은 인사팀인데 다른 조직코드를 조회 — 성공한 것처럼 보이는 오답).
        if (!org && spec.orgParam.selfDefault) {
          org = (await resolveSelfOrgCd(this)) || "";
          if (org) this.introspect(`본인 소속 조직(${org}) 기준으로 조회합니다.`);
        }
        if (spec.orgParam.required && !org) {
          return "> ⚠️ 조직코드(org_cd)가 필요합니다. 먼저 org_tree(조직도)로 조직코드를 조회하세요.";
        }
        if (org) form[spec.orgParam.name] = org;
      }

      if (spec.dateParam === "today") {
        form.searchSymd = todayYmd();
      } else if (spec.dateParam === "today-dashed") {
        form.searchYmd = todayDashed(); // §4 공통 BODY
      } else if (spec.dateParam === "month-range") {
        const ym =
          resolveDateParam(year_month, "year_month") ||
          resolveDateParam("이번달", "year_month");
        const [sYmd, eYmd] = monthRange(ym);
        form.staYmd = sYmd;
        form.endYmd = eYmd;
      }

      this.introspect(`${label} 조회 중...`);
      const { errorMessage, records, isEmpty } = await hrFetch(this, {
        path: spec.path,
        form,
        gate: spec.gate,
      });
      if (errorMessage) return errorMessage;
      if (isEmpty) {
        return `> ⚠️ **${label}** 조회 결과가 존재하지 않습니다.`;
      }

      this.introspect(`${label} 조회 완료.`);
      // 민감 섹션은 렌더 이전에 제거 — LLM에 도달하지 않게 한다(L2 원천 차단).
      let safe = spec.blockRowsByLabel
        ? dropSensitiveRows(records, spec.blockRowsByLabel)
        : records;
      // 날짜 없이 하루=1행으로 오는 endpoint는 연휴처럼 같은 값이 반복된다 — 렌더 전 중복 제거.
      if (spec.dedupeColumn) safe = dedupeByColumn(safe, spec.dedupeColumn);
      // 화이트리스트 컬럼 정의가 있으면 선별 렌더(코드값·내부 식별자 제외)
      if (spec.columns)
        return formatWhitelisted(
          safe,
          label,
          spec.columns,
          spec.codeLabels,
          spec.maskYmdColumns
        );
      return formatPersonnel(safe, label);
    } catch (e) {
      this.logger("Error in hr-personnel", e.message);
      return `> ⚠️ 인사기록 조회 중 오류가 발생했습니다: ${e.message}`;
    }
  },
};

/**
 * 라벨 컬럼 값에 차단 키워드가 포함된 행을 제거한다. 원본은 변경하지 않는다.
 * 응답 키 대소문자·camelCase 변형을 formatWhitelisted와 같은 규칙으로 대응한다
 * (egovMap이 MENU_NM을 menuNm으로 내려주는 경우가 있어 한쪽만 보면 필터가 새어 나간다).
 */
function dropSensitiveRows(records, { key, keywords }) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  const pick = (row) => row[key] ?? row[key.toLowerCase()] ?? row[camel(key)];
  return list.filter((row) => {
    const label = String(pick(row) ?? "");
    return !keywords.some((w) => label.includes(w));
  });
}

/**
 * 지정 컬럼 값이 같은 행을 첫 번째 것만 남기고 제거한다. 원본은 변경하지 않는다.
 * (연휴처럼 하루=1행으로 오는 목록에서 같은 제목이 일수만큼 반복되는 것을 정리)
 */
function dedupeByColumn(records, key) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  const pick = (row) => row[key] ?? row[key.toLowerCase()] ?? row[camel(key)];
  const seen = new Set();
  return list.filter((row) => {
    const v = String(pick(row) ?? "");
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

function formatPersonnel(data, label) {
  const { normalizeData, renderTable, renderSummary } = require("../_shared/formatTable");
  const { rows, summary } = normalizeData(data);

  let md = `## HR 인사기록 - ${label}\n\n`;

  if (rows.length === 0) return md + "> 조회된 데이터가 없습니다.";

  md += renderTable(rows);
  md += `\n> 총 **${rows.length}건** 조회됨`;
  if (summary) {
    md += `\n${renderSummary(summary)}`;
  }
  return md;
}

function camel(snake) {
  return snake.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// YYYYMMDD 생년월일에서 연도를 지운다 — 그대로 두면 나이가 드러난다.
// 형식이 다르면 추측해 바꾸지 않고 원값을 그대로 둔다.
function maskYmdToMonthDay(v) {
  const s = String(v).trim();
  return /^\d{8}$/.test(s) ? `${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

// 컬럼 화이트리스트 렌더 — hr-approval/hr-certificate와 동일 패턴(코드값 제외 + union 정규화)
function formatWhitelisted(
  records,
  label,
  columnLabels,
  codeLabels = {},
  maskYmdColumns = []
) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  let md = `## HR 인사기록 - ${label}\n\n`;
  if (list.length === 0) return md + "> 조회된 데이터가 없습니다.";

  const maskYmd = new Set(maskYmdColumns);
  const pick = (row) => {
    const out = {};
    for (const [col, lab] of Object.entries(columnLabels)) {
      const v = row[col] ?? row[col.toLowerCase()] ?? row[camel(col)];
      if (codeLabels[col]) {
        out[lab] = applyCodeLabel(v, codeLabels[col]);
        continue;
      }
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out[lab] = maskYmd.has(col) ? maskYmdToMonthDay(v) : stripHtmlBreaks(v);
      }
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
