/**
 * Mock HR API server for HR skill E2E tests.
 *
 * - Listens on $MOCK_PORT (default 8000) on 0.0.0.0
 * - Returns 200 {"success":true,"data":[],"message":"mock"} for all routes
 *   except /health which returns {"ok":true}
 * - Logs every request as one JSON Lines entry to the file passed via
 *   --log-path (or the --log-path env var), including method/path/query/headers.
 * - On SIGINT/SIGTERM, closes the server and exits 0 within ~1s.
 *
 * Spawned by runner.js. Not intended for direct production use.
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

function parseArgs(argv) {
  const args = { port: null, logPath: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") args.port = argv[i + 1];
    else if (argv[i] === "--log-path") args.logPath = argv[i + 1];
  }
  if (!args.port) args.port = process.env.MOCK_PORT || "8000";
  if (!args.logPath) args.logPath = process.env.MOCK_LOG_PATH || null;
  return args;
}

const { port, logPath } = parseArgs(process.argv.slice(2));
const portNum = Number.parseInt(port, 10);
if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
  process.stderr.write(`[mock-hr-api] invalid port: ${port}\n`);
  process.exit(1);
}

if (logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, "");
}

function writeLog(entry) {
  if (!logPath) return;
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch (e) {
    process.stderr.write(`[mock-hr-api] log write failed: ${e.message}\n`);
  }
}

const BODYLESS_METHODS = new Set(["GET", "HEAD", "DELETE", "OPTIONS"]);

// 012-hr-answer-quality: cmd 기반 fixture (답변 품질 E2E의 answer_pattern 검증용).
// 미등록 cmd는 기존 빈 응답 유지 — 기존 시나리오(tool_call/url/body 검증) 무영향.
const FIXTURES_BY_CMD = {
  // 연차 발생/사용/잔여 (TAA-1310) — Q1/Q2: 연차 잔여 22 + 무관 휴가종류 1건
  getTAADclzVcatnList1: {
    result: [
      { workNm: "연차", creDd: "23", useDd: "1", remDd: "22", staYmd: "20260101", endYmd: "20261231" },
      { workNm: "배우자출산휴가(유급)", creDd: "20", useDd: "0", remDd: "20", staYmd: "20260101", endYmd: "20261231" },
    ],
  },
  // 휴가 사용내역 (TAA-0490) — Q4: 2건 전건 포함(과요약 방지)
  getTAADclzVcatnList2: {
    result: [
      // week는 실측상 영문 3자다("MON"). 한글로 넣으면 표시 보정(displayNormalize)이
      // 동작하지 않아도 통과해 버려 회귀를 못 잡는다 — 되돌리지 말 것.
      { ymd: "20260710", week: "FRI", leavNm: "연차", useDd: "1", reason: "개인사유" },
      { ymd: "20260721", week: "TUE", leavNm: "반차", useDd: "0.5", reason: "병원" },
    ],
  },
  // 근무현황/출퇴근기록 (TAA-1410) — Q3: 지각 1건(07-03, 10분) / Q6: 특정일 발췌.
  // 실측 42필드 superset: timesheet 화이트리스트(staTime/endTime/lateYn 등)와
  // work_status 화이트리스트(inTime/outTime/lateTime 등) 키를 모두 포함해야
  // 두 query_type 렌더가 모두 채워진다 (kiwibox-endpoint-test-guide §3.2).
  // 일일 근태 (TAA-1410) — timesheet/work_status 공용 endpoint.
  // 값 규약은 ntest.5240.kr 실호출로 확정(2026-08-18, self 79행 / 실응답 44필드):
  //   · 플래그(lateYn·earlyYn·earlyOtYn·absentYn·annualLeave·etcLeave·bizTrip·
  //     education·leaveAbsence·goOut·ot70·otWeekday·otHoliday)는 Y/N이 아니라
  //     **해당 없으면 빈 값**이고, 있을 때는 서술 텍스트가 온다
  //     (실측 예: bizTrip="국내(천안, 09:00-16:00)", education="기본교육1(빅데이터 전문가과정)").
  //     화면 판정 함수 has(v)=null/공백 아님과 일치. "N"을 넣으면 실측과 어긋난다.
  //   · 분 단위(lateTime·earlyTime·goOutTime·otTime)는 해당 없어도 "0"이 항상 온다.
  //   · mark는 실측 전 행 "NORMAL"(카탈로그상 ABNORMAL도 존재).
  //   · workYmd는 **연도 없는 MM-DD**("06-01"), 연도를 가진 건 ymd("20260601").
  //   · week는 **영문 3자**("MON"/"TUE"), weekNm은 요일이 아니라 주차("2026-22").
  //   · 승인OT 5종은 실측 계정에 이력이 0건이라 숫자 형태 미확정 — JSP otHas(v)=숫자>0
  //     근거로 시간(NUMBER)을 넣어 둔다. 이력 있는 계정 확보 시 재확인 대상.
  // 커버리지: 07-01 정상 / 07-03 지각 / 07-06 승인OT / 07-08 결근.
  // 07-06·07-08은 workComment를 비워 둔다 — 거기에 "연장근무"/"결근" 문구를 넣으면
  // 이미 화이트리스트에 있는 workComment 경유로 신호가 새서, K20이 absentYn·승인OT
  // 누락을 잡지 못하고 잘못된 이유로 통과한다(되돌리지 말 것).
  getTAAWrkTimeStatusMgrList: {
    result: [
      { ymd: "20260701", workYmd: "07-01", week: "WED", weekNm: "2026-27", workComment: "출근", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", staTime: "0855", endTime: "1810", inTime: "0855", outTime: "1810", lateTime: "0", earlyTime: "0", goOutTime: "0", otTime: "0" },
      { ymd: "20260703", workYmd: "07-03", week: "FRI", weekNm: "2026-27", workComment: "지각", mark: "ABNORMAL", baseStaTime: "0900", baseEndTime: "1800", staTime: "0910", endTime: "1805", inTime: "0910", outTime: "1805", lateYn: "지각", lateTime: "10", earlyTime: "0", goOutTime: "0", otTime: "0" },
      { ymd: "20260706", workYmd: "07-06", week: "MON", weekNm: "2026-28", mark: "NORMAL", baseStaTime: "0900", baseEndTime: "1800", staTime: "0850", endTime: "2010", inTime: "0850", outTime: "2010", lateTime: "0", earlyTime: "0", goOutTime: "0", otTime: "130", otWeekday: "평일연장근무", otWorkOver: "1.5", otWorkNight: "0.5" },
      { ymd: "20260708", workYmd: "07-08", week: "WED", weekNm: "2026-28", mark: "ABNORMAL", baseStaTime: "0900", baseEndTime: "1800", absentYn: "결근", lateTime: "0", earlyTime: "0", goOutTime: "0", otTime: "0" },
    ],
  },
  // 아래 4종 — ntest.5240.kr 실호출로 키를 확정(2026-08-19). 성명·금액 등 개인정보는
  // 합성값으로 교체하고 키 이름과 값 형식(YYYYMMDD, 숫자/문자 구분)은 실측 그대로 둔다.
  //
  // 연장근무 신청내역 (TAA §2.6) — 주차별 매트릭스 otWeek01~06 + 합계.
  getTAADclzWorkOtSchdulList2: {
    DATA: [
      { staffNm: "홍길동", orgNm: "인사팀", posNm: "과장", otWeek01: "4", otWeek02: "2", otWeek03: "0", otWeek04: "6", otWeekSum: "12" },
    ],
  },
  // 연장근무 한도/잔여 — 일별 매트릭스 ot01~ot31 + sumOt(실측 전 키 존재).
  // fixture는 앞 5일 + 합계만 채운다(renderWhitelisted가 빈 열을 떨어뜨림).
  getTAADclzWorkOtSchdulList: {
    DATA: [
      { staffNm: "홍길동", orgNm: "인사팀", posNm: "과장", ot01: "0", ot02: "2", ot03: "0", ot04: "4", ot05: "0", sumOt: "6" },
    ],
  },
  // OT가 없는 달의 실응답 — **행은 오되 OT 값이 전부 null**이다(2026-08-20 ntest 실측,
  // 202608). 성명·소속·직위만 남아 "한도"를 물었는데 소속·직위가 답으로 제시됐다.
  // 아래 OT_EMPTY_*는 요청 월이 이번 달일 때 대신 내려준다(respond 참조).
  _OT_EMPTY_WEEK: {
    DATA: [
      { staffId: "E2E001", staffNo: "20070133", staffNm: "홍길동", orgCd: "0303", orgNm: "인사팀", posNm: "과장", workStaffId: "E2E001", otWeek01: null, otWeek02: null, otWeek03: null, otWeek04: null, otWeek05: null, otWeek06: null, otWeekSum: null },
    ],
  },
  _OT_EMPTY_DAY: {
    DATA: [
      { staffId: "E2E001", staffNo: "20070133", staffNm: "홍길동", orgCd: "0303", orgNm: "인사팀", posNm: "과장", workStaffId: "E2E001", ot01: null, ot15: null, ot31: null, sumOt: null },
    ],
  },
  // 조직 휴가캘린더 — 실측은 공휴일 행이 kind="vacation"으로 함께 내려온다.
  getTAADclzVcatnCldrMgr: {
    DATA: [
      { kind: "vacation", title: " 광복절", leavNm: "광복절", personInfo: "///", staYmd: "20260815", endYmd: "20260815", allDay: "true" },
      { kind: "vacation", title: " 연차", leavNm: "연차", personInfo: "홍길동/인사팀/과장/", orgNm: "인사팀", posNm: "과장", staYmd: "20260820", endYmd: "20260820", staHm: "0900", endHm: "1800", reason: "개인사유" },
    ],
  },
  // 증명서 신청내역 (CTI) — 응답에 addr(주소)가 있으나 화이트리스트에 없어 차단된다.
  // fixture에도 넣지 않는다(차단이 화이트리스트 소관임을 흐리지 않기 위해).
  getCTIMcrtfReqstRefromMgrList: {
    DATA: [
      { typeNm: "재직증명서", useNm: "제출용", submitPlace: "○○은행", copyNum: 1, issueNo: "2026-0001", issueYmd: "20260810", reqDate: "20260810093000", prtYn: "Y", name: "홍길동", year: 18, month: 11, reqNo: 190001 },
    ],
  },
  // 근무캘린더 (TAA-0730) — ntest.5240.kr 실호출로 확정(2026-08-19, self 202608 = 31행).
  // 실응답 그대로의 형태: ymd는 이미 대시 포함 "2026-08-01"(SQL xTO_CHAR_YMD),
  // holidayNm은 공휴일에만 값이 있고 평소 null, reqNo="N", wktypeCd="810", mark="NORMAL".
  // workTypeNm은 여러 근무유형이 콤마로 이어진다("육아단축근무,기본교육1(...)").
  // 이 fixture가 없던 동안 work_calendar는 빈 응답만 받아 "답변 불가"가 나왔고,
  // K5가 BODY만 검증해 전건 PASS 상태로 가려져 있었다. 지우지 말 것.
  // 월별 지급내역 (SAL-0050) — ntest.5240.kr 실호출로 확정(2026-08-19, findText=2026 = 6행).
  // 실응답 13필드 중 화이트리스트가 쓰는 키만. 금액은 실제 급여라 합성값으로 교체하고
  // 구조(salYmd=YYYYMMDD, 금액은 number, salTypeCd="P")는 실측 그대로 둔다.
  // 이 endpoint는 월 범위가 아니라 연도(findText)로 거른다 — SQL: SAL_YMD LIKE 연도||'%'.
  getSALSalaryBassMgrTab110List: {
    DATA: [
      { salYmd: "20260725", orgNm: "인사팀", posNm: "급여", jtotAmt: 3000000, gtotAmt: 300000, ctotAmt: 2700000, salTypeCd: "P" },
      { salYmd: "20260625", orgNm: "인사팀", posNm: "급여", jtotAmt: 3000000, gtotAmt: 300000, ctotAmt: 2700000, salTypeCd: "P" },
      { salYmd: "20260525", orgNm: "인사팀", posNm: "급여", jtotAmt: 2900000, gtotAmt: 290000, ctotAmt: 2610000, salTypeCd: "P" },
    ],
  },
  // 급여명세 3종 (SAL-0527) — ntest.5240.kr 실호출로 키 확정(2026-08-19,
  // pay_item=20260725P → 지급 3행 / 공제 6행 / 요약 1행). 금액은 합성값.
  // 2단계 호출: pay_periods로 pay_item을 얻은 뒤 searchItem으로 조회한다.
  getSALPayslipNewMgrList: {
    DATA: [
      { salItemNm: "기본급", salTypeNm: "급여", salYm: "2026-07", salAmt: 2600000, resalAmt: 0 },
      { salItemNm: "직책수당", salTypeNm: "급여", salYm: "2026-07", salAmt: 300000, resalAmt: 0 },
      { salItemNm: "식대", salTypeNm: "급여", salYm: "2026-07", salAmt: 100000, resalAmt: 0 },
    ],
  },
  getSALPayslipNewMgrList2: {
    DATA: [
      { salItemNm: "국민연금", salYm: "2026-07", salAmt: 135000 },
      { salItemNm: "건강보험", salYm: "2026-07", salAmt: 106000 },
      { salItemNm: "장기요양보험", salYm: "2026-07", salAmt: 13700 },
      { salItemNm: "고용보험", salYm: "2026-07", salAmt: 27000 },
      { salItemNm: "소득세", salYm: "2026-07", salAmt: 52000 },
      { salItemNm: "지방소득세", salYm: "2026-07", salAmt: 5200 },
    ],
  },
  // 단건 요약 — 실측 래퍼 키가 Map(배열 아님). hrSession이 Map을 언랩한다.
  getSALPayslipNewMgrMap: {
    Map: {
      staffNm: "홍길동", orgNm: "인사팀", posNm: "과장", resNm: "직책과장",
      empYmd: "20070830", salYmd: "20260725",
      jtotAmt: 3000000, gtotAmt: 338900, ctotAmt: 2661100,
    },
  },
  // 대출 신청내역 (LON) — 실응답에 accNo(계좌번호)·bankCd가 있으나 화이트리스트
  // 7컬럼에 없어 차단된다(§8 사례집 "계좌번호 평문 노출" 방어). fixture에도 넣지 않는다.
  // 주의: 화이트리스트의 LONF_BAL_AMT(잔액)는 실응답 키에 없어 항상 공란이다 — 별건 확인 대상.
  getLONLoanReqstListMgrList1: {
    DATA: [
      { loaTypeCdNm: "주택자금대출", lonAmt: 10000000, lonRate: 3.5, loaRepayCdNm: "원금균등상환", reqDate: "2025-10-26 21:11:30", applForm: "0", amt: 8500000 },
      { loaTypeCdNm: "생활안정자금", lonAmt: 4000000, lonRate: 2.5, loaRepayCdNm: "원금균등상환", reqDate: "2025-09-29 11:29:00", applForm: "0", amt: 0 },
    ],
  },
  // 교육이력 (PRC-0220) — ntest.5240.kr 실호출로 확정(2026-08-19, self 15행).
  // finCd = 수료여부. 공통코드 EDU_FIN_CD 실조회값: 1=수료, 2=미수료, 3=기타.
  // 실데이터는 15행 중 3행만 finCd에 값이 있고 나머지는 null(미입력)이라 세 상태를 모두 둔다.
  // note(비고)는 eduMemo(교육내용및교육소감)와 다른 필드다 — 정본 그리드 헤더 기준.
  getPRCHrBassiemMgrTab220List: {
    DATA: [
      { eduNm: "오라클 튜닝", staYmd: "20251024", endYmd: "20251024", ofcNm: "오라클", contentsNm: "튜닝", eduTime: 8, finCd: null, eduMemo: null, note: null },
      { eduNm: "빅데이터 전문가과정", staYmd: "20260601", endYmd: "20260831", ofcNm: "사내교육원", contentsNm: "기본교육1", eduTime: 12, eduPoint: 3, finCd: "1", eduMemo: "실습 위주로 진행됨", note: "사내추천" },
      { eduNm: "정보보안 기본교육", staYmd: "20260210", endYmd: "20260210", ofcNm: "보안원", contentsNm: "보안", eduTime: 4, finCd: "2", eduMemo: null, note: null },
    ],
  },
  // 결재문서함 (EAP-0070) — ntest.5240.kr 실호출로 확정(2026-08-19, gubun=2 202606).
  // 응답 33필드 중 화이트리스트(COLUMN_LABELS)가 쓰는 키만. egovMap camelCase.
  // 성명은 합성값으로 교체(구조는 실측 그대로: signLine은 "이름(O)▶이름(X)▶..." 연결).
  // eYmd·memo는 실측에서 null이 흔하다 — renderWhitelisted가 공백 열을 떨어뜨린다.
  getEAPRequestMgrList: {
    DATA: [
      { applNm: "급여예외지급신청서", title: "급여예외지급신청서", reqStatusNm: "결재완료", lapsedDd: 1, applStaffNm: "홍길동", applOrgNm: "인사팀", applYmd: "20260628", sYmd: "20260628", eYmd: null, memo: null, signLine: "홍길동(O)▶김결재*홍길동(O)", lastSignYmd: "20260629" },
      { applNm: "⛱️휴가신청", title: "휴가신청", reqStatusNm: "반려", lapsedDd: 20, applStaffNm: "홍길동", applOrgNm: "인사팀", applYmd: "20260611", sYmd: "20260611", eYmd: null, memo: null, signLine: "홍길동(O)▶이승인(X)▶이승인▶홍길동", lastSignYmd: "20260701" },
    ],
  },
  getTAADclzWorkSearchCldr: {
    DATA: [
      { kind: "01", ymd: "2026-08-03", workTypeNm: "육아단축근무,기본교육1(빅데이터 전문가과정)", wktypeCd: "810", reqNo: "N", holidayNm: null, mark: "NORMAL" },
      { kind: "01", ymd: "2026-08-04", workTypeNm: "육아단축근무,기본교육1(빅데이터 전문가과정)", wktypeCd: "810", reqNo: "N", holidayNm: null, mark: "NORMAL" },
      { kind: "01", ymd: "2026-08-15", workTypeNm: "휴일", wktypeCd: "810", reqNo: "N", holidayNm: "광복절", mark: "NORMAL" },
      { kind: "01", ymd: "2026-08-17", workTypeNm: "휴일", wktypeCd: "810", reqNo: "N", holidayNm: "광복절(대체휴일)", mark: "NORMAL" },
    ],
  },
};

// cmd 없는 경로형 endpoint fixture — 사원증(getMBLPrtEmpCard)은 body에 cmd가 없어
// 경로로 매칭한다. 실측 SQL(MBLPrtEmpCard_SQL.xml) 반환 컬럼 재현: 내부 식별자
// (servareaId/corpId/staffId/*Cd/loginId) 포함 — 화이트리스트 미노출 검증용(Q7).
// 일용직 급여 (SALDaylabMgr) — Q8: 계좌번호(암호문·복호화 평문)·내부 식별자 비노출 검증.
// 실측 SQL(SALDaylabMgr_SQL.xml) 68컬럼 중 대표 필드 재현.
FIXTURES_BY_CMD.getSALDaylabMgrList = {
  DATA: [
    {
      servareaId: "100", staffId: "2026000001", staffNo: "20260001",
      staffNm: "오사공", workYmd: "20260715", salYmd: "20260725",
      statYm: "202607", fixYn: "Y", closeYn: "Y", corpId: "1000",
      corpNm: "오이사공", orgCd: "0303", orgNm: "개발팀", posCd: "40",
      posNm: "책임", clsCd: "40", clsNm: "4급", empTypeCd: "20",
      empTypeNm: "일용직", wktypeCd: "10", wktypeNm: "통상근무",
      bankCd: "088", salClassNm: "신한은행", accNo: "ENC:AbCdEf012345",
      accNoDecrypt: "110-123-456789", cryptAuthYn: "Y",
      staTime: "0900", endTime: "1800", workTime: "8", overTime: "1",
      hourlyAmt: "12000", dailyAmt: "96000", otAmt: "18000", etcAmt: "0",
      payAmt: "114000", taxEarnAmt: "114000", ntaxEarnAmt: "0",
      itaxAmt: "3078", rtaxAmt: "307", insuranceAmt: "912",
      deducAmt: "4297", rpayAmt: "109703", memo: "", note: "",
      chgStaffId: "9000000001", chgDate: "2026-07-25 10:00:00",
    },
  ],
};

// ─── 연말정산(YTA) ───────────────────────────────────────────────────────────
// 응답 키는 ntest.5240.kr 실호출로 확정(2026-08-20, self 2024년 · calKindCd=1).
// 금액·성명·주민번호는 합성값이고 구조만 실측 그대로다.
//
// **필수 파라미터가 없으면 빈 배열을 준다** — 정본 SQL의 WHERE가 <if> 없이
// CAL_KIND_CD 등을 걸기 때문에 파라미터가 빠지면 실서버는 0행이다.
// 종전 mock은 YTA fixture 자체가 없어 기본 빈 응답으로 떨어졌고, 시나리오도 BODY만
// 검증해 "9종 전부 0행"이라는 결함을 전혀 잡지 못했다(2026-08-20 발견).
// ─── 필수 파라미터 게이트 (전 endpoint 공통) ─────────────────────────────────
// 정본 SQL이 <if> 없이 WHERE에 거는 파라미터. 빠지면 조건이 NULL이 되어 실서버는
// **0행**을 준다. mock도 같게 동작해야 "BODY 누락"이 E2E에서 잡힌다.
//
// 종전에는 이 게이트가 YTA에만 있어, handler가 파라미터를 빠뜨려도 mock은 fixture를
// 그대로 돌려줬다. 그래서 다음 결함들이 전부 **실서버 수동 확인에서만** 드러났다:
//   근무캘린더(searchSYmd/EYmd) · 월별지급내역(findText/staffId) · 연장근무(searchYm) ·
//   연말정산 9종(searchCalKindCd) — specs/022 P-BODY, 26커밋 중 7건.
// 이미 고쳐진 건도 목록에 넣어 **회귀를 감지**한다.
//
// ⚠️ 조건부(<if>) 파라미터는 넣지 말 것. 예: 결재함 sdt/edt는 기간 미지정 시
//    의도적으로 생략하며(unscopedByDefault) 실서버도 그때 전 기간을 준다.
const REQUIRED_PARAMS_BY_CMD = {
  // 근태 — TAADclzWorkSearchCldr_SQL: A.YMD BETWEEN X.STA_YMD AND X.END_YMD
  getTAADclzWorkSearchCldr: ["searchSYmd", "searchEYmd"],
  // 근태 — TAADclzWorkOtSchdul_SQL: 월 파라미터가 없으면 0행
  getTAADclzWorkOtSchdulList: ["searchYm"],
  getTAADclzWorkOtSchdulList2: ["searchYm"],
  // 급여 — SALSalaryBassMgr_SQL: SAL_YMD LIKE findText||'%' AND STAFF_ID = staffId
  getSALSalaryBassMgrTab110List: ["findText", "staffId"],
  // 급여명세 3종 — SALPayslipNewMgr_SQL: searchItem(급여일자+유형 복합키)
  getSALPayslipNewMgrList: ["searchItem"],
  getSALPayslipNewMgrList2: ["searchItem"],
  getSALPayslipNewMgrMap: ["searchItem"],
  // 연말정산 — CAL_KIND_CD는 <if> 밖. 그 외는 조회별로 상이
  getYTASummaryMgrList: ["searchCalKindCd"],
  getYTAYndMedDtlMgrList: ["searchCalKindCd"],
  getYTAYndGivPayDtlMgrList: ["searchCalKindCd"],
  getYTAYtaFamilySttusMgrList: ["searchCalKindCd", "searchCalYy"],
  getYTAYndBefWrkDtlMgrList: ["searchCalKindCd", "searchCalYy"],
  getYTAInDctMgrTab08List: ["searchCalKindCd", "searchCalYy", "searchStaffId"],
  getYTAInDctMgrTab13List: ["searchCalKindCd", "searchCalYy", "searchStaffId"],
  getYTAInDctMgrTab15List: ["searchCalKindCd", "searchCalYy", "searchStaffId"],
  getYTAInDctMgrTab06List: [
    "searchCalKindCd",
    "searchCalYy",
    "searchStaffId",
    "searchItemGroupCd",
  ],
};

// 경로형(cmd 없는 *.do) endpoint의 필수 파라미터. cmd 기반 표와 같은 취지다 —
// 종전에는 cmd가 있는 endpoint만 게이트를 걸어 경로형 결함이 새어 나갔다.
// 실제로 조직원 목록이 searchTypeVal 누락으로 항상 0행이었는데 mock은 fixture를 돌려줘
// E2E가 통과했다(2026-08-21 발견 — BODY 계약 불일치 8번째).
const REQUIRED_PARAMS_BY_PATH = {
  // MBLHrBassiemList_SQL: sub_org_yn = #{searchTypeVal} (Y:하위포함 / N:미포함)
  "/getMBLHrBassiemMemberList.do": ["searchOrgCd", "searchSymd", "searchTypeVal"],
  "/getMBLHrBassiemOrgList.do": ["searchSymd"],
};

/** 필수 파라미터 중 비어 있는 것들 (없으면 빈 배열) */
function missingRequiredParams(parsedBody, pathname) {
  const need = [
    ...(REQUIRED_PARAMS_BY_CMD[parsedBody && parsedBody.cmd] || []),
    ...(REQUIRED_PARAMS_BY_PATH[pathname] || []),
  ];
  return need.filter(
    (k) => !parsedBody[k] || String(parsedBody[k]).trim() === ""
  );
}

