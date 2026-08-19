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
      { ymd: "20260710", week: "금", leavNm: "연차", useDd: "1", reason: "개인사유" },
      { ymd: "20260721", week: "화", leavNm: "반차", useDd: "0.5", reason: "병원" },
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

const FIXTURES_BY_PATH = {
  // 할일/미결 건수 — ntest.5240.kr 실호출로 확정(2026-08-19). 래퍼 키가 todoCnt이고
  // 값은 소문자 cnt1~cnt3다(화이트리스트는 CNT1~CNT3, renderWhitelisted가 대소문자 대응).
  // hrSession 언랩 목록에 todoCnt가 없어 이 응답이 통째로 passthrough되던 버그의 회귀 fixture.
  "/getTodoIconCnt.do": { todoCnt: [{ cnt1: 188, cnt2: 53, cnt3: 1 }] },
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          codeList: [
            { codeNm: "2026-06-19 급여", code: "20260619P", colorCode: null },
          ],
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
