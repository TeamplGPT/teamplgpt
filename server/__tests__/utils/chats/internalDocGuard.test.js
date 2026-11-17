/* eslint-env jest, node */
const {
  isInternalDesignText,
  dropInternalDesignTexts,
  dropInternalDesignSources,
  INTERNAL_INFO_RULES,
} = require("../../../utils/chats/internalDocGuard");

// 운영 위젯이 실제로 그대로 보여준 문서 조각(2026-11-18, 3차 테스트 P39)
const LEAKED_TABLE_DOC = `CMMT_DBOBJ (DB 오브젝트 정의)
컬럼 | 타입 | NULL | PK | 의미
SERVAREA_ID | VARCHAR2(20) | N | ✔(1) | 서비스영역ID(마스터 '000' 고정)
OWNER | VARCHAR2(100) | N | ✔(2) | OBJECT 소유자
OBJ_ID | VARCHAR2(50) | N | ✔(3) | OBJECT ID
OBJ_NM2 | VARCHAR2(2000) | Y | | OBJECT명(DB 코멘트)
USE_YN | VARCHAR2(1) | Y | | 사용여부`;

const LEAKED_NUMBER_DATE_DOC = `CMMT_CRUD_LOG (CRUD 로그)
STAFF_ID VARCHAR2(30) N PK 작업자직원ID
LOG_DATE DATE N PK 로그일시
LOG_SEQ NUMBER N PK 로그 일련번호`;

const DDL_DOC = `CREATE TABLE PRCT_STAFF (
  STAFF_ID VARCHAR2(30) NOT NULL,
  PRIMARY KEY (STAFF_ID)
);`;

const PROC_PARAMS_DOC = `# TAAP_CRTE_TMSHEET
> **유형**: 프로시저(PROCEDURE)
| 인자 | IN/OUT | 타입 | 의미 |
|---|---|---|---|
| AV_SERVAREA_ID | IN | VARCHAR2 | 서비스영역ID |
| AV_STAFF_ID | IN | VARCHAR2 | 직원ID |`;

const SQL_MAPPER_DOC = `# MDEMedConfmUploadMgr_SQL
| id | 유형 | 대상 객체 |
|---|---|---|
| getMDEMedConfmUploadMgrList | select | MDET_REQ_UPLOAD |
| insertMDEMedConfmUploadMgr | insert | MDET_REQ_UPLOAD |`;

const CONNECTION_DOC = `# DB 접속 및 조회 방법
- 방식: sqlcl named connection — 연결명 5240_hrm
- DBMS: Oracle 12c (DB_NAME ora12c), 스키마/계정 KIWIBOX`;

const QUERY_DOC = `직원 목록은 아래처럼 가져온다.
SELECT STAFF_ID, STAFF_NM FROM PRCT_STAFF WHERE SERVAREA_ID = :id`;

const INTERNAL_MARKED_DOC = `## 출처 (Provenance) — 내부용
<!-- chunk: overview-provenance / 내부용 / domain=EDU -->
- 이 화면은 교육 신청 결과를 모아 보여준다.`;

const SOURCE_PATH_DOC = `- 소스: \`kiwibox/src/main/java/kiwibox/DEV/EDU/\`
- 화면은 교육 신청 목록을 보여준다.`;

const COMPANY_RULE = `제38조(경조사 휴가) ① 회사는 다음 각 호에 따라 유급 경조사휴가를 준다.
1. 본인의 결혼: 5일
2. 본인·배우자의 부모 또는 배우자의 사망: 5일`;

const HR_MANUAL = `휴가신청은 근태관리 > 휴가관리 > 휴가신청(직원) 메뉴에서 합니다.
휴가 종류(연차·반차)와 기간을 고르고 결재 상신 버튼을 누르세요.
사원번호(STAFF_NO)는 자동으로 들어갑니다.`;

describe("isInternalDesignText — DB 설계 문서 조각 판별", () => {
  it.each([
    ["컬럼 타입 표", LEAKED_TABLE_DOC],
    ["NUMBER·DATE 컬럼 정의", LEAKED_NUMBER_DATE_DOC],
    ["DDL", DDL_DOC],
    ["프로시저 인자 표", PROC_PARAMS_DOC],
    ["SQL 매퍼 목록", SQL_MAPPER_DOC],
    ["DB 접속 정보", CONNECTION_DOC],
    ["쿼리문", QUERY_DOC],
    ["내부용 표지가 붙은 조각", INTERNAL_MARKED_DOC],
    ["소스 코드 경로", SOURCE_PATH_DOC],
  ])("%s는 내부 설계로 본다", (_name, text) => {
    expect(isInternalDesignText(text)).toBe(true);
  });

  it.each([
    ["취업규칙 조문", COMPANY_RULE],
    ["화면 사용 안내(식별자 한 번 언급)", HR_MANUAL],
    ["빈 문자열", ""],
    ["문자열이 아님", null],
  ])("%s는 내부 설계가 아니다", (_name, text) => {
    expect(isInternalDesignText(text)).toBe(false);
  });
});

