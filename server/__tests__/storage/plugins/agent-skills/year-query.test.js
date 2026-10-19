/**
 * 연도 질의 조회 도우미 테스트 (specs/015 data-model §4, contracts/tool-output-year.md §1·§3)
 */
const path = require("path");
const {
  runMonthly,
  monthlyPeriod,
  formatPeriodHeader,
  withPeriodHeader,
  renderMonthlySum,
  sumHHMM,
  failureReason,
} = require(
  path.resolve(
    __dirname,
    "../../../../storage/plugins/agent-skills/_shared/yearQuery.js"
  )
);

const PERIOD = {
  year: "2026",
  start: "20260101",
  end: "20261015",
  months: ["202601", "202602", "202603", "202604"],
  isCurrentYear: true,
  label: "2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)",
};

const ok = (records) => ({ records });
const empty = () => ({ errorMessage: null, records: null, isEmpty: true });
const fail = (msg) => ({ errorMessage: msg });

// 호출마다 fakeMs만큼 시간이 흐르는 가짜 시계
function steppingClock(stepMs) {
  let t = 1_000_000;
  return { now: () => t, tick: () => (t += stepMs) };
}

describe("runMonthly", () => {
  it("모든 달을 순서대로 한 번씩 호출하고 성공·빈 달을 나눈다", async () => {
    const seen = [];
    const result = await runMonthly(PERIOD.months, async (ym) => {
      seen.push(ym);
      return ym === "202602" ? empty() : ok([{ ym }]);
    });
    expect(seen).toEqual(PERIOD.months);
    expect(result).toEqual({
      perMonth: [
        { ym: "202601", records: [{ ym: "202601" }] },
        { ym: "202603", records: [{ ym: "202603" }] },
        { ym: "202604", records: [{ ym: "202604" }] },
      ],
      emptyMonths: ["202602"],
      failedMonths: [],
    });
  });

  it("호출은 순차다 — 앞 달이 끝나기 전에 다음 달을 부르지 않는다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runMonthly(PERIOD.months, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return ok([]);
    });
    expect(maxInFlight).toBe(1);
  });

  it("첫 달이 실패하면 그 errorMessage를 그대로 반환하고 나머지는 부르지 않는다", async () => {
    const seen = [];
    const msg = "> ⚠️ HR 세션이 만료되었거나 로그인 페이지로 이동되었습니다. 5240 HR에 다시 로그인한 후 시도하세요.";
    const result = await runMonthly(PERIOD.months, async (ym) => {
      seen.push(ym);
      return fail(msg);
    });
    expect(result).toEqual({ errorMessage: msg });
    expect(seen).toEqual(["202601"]);
  });

  it("둘째 달부터의 실패는 failedMonths에 사유와 함께 남기고 계속 조회한다", async () => {
    const result = await runMonthly(PERIOD.months, async (ym) =>
      ym === "202603" ? fail("> ⚠️ HR 시스템 호출 실패 (HTTP 500).") : ok([{ ym }])
    );
    expect(result.failedMonths).toEqual([{ ym: "202603", reason: "HR 시스템 호출 실패 (HTTP 500)" }]);
    expect(result.perMonth.map((m) => m.ym)).toEqual(["202601", "202602", "202604"]);
  });

  it("첫 달 예외는 다시 던져 handler의 기존 catch 문구로 보낸다", async () => {
    await expect(
      runMonthly(PERIOD.months, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  it("둘째 달부터의 예외는 고정 사유 '조회 오류'로만 남긴다(내부 메시지 미노출)", async () => {
    const later = await runMonthly(PERIOD.months, async (ym) => {
      if (ym === "202602") throw new Error("Cannot read properties of undefined");
      return ok([]);
    });
    expect(later.failedMonths).toEqual([{ ym: "202602", reason: "조회 오류" }]);
  });

  it("연속 2회 실패하면 남은 달은 부르지 않고 '연속 실패로 조회 중단'", async () => {
    const seen = [];
    const months = ["202601", "202602", "202603", "202604", "202605"];
    const result = await runMonthly(months, async (ym) => {
      seen.push(ym);
      return ym === "202601" ? ok([]) : fail("> ⚠️ HR 시스템 호출 실패 (HTTP 500).");
    });
    expect(seen).toEqual(["202601", "202602", "202603"]);
    expect(result.failedMonths).toEqual([
      { ym: "202602", reason: "HR 시스템 호출 실패 (HTTP 500)" },
      { ym: "202603", reason: "HR 시스템 호출 실패 (HTTP 500)" },
      { ym: "202604", reason: "연속 실패로 조회 중단" },
      { ym: "202605", reason: "연속 실패로 조회 중단" },
    ]);
  });

  it("실패 사이에 성공이 끼면 연속 횟수는 초기화된다", async () => {
    const months = ["202601", "202602", "202603", "202604", "202605"];
    const result = await runMonthly(months, async (ym) =>
      ym === "202602" || ym === "202604" ? fail("> ⚠️ 실패.") : ok([])
    );
    expect(result.failedMonths.map((f) => f.ym)).toEqual(["202602", "202604"]);
    expect(result.perMonth.map((m) => m.ym)).toEqual(["202601", "202603", "202605"]);
  });

  it("시간 예산을 넘기면 남은 달은 호출하지 않고 '시간 초과'로 기록한다", async () => {
    const clock = steppingClock(25_000);
    const seen = [];
    const result = await runMonthly(
      PERIOD.months,
      async (ym) => {
        seen.push(ym);
        clock.tick();
        return ok([{ ym }]);
      },
      { budgetMs: 60_000, now: clock.now }
    );
    // 0s 시작 → 1월 후 25s → 2월 후 50s → 3월 후 75s(예산 초과) → 4월 미호출
    expect(seen).toEqual(["202601", "202602", "202603"]);
    expect(result.failedMonths).toEqual([{ ym: "202604", reason: "시간 초과" }]);
  });

  it("기본 예산은 60초다", async () => {
    const clock = steppingClock(59_000);
    const seen = [];
    await runMonthly(
      PERIOD.months,
      async (ym) => {
        seen.push(ym);
        clock.tick();
        return ok([]);
      },
      { now: clock.now }
    );
    expect(seen).toEqual(["202601", "202602"]);
  });
});

describe("failureReason", () => {
  it.each([
    ["> ⚠️ HR 조회 응답이 시간 내에 도착하지 않았습니다. 5240 HR 화면이 열려 있고 로그인 상태인지 확인하세요.", "HR 조회 응답이 시간 내에 도착하지 않았습니다"],
    ["> ⚠️ HR 시스템 호출 실패 (HTTP 502).", "HR 시스템 호출 실패 (HTTP 502)"],
    ["> ⚠️ HR 시스템 응답 시간이 초과되었습니다.", "HR 시스템 응답 시간이 초과되었습니다"],
    ["그냥 문장", "그냥 문장"],
  ])("%p → %p", (msg, reason) => {
    expect(failureReason(msg)).toBe(reason);
  });
});

describe("formatPeriodHeader", () => {
  it("실패한 달이 없으면 조회 기간 한 줄", () => {
    expect(formatPeriodHeader(PERIOD)).toBe(
      "> 조회 기간: 2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)\n"
    );
  });

  const MISSING_NOTE =
    "> [안내] 답변에서 위 달이 빠졌다는 것만 짧게 밝히고(사유 설명 불필요), 결과를 그해 전체인 것처럼 말하지 마세요.\n";

  it("사유가 모두 같으면 달을 나열하고 사유를 한 번만 붙인다 + 빠진 달을 밝히라는 안내", () => {
    expect(
      formatPeriodHeader(PERIOD, [
        { ym: "202603", reason: "HR 응답 시간 초과" },
        { ym: "202607", reason: "HR 응답 시간 초과" },
      ])
    ).toBe(
      "> 조회 기간: 2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)\n" +
        "> 조회되지 않은 달: 2026-03, 2026-07\n" +
        MISSING_NOTE +
        "> [내부 참조 — 답변에 쓰지 마세요] 조회되지 않은 사유: 2026-03, 2026-07 (HR 응답 시간 초과)\n"
    );
  });

  it("사유가 다르면 달마다 괄호로 붙인다", () => {
    expect(
      formatPeriodHeader(PERIOD, [
        { ym: "202603", reason: "HR 시스템 호출 실패 (HTTP 500)" },
        { ym: "202607", reason: "시간 초과" },
      ])
    ).toBe(
      "> 조회 기간: 2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)\n" +
        "> 조회되지 않은 달: 2026-03, 2026-07\n" +
        MISSING_NOTE +
        "> [내부 참조 — 답변에 쓰지 마세요] 조회되지 않은 사유: 2026-03 (HR 시스템 호출 실패 (HTTP 500)), 2026-07 (시간 초과)\n"
    );
  });
});

describe("monthlyPeriod — 월 단위 조회 표기", () => {
  it("올해(일부 월) → '2026년 1~4월, 월 단위 조회'", () => {
    expect(monthlyPeriod(PERIOD).label).toBe("2026-01 ~ 2026-04 (2026년 1~4월, 월 단위 조회)");
  });

  it("12개월 → '그해 전체, 월 단위 조회'", () => {
    const months = Array.from({ length: 12 }, (_, i) => `2025${String(i + 1).padStart(2, "0")}`);
    expect(monthlyPeriod({ ...PERIOD, year: "2025", months }).label).toBe(
      "2025-01 ~ 2025-12 (2025년 전체, 월 단위 조회)"
    );
  });

  it("원본 period를 변경하지 않는다", () => {
    const frozen = Object.freeze({ ...PERIOD, months: Object.freeze([...PERIOD.months]) });
    expect(() => monthlyPeriod(frozen)).not.toThrow();
    expect(frozen.label).toBe(PERIOD.label);
  });
});

describe("renderMonthlySum", () => {
  const merged = (values) => ({
    perMonth: values.map((v, i) => ({ ym: `20260${i + 1}`, records: v })),
    emptyMonths: [],
    failedMonths: [],
  });

  it("값이 하나도 없으면 00:00이라 적지 않는다(조용한 0 방지)", () => {
    const md = renderMonthlySum(merged([null, null]), (v) => v, "연장근무 합계");
    expect(md).toContain("> 월별 합계 값이 없어 연간 합계를 계산하지 않았습니다.");
    expect(md).not.toContain("00:00");
  });

  it("값이 있으면 연간 합계", () => {
    const md = renderMonthlySum(merged(["1:30", "2:00"]), (v) => v, "연장근무 합계");
    expect(md).toContain("> 연간 합계 **03:30** (조회된 2개월)");
  });
});

describe("withPeriodHeader", () => {
  it("제목(## …) 바로 다음, 본문 앞에 머리 줄을 넣는다", () => {
    expect(withPeriodHeader("## HR 근태 - 출퇴근 기록\n\n| a |\n", PERIOD)).toBe(
      "## HR 근태 - 출퇴근 기록\n\n> 조회 기간: 2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)\n\n| a |\n"
    );
  });

  it("제목이 없는 안내 문구에는 뒤에 붙인다", () => {
    expect(withPeriodHeader("> ⚠️ **출퇴근 기록** 조회 결과가 존재하지 않습니다.", PERIOD)).toBe(
      "> ⚠️ **출퇴근 기록** 조회 결과가 존재하지 않습니다.\n> 조회 기간: 2026-01-01 ~ 2026-10-15 (2026년, 오늘까지)\n"
    );
  });
});

describe("sumHHMM", () => {
  it("H:MM·HH:MM 값을 분 단위로 더해 HH:MM으로 반환한다", () => {
    expect(sumHHMM(["05:00", "0:30", "12:45"])).toBe("18:15");
  });

  it("100시간을 넘어도 그대로 표기한다", () => {
    expect(sumHHMM(["52:00", "52:00", "10:30"])).toBe("114:30");
  });

  it("빈 목록은 00:00", () => {
    expect(sumHHMM([])).toBe("00:00");
  });

  it.each([[["05:00", "3.5"]], [["05:00", ""]], [["05:00", null]], [["5:75"]], [["1:2"]]])(
    "형식이 다른 값이 섞이면 null — %p",
    (values) => {
      expect(sumHHMM(values)).toBeNull();
    }
  );
});
