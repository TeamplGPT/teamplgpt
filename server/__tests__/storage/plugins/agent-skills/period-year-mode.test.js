/**
 * 연도 단위 질의 handler 동작 (specs/015 contracts/tool-output-year.md)
 * 기준일 2026-10-15(서울). 월 단위 질의 무변경은 period-golden.test.js가 맡는다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

const SELF = "$SELF_STAFF_ID";
const HEADER_THIS_YEAR = "> 조회 기간: 2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)";
// 월 고정형(연장근무·지급 건)은 달 단위로 받으므로 월 단위 표기 (코드 리뷰 L-4)
const HEADER_MONTHLY = "> 조회 기간: 2026-01 ~ 2026-10 (2026년 1~10월, 월 단위 조회)";
const MISSING_NOTE =
  "> [안내] 답변에서 위 달이 빠졌다는 것만 짧게 밝히고(사유 설명 불필요), 결과를 그해 전체인 것처럼 말하지 마세요.";
const MONTHS_TO_OCT = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map(
  (m) => `2026${m}`
);
const SESSION_EXPIRED =
  "> ⚠️ HR 세션이 만료되었거나 로그인 페이지로 이동되었습니다. 5240 HR에 다시 로그인한 후 시도하세요.";

// 연간 근무현황 원본(kiwibox 실측 형태). 특이사항: 2/10 지각, 4/20 연차, 5/15 연장근무
const WORK_ROWS = [
  { staffId: "S0001", workYmd: "20260105", week: "MON", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", inTime: "0855", outTime: "1805", staTime: "0855", endTime: "1805" },
  { staffId: "S0001", workYmd: "20260210", week: "TUE", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", inTime: "0910", outTime: "1800", staTime: "0910", endTime: "1800", lateYn: "지각", lateTime: "10" },
  { staffId: "S0001", workYmd: "20260311", week: "WED", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", inTime: "0900", outTime: "1800", staTime: "0900", endTime: "1800" },
  { staffId: "S0001", workYmd: "20260420", week: "MON", mark: "", workComment: "연차", annualLeave: "연차" },
  { staffId: "S0001", workYmd: "20260515", week: "FRI", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", inTime: "0900", outTime: "2100", staTime: "0900", endTime: "2100", otWorkOver: "3.0", otTime: "180" },
];

const APPROVAL_ROW = { APPL_NM: "휴가신청", TITLE: "연차 신청", REQ_STATUS_NM: "완료", APPL_YMD: "20260305", REQ_NO: "R0001" };

// 연장근무 월간(searchType=3) 응답 1행 — 한도 52, 사용 used (specs/017)
const otMonthRow = (used) => ({
  staffNo: "20260001", staffNm: "홍길동", orgNm: "인사팀", posNm: "사원",
  lmtOt: 0, useOt: 0, remOt: 0, lmtOt2: 52, useOt2: used, remOt2: 52 - used,
});

beforeEach(() => freezeClock());
afterEach(() => jest.useRealTimers());

describe("range 모드 — 1회 호출, 기간만 1년 (US1)", () => {
  it("timesheet 올해 → 1/1~오늘, 특이사항 있는 날만 표 + 그 외 N일", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "timesheet", year_month: "올해" },
      () => ({ DATA: WORK_ROWS })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].form).toMatchObject({
      searchBaseSYmd: "20260101",
      searchBaseEYmd: "20261015",
      searchSYmd: "20260101",
      searchEYmd: "20261015",
      cmmSearchStaffId: SELF,
    });
    expect(output.startsWith(`## HR 근태 - 출퇴근 기록\n\n${HEADER_THIS_YEAR}\n\n`)).toBe(true);
    expect(output).toContain("20260210");
    expect(output).toContain("20260420");
    expect(output).toContain("20260515");
    expect(output).not.toContain("20260105");
    expect(output).not.toContain("20260311");
    expect(output).toContain("> 그 외 2일은 특이사항 없음");
    expect(output).not.toContain("S0001");
  });

  it("work_status 이번년도 → 머리 줄 → 집계(전체 행 기준) → 특이사항 표 → 그 외 → 응답 지침 순", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "work_status", year_month: "이번년도" },
      () => ({ DATA: WORK_ROWS })
    );
    expect(calls[0].form.searchBaseSYmd).toBe("20260101");
    expect(calls[0].form.searchBaseEYmd).toBe("20261015");
    const order = [
      "## HR 근태 - 근무현황 요약",
      HEADER_THIS_YEAR,
      "> 집계(5일) · 정상 3일 · 지각 1회 · 휴가 1일 · 연장근로 1일(승인 3.0h)",
      "| 20260210 |",
      "> 그 외 2일은 특이사항 없음",
      "[응답 지침]",
    ].map((s) => output.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("특이사항 있는 날이 없으면 표 대신 안내 문구", async () => {
    const { output } = await runHandler(
      "hr-attendance",
      { query_type: "work_status", year_month: "2026" },
      () => ({ DATA: [WORK_ROWS[0], WORK_ROWS[2]] })
    );
    expect(output).toContain("> 집계(2일) · 정상 2일");
    expect(output).toContain("> 조회 기간 동안 특이사항이 있는 날이 없습니다.");
    expect(output).not.toContain("| 일자 |");
  });

  it("조회 결과가 없으면 기존 문구에 조회 기간을 붙인다", async () => {
    const { output } = await runHandler(
      "hr-attendance",
      { query_type: "timesheet", year_month: "올해" },
      () => ({ DATA: [] })
    );
    expect(output).toBe(
      `> ⚠️ **출퇴근 기록** 조회 결과가 존재하지 않습니다.\n${HEADER_THIS_YEAR}\n`
    );
  });

  it("오류는 머리 줄 없이 그대로 반환한다", async () => {
    const { output } = await runHandler(
      "hr-attendance",
      { query_type: "timesheet", year_month: "올해" },
      () => ({ __raw: { ok: true, status: 200, body: "<html>login</html>" } })
    );
    expect(output).toBe(SESSION_EXPIRED);
  });

  it("daylabor 2026 → searchDateSYmd/EYmd 1/1~오늘, 계좌 미노출", async () => {
    const { calls, output } = await runHandler(
      "hr-salary",
      { query_type: "daylabor", year_month: "2026" },
      () => ({ DATA: [{ workYmd: "20260303", salYmd: "20260310", staffNm: "홍길동", payAmt: "100000", accNo: "ENC", accNoDecrypt: "123-456-789" }] })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].form).toMatchObject({
      searchDateSYmd: "20260101",
      searchDateEYmd: "20261015",
      cmmSearchStaffId: SELF,
    });
    expect(output.startsWith(`## HR 급여 - 일용직 급여 내역\n\n${HEADER_THIS_YEAR}\n\n`)).toBe(true);
    expect(output).not.toContain("123-456-789");
  });

  // specs/016: 결재함은 본인 기안함(drafted)만 제공 — 미결·기결·반려·참조는 다른 직원 문서라 제공 중단
  it.each([["drafted", "2"]])("결재 %s 올해 → sdt/edt 1/1~오늘", async (query_type, gubun) => {
    const { calls, output } = await runHandler(
      "hr-approval",
      { query_type, year_month: "올해" },
      () => ({ DATA: [APPROVAL_ROW] })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].form).toEqual({
      cmd: "getEAPRequestMgrList",
      selectGubun: gubun,
      sdt: "20260101",
      edt: "20261015",
    });
    expect(output).toContain(`\n\n${HEADER_THIS_YEAR}\n\n`);
    expect(output).toContain("연차 신청");
  });

  it("결재함 문서가 없으면 기존 문구 + 조회 기간", async () => {
    const { output } = await runHandler(
      "hr-approval",
      { query_type: "drafted", year_month: "2026년" },
      () => ({ DATA: [] })
    );
    expect(output).toBe(
      `> ⚠️ **기안함(내가 상신한 문서)**: 해당 기간에 문서가 없습니다.\n${HEADER_THIS_YEAR}\n`
    );
  });
});

describe("일정 조회 — 올해도 1/1~12/31 (US2)", () => {
  const HEADER_SCHEDULE = "> 조회 기간: 2026-01-01 ~ 2026-12-31 (2026년 전체)";

  it("schedule_day 올해 → staYmd/endYmd 1년, 건수 1 이상인 날만 + 그 외 N일은 일정 없음", async () => {
    const { calls, output } = await runHandler(
      "hr-personnel",
      { query_type: "schedule_day", year_month: "올해" },
      () => ({
        DATA: [
          { MD: "0101", HOLIDAY_YN: "Y", RESULT: "1" },
          { MD: "0102", HOLIDAY_YN: "N", RESULT: "0" },
          { MD: "0301", HOLIDAY_YN: "Y", RESULT: "2" },
          { MD: "0302", HOLIDAY_YN: "N", RESULT: "0" },
          { MD: "0303", HOLIDAY_YN: "N", RESULT: "0" },
        ],
      })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].form).toEqual({ staYmd: "20260101", endYmd: "20261231" });
    expect(output.startsWith(`## HR 인사기록 - 일정/생일/공휴일 건수\n\n${HEADER_SCHEDULE}\n\n`)).toBe(true);
    expect(output).toContain("| 0101 |");
    expect(output).toContain("| 0301 |");
    expect(output).not.toContain("| 0102 |");
    // 보조 줄은 응답 지침 앞(표 바로 아래)
    const rest = output.indexOf("> 그 외 3일은 일정 없음");
    expect(rest).toBeGreaterThan(0);
    expect(rest).toBeLessThan(output.indexOf("[응답 지침]"));
  });

  it("schedule_day 일정 있는 날이 없으면 안내 문구", async () => {
    const { output } = await runHandler(
      "hr-personnel",
      { query_type: "schedule_day", year_month: "2026" },
      () => ({ DATA: [{ MD: "0102", HOLIDAY_YN: "N", RESULT: "0" }] })
    );
    expect(output).toBe(
      `## HR 인사기록 - 일정/생일/공휴일 건수\n\n${HEADER_SCHEDULE}\n\n> 조회 기간 동안 일정이 있는 날이 없습니다.`
    );
  });

  // specs/016: birthday(생일자 명단)는 다른 직원 정보라 제공 중단 — other-employee-block.test.js가 거절을 검증
  it.each([
    ["schedule_titles", { DATA: [{ TITLE: "설날" }, { TITLE: "설날" }, { TITLE: "추석" }] }, "추석"],
  ])("%s 이번년도 → staYmd/endYmd 1년 + 머리 줄", async (query_type, body, expected) => {
    const { calls, output } = await runHandler(
      "hr-personnel",
      { query_type, year_month: "이번년도" },
      () => body
    );
    expect(calls[0].form).toEqual({ staYmd: "20260101", endYmd: "20261231" });
    expect(output).toContain(`\n\n${HEADER_SCHEDULE}\n\n`);
    expect(output).toContain(expected);
    expect(output).not.toContain("1990");
  });

  it("schedule_titles 연도 질의에서도 중복 제목은 합친다", async () => {
    const { output } = await runHandler(
      "hr-personnel",
      { query_type: "schedule_titles", year_month: "올해" },
      () => ({ DATA: [{ TITLE: "설날" }, { TITLE: "설날" }, { TITLE: "추석" }] })
    );
    expect(output.match(/설날/g)).toHaveLength(1);
  });

  it("vacation_calendar 2026 → 다른 직원 정보라 제공 중단(호출 0 + 거절 문구, specs/016)", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "vacation_calendar", year_month: "2026" },
      () => ({ DATA: [{ title: "홍길동 연차", leavNm: "연차", staYmd: "20261224", endYmd: "20261224", leavCd: "L01" }] })
    );
    expect(calls).toHaveLength(0);
    expect(output).toBe('> ⚠️ 다른 직원의 정보는 조회할 수 없어요. 본인 정보는 "내 연차 알려줘"처럼 물어봐 주세요.');
  });

  it("work_calendar 올해 → searchYm=1월 + searchSYmd/EYmd 1년 (spec D7, 실서버 확인 전제)", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "work_calendar", year_month: "올해" },
      () => ({ DATA: [{ ymd: "20260301", workTypeNm: "휴일", holidayNm: "삼일절", kind: "H" }] })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].form).toEqual({
      cmd: "getTAADclzWorkSearchCldr",
      searchYm: "202601",
      searchSYmd: "20260101",
      searchEYmd: "20261231",
      searchBaseYmd: "2026-10-15",
      searchId: SELF,
      cmmSearchStaffId: SELF,
    });
    expect(output).toContain(`\n\n${HEADER_SCHEDULE}\n\n`);
  });

  it("work_calendar를 monthly로 전환하면 12개월 순차 호출 + 달별 행을 이어 붙여 같은 축약 적용(D7 대비)", async () => {
    const { YEAR_MODE } = require("../../../../storage/plugins/agent-skills/hr-attendance/handler.js");
    const original = YEAR_MODE.work_calendar;
    YEAR_MODE.work_calendar = { kind: "schedule", mode: "monthly" };
    try {
      const { calls, output } = await runHandler(
        "hr-attendance",
        { query_type: "work_calendar", year_month: "올해" },
        ({ form }) => ({
          DATA: [
            { ymd: `${form.searchYm}01`, workTypeNm: "주간근무" },
            ...(form.searchYm === "202612" ? [{ ymd: "20261225", workTypeNm: "휴일", holidayNm: "성탄절" }] : []),
          ],
        })
      );
      expect(calls).toHaveLength(12);
      expect(calls[1].form).toMatchObject({
        searchYm: "202602",
        searchSYmd: "20260201",
        searchEYmd: "20260228",
      });
      expect(output).toContain(`2026-01 ~ 2026-12 (2026년 전체, 월 단위 조회)`);
      expect(output).toContain("| 20261225 |");
      expect(output).not.toContain("| 20260101 |");
      expect(output).toContain("> 그 외 12일은 평일 주간근무 / 주말 주간근무");
    } finally {
      YEAR_MODE.work_calendar = original;
    }
  });
});

describe("지난해·특정 연도 — 그해 전체 (US3)", () => {
  const HEADER_2025 = "> 조회 기간: 2025-01-01 ~ 2025-12-31 (2025년 전체)";
  const HEADER_2024 = "> 조회 기간: 2024-01-01 ~ 2024-12-31 (2024년 전체)";

  it("work_status 작년 → 2025-01-01~2025-12-31 (지난 연도는 실적도 12/31까지)", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "work_status", year_month: "작년" },
      () => ({ DATA: WORK_ROWS })
    );
    expect(calls[0].form).toMatchObject({
      searchBaseSYmd: "20250101",
      searchBaseEYmd: "20251231",
      searchSYmd: "20250101",
      searchEYmd: "20251231",
    });
    expect(output).toContain(`\n\n${HEADER_2025}\n\n`);
  });

  it("overtime 지난해 → 2025년 12개월 순차 호출(각 달 말일 기준)", async () => {
    const { calls } = await runHandler(
      "hr-attendance",
      { query_type: "overtime", year_month: "지난해" },
      () => ({ DATA: [otMonthRow(1)] })
    );
    expect(calls).toHaveLength(12);
    expect(calls[0].form.searchBaseSYmd).toBe("2025-01-31");
    expect(calls[1].form.searchBaseSYmd).toBe("2025-02-28");
    expect(calls[11].form.searchBaseSYmd).toBe("2025-12-31");
  });

  it("leave_requests 재작년 → 휴가·회계연도 2024 + 머리 줄", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "leave_requests", year_month: "재작년" },
      () => ({ DATA: [{ ymd: "20240510", week: "FRI", leavNm: "연차", useDd: "1", reason: "개인사유" }] })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].form).toMatchObject({
      searchSymdLv: "20240101",
      searchEymdLv: "20241231",
      searchSymdFy: "20240101",
      searchEymdFy: "20241231",
      staffId: SELF,
      cmmSearchStaffId: SELF,
    });
    expect(output).toContain(`\n\n${HEADER_2024}\n\n`);
  });

  it("annual_leave_balance는 연도 표현이 와도 기존 경로(머리 줄 없음)", async () => {
    const { output } = await runHandler(
      "hr-attendance",
      { query_type: "annual_leave_balance", year_month: "재작년" },
      () => ({ DATA: [{ workNm: "연차", creDd: "15", useDd: "3", remDd: "12" }] })
    );
    expect(output).not.toContain("조회 기간");
  });

  it("salary_statement 재작년 → findText=2024 + 머리 줄", async () => {
    const { calls, output } = await runHandler(
      "hr-salary",
      { query_type: "salary_statement", year_month: "재작년" },
      () => ({ DATA: [{ salYmd: "20240125", orgNm: "인사팀", jtotAmt: "3000000", gtotAmt: "500000", ctotAmt: "2500000" }] })
    );
    expect(calls[0].form).toEqual({
      cmd: "getSALSalaryBassMgrTab110List",
      findText: "2024",
      staffId: SELF,
    });
    expect(output).toContain(`\n\n${HEADER_2024}\n\n`);
  });

  it.each([
    ["재작년", "2024"],
    ["2025년", "2025"],
    ["작년", "2025"],
    ["2023", "2023"],
  ])("연말정산 cal_yy=%s → %s년 경로·searchCalYy, 머리 줄 없음", async (cal_yy, year) => {
    const { calls, output } = await runHandler(
      "hr-year-end-tax",
      { query_type: "summary", cal_yy },
      () => ({ DATA: [{ TX_DIV: "근로", CAL_YM: `${year}02`, TOT_AMT: "1000" }] })
    );
    expect(calls[0].path).toBe(`/YTASummaryMgr${year}.do`);
    expect(calls[0].form.searchCalYy).toBe(year);
    expect(output).toContain(`(${year}년)`);
    expect(output).not.toContain("조회 기간");
  });

  it.each(["이번년도", "올해", "금년"])("연말정산 cal_yy=%s → 2026은 기존대로 미지원 안내", async (cal_yy) => {
    const { calls, output } = await runHandler(
      "hr-year-end-tax",
      { query_type: "summary", cal_yy },
      () => ({ DATA: [] })
    );
    expect(calls).toHaveLength(0);
    expect(output).toBe("> ⚠️ 2026년 연말정산은 지원하지 않습니다. 지원 연도: 2025, 2024, 2023, 2022.");
  });
});

describe("monthly 모드 — 달마다 순차 호출 후 병합 (US1)", () => {
  // 연장근무 연도 질의는 5240 모바일 월간 조회(searchType=3)를 달마다 부른다(specs/017).
  // 렌더 세부는 overtime-status.test.js가 맡고, 여기서는 handler → hrFetch 연결과 runMonthly 승계를 본다.
  const OT_PATH = "/getMBLDclzWorkOtSchdul.do";
  const MONTH_ENDS_TO_OCT = [
    "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31",
    "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-15",
  ];
  const monthOf = (form) => form.searchBaseSYmd.slice(5, 7);

  it("overtime 올해 → 1월~10월 10회, 월간(searchType=3) 기준일은 말일(이번 달은 오늘), 본인 마커", async () => {
    const { calls } = await runHandler(
      "hr-attendance",
      { query_type: "overtime", year_month: "올해" },
      () => ({ DATA: [otMonthRow(5)] })
    );
    expect(calls.map((c) => c.form.searchBaseSYmd)).toEqual(MONTH_ENDS_TO_OCT);
    for (const c of calls) {
      expect(c.path).toBe(OT_PATH);
      expect(c.form).toEqual({ searchType: "3", searchBaseSYmd: c.form.searchBaseSYmd, cmmSearchStaffId: SELF });
    }
  });

  it("overtime_limit도 같은 경로 — 월별 표 + 사용 합계", async () => {
    const { output } = await runHandler(
      "hr-attendance",
      { query_type: "overtime_limit", year_month: "2026년" },
      () => ({ DATA: [otMonthRow(3.5)] })
    );
    expect(output).toContain("## HR 근태 - 연장근무 현황");
    expect(output).toContain(`${HEADER_MONTHLY}\n`);
    expect(output).toContain("| 2026-01 | 52.0 | 3.5 | 48.5 |");
    expect(output).toContain("| 합계 | — | 35.0 | — |");
  });

  it("한 달 응답이 여러 행이면 그 달을 실패로 돌리고 다른 직원 값은 쓰지 않는다", async () => {
    const { output } = await runHandler(
      "hr-attendance",
      { query_type: "overtime", year_month: "올해" },
      ({ form }) =>
        monthOf(form) === "04"
          ? { DATA: [otMonthRow(5), { ...otMonthRow(9), staffNo: "20260002", staffNm: "김철수" }] }
          : { DATA: [otMonthRow(5)] }
    );
    expect(output).toContain("> 조회되지 않은 달: 2026-04 (표에 —로 표시)");
    expect(output).toContain("조회되지 않은 사유: 2026-04 (본인 한 명 분이 아닌 응답이라 사용하지 않았습니다)");
    expect(output).toContain("| 2026-04 | — | — | — |");
    expect(output).toContain("| 합계 (조회된 9개월) | — | 45.0 | — |");
    expect(output).not.toMatch(/김철수|20260002|9\.0/);
  });

  it("셋째 달 실패 → 행은 —(018 D12), 머리 줄에 표시, 합계는 조회된 달 수와 함께", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "overtime", year_month: "올해" },
      (req) =>
        monthOf(req.form) === "03"
          ? { __raw: { ok: false, status: 500, body: "error" } }
          : { DATA: [otMonthRow(5)] }
    );
    expect(calls).toHaveLength(10);
    expect(output).toContain(
      `${HEADER_MONTHLY}\n> 조회되지 않은 달: 2026-03 (표에 —로 표시)\n${MISSING_NOTE}\n> [내부 참조 — 답변에 쓰지 마세요] 조회되지 않은 사유: 2026-03 (HR 시스템 호출 실패 (HTTP 500))\n`
    );
    expect(output).toContain("| 2026-03 | — | — | — |");
    expect(output).toContain("| 합계 (조회된 9개월) | — | 45.0 | — |");
  });

  it("첫 달 실패 → 기존 오류 문구 그대로, 나머지 달 미호출", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "overtime", year_month: "올해" },
      () => ({ __raw: { ok: true, status: 200, body: "<html>login</html>" } })
    );
    expect(calls).toHaveLength(1);
    expect(output).toBe(SESSION_EXPIRED);
  });

  it("누적 60초를 넘기면 남은 달은 호출하지 않고 '시간 초과'로 표시", async () => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "overtime", year_month: "올해" },
      () => {
        jest.setSystemTime(Date.now() + 25_000);
        return { DATA: [otMonthRow(5)] };
      }
    );
    expect(calls).toHaveLength(3);
    expect(output).toContain(
      "> 조회되지 않은 달: 2026-04, 2026-05, 2026-06, 2026-07, 2026-08, 2026-09, 2026-10 (표에 —로 표시)"
    );
    expect(output).toContain("| 합계 (조회된 3개월) | — | 15.0 | — |");
    expect(output).toContain(MISSING_NOTE);
  });

  it("모든 달 사용 0 → 그해 연장근무 기록 없음", async () => {
    const { output } = await runHandler(
      "hr-attendance",
      { query_type: "overtime", year_month: "올해" },
      () => ({ DATA: [otMonthRow(0)] })
    );
    expect(output).toContain("> 2026년 연장근무 기록이 없습니다.");
    // 응답 형식 줄은 '"1건" 같은 표현은 쓰지 마세요'라고 금지어를 인용하므로 빼고 본다
    expect(output.replace(/\[응답 형식\][^\n]*/g, "")).not.toContain("1건");
  });

  it("pay_periods 올해 → 10회(YYYY-MM), 월 칸 추가, 코드 중복 제거, 지급 건 없는 달 표시", async () => {
    const codes = (ym, list) => ({
      codeList: list.map(([d, kind, suffix]) => ({ CODE: `${ym.replace("-", "")}${d}${suffix}`, CODE_NM: `${ym}-${d} ${kind}` })),
    });
    const { calls, output } = await runHandler(
      "hr-salary",
      { query_type: "pay_periods", year_month: "올해" },
      ({ form }) => {
        if (form.searchYm === "2026-10") return { codeList: [] };
        if (form.searchYm === "2026-03") {
          return {
            codeList: [
              { CODE: "20260225NN", CODE_NM: "2026-02-25 정기급여" }, // 2월 건 중복(마감 지연분)
              { CODE: "20260325NN", CODE_NM: "2026-03-25 정기급여" },
              { CODE: "20260310BN", CODE_NM: "2026-03-10 상여" },
            ],
          };
        }
        return codes(form.searchYm, [["25", "정기급여", "NN"]]);
      }
    );
    expect(calls.map((c) => c.form.searchYm)).toEqual(
      MONTHS_TO_OCT.map((ym) => `${ym.slice(0, 4)}-${ym.slice(4)}`)
    );
    expect(calls[0].form).toEqual({
      cmd: "getCommonNSCodeList",
      queryId: "getSalYmdTypeCdList2",
      closeChk: "Y",
      searchYm: "2026-01",
      applCd: "",
      staffId: SELF,
    });
    expect(output.startsWith(`## HR 급여 - 지급 건 목록 (2026년)\n\n${HEADER_MONTHLY}\n\n`)).toBe(true);
    // 지급 건 코드는 표에 없고 내부 참조 줄에만(018 보안 리뷰 C1 — 연 단위도 월 단위와 같게)
    expect(output).toContain("| 월 | 급여 건 |");
    expect(output).toContain("| 2026-01 | 2026-01-25 정기급여 |");
    expect(output).toContain("| 2026-03 | 2026-03-10 상여 |");
    const table = output.split("\n").filter((l) => l.startsWith("|")).join("\n");
    expect(table).not.toMatch(/20260125NN|pay_item|코드/);
    expect(output.match(/2026-02-25 정기급여=20260225NN/g)).toHaveLength(1);
    expect(output).toContain("> 총 **10건**.");
    expect(output).toContain("> 지급 건이 없는 달: 2026-10");
  });

  it("pay_periods 해당 연도 지급 건이 하나도 없으면 안내 + 조회 기간", async () => {
    const { output } = await runHandler(
      "hr-salary",
      { query_type: "pay_periods", year_month: "금년" },
      () => ({ codeList: [] })
    );
    expect(output).toBe(
      `> ⚠️ **급여 지급 건 목록**: 해당 연도에 지급된(마감된) 급여 건이 없습니다.\n${HEADER_MONTHLY}\n`
    );
  });

  it("pay_periods 코드가 빈 행은 서로 다른 건일 수 있어 합치지 않는다", async () => {
    const { output } = await runHandler(
      "hr-salary",
      { query_type: "pay_periods", year_month: "올해" },
      ({ form }) => ({ codeList: [{ CODE_NM: `${form.searchYm}-25 정기급여` }] })
    );
    expect(output).toContain("> 총 **10건**.");
  });
});