const YTA_FIXTURES = {
  // 요약 — 결정세액은 p* 계열(pIncomeTaxAmt=결정소득세)
  // 2개 연도를 둔다: searchCalYy를 안 보내면 정본 SQL의 <if>가 걸리지 않아 **두 해가 다 온다**.
  // 실서버에서 "2023 연말정산 결과"에 2024년 수치가 나온 원인이 이것이다(2026-08-20).
  getYTASummaryMgrList: {
    DATA: [
      {
        staffId: "E2E001", staffNo: "20070133", name: "홍길동", orgCd: "0303", orgNm: "인사팀",
        ctzNo: "9001011234567", bzplceNm: "예시사업장", txDiv: "신청", calYm: "202502",
        staYmd: "20240101", endYmd: "20241231",
        taxAmt1: 36000000, unTaxAmt1: 2400000, taxAmt2: 3000000, unTaxAmt2: 0,
        redcAmt: 0, totAmt: 41400000,
        incomeTaxAmt: 1850000, residenceAmt: 185000, nongteukAmt: 0,
        pIncomeTaxAmt: 1620000, pResidenceAmt: 162000, pNongteukAmt: 0,
        aIncomeTaxAmt: -230000, aResidenceAmt: -23000, aNongteukAmt: 0,
      },
      {
        staffId: "E2E001", staffNo: "20070133", name: "홍길동", orgCd: "0303", orgNm: "인사팀",
        ctzNo: "9001011234567", bzplceNm: "예시사업장", txDiv: "신청", calYm: "202402",
        staYmd: "20230101", endYmd: "20231231",
        taxAmt1: 33000000, unTaxAmt1: 2400000, taxAmt2: 2500000, unTaxAmt2: 0,
        redcAmt: 0, totAmt: 37900000,
        incomeTaxAmt: 1490000, residenceAmt: 149000, nongteukAmt: 0,
        pIncomeTaxAmt: 1310000, pResidenceAmt: 131000, pNongteukAmt: 0,
        aIncomeTaxAmt: -180000, aResidenceAmt: -18000, aNongteukAmt: 0,
      },
    ],
  },
  getYTAYndMedDtlMgrList: {
    DATA: [
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", staffNm: "홍길동", famNm: "홍길동",
        mediBzplceNm: "○○병원", mediCnt: 4, sumAmt: 620000, pregnantYn: "N" },
    ],
  },
  getYTAYtaFamilySttusMgrList: {
    DATA: [
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", staffNm: "홍길동", famNm: "홍길동", famCd: "0", age: 44, spouseYn: "N" },
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", staffNm: "홍길동", famNm: "김배우", famCd: "3", age: 42, spouseYn: "Y" },
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", staffNm: "홍길동", famNm: "홍자녀", famCd: "4", age: 12, spouseYn: "N" },
    ],
  },
  getYTAYndBefWrkDtlMgrList: { DATA: [] },
  getYTAYndGivPayDtlMgrList: {
    DATA: [
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", donTypeCdNm: "지정기부금",
        donBzplceNm: "○○재단", donCnt: 2, donAmt1: 300000, donApplAmt: 300000, donSum: 300000 },
    ],
  },
  getYTAInDctMgrTab08List: {
    DATA: [
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", famNm: "홍길동", famCd: "0",
        cardAmt: 8200000, cardEtcAmt: 1500000, firstHelfAmt: 4600000, secondHelfAmt: 5100000 },
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", famNm: "김배우", famCd: "3",
        cardAmt: 3100000, cardEtcAmt: 400000, firstHelfAmt: 1700000, secondHelfAmt: 1800000 },
    ],
  },
  getYTAInDctMgrTab13List: {
    DATA: [
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", famNm: "홍길동", famCd: "0",
        insuAmt: 1200000, insuEtcAmt: 0 },
    ],
  },
  getYTAInDctMgrTab15List: {
    DATA: [
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", famNm: "홍자녀", famCd: "4",
        eduAmt: 2400000, eduEtcAmt: 0 },
    ],
  },
  getYTAInDctMgrTab06List: {
    DATA: [
      { staffId: "E2E001", calYy: "2024", calKindCd: "1", itemGroupCd: "TAB_06",
        bankCd: "020", accNo: "ENC:AbCdEf012345", payCnt: 12, payAmt: 6000000 },
    ],
  },
};

