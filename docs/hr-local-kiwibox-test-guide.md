> **소속**: TeamplGPT — HR agent-skill 실서버 연동 검증 가이드. 2026-09-04 handler 정본 재정렬(파라미터·경로 교정) 검증 절차 포함.
> 선행 문서: `HR-SKILL-GUIDE.md`(개발·검증 전반), `specs/kiwibox-endpoint-test-guide.md`(curl 실측 규약 정본).

# HR 스킬 로컬/ntest 연동 테스트 가이드

로컬 kiwibox 또는 원격 `https://ntest.5240.kr`에 teamplgpt를 연동해 HR 스킬 handler를 실서버로 검증하는 절차. 비용이 낮은 순서로 3단계다. **1단계(curl)만으로 파라미터 수준 검증의 대부분이 끝난다.**

| 단계 | 필요한 것 | 검증 범위 |
|---|---|---|
| 1. curl 직접 호출 | kiwibox(로컬 또는 ntest) + 로그인 세션 | handler가 보내는 파라미터가 kiwibox에서 실제로 데이터를 반환하는지 |
| 2. 서버 폴백 연동 | 1 + teamplgpt 서버·프론트 | LLM → handler → kiwibox 전 구간 (운영 피드백 발화 재현) |
| 3. E2E(mock) / R1 위젯 | teamplgpt (+okrservice) | 행태 회귀 / 브리지·origin 배선 |

---

## 0. kiwibox 준비 — 로컬 vs ntest

### 0.1 로컬 kiwibox

```bash
cd $KIWIBOX && mvn cargo:run        # 내장 Tomcat, http://localhost:8080
```

- Oracle 접속은 커밋된 `globals.properties`(암호화 URL) 사용. 로컬에서 해당 Oracle에 접근 불가하면 로컬 기동을 포기하고 ntest로 진행한다(아래 절차 동일).
- 루트 배포이므로 컨텍스트 경로 없음.

### 0.2 원격 ntest.5240.kr (kiwibox 기동 생략)

- 브라우저로 `https://ntest.5240.kr/Login.do` 로그인만 하면 된다.
- **버전 유의**: handler 수정은 `$KIWIBOX` 소스의 SQL과 대조해 만든 것이다. ntest 배포본이 소스와 다르면 결과가 어긋날 수 있다 — 실패 시 응답 원문을 기록해 소스와 대조한다.

### 0.3 인증 정보 확보 (공통)

1. 로그인한 브라우저 개발자도구 → Application → Cookies → `JSESSIONID` 복사.
2. 본인 **OID** 확보 — 표시사번(예 `20070133`)이 아니라 내부 STAFF_ID(`100:2007:00204:kkHT` 형식). 아무 조회 응답의 `staffId` 필드에서 확인.
3. 세션은 유휴 3600초 만료. 테스트 직전 `chkLoginSession.do`로 확인, 만료 시 재로그인 후 갱신.

```bash
export HOST="http://localhost:8080"          # ntest 사용 시: https://ntest.5240.kr
export CK="JSESSIONID=<로그인_세션_값>"
export OID="<본인 OID>"

curl -sS -b "$CK" "$HOST/chkLoginSession.do"   # {"loginInfo":"Login!"} 이면 유효
```

---

## 1. curl 직접 검증 — 2026-09-04 수정 9건 체크리스트

공통 하니스(Referer 헤더 필수 — 없으면 302 바운스, `specs/kiwibox-endpoint-test-guide.md` §1):

```bash
call() { curl -sS -m 30 -b "$CK" -H "Referer: $HOST/Main.do" \
  -H "X-Requested-With: XMLHttpRequest" -d "$2" "$HOST$1"; }
```

각 항목은 "빈 DATA = 파라미터 문제"와 "빈 DATA = 데이터 없음"을 구분해야 하므로, **본인 계정에 실데이터가 있는 연월로 조정**해서 실행한다.

### 1.1 전자결재 — 기간 파라미터 `sdt`/`edt`

```bash
call /EAPRequestMgr.do "cmd=getEAPRequestMgrList&selectGubun=2&sdt=20260601&edt=20260904"
```

- 기대: 기간 내 기안 문서 DATA. 대조군으로 `sdt/edt`를 빼면 **오늘 하루**만 나와야 한다(종전 "기안함 답변불가"의 원인 재현). gubun 3/4/6은 미전송 시 전체기간(1900~2999)이 나온다.

### 1.2 급여 2단계 — 지급 건 목록 → 명세 정본

