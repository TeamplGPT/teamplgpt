# Research: 위젯 HR 메뉴 권한에 5240 PC 메뉴 권한 반영

## R1. PC 메뉴 권한을 받는 조회

- **Decision**: 5240 `/getSubLowMenuList.do`를 `menuKind=menu01`(직원용)·`menuKind=menu02`(업무 담당자용)로 두 번 호출해 합친다.
- **Rationale**: 5240 PC 포털 왼쪽 메뉴가 쓰는 조회다(`webapp/common/js/main.js` `createLowMenu`). 컨트롤러(`LoginController.getSubLowMenuList`)가 세션의 servareaId·staffId·ssnId·grpCd를 넣고, SQL(`Main_SQL.xml` `getLowMenuList`)은 `menuKind`·`language`·세션 값만 쓴다. 다른 직원을 지정하는 파라미터가 없다. PC 메뉴만 돌려준다(`PC_MOB_TYPE IS NULL OR = 'P'`), 사용 메뉴만(`USE_YN='Y'`).
- **응답 모양(소스 기준)**: `jsonView` → `{"result":[...]}`. egovMap이라 키는 camelCase: `lvl`, `menuCd`, `priorMenuCd`, `grpCd`, `progCd`, `progFile`, `applCd`, `dataRwType`, `type`, `menuNm` 등. 1·2레벨 행은 `progCd`/`progFile`이 비어 있다(권한 그룹·대분류).
- **실측(2026-11-17, 5240corp 오이사공 테스트 계정)**: 래퍼 `result`(소문자 — 모바일은 `Result`). 행 키 `applCd, batchButnYns, dataRwType, downloadYn, grpCd, helpUseYn, lvl, menuCd, menuNm, priorMenuCd, progCd, progFile, reloginYn, seqPath, servareaId, type, uploadYn`. menu01 66행(프로그램 행은 lvl 4, 55개) / menu02 0행. lvl 1~3 행은 `progCd` null, 3레벨은 `progFile: 'NO_USE'`. 결재 양식 행은 `progFile: /EAPApprovalMgr.do?cmd=viewEAPApprovalMgr` + `applCd`(예: 휴가신청 TAA-0070 → 1022, 사직서(직원) PRC-0030 → 1590), 조회 화면은 `applCd` null(급여명세서New SAL-0527만 급여 구분 문자열).
- **실측이 바꾼 것**: menu01은 직원용 메뉴 트리(권한 그룹 "직원 Self Service")라, 이 목록에 있는 프로그램은 회사가 **직원에게** 연 메뉴다. 프로그램 목록(`programName_menuName.json`)의 분류만 보고 관리자 화면으로 뺐던 코드 일부가 실제로는 직원 메뉴로 쓰인다(R3 재검토 — 아래 R3a).
- **Alternatives considered**: `/getMainMajorMenuList.do`는 대분류만 준다. `Main.do`는 HTML이다.

## R2. 위젯 브리지 허용 방식

- **Decision**: `ALLOWED_PATHS`에 `/getSubLowMenuList.do`를 추가하고, `ALLOWED_PARAM_KEYS['/getSubLowMenuList.do'] = ['menuKind']`, `PARAM_VALUE_ALLOWLIST['/getSubLowMenuList.do'] = { menuKind: ['menu01','menu02'] }`로 둔다.
- **Rationale**: 기존 `/getMobileMenuList.do`(파라미터 0개만 허용)와 같은 수준이다. `PARAM_VALUE_ALLOWLIST`는 키가 반드시 있고 값이 목록 안이어야 통과하므로 `menuKind` 없는 호출도 막힌다. cmd 없는 경로라 `CMD_ALLOWLIST`는 해당 없음(`isCmdAllowed`가 cmd 있으면 거부). 사번 파라미터가 없는 조회라 `REQUIRED_STAFF_PARAMS`에는 넣지 않는다.
- **Alternatives considered**: 파라미터 자유 허용 — 거부(최소 허용 원칙).

## R3. 대응표 "확인 필요" 5행 확정 (D3 규칙 적용)

D3 규칙을 다음처럼 구체화했다: **PC 프로그램이 대분류 "직원(SelfService)"이거나, 이름 괄호 안에 대상이 직원 본인임을 뜻하는 "직원" 표기가 있을 때만 짝짓는다**(예: "휴가신청(직원)", "탄력근무신청(2주,직원)", "급여명세서(직원2)"). "임직원"은 전 직원 조회라 해당하지 않는다. 그 밖(근태관리·조직관리·부서장(MSS)·시스템관리·근태제도 분류의 관리 화면, 회사 전용 `-NNN` 코드)은 짝짓지 않는다.

| 버튼 | 후보 | 판정 | 근거 |
|---|---|---|---|
| 대체휴무신청(개인) | 개인용 PC 프로그램 없음 | 짝 없음 | TAA-0470은 일반 대체휴무신청 버튼과 짝 |
| 결재취소신청 | EAP-0110 결재취소신청(직원) | 짝 없음 | 대분류가 시스템관리(Admin) > 예제프로그램 — 실사용 메뉴인지 불명 |
| 인사카드 | PRC-0450 인사카드 | 짝 없음 | 프로그램명 "인사카드(부서장)", 중분류 부서장(MSS) |
| 조직원조회 | ORG-0070, PRC-6000 | 짝 없음 | 대분류 조직관리(관리자 화면) |
| 휴가현황 | TAA-0490 휴가현황 | 짝 없음 | 대분류 근태관리, RW=W(관리 화면) |

