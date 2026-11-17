# Research: 급여명세서 5240 화면 구성 (024)

근거 확인일 2026-11-18. kiwibox는 읽기만 했다.

## R1. 5240 급여명세서 화면이 쓰는 조회

- **Decision**: 명세서 답은 `/SALSalaryDtstmnMgr.do`의 네 cmd를 쓴다 — `getSALSalaryDtstmnMgrMap`(합계), `getSALSalaryDtstmnMgrList`(지급), `getSALSalaryDtstmnMgrList2`(공제), `getSALSalaryDtstmnMgrList3`(기재).
- **Rationale**: kiwibox `salSalaryDtstmnMgr.jsp`가 화면을 그릴 때 이 넷을 부른다(L932 mySheet3 → List3). spec-docs `salSalaryDtstmnMgr.md` cmd 목록과 같다. `List4`는 SQL id가 없는 데드코드라 쓰지 않는다.
- **Alternatives**: `SALPayslipNewMgr.do` — 컨트롤러 매핑이 없는 유령 경로(handler 주석·위젯 브리지 주석과 같음).

## R2. 네 조회의 공통 파라미터

- **Decision**: 기존 payslip 조회의 form을 그대로 쓰고 cmd만 바꾼다 — `searchItem`(지급 건 코드), `searchYm`(YYYY-MM), `searchType=web`, `cmmSearchStaffId`(본인 강제), 메뉴 게이트(`gate: true`).
- **Rationale**: SQL 네 개 모두 `A.SAL_YMD = SUBSTR(searchItem,1,8)`, `A.SAL_TYPE_CD = SUBSTR(searchItem,9,10)`, `A.STAFF_ID = cmmSearchStaffId`, `searchType != mobile`이면 `AUTF_SRCH_STAFF_YN(... activeMenuCd)` 권한 필터. 기존 List/List2/Map이 이미 이 form으로 동작한다.
- **Alternatives**: 없음.

## R3. 기재사항(List3) 응답과 표시

- **Decision**: 응답 칸 `SAL_ITEM_NM`(기재항목)·`SAL_ENTR_CD`(기재구분 코드)·`SAL_AMT`(금액/시간등)·`SAL_YM`. 기재구분은 E=기준항목, T=근태항목으로 이름을 바꾸고 그 밖의 값은 그대로. `SAL_AMT`는 5240이 `CMMF_FORM_NUM`으로 포맷한 문자열이라 다시 계산하지 않는다. `SAL_YM`은 숨긴다.
- **Rationale**: SQL `getSALSalaryDtstmnMgrList3`(조건 `SAL_ITEM_TYPE_CD='C'`, `TAA_YN='Y'`, `SAL_ENTR_CD IN ('E','T')`), 공통코드 `SAL_ENTR_CD`(spec-db common-code-catalog: E 기준항목, T 근태항목). JSP mySheet3 칸: 기재구분·기재항목·금액/시간등·비고. 비고는 SQL이 주지 않아 뺀다.
- **Alternatives**: 기재구분 코드 그대로 — 사용자가 뜻을 모른다.

## R4. 소급금액·숨김 칸

- **Decision**: 지급내역에서 지급구분(`salTypeNm`)·급여연월(`salYm`) 칸을 뺀다. 소급금액(`resalAmt`)은 그 지급 건의 합이 0이면 칸째 뺀다.
- **Rationale**: JSP mySheet1 — 직원번호·지급구분·적용년월 `Visible:0`, 소급금액은 `resalAmt` SUM 0이면 숨김(spec-docs 그리드 컬럼 표).

## R5. 합계 표와 합계 줄

- **Decision**: 합계 표(지급금액·공제금액·실지급액)는 Map의 `jtotAmt`·`gtotAmt`·`ctotAmt` 그대로. 지급·공제 표의 합계 줄은 그 표 행의 금액 합(5240 그리드 하단 합계와 같은 방식).
- **Rationale**: 5240 화면도 합계 박스는 Map 값, 그리드 하단 "합계 ₩"는 그리드 행 합이다. Map이 실패해도 합계 줄은 행에서 나오지만, 합계 표 자리에 실지급액을 계산해 넣지 않는다(spec D7·FR-002).
- **Alternatives**: 합계 줄도 Map 값 — 행 합과 다르면 표가 스스로 모순돼 보인다.

## R6. 네 조회를 부르는 방식과 실패 처리

- **Decision**: 네 조회를 동시에(`Promise.all`) 부르고, 영역마다 결과(성공·빈 결과·오류)를 따로 다룬다. 오류인 영역만 "조회하지 못했어요"로 표시. 위젯 브리지 차단(403 "bridge: cmd not allowed")도 그 영역의 오류로 다룬다.
- **Rationale**: hr-certificate가 이미 두 조회를 `Promise.all`로 부른다. 위젯 경로(R1 클라이언트 위임)는 조회마다 브리지 왕복이라 순차보다 빠르다. 위젯 배포 전에는 List3만 막히므로 나머지 세 영역은 보인다(spec Edge Cases).

## R7. 표 블록과 영역 제목

- **Decision**: 영역 제목은 `## ` 줄이 아니라 사용자에게 보이는 줄(`> **지급내역** 4건` 꼴)로 쓴다. 표 블록(specs/018)은 한 tool 결과의 여러 표를 한 블록으로 붙이므로 영역 순서가 그대로 유지된다. 건수·제목 줄은 공통 응답 지침(ANSWER_GUIDE) **앞**에 둔다.
- **Rationale**: `utils/hrTableBlocks.js` `isModelOnlyLine`은 `## ` 줄을 사용자 블록에서 지운다. 지침 뒤 줄은 블록·모델 입력에서 잘린다(2026-11-18 연말정산 수정과 같은 문제, 커밋 baeb7dd8).

## R8. 3-Mode·라우팅

- **Decision**: handler 하나만 바꾸므로 chat/query·react·@agent·embed 네 경로가 같은 명세서를 받는다. 조회 선택은 `hr-salary` query_type 설명(Location B)의 payslip 항목만 "명세서 전체"로 고친다. deductions·payslip_summary 설명은 그대로.
- **Rationale**: 운영 위젯에서 "6월 급여명세서"가 payslip_summary로 가는 실패(EC-FILTER-06·EC-ALLOW-04 간헐)가 있다. payslip이 "명세서·페이슬립 전체"라고 분명해지면 개선이 기대되지만, 공제·실수령 질문이 payslip으로 끌려오지 않는지 경계 케이스로 확인해야 한다(Convention §7.4-1).
- **검증**: 라우팅 평가 `dataset.jsonl`에 명세서·공제·실수령 케이스, embed E2E·agent E2E(K10·KB43) 기대 갱신.

## R9. E2E mock

- **Decision**: mock HR API `FIXTURES_BY_CMD`에 List·List2·List3·Map 응답을 넣는다(지급 4·공제 6·기재 2, 합계 맞춤). 응답 래퍼는 실측과 같게 `{"Message":"","DATA":[...]}`, Map은 `{"Map":{...}}`.
- **Rationale**: 지금 mock은 이 cmd들에 `{success,data:[]}`를 돌려 "조회 결과 없음"이 된다 — 답 구성(영역 순서·숨김 칸)을 검증할 수 없다.
