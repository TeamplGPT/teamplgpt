/**
 * 기간 파라미터 골든 테스트 (specs/015 T004, SC-002)
 *
 * 연도 단위 질의 지원(015) 이전 HEAD 코드로 캡처한 스냅샷이다.
 * 월 단위·기간 없음 입력의 kiwibox 요청({path, form})과 도구 결과 문자열이
 * 변경 후에도 바이트 단위로 같아야 한다. 스냅샷을 갱신(-u)하면 이 테스트의
 * 의미가 사라진다 — 불일치가 나면 handler를 고친다.
 *
 * 아래 응답 fixture도 스냅샷의 일부다. 바꾸지 않는다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const ROW_STAFF = { staffId: "S0001", staffNo: "E0001" };

// path(+cmd)별 고정 응답. 연도 질의 테스트는 별도 fixture를 쓴다.
function respond({ path, form }) {
  switch (path) {
    case "/TAAWrkTimeStatusMgr.do":
      return {
        DATA: [
          { ...ROW_STAFF, workYmd: "20260302", week: "MON", mark: "NORMAL", baseStaTime: "09:00", baseEndTime: "18:00", inTime: "08:55", outTime: "18:05", staTime: "08:55", endTime: "18:05" },
          { ...ROW_STAFF, workYmd: "20260303", week: "TUE", mark: "ABNORMAL", baseStaTime: "09:00", baseEndTime: "18:00", inTime: "09:20", outTime: "18:00", staTime: "09:20", endTime: "18:00", lateYn: "Y", lateTime: "20" },
          { ...ROW_STAFF, workYmd: "20260304", week: "WED", mark: "NORMAL", baseStaTime: "09:00", baseEndTime: "18:00", inTime: "09:00", outTime: "21:00", staTime: "09:00", endTime: "21:00", otWorkOver: "3.0", otTime: "180" },
          { ...ROW_STAFF, workYmd: "20260305", week: "THU", mark: "", workComment: "연차", annualLeave: "연차" },
        ],
      };
    case "/TAADclzWorkSearchCldr.do":
      return {
        DATA: [
          { ymd: "20260301", workTypeNm: "휴일", holidayNm: "삼일절", mark: "", kind: "H" },
          { ymd: "20260302", workTypeNm: "주간근무", holidayNm: "", mark: "NORMAL", kind: "W" },
        ],
      };
    // 연장근무현황(모바일) — specs/017에서 PC 주차별 표(TAADclzWorkOtSchdul)를 교체
    case "/getMBLDclzWorkOtSchdul.do":
      return {
        DATA: [
          { ...ROW_STAFF, staffNm: "홍길동", orgNm: "인사팀", posNm: "사원", lmtOt: 12, useOt: 3.5, remOt: 8.5, lmtOt2: 52, useOt2: 3.5, remOt2: 48.5 },
        ],
      };
    case "/getMBLDclzWorkOtSchdulPerson.do":
      return {
        DATA: [
          { workYmd: "20260317", staHm: "1800", endHm: "1930", otTime: "01:30", wktypeNm: "통상근무", reason: "" },
          { workYmd: "20260302", staHm: "1800", endHm: "2000", otTime: "02:00", wktypeNm: "통상근무", reason: "월초 마감" },
        ],
      };
    case "/TAADclzVcatnList.do":
      if (form.cmd === "getTAADclzVcatnList2") {
        return {
          DATA: [
            { ymd: "20260310", week: "TUE", leavNm: "연차", useDd: "1", reason: "개인사유", dayTypeCd: "1", addNum: "0" },
          ],
        };
      }
      return {
        DATA: [
          { leavCd: "L01", workNm: "연차", creDd: "15", useDd: "3", remDd: "12", staYmd: "20260101", endYmd: "20261231" },
        ],
      };
    case "/TAADclzVcatnCldrMgr.do":
      return {
        DATA: [
          { title: "홍길동 연차", leavNm: "연차", personInfo: "홍길동/인사팀", orgNm: "인사팀", posNm: "사원", staYmd: "20260310", endYmd: "20260310", leavCd: "L01" },
        ],
      };
    case "/getScheduleDay.do":
      return {
        DATA: [
          { MD: "0301", HOLIDAY_YN: "Y", RESULT: "1" },
          { MD: "0302", HOLIDAY_YN: "N", RESULT: "0" },
          { MD: "0303", HOLIDAY_YN: "N", RESULT: "2" },
        ],
      };
    case "/getBirthDetailList.do":
      return { DATA: [{ YMD: "19900315", STAFF_NM: "김철수", ORG_NM: "재무팀", EINFO5: "대리" }] };
    case "/getHRDetailList.do":
      return { DATA: [{ TITLE: "삼일절" }, { TITLE: "전사 워크숍" }, { TITLE: "전사 워크숍" }] };
    case "/CommonCode.do": {
      // 이번 달(2026-10)은 마감 전이라 지급 건이 없다 — 미지정 시 소급 폴백 경로를 태운다.
      if (form.searchYm === "2026-10") return { codeList: [] };
      const [y, m] = String(form.searchYm).split("-");
      return { codeList: [{ CODE: `${y}${m}25NN`, CODE_NM: `${y}-${m}-25 정기급여` }] };
    }
    case "/SALSalaryBassMgr.do":
      return {
        DATA: [
          { ...ROW_STAFF, salYmd: "20260125", orgNm: "인사팀", posNm: "사원", jtotAmt: "3000000", gtotAmt: "500000", ctotAmt: "2500000" },
        ],
      };
    case "/SALDaylabMgr.do":
      return {
        DATA: [
          { workYmd: "20260303", salYmd: "20260310", staffNm: "홍길동", payAmt: "100000", accNo: "ENC", accNoDecrypt: "123-456-789" },
        ],
      };
    case "/EAPRequestMgr.do":
      return {
        DATA: [
          { APPL_NM: "휴가신청", TITLE: "연차 신청", REQ_STATUS_NM: "진행", APPL_STAFF_NM: "홍길동", APPL_YMD: "20260305", REQ_NO: "R0001", REQ_STATUS_CD: "10" },
        ],
      };
    default:
      if (/^\/YTA/.test(path)) {
        return {
          DATA: [
            {
              CTZ_NO: "900101-1******", TX_DIV: "근로", CAL_YM: "202502", TOT_AMT: "1000",
              STAFF_NM: "홍길동", MEDI_BZPLCE_NM: "병원", SUM_AMT: "50000", AGE: "30",
              BIZ_PLACE_NM: "A사", DON_TYPE_CD_NM: "법정", FAM_NM: "본인", CARD_AMT: "100",
              INSU_AMT: "10", EDU_AMT: "20", PAY_CNT: "12", PAY_AMT: "1200",
            },
          ],
        };
      }
      throw new Error(`fixture 없음: ${path}`);
  }
}

// year_month를 받는 query_type (015 data-model §2) + 연도 표현이 와도 기존 경로인 대조군.
// specs/016: 다른 직원 정보 조회(vacation_calendar·birthday·결재 미결/기결/반려/참조)는 제공 중단 —
// 결과가 바뀌는 것이 목적이라 이 골든에서 뺐다(016 contracts/test-expectations.md §5, 24건).
const YEAR_MONTH_TYPES = {
  "hr-attendance": [
    "timesheet", "work_status", "work_calendar",
    "overtime", "overtime_limit", "leave_requests",
  ],
  "hr-personnel": ["schedule_day", "schedule_titles"],
  "hr-salary": ["pay_periods", "salary_statement", "daylabor"],
  "hr-approval": ["drafted"],
};
const MONTH_INPUTS = ["3월", "지난달", "202503", undefined];

const YEAR_END_TAX_TYPES = [
  "summary", "medical", "family", "previous_employer", "donation",
  "credit_card", "insurance", "education", "savings",
];
const YEAR_END_TAX_INPUTS = ["2024", "작년", undefined];

// 모드 없음(data-model §3) — 연도 표현이 와도 지금과 같은 요청·결과여야 한다.
const UNAFFECTED_YEAR_INPUTS = ["올해", "이번년도", "2026", "작년"];

const label = (v) => (v === undefined ? "(없음)" : v);

describe("기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015)", () => {
  beforeEach(() => freezeClock());
  afterEach(() => jest.useRealTimers());

  for (const [skill, types] of Object.entries(YEAR_MONTH_TYPES)) {
    for (const query_type of types) {
      for (const year_month of MONTH_INPUTS) {
        it(`${skill} ${query_type} year_month=${label(year_month)}`, async () => {
          const result = await runHandler(skill, { query_type, year_month }, respond);
          expect(result).toMatchSnapshot();
        });
      }
    }
  }

  for (const query_type of YEAR_END_TAX_TYPES) {
    for (const cal_yy of YEAR_END_TAX_INPUTS) {
      it(`hr-year-end-tax ${query_type} cal_yy=${label(cal_yy)}`, async () => {
        const result = await runHandler("hr-year-end-tax", { query_type, cal_yy }, respond);
        expect(result).toMatchSnapshot();
      });
    }
  }

  for (const year_month of [...MONTH_INPUTS, ...UNAFFECTED_YEAR_INPUTS]) {
    it(`hr-attendance annual_leave_balance year_month=${label(year_month)} (모드 없음)`, async () => {
      const result = await runHandler(
        "hr-attendance",
        { query_type: "annual_leave_balance", year_month },
        respond
      );
      expect(result).toMatchSnapshot();
    });
  }
});