describe("dropInternalDesignTexts / dropInternalDesignSources", () => {
  it("설계 조각만 빼고 순서를 유지한다(원본 배열은 그대로)", () => {
    const input = [COMPANY_RULE, LEAKED_TABLE_DOC, HR_MANUAL];
    const out = dropInternalDesignTexts(input);
    expect(out).toEqual([COMPANY_RULE, HR_MANUAL]);
    expect(input).toHaveLength(3);
  });

  it("sources는 text 기준으로 뺀다", () => {
    const sources = [
      { title: "rules.md", text: COMPANY_RULE },
      { title: "db.xlsx", text: LEAKED_NUMBER_DATE_DOC },
    ];
    expect(dropInternalDesignSources(sources)).toEqual([sources[0]]);
  });

  it("배열이 아니면 빈 배열", () => {
    expect(dropInternalDesignTexts(undefined)).toEqual([]);
    expect(dropInternalDesignSources(null)).toEqual([]);
  });
});

describe("INTERNAL_INFO_RULES — 위젯 답변 규칙(L1)", () => {
  it("거절 문구가 채팅 설정·조회 없음 안내와 같다", () => {
    const { INTERNAL_INFO_REFUSAL } = require("../../../utils/chats/internalDocGuard");
    expect(INTERNAL_INFO_REFUSAL).toBe("내부 구현 정보는 안내해 드릴 수 없습니다.");
    expect(INTERNAL_INFO_RULES).toContain(INTERNAL_INFO_REFUSAL);
  });

  it("DB·소스·내부 주소 비공개를 명시한다", () => {
    expect(INTERNAL_INFO_RULES).toMatch(/테이블/);
    expect(INTERNAL_INFO_RULES).toMatch(/컬럼/);
    expect(INTERNAL_INFO_RULES).toMatch(/SQL|쿼리/);
    expect(INTERNAL_INFO_RULES).toMatch(/문서에 있더라도/);
  });
});

describe("리뷰 반영 (2026-11-18)", () => {
  it("빈 줄이 아주 많은 문서도 빨리 판정한다(이벤트 루프를 막지 않음)", () => {
    const started = Date.now();
    isInternalDesignText("\n".repeat(200_000) + "끝");
    isInternalDesignText("\n \t".repeat(30_000));
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("식별자와 타입이 다른 줄에 있으면 컬럼 정의로 보지 않는다", () => {
    expect(isInternalDesignText("STAFF_NO\nDATE 기준\nWORK_YMD\nDATE 순서")).toBe(false);
  });

  it.each([
    ["영문 버튼 설명", "Create View 버튼을 눌러 화면을 만듭니다."],
    ["개념 설명", "primary key 같은 개념은 몰라도 됩니다."],
    ["매뉴얼 버튼 표", "| 버튼 | 설명 |\n| Select | 선택 |\n| Delete | 삭제 |"],
  ])("%s는 내부 설계가 아니다", (_name, text) => {
    expect(isInternalDesignText(text)).toBe(false);
  });
});

describe("sanitizeEmbedChatRow — 저장된 대화를 기록 화면으로 돌려줄 때", () => {
  const { sanitizeEmbedChatRow, INTERNAL_INFO_REFUSAL } = require("../../../utils/chats/internalDocGuard");

  it("새어 나간 답변은 거절 문구로, 설계 출처는 빼고 새 행으로 돌려준다(원본은 그대로)", () => {
    const row = {
      id: 7,
      prompt: "DB 테이블 알려줘",
      response: JSON.stringify({
        text: LEAKED_TABLE_DOC,
        sources: [{ title: "db.md", text: LEAKED_TABLE_DOC }, { title: "rules.md", text: COMPANY_RULE }],
        type: "chat",
      }),
    };
    const out = sanitizeEmbedChatRow(row);
    const parsed = JSON.parse(out.response);
    expect(parsed.text).toBe(INTERNAL_INFO_REFUSAL);
    expect(parsed.sources.map((s) => s.title)).toEqual(["rules.md"]);
    expect(parsed.type).toBe("chat");
    expect(out.id).toBe(7);
    expect(JSON.parse(row.response).text).toBe(LEAKED_TABLE_DOC);
  });

  it("평범한 답변은 내용이 바뀌지 않는다", () => {
    const row = { response: JSON.stringify({ text: "13.6일", sources: [] }) };
    expect(JSON.parse(sanitizeEmbedChatRow(row).response)).toEqual({ text: "13.6일", sources: [] });
  });
});