const FIXTURES_BY_PATH = {
  // 조직도 — 실측 147행. Level은 대문자 L(egovMap 별칭 그대로)이며 화이트리스트 미포함.
  "/getMBLHrBassiemOrgList.do": {
    result: [
      { Level: "0", orgNm: "(주)예시", orgCd: "0000", orgFnm: "(주)예시", priorOrgCd: "0", chiefInfo: "김대표 사장 대표이사", staffCnt: 3 },
      { Level: "1", orgNm: "인사팀", orgCd: "0303", orgFnm: " 인사팀", priorOrgCd: "0000", chiefInfo: "이팀장 팀장", staffCnt: 5 },
    ],
  },
  // 일정/생일/공휴일 캘린더 — 실측은 월의 일수만큼(31행) md/holidayYn/result 3필드.
  "/getScheduleDay.do": {
    DATA: [
      { md: "0801", holidayYn: "N", result: 9 },
      { md: "0815", holidayYn: "Y", result: 1 },
      { md: "0819", holidayYn: "N", result: 4 },
    ],
  },
  // 인사카드 상세 (profile_detail) — ntest.5240.kr 실호출로 확정(2026-08-19, 17행).
  // 실측 섹션명 그대로: 기본/가족/학력/자격/어학/언어능력/경력/발령/포상/징계/교육/
  // 보훈/장애/병역/신체·취미/기타사항/메모. 내용은 개인정보라 합성값으로 교체.
  // 민감 섹션(가족·장애·보훈)이 fixture에 있어야 K27이 차단을 검증할 수 있다 — 지우지 말 것.
  "/getMBLPrtEmpCardPop.do": {
    result: [
      { menuNm: "◎ 기본", contents: "홍길동 과장 / Hong Gil Dong<BR>인사팀", seq: "10" },
      { menuNm: "◎ 가족", contents: "∙김서연, 39세 여자 배우자<BR>∙홍판서, 71세 남자 부", seq: "20" },
      { menuNm: "◎ 학력", contents: "○○대학교 경영학과 졸업(2007)", seq: "30" },
      { menuNm: "◎ 자격", contents: "정보처리기사(2010)<BR>사회조사분석사 2급(2012)", seq: "40" },
      { menuNm: "◎ 경력", contents: "△△기업 인사팀 대리(2005~2007)", seq: "50" },
      { menuNm: "◎ 장애", contents: "해당 없음", seq: "60" },
      { menuNm: "◎ 보훈", contents: "해당 없음", seq: "70" },
      { menuNm: "◎ 교육", contents: "기본교육1(빅데이터 전문가과정) 2026", seq: "80" },
    ],
  },
  // 할일/미결 건수 — ntest.5240.kr 실호출로 확정(2026-08-19). 래퍼 키가 todoCnt이고
  // 값은 소문자 cnt1~cnt3다(화이트리스트는 CNT1~CNT3, renderWhitelisted가 대소문자 대응).
  // hrSession 언랩 목록에 todoCnt가 없어 이 응답이 통째로 passthrough되던 버그의 회귀 fixture.
  "/getTodoIconCnt.do": { todoCnt: [{ cnt1: 188, cnt2: 53, cnt3: 1 }] },
  // 조직원 목록 — ntest 실호출로 확정(2026-08-21, searchOrgCd=0303 인사팀 36행).
  // 성명은 합성값이고 구조만 실측 그대로다. detail/seqNo/staffId 등 내부키는 화이트리스트가 막는다.
  "/getMBLHrBassiemMemberList.do": {
    DATA: [
      { staffNm: "김영지", staffNo: "20050101", orgNm: "인사팀", posNm: "부장 🏅", resNm: "팀장", corpNm: "(주)예시", workType: "통상근무", workInfo: "근무" },
      { staffNm: "홍길동", staffNo: "20070133", orgNm: "인사팀", posNm: "과장", resNm: "팀원", corpNm: "(주)예시", workType: "육아단축근무", workInfo: "근무" },
      { staffNm: "조성애", staffNo: "20100715", orgNm: "인사팀", posNm: "차장", resNm: "팀원", corpNm: "(주)예시", workType: "통상근무", workInfo: "휴가" },
    ],
  },
  "/getMBLPrtEmpCard.do": {
    DATA: [
      {
        servareaId: "100", corpId: "1000", corpNm: "오이사공", name: "오사공",
        ename: "Oh Sa Gong", cname: "오사공", empTypeCd: "10", staffTypeNm: "일반직",
        wkareaCd: "1000", wktypeCd: "10", lunTypeCd: "1", orgCd: "0303",
        orgNm: "개발팀", retYmd: "", staffId: "2026000001", staffNo: "20260001",
        sexCd: "M", officeStatCd: "10", posNm: "책임", clsNm: "4급", resNm: "팀원",
        statusNm: "재직", wktypeNm: "통상근무", corpTel: "02-1234-5678",
        homeTel: "", faxNo: "", handPhone: "010-1234-5678", connectTel: "",
        mailId: "osagong@example.com", outMailId: "", loginId: "osagong",
      },
    ],
  },
};

