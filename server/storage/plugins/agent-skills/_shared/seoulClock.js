// _shared/seoulClock.js
// HR 날짜는 서버 시간대와 무관하게 한국 시간으로 계산한다.
//
// 서버(도커 이미지)는 시간대를 정하지 않아 UTC로 돌 수 있다. 그러면 로컬 시각으로 계산한
// "오늘"·"이번달"이 서울 기준 매일 00:00~08:59에 하루(매월 1일엔 한 달) 밀린다.
//
// seoulWallClock()은 "로컬 getter(getFullYear·getMonth·getDate·getHours)가 서울 벽시계 값을
// 돌려주는 Date"를 만든다. 기존 코드가 로컬 getter를 쓰는 곳(sugar-date 포함)은 이 Date를
// "현재"로 받으면 서버 시간대와 상관없이 서울 날짜로 계산된다. 한국은 일광절약시간이 없어
// 고정 오프셋(UTC+9)으로 충분하다.

const SEOUL_OFFSET_MIN = 9 * 60;

/**
 * @param {Date} [now] - 실제 현재 시각
 * @returns {Date} 로컬 getter가 서울 날짜·시각을 돌려주는 Date (시각 비교·저장용이 아니라 날짜 계산용)
 */
function seoulWallClock(now = new Date()) {
  // getTimezoneOffset()은 "UTC - 로컬"(분). 서울이면 -540이라 이동량 0, UTC면 +540분
  return new Date(now.getTime() + (SEOUL_OFFSET_MIN + now.getTimezoneOffset()) * 60_000);
}

module.exports = { seoulWallClock, SEOUL_OFFSET_MIN };
