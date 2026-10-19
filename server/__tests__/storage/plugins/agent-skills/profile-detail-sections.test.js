/**
 * 인사카드 상세(profile_detail) 섹션 — 허용 목록 (사용자 결정 2026-10-19: 다른 사람 정보가 담길 수 있는 섹션은 안 보이게)
 * 섹션은 HR 메뉴 설정(AUTT_MENU)에 따라 달라 이름을 모르는 섹션은 감춘다(fail-closed).
 * 본인 인사 정보로 보이는 이름만 보이고, 다른 사람 정보 단어가 섞이면 허용 단어가 있어도 감춘다.
 */
const { freezeClock, runHandler } = require("./helpers/hrHandlerHarness");

beforeEach(() => freezeClock());
afterEach(() => jest.useRealTimers());

const SECTIONS = [
  ["◎ 기본", "오사공 책임"],
  ["◎ 발령", "2026-01-01 개발팀 배치"],
  ["◎ 학력", "OO대학교 졸업"],
  ["◎ 경력", "前 OO 3년"],
  ["◎ 자격", "정보처리기사"],
  ["◎ 교육", "오라클 튜닝"],
  ["◎ 가족", "김미선 39세 배우자"],
  ["◎ 부양가족", "오준영 5세"],
  ["◎ 보증인", "박보증 010-0000-0000"],
  ["◎ 비상연락처", "김미선 010-1111-2222"],
  ["◎ 장애", "-"],
  ["◎ 보훈", "-"],
  ["◎ 추천인", "이추천 부장"],
  ["◎ 기타사항", "알 수 없는 내용"],
];

async function run() {
  const { output } = await runHandler("hr-personnel", { query_type: "profile_detail" }, () => ({
    DATA: SECTIONS.map(([menuNm, contents]) => ({ menuNm, contents })),
  }));
  return output;
}

it.each(["◎ 기본", "◎ 발령", "◎ 학력", "◎ 경력", "◎ 자격", "◎ 교육"])("본인 인사 정보 섹션은 보인다: %s", async (name) => {
  expect(await run()).toContain(name);
});

it.each(["가족", "부양", "보증인", "비상연락", "장애", "보훈", "추천인", "기타사항", "김미선", "010-"])(
  "다른 사람 정보가 담길 수 있거나 모르는 섹션은 감춘다: %s",
  async (word) => {
    expect(await run()).not.toContain(word);
  }
);