같은 규칙으로 spec 초안의 "짝" 행 중 다음을 뺐다(fail closed):

| 버튼 | 뺀 코드 | 이유 | 남은 짝 |
|---|---|---|---|
| 근무일정조회 | TAA-0730 월별근무계획조회(달력) | 근태관리 분류, 부서장 마운트 별칭 | TAA-0950 |
| 경조휴가신청 | EAP-6220 경조휴가(금,품포함)신청 | 대분류 없음, 기타(총무) | TAA-0076 |
| 교육신청 | EDU-0200 교육신청-교육명 | 교육관리 분류 | EDU-0070 |
| 선택신청(월) | TAA-0880 선택근무신청 | 근태제도 분류, "(직원)" 표기 없음 | 없음 → 짝 없음 |

## R3a. 실측 기반 대응표 수정안 (사용자 승인 대기)

실계정 직원용 PC 메뉴(menu01)에 같은 기능으로 걸린 프로그램:

| 버튼 | 실측 PC 프로그램 | 기존 대응표 | 수정안 |
|---|---|---|---|
| 결재취소신청 | EAP-0110 결재취소신청 | 없음 | EAP-0110 추가 |
| 선택신청(월) | TAA-0880 선택근무신청(1개월) | 없음 | TAA-0880 추가 |
| 교육신청 | EDU-0200 교육신청-교육명 (applCd 1133 = 모바일 버튼의 searchApplCd 1133) | EDU-0070 | EDU-0200 추가 |
| 인사카드 | PRC-0090 인사카드 | 없음 | PRC-0090 추가 |
| 휴가현황 | TAA-0490 휴가현황 | 없음 | TAA-0490 추가 |
| 조직원조회 | PRC-6000 조직원조회(직원) | 없음 | PRC-6000 추가 |
| 급여명세서 | SAL-0527 급여명세서New | SAL-0220·0230(이 계정에 없음) | SAL-0527 추가 |
| 휴가캘린더 | TAA-0370 휴가자조회(달력) | 없음 | TAA-0370 추가 |

실측에 없던 대응표 코드(BTR-0042, EAP-5490, EDU-0070, SAL-0220, SAL-0230, TAA-0471, TAA-0980)는 다른 회사 대비로 남긴다. 회사 전용 코드(SAL-0527-303 등 `-NNN`)는 계속 넣지 않는다. 출근현황·연장근무현황·OT현황·게시판·대체휴무신청(개인)은 실측에도 같은 기능 프로그램이 없어 "없음" 유지.

## R4. 결재 양식 버튼의 PC 짝

- **Decision**: 신청 종류(applCd)로 짓는 버튼 4개(고충신고서 5470, 사직서(직원) 1590, 사직서(히타치) 6000-303, 근무복신청서 5200-303)는 PC 메뉴 행 중 `applCd`가 같은 행이 있으면 PC 권한으로 인정한다. 주소(progFile)는 따지지 않는다.
- **Rationale**: PC 결재 양식은 모두 `/EAPApprovalMgr.do`이고 신청 종류로 구분된다. 모바일 쪽 기존 보호(같은 화면을 쓰는 다른 신청서가 열리지 않게)와 같은 키다.
- **사직서(직원) 여는 주소**: 지금은 모바일 메뉴 행의 progFile·progCd·dataRwType로 만든다(`approvalOpenPath`). 모바일 행이 없고 PC 행만 있으면 PC 행의 같은 칸으로 만든다. 기존 테스트 픽스처상 모바일 행도 `progCd: PRC-0030`(PC 프로그램 코드)이라 같은 주소가 나온다. 실계정 확인: quickstart Q3.

## R5. 성능 (okrservice perf 규칙)

- **Decision**: 모바일·PC(직원용·담당자용) 세 조회를 챗봇 화면을 열 때 **동시에** 시작하고, 각각 끝나는 대로 권한을 갱신한다. 화면 표시는 기다리지 않는다(현행: 확인 전에는 항상 허용 화면만).
- **Rationale**: 기존 `useMenuPermission`은 화면 마운트당 1회 조회다. 같은 패턴을 유지하고 조회만 늘린다. 한 조회 실패가 다른 조회 결과를 버리지 않는다(spec D6).
- **Alternatives considered**: 세 조회를 모두 기다린 뒤 한 번에 반영 — 가장 느린 조회만큼 버튼이 늦게 뜬다.

## R6. 테스트

- okrservice `widgets`의 jest(jsdom). 기존 `menuPermission.test.ts`(260줄)·`hrBridge.test.ts`(1041줄)에 추가한다.
- D10(필수) 검증: 위젯 버튼 34개 × {권한 없음, 모바일만, PC만, 둘 다} × {모바일 조회 실패, PC 조회 실패, 둘 다 실패} 조합을 표로 돌려, "둘 다 없음/둘 다 실패 → 숨김"을 전수 확인한다.
- LLM 행태 변경이 아니므로 TeamplGPT E2E 시나리오(헌장 III)는 해당 없음. 실동작은 실위젯·실계정으로 확인(quickstart).