```bash
# 1단계: 지급 건 코드 획득 (마감 CLOSE_YN='Y' 건만 나옴 — 마감 전 월은 빈 결과가 정상)
call /CommonCode.do "cmd=getCommonNSCodeList&queryId=getSalYmdTypeCdList2&closeChk=Y&searchYm=2026-08&applCd=&staffId=$OID"

# 2단계: 명세 (CODE를 searchItem에) — /SALPayslipNewMgr.do는 유령 경로였음
call /SALSalaryDtstmnMgr.do "cmd=getSALSalaryDtstmnMgrList&searchItem=<CODE>&searchYm=2026-08&searchType=web&cmmSearchStaffId=$OID"
# 공제내역: cmd=getSALSalaryDtstmnMgrList2 / 요약: cmd=getSALSalaryDtstmnMgrMap (동일 body)
```

### 1.3 월별 지급내역 — `findText`(연도) + `staffId`

```bash
call /SALSalaryBassMgr.do "cmd=getSALSalaryBassMgrTab110List&findText=2026&staffId=$OID"
```

- 기대: 해당 연도 월별 지급 목록. 종전엔 `staffId` 미전송으로 항상 0건이었다.

### 1.4 연장근무(OT) — `searchYm`

```bash
call /TAADclzWorkOtSchdul.do "cmd=getTAADclzWorkOtSchdulList2&searchType=2&searchYm=202608&cmmSearchStaffId=$OID"
# 한도(일별 매트릭스): cmd=getTAADclzWorkOtSchdulList (동일 body)
```

### 1.5 근무캘린더 — `searchSYmd`/`searchEYmd` 필수

```bash
call /TAADclzWorkSearchCldr.do "cmd=getTAADclzWorkSearchCldr&searchYm=202609&searchSYmd=20260901&searchEYmd=20260930&searchId=$OID&cmmSearchStaffId=$OID&searchBaseYmd=2026-09-04"
```

### 1.6 조직원 목록 — `searchTypeVal` 필수

```bash
# 먼저 조직도에서 ORG_CD 확인
call /getMBLHrBassiemOrgList.do "searchSymd=20260904"
# searchTypeVal 없으면 SQL의 Y/N 분기 양쪽 모두 거짓 → 항상 0건
call /getMBLHrBassiemMemberList.do "searchOrgCd=<ORG_CD>&searchSymd=20260904&searchTypeVal=N"
```

### 1.7 ★연말정산 — `searchCalKindCd` 실값 + 연도·사번 파라미터 확인 (실측 필수)

```bash
# 요약(cmmSearchStaffId 계열)
call /YTASummaryMgr2025.do "cmd=getYTASummaryMgrList&cmmSearchStaffId=$OID&searchCalYy=2025&searchCalKindCd=1"
# 부양가족(searchCalYy 무조건 필터 — 빠지면 0건)
call /YTAYtaFamilySttusMgr2025.do "cmd=getYTAYtaFamilySttusMgrList&cmmSearchStaffId=$OID&searchCalYy=2025&searchCalKindCd=1"
# 신용카드(InDct 계열 — 사번이 searchStaffId)
call /YTAInDctMgr2025.do "cmd=getYTAInDctMgrTab08List&searchStaffId=$OID&searchCalYy=2025&searchCalKindCd=1"
# 연금저축(InDct + searchItemGroupCd=TAB_06 무조건 필터)
call /YTAInDctMgr2025.do "cmd=getYTAInDctMgrTab06List&searchStaffId=$OID&searchCalYy=2025&searchCalKindCd=1&searchItemGroupCd=TAB_06"
```

- YTA 계열 SQL 전부가 `CAL_KIND_CD = #{searchCalKindCd}` **무조건 필터**다. `'1'`=연말정산, `'2'`=중도정산(kiwibox `docs/schema_utf8.sql`의 YTA_CAL_KIND_CD 주석). handler는 `'1'`로 보내며, 빈 결과면 `searchCalKindCd=2`로 재시도해 데이터 유무를 대조한다.
- `searchCalYy`: family/previous_employer/InDct 4종은 `CAL_YY = #{searchCalYy}` **무조건 필터**(미전송 시 0건). summary/medical/donation은 `<if>`라 미전송 시 **전 연도 행이 섞여** 나온다. handler는 항상 경로 연도와 같은 값을 보낸다(2026-09-08 보강).
- 사번 파라미터명: Summary/Med/Family/BefWrk/GivPay는 `cmmSearchStaffId`, **InDct 4종(신용카드·보험·교육·연금저축)은 `searchStaffId`**. 연금저축(Tab06)은 `searchItemGroupCd=TAB_06`도 필수(화면 hidden 값, 2022~2025 동일).
- 판정: 위 4개 curl 중 하나라도 DATA가 오면 파라미터 계약은 맞는 것. 전부 0건이면 (a) 해당 연도 정산 데이터 자체가 없거나 (b) `AUTF_SRCH_STAFF_YN` 게이트(`activeMenuCd`는 세션 주입 — handler는 gate:false라 사전 세팅 없음)를 의심한다. (b)는 `HR_ACTIVE_MENU_CD`를 YTA 메뉴 코드로 넣고 재시도.