describe("코드 리뷰 반영 — 흔한 연도 변형·연차 연도 교정", () => {
  it.each(["2026년 전체", "이번 연도", "금년도", "올해 전체"])(
    "work_status %s → 연도 모드(이번 달로 축소되지 않음)",
    async (year_month) => {
      const { calls, output } = await runHandler(
        "hr-attendance",
        { query_type: "work_status", year_month },
        () => ({ DATA: WORK_ROWS })
      );
      expect(calls[0].form).toMatchObject({ searchBaseSYmd: "20260101", searchBaseEYmd: "20261015" });
      expect(output).toContain(HEADER_THIS_YEAR);
    }
  );

  it.each([
    ["재작년", "2024"],
    ["전년도", "2025"],
    ["2024년도", "2024"],
  ])("annual_leave_balance %s → 휴가연도 %s (머리 줄 없음, 기존 렌더)", async (year_month, year) => {
    const { calls, output } = await runHandler(
      "hr-attendance",
      { query_type: "annual_leave_balance", year_month },
      () => ({ DATA: [{ workNm: "연차", creDd: "15", useDd: "3", remDd: "12" }] })
    );
    expect(calls[0].form).toMatchObject({
      searchSymdLv: `${year}0101`,
      searchEymdLv: `${year}1231`,
      searchSymdFy: `${year}0101`,
      searchEymdFy: `${year}1231`,
    });
    expect(output).not.toContain("조회 기간");
  });

  it("work_calendar 1년치는 공휴일·평일/주말 각각의 평소 유형과 다른 날만 표 + 그 외 N일 요약", async () => {
    // 2026-03-02(월)~06(금) 평일, 01·08(일)·07·14(토) 주말 — 실서버처럼 주말은 "휴일"이 평소다
    const days = [
      ...Array.from({ length: 5 }, (_, i) => ({ ymd: `2026-03-0${i + 2}`, workTypeNm: "주간근무", mark: "NORMAL" })),
      { ymd: "2026-03-01", workTypeNm: "휴일", holidayNm: "삼일절", mark: "" },
      { ymd: "2026-03-07", workTypeNm: "휴일", mark: "" },
      { ymd: "2026-03-08", workTypeNm: "휴일", mark: "" },
      { ymd: "2026-03-10", workTypeNm: "재택근무", mark: "NORMAL" },
      { ymd: "2026-03-14", workTypeNm: "주간근무", mark: "NORMAL" }, // 주말 근무 — 특이
    ];
    const { output } = await runHandler(
      "hr-attendance",
      { query_type: "work_calendar", year_month: "올해" },
      () => ({ DATA: days })
    );
    expect(output).toContain("| 2026-03-01 |");
    expect(output).toContain("| 2026-03-10 |");
    expect(output).toContain("| 2026-03-14 |");
    expect(output).not.toContain("| 2026-03-02 |");
    expect(output).not.toContain("| 2026-03-07 |");
    const rest = output.indexOf("> 그 외 7일은 평일 주간근무 / 주말 휴일");
    expect(rest).toBeGreaterThan(0);
    expect(rest).toBeLessThan(output.indexOf("[응답 지침]"));
  });
});