// searchYm(YYYYMM)이 실행 시점의 이번 달인지
function isCurrentYm(searchYm) {
  const v = String(searchYm || "").trim();
  if (!/^\d{6}$/.test(v)) return false;
  const now = new Date();
  return v === `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, false);
  const baseEntry = {
    ts: new Date().toISOString(),
    method: req.method,
    path: parsed.pathname,
    query: parsed.query || "",
    fullUrl: req.url,
    headers: { host: req.headers.host || "" },
  };

  function respond(parsedBody) {
    if (parsed.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } else if (parsed.pathname === "/CommonCode.do") {
      // 급여 2단 체인용 fixture: pay_periods(getSalYmdTypeCdList2) 응답 —
      // LLM이 code(20260619P)를 pay_item으로 이어 호출할 수 있게 한다 (specs/011 K10).
      //
      // 월별로 응답이 갈린다 — 실동작과 맞추기 위한 것이다(2026-08-19 ntest 실측:
      // 2026-08 0건 / 2026-07 1건 / 2026-06 0건). 급여는 25일 지급이라 **이번 달은
      // 지급일 전이면 비어 있는 게 정상**이고, 종전 fixture처럼 어떤 월이든 1건을
      // 돌려주면 "이번 달 급여 없음"에서 막히는 결함이 mock에서 재현되지 않는다.
      res.writeHead(200, { "Content-Type": "application/json" });
      const searchYm = (parsedBody && parsedBody.searchYm) || "";
      const now = new Date();
      const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const codeList =
        searchYm === "2026-06" && searchYm !== curYm
          ? [{ codeNm: "2026-06-19 급여", code: "20260619P", colorCode: null }]
          : [];
      res.end(JSON.stringify({ codeList }));
    } else if (
      parsedBody &&
      missingRequiredParams(parsedBody, parsed.pathname).length
    ) {
      // 필수 파라미터 누락 — 실서버와 같이 0행. 어떤 cmd든 동일하게 적용된다.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ Message: "", DATA: [] }));
    } else if (
      parsedBody &&
      (parsedBody.cmd === "getTAADclzWorkOtSchdulList" ||
        parsedBody.cmd === "getTAADclzWorkOtSchdulList2") &&
      isCurrentYm(parsedBody.searchYm)
    ) {
      // 이번 달은 OT 이력이 없다 — 실서버도 행은 주되 OT 값이 전부 null이다.
      const empty =
        parsedBody.cmd === "getTAADclzWorkOtSchdulList2"
          ? FIXTURES_BY_CMD._OT_EMPTY_WEEK
          : FIXTURES_BY_CMD._OT_EMPTY_DAY;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(empty));
    } else if (parsedBody && YTA_FIXTURES[parsedBody.cmd]) {
      // 귀속연도 필터는 정본 SQL에서 <if searchCalYy>라 **보낼 때만** 걸린다.
      // 안 보내면 전 연도가 그대로 온다 — 경로의 연도(/YTA…Mgr2023.do)는 컨트롤러
      // 버전만 고를 뿐 데이터를 거르지 않는다. 이 동작을 그대로 재현한다.
      const yy = String(parsedBody.searchCalYy || "").trim();
      const rows = YTA_FIXTURES[parsedBody.cmd].DATA || [];
      const rowYear = (r) => String(r.calYy || (r.staYmd || "").slice(0, 4));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          Message: "",
          DATA: yy ? rows.filter((r) => rowYear(r) === yy) : rows,
        })
      );
    } else if (parsedBody && parsedBody.cmd && FIXTURES_BY_CMD[parsedBody.cmd]) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(FIXTURES_BY_CMD[parsedBody.cmd]));
    } else if (FIXTURES_BY_PATH[parsed.pathname]) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(FIXTURES_BY_PATH[parsed.pathname]));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: [], message: "mock" }));
    }
  }

  // Fast-path: body 없는 메서드는 즉시 logging + 응답 + drain
  // (GET 요청은 'end' 이벤트가 환경에 따라 지연될 수 있어 응답 누락 발생)
  if (BODYLESS_METHODS.has(req.method)) {
    writeLog({ ...baseEntry, body: null });
    respond(null);
    req.resume();
    return;
  }

  // body 있는 메서드: cmd 기반 fixture 선택을 위해 body 수신 완료 후 응답
  // (클라이언트가 body+end를 보내는 POST는 'end' 지연 문제 없음 — GET fast-path만 별도)
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let parsedBody = null;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // kiwibox 계열은 urlencoded — 객체 파싱 + 원문(_raw) 병기 (runner body 검증용)
        if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(rawBody)) {
          parsedBody = Object.fromEntries(new URLSearchParams(rawBody));
          parsedBody._raw = rawBody;
        } else {
          parsedBody = { _raw: rawBody };
        }
      }
    }
    writeLog({ ...baseEntry, body: parsedBody });
    respond(parsedBody);
  });
  req.on("error", (e) => {
    writeLog({ ...baseEntry, body: { _error: e.message } });
  });
});

server.listen(portNum, "0.0.0.0", () => {
  process.stderr.write(
    `[mock-hr-api] listening on :${portNum}, logging to ${logPath || "(none)"}\n`
  );
});

function shutdown(signal) {
  process.stderr.write(`[mock-hr-api] shutdown on ${signal}\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
