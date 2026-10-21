/**
 * 기간 파라미터 골든 보강 (specs/015 코드 리뷰 L-10)
 *
 * period-golden.test.js의 4종 입력 밖에서, 연도가 붙은 월 표현·숫자·빈 값처럼 "연도 단위가
 * 아닌" 입력과 급여 명세(pay_item) 계열이 변경 전과 같은지 고정한다. 스냅샷은 변경 전 HEAD를
 * 별도 worktree로 띄워 캡처했다(현재 코드로 캡처하지 않음). 갱신(-u) 금지.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

// period-golden.test.js와 같은 fixture 규칙을 쓰되, 이 파일 안에 고정한다.
function respond({ path, form }) {
  switch (path) {
    case "/TAAWrkTimeStatusMgr.do":
      return { DATA: [{ workYmd: "20260302", week: "MON", mark: "NORMAL", inTime: "0855", outTime: "1805", staTime: "0855", endTime: "1805" }] };
    // 연장근무현황(모바일) — specs/017에서 PC 주차별 표(TAADclzWorkOtSchdul)를 교체
    case "/getMBLDclzWorkOtSchdul.do":
      return { DATA: [{ staffNm: "홍길동", lmtOt: 12, useOt: 2, remOt: 10, lmtOt2: 52, useOt2: 2, remOt2: 50 }] };
    // 월 근무시간(5240 홈 "월별 근무현황", specs/019) — 근무현황 앞에 붙는다
    case "/Home.do":
      return { Map: { workT: 82.5, basTime1: 171, basTime2: 53, remT: "88.5" } };
    case "/getMBLDclzWorkOtSchdulPerson.do":
      return { DATA: [{ workYmd: "20260302", staHm: "1800", endHm: "2000", otTime: "02:00", wktypeNm: "통상근무", reason: "" }] };
    case "/TAADclzVcatnList.do":
      return { DATA: [{ ymd: "20260310", week: "TUE", leavNm: "연차", useDd: "1", workNm: "연차", creDd: "15", remDd: "12" }] };
    case "/getScheduleDay.do":
      return { DATA: [{ MD: "0301", HOLIDAY_YN: "Y", RESULT: "1" }] };
    case "/CommonCode.do": {
      const [y, m] = String(form.searchYm).split("-");
      return { codeList: [{ CODE: `${y}${m}25NN`, CODE_NM: `${y}-${m}-25 정기급여` }] };
    }
    case "/SALSalaryBassMgr.do":
      return { DATA: [{ salYmd: "20260125", jtotAmt: "3000000", ctotAmt: "2500000" }] };
    case "/SALSalaryDtstmnMgr.do":
      return { DATA: [{ salItemNm: "기본급", salYm: "202603", salAmt: "3000000", staffNm: "홍길동", jtotAmt: "3000000" }] };
    case "/EAPRequestMgr.do":
      return { DATA: [{ APPL_NM: "휴가신청", TITLE: "연차 신청", APPL_YMD: "20260305" }] };
    default:
      throw new Error(`fixture 없음: ${path}`);
  }
}

// 연도 단위가 아닌 입력 — periodResolver가 null을 돌려 기존 경로를 타야 한다
// "올해 3월"·"3월 전체"는 2026-10-21에 의도적으로 바뀌었다 — 전에는 해석하지 못해 이번 달(10월)을 조회했고,
// 이제 3월을 조회한다(dateResolver 연도 상대 표현 + 월, date-relative-month.test.js). 나머지 입력은 변경 전과 동일.
const NON_YEAR_INPUTS = ["2026년 3월", "올해 3월", "2026-03", "3", 3, "202512", "", "다음달", "3월 전체"];

const CASES = [
  ["hr-attendance", "work_status"],
  ["hr-attendance", "overtime"],
  ["hr-attendance", "leave_requests"],
  ["hr-attendance", "annual_leave_balance"],
  ["hr-personnel", "schedule_day"],
  ["hr-salary", "pay_periods"],
  ["hr-salary", "salary_statement"],
  // ["hr-approval", "completed"] — specs/016 제공 중단(다른 직원 문서), 9건 제외
];

const label = (v) => (v === "" ? "(빈 문자열)" : typeof v === "number" ? `${v}(숫자)` : v);

describe("기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10)", () => {
  beforeEach(() => freezeClock());
  afterEach(() => jest.useRealTimers());

  for (const [skill, query_type] of CASES) {
    for (const year_month of NON_YEAR_INPUTS) {
      it(`${skill} ${query_type} year_month=${label(year_month)}`, async () => {
        expect(await runHandler(skill, { query_type, year_month }, respond)).toMatchSnapshot();
      });
    }
  }

  // 급여 명세 계열 — pay_item으로 지급 건이 특정되며 year_month는 무시돼야 한다
  for (const query_type of ["payslip", "deductions", "payslip_summary"]) {
    for (const year_month of [undefined, "올해", "2026"]) {
      it(`hr-salary ${query_type} pay_item=20260325NN year_month=${year_month ?? "(없음)"}`, async () => {
        expect(
          await runHandler("hr-salary", { query_type, pay_item: "20260325NN", year_month }, respond)
        ).toMatchSnapshot();
      });
    }
  }
});
