/**
 * 시나리오 기대값의 날짜 자리표시자(specs/020) — "오늘 출근시각"처럼 실행하는 날에 따라 답이 바뀌는
 * 시나리오용. 실행 시점의 서울 날짜로 바꾼다. 자리표시자가 없는 문자열은 그대로.
 *
 *   {{TODAY}} 20261023 / {{TODAY_MD}} 10-23 / {{YESTERDAY}}·{{YESTERDAY_MD}} / {{TOMORROW}}·{{TOMORROW_MD}}
 *   {{WEEK_MON}}·{{WEEK_SUN}} 이번 주 월·일요일(YYYYMMDD) / {{LAST_WEEK_MON}}·{{LAST_WEEK_SUN}}
 *   {{LAST_WEEK_WED}}·{{LAST_WEEK_WED_MD}} 지난주 수요일
 *
 * 두 러너(@agent·위젯)가 시나리오를 읽은 직후 expect에 적용한다.
 */

"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;

function seoulTodayUtc(now) {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate()));
}

const ymdOf = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const mdOf = (d) => d.toISOString().slice(5, 10);

function placeholderValues(now = new Date()) {
  const today = seoulTodayUtc(now);
  const shift = (n) => new Date(today.getTime() + n * DAY_MS);
  const monday = shift(-((today.getUTCDay() + 6) % 7));
  const weekDay = (offset) => new Date(monday.getTime() + offset * DAY_MS);
  return {
    TODAY: ymdOf(today),
    TODAY_MD: mdOf(today),
    YESTERDAY: ymdOf(shift(-1)),
    YESTERDAY_MD: mdOf(shift(-1)),
    TOMORROW: ymdOf(shift(1)),
    TOMORROW_MD: mdOf(shift(1)),
    WEEK_MON: ymdOf(weekDay(0)),
    WEEK_SUN: ymdOf(weekDay(6)),
    LAST_WEEK_MON: ymdOf(weekDay(-7)),
    LAST_WEEK_SUN: ymdOf(weekDay(-1)),
    LAST_WEEK_WED: ymdOf(weekDay(-5)),
    LAST_WEEK_WED_MD: mdOf(weekDay(-5)),
  };
}

/**
 * 값(문자열·배열·객체) 안의 자리표시자를 바꾼 새 값을 돌려준다. 원본은 바꾸지 않는다.
 * 모르는 자리표시자는 Error — 오타가 정규식으로 남아 엉뚱하게 통과하지 않게.
 */
function fillDates(value, values = placeholderValues()) {
  if (typeof value === "string") {
    return value.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key) => {
      if (!Object.hasOwn(values, key)) throw new Error(`Unknown date placeholder ${whole}`);
      return values[key];
    });
  }
  if (Array.isArray(value)) return value.map((v) => fillDates(v, values));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDates(v, values)]));
  }
  return value;
}

module.exports = { fillDates, placeholderValues };