### 1.8 ★증명서 발급내역 — AUTF 게이트 확인 (실측 필수)

```bash
call /CTIMcrtfIssuMgr.do "cmd=getCTIMcrtfIssuMgrList&staffIdNm=$OID&searchSymd=20250301&searchEymd=20260904"
```

- 기대: 본인 발급내역 목록(피드백 기준 2026년 4건). 종전 `getCTIMcrtfReqstRefromMgrList`는 신청화면 초기조회용이라 구조적으로 1건만 반환했다.
- 0건이면 AUTF_SRCH_STAFF_YN 게이트(activeMenuCd) 이슈다:
  ```bash
  call "/setSessionActiveTabMenuCd.do?tabMenuCd=<발급내역 메뉴CD>" ""
  ```
  선호출 후 재시도. 그래도 안 되면 일반 사용자 권한으로는 이 endpoint를 못 쓰는 것이므로 대체 endpoint 재설계가 필요하다(스킬 setup_args `HR_ACTIVE_MENU_CD` 활용 검토 포함).

### 1.9 검증 결과 판정표

| 항목 | 성공 기준 | 실패 시 의심 |
|---|---|---|
| 1.1 | 기간 내 문서 목록 | ntest 버전 차이(sdt/edt 명칭) |
| 1.2 | CODE 목록 → 명세 항목 | 해당 월 급여 미마감(다른 월로), Dtstmn 게이트 |
| 1.3 | 연간 월별 목록 | findText/staffId 명칭 버전 차이 |
| 1.4~1.6 | 데이터 반환 | 파라미터 명칭 버전 차이 |
| 1.7 | DATA 반환하는 cal_kind 값 발견 | 코드값 상이 → handler 수정 |
| 1.8 | 발급 건수 일치 | AUTF 게이트 → HR_ACTIVE_MENU_CD 또는 재설계 |

---

## 2. teamplgpt 서버 폴백 연동 (LLM → handler → kiwibox 전 구간)

### 2.1 기동

```bash
docker start anythingllm-postgres
cd $TEAMPLGPT && HR_DEBUG_TOOL_IO=true yarn dev:server    # :3001
yarn dev:frontend                                          # :3000
```

- `_shared/*.js`·`server/utils/**` 수정분은 **서버 재기동 필요**. `handler.js`는 매 호출 require 캐시를 지우므로 이후 수정은 재기동 불요.
- `HR_DEBUG_TOOL_IO=true` → `[tool-io]` 한 줄 JSON 로그(LLM 입출력·TOOL_CALL·KIWIBOX_RAW). **운영에서는 절대 켜지 않는다**(급여·개인정보 노출).

### 2.2 스킬 setup_args 설정

7종 스킬 각각의 `server/storage/plugins/agent-skills/hr-*/plugin.json` setup_args `value`를 수정(또는 관리자 UI > Agent Skills):

| 키 | 로컬 kiwibox | ntest |
|---|---|---|
| `HR_BASE_URL` | `http://localhost:8080` | 기본값 그대로 (`https://ntest.5240.kr`) |
| `HR_CONTEXT_PATH` | 빈 값 | 빈 값 (루트 배포) |
| `HR_SESSION_COOKIE` | `JSESSIONID=<값>` | 동일 |
| `HR_STAFF_ID` | `<OID>` | 동일 |
| `HR_ACTIVE_MENU_CD` | 1.8 실측 결과에 따라 | 동일 |

**보안 주의**: `HR_SESSION_COOKIE`는 본인 실세션이다. 이 워크스페이스에서 채팅하는 누구든 본인 데이터가 조회되므로 로컬 개발에서만 쓰고, **plugin.json에 넣은 값을 커밋하지 않는다**(테스트 후 비우기).

### 2.3 검증 발화 (운영 피드백 재현)

workspace(`eshelsoft`) 채팅에서 새 세션으로(기존 히스토리의 잘못된 답변 패턴 승계 방지):

- "내가 올린 결재 문서" → 기안함 목록 (종전 답변불가)
- "완료된 결재" → 이번 달 범위 (종전 전체기간)
- "급여명세서 보여줘" / "공제내역 알려줘" / "실수령액 얼마야" → 지급 건 목록 → 상세 체인 (마감 전이면 지난달 자동 폴백)
- "월별 급여 내역 보여줘" → 연간 월별 목록 (종전 답변불가)
- "이번 달 연장근무 내역" / "OT 한도 알려줘" (종전 답변불가)
- "이번 달 근무캘린더 보여줘" (종전 답변불가)
- "우리 팀원 누구야?" → 조직도 선행 → 조직원 (종전 답변불가)
- "2024 연말정산 결과 알려줘" (종전 답변불가)
- "재직증명서 발급내역 알려줘" → 건수 일치 확인 (종전 1건만)

`[tool-io]` 로그에서 실제 전송 body와 kiwibox 원응답을 대조한다.

---

## 3. E2E 회귀와 R1 위젯 경유

### 3.1 E2E(mock) — 행태 회귀

```bash
npm run e2e:hr-skill          # @agent 면
npm run e2e:embed-hr-skill    # embed 면
```

- 2026-09-04 handler 재정렬에 맞춰 시나리오 갱신됨: K5·K6·K10~K15·KB21·KB43·KB23/24 + embed 2건. mock 기반이므로 **실서버 검증을 대체하지 않는다**.

### 3.2 R1 위젯 경유 (브리지·origin 배선 검증)

- **로컬 kiwibox**: kiwibox JSP 공통 레이아웃에 `extras/kiwibox-bridge/README.md`의 스니펫 삽입 + okrservice 기동(`HR-SKILL-GUIDE.md` §7 배선: `TEAMPLGPT_EMBED_ID`(uuid)·`TEAMPLGPT_WIDGET_ORIGIN`·embed `allow_tool_calling`+`client_tool_execution`).
- **ntest**: 서버 JSP 수정 불가 → (a) 브라우저 콘솔에 브리지 JS 붙여넣기 + 로컬 위젯 iframe 수동 생성(Chrome은 https 페이지에서 `http://localhost` iframe 허용 — 간이 방법, 정책에 따라 막힐 수 있음), 또는 (b) **권장: 스테이징 정식 삽입 시점으로 보류**. 2단계가 handler→kiwibox 전 구간을 검증하므로 R1에서 추가 확인되는 것은 브리지 allowlist·마커 치환·origin 배선뿐이다.

---

## 부록 A. 2026-09-04 관련 수정 이력 (이 가이드가 검증하는 대상)

| 파일 | 수정 |
|---|---|
| `hr-approval/handler.js` | 기간 파라미터 `sdt`/`edt`로 교체(월 미지정 시 최근 3개월) |
| `hr-salary/handler.js` | 명세 3종 `/SALSalaryDtstmnMgr.do`로 교체, salary_statement `findText`+`staffId`, pay_periods 마감 전 소급 폴백 |
| `hr-attendance/handler.js` | OT `searchYm`, 근무캘린더 `searchSYmd/EYmd` 추가 |
| `hr-personnel/handler.js` | org_members `searchTypeVal:"N"` |
| `hr-year-end-tax/handler.js` | `searchCalKindCd:"1"` + `searchCalYy`(경로 연도) 전 항목, InDct 4종 사번 `searchStaffId`, Tab06 `searchItemGroupCd:"TAB_06"` (2026-09-08 보강 — 종전 6종은 searchCalYy 미전송으로 여전히 0건이었음) |
| `hr-certificate/handler.js` | `getCTIMcrtfIssuMgrList`로 교체 (게이트는 1.8에서 확인) |
| `_shared/hrSession.js` | 서버 폴백에 `Referer`·`X-Requested-With` 헤더 추가(없으면 302 바운스로 폴백 자체가 불능이었음) |
| `extras/kiwibox-bridge/teamplgpt-hr-bridge.js` | allowlist에 `/TAADclzVcatnList.do`·`/SALSalaryBassMgr.do`·`/CTIMcrtfIssuMgr.do` 추가 |
| okrservice `widgets/client/messenger/widget/hrBridge.ts` | allowlist에 `/SALSalaryDtstmnMgr.do`·`/CTIMcrtfIssuMgr.do` 추가 |
| E2E `scenarios.json` 2종 | 새 계약 기준으로 body 패턴 갱신 |

## 부록 B. 장애 증상 빠른 매핑

| 증상 | 원인 |
|---|---|
| curl이 HTML/302 반환 | Referer 헤더 누락 또는 세션 만료 |
| "HR 세션이 만료되었거나..." | JSESSIONID 만료 — 재로그인 후 setup_args 갱신 |
| "서버 폴백 모드에서는 HR_STAFF_ID..." | HR_STAFF_ID 미설정(OID 형식이어야 함) |
| 지급 건 목록 항상 빈 결과 | 해당 월 급여 미마감(CLOSE_YN) — 마감된 월로 |
| YTA 전 항목 0건 | searchCalKindCd 실값 상이 또는 AUTF 게이트(activeMenuCd 세션) — 1.7 절차 |
| YTA 요약·의료비만 되고 가족·전직장·카드 등 0건 | `searchCalYy`/`searchStaffId` 미전송(2026-09-08 이전 handler) — handler 버전 확인 |
| 증명서 0건 | AUTF 게이트 — 1.8 절차 |
| "bridge: path not allowed" | 스킬-브리지 allowlist 버전 불일치 |
