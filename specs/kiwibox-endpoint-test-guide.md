> **소속**: TeamplGPT — HR agent-skill 조회 백엔드(kiwibox 직접 통합, specs/001~007-hr-*). 정본 카탈로그: kiwibox_eGov4.2 `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md`. 작성 2026-07-24.

# kiwibox(5240 HR) 엔드포인트 호출·응답 테스트 가이드

로그인된 `https://ntest.5240.kr` 세션을 전제로, 자기 인사정보/메뉴 조회 엔드포인트를 **직접 호출해 응답을 검증**하는 방법을 정리한다. 엔드포인트 정본 카탈로그(파라미터·응답 필드 전량)는 kiwibox 리포지토리 `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md`. 본 문서는 그 카탈로그를 **실행·검증하는 절차**만 다룬다.

---

## 0. 전제 · 준비

### 0.1 인증 세션(JSESSIONID)
- 인증은 서버 `HttpSession` + `JSESSIONID` 쿠키. 로그인 UI(`/Login.do`)로 로그인한 브라우저에서 쿠키를 복사한다.
  - 개발자도구 → Application → Cookies → `https://ntest.5240.kr` → `JSESSIONID` 값.
- 이 가이드는 **로그인된 세션이 이미 있다고 가정**한다. 세션은 만료(기본 3600초 유휴)되므로 테스트 직전 갱신한다.

```bash
export HOST="https://ntest.5240.kr"     # context_path="" — /kiwibox 접두 없음(배포에 따라 /kiwibox 일 수 있음, 그 경우 HOST 에 붙임)
export CK="JSESSIONID=<로그인_세션_값>"
```

### 0.2 대상 사번 OID
- self 조회 엔드포인트는 대상 사번을 내부 **OID**(`SERVAREA:입사연:일련:솔트`, 예 `100:2007:00204:kkHT`)로 받는다(표시사번 `20070133` 아님).
- OID 획득: 아래 아무 응답의 `staffId` 필드에서 확인(예: 급여명세 Map, 근태현황 DATA[0].staffId). 로그인 사용자 본인 OID를 `$OID`에 넣는다.

```bash
export OID="100:2007:00204:kkHT"        # 로그인 사용자 본인 OID 로 교체
```

### 0.3 세션 유효성 확인 (테스트 전 필수)
```bash
curl -sS -b "$CK" "$HOST/chkLoginSession.do"
# 유효  → {"timeLimit":"3600",...,"loginInfo":"Login!"}
# 만료  → 빈 응답 또는 302 (로그인 페이지). 이 경우 재로그인 후 JSESSIONID 재발급.
```

---

## 1. 공통 호출 규약 (모든 엔드포인트 공통)

| 항목 | 값 |
|---|---|
| 메서드 | POST (`application/x-www-form-urlencoded`). GET/POST 무제약이나 POST 고정 권장 |
| 필수 헤더 | `Cookie: JSESSIONID=…`, **`Referer: https://ntest.5240.kr/Main.do`**(★없으면 302 바운스), `X-Requested-With: XMLHttpRequest` |
| 응답 | JSON. 최상위 키 = `DATA`(배열)·`Map`/`result`(객체·배열). 데이터 없음 = `{"Message":"","DATA":[]}` |
| self 강제 | 사번 파라미터(`cmmSearchStaffId`/`staffId`/`searchId`/`searchStaffId`)는 세션 사번(OID)으로 고정. `searchType=mobile` 등 게이트 스킵 값 주입 금지 |
| 세션 만료 | 302 리다이렉트 또는 로그인 HTML 반환 → "세션 만료"로 처리 후 재인증 |

### 1.1 접근 게이트 = Referer 헤더
업무 `.do` 직접 호출 시 302→`/Main.do` 바운스가 나면 **Referer 헤더 누락**이 원인(인터셉터의 direct-URL 차단). `Referer` 1개만 붙이면 통과한다. activeMenuCd·메뉴 인가와 무관.

---

## 2. 테스트 하니스 (재사용 함수)

```bash
# call <라벨> <경로+쿼리> <form-body>  → 응답 저장 + HTTP/크기 출력
call() {
  local label="$1" path="$2" body="$3"
  curl -sS -m 30 -b "$CK" \
    -H "Referer: $HOST/Main.do" \
    -H "X-Requested-With: XMLHttpRequest" \
    -o "/tmp/kb_${label}.json" \
    -w "%{http_code} %{size_download}b  ${label}\n" \
    --data "$body" "$HOST$path"
}

# assert_rows <라벨> <최상위키>  → 행수·첫행 키 출력(jq 필요)
assert_rows() {
  local label="$1" key="${2:-DATA}"
  local f="/tmp/kb_${label}.json"
  # 세션 만료(비-JSON) 감지
  if ! jq -e . "$f" >/dev/null 2>&1; then echo "  ✗ ${label}: 비-JSON(세션 만료 가능)"; return 1; fi
  local n; n=$(jq -r "(.${key} // []) | length" "$f")
  echo "  ${label}: ${key} rows=${n}"
  jq -r "(.${key} // [])[0] // {} | keys | join(\", \")" "$f" | sed 's/^/    fields: /'
}
```

검증 원칙: (1) HTTP 200, (2) 최상위 키 존재, (3) 로그인 계정에 데이터가 있으면 `rows>0`, (4) 응답 필드가 카탈로그와 일치, (5) 비-JSON/302 = 세션 만료.

---

## 3. 엔드포인트별 테스트

각 항목: **호출** → **기대 응답**(최상위 키·핵심 필드) → **검증**. `<OID>`는 `$OID`로 치환.

### 3.1 급여명세 (콤보 체인 필수)
```bash
# ① 지급구분 코드(searchItem) 조회 — 월(YYYY-MM)별
call sal_combo "/CommonCode.do?cmd=getCommonNSCodeList" \
  "queryId=getSalYmdTypeCdList2&closeChk=Y&searchYm=2026-06&applCd=&staffId=$OID"
# 기대: {"codeList":[{"codeNm":"2026-06-19 급여","code":"20260619P"}]}  → code 를 searchItem 으로
ITEM=$(jq -r '.codeList[0].code' /tmp/kb_sal_combo.json)

# ② 급여명세 합계/지급/공제
call sal_map  "/SALPayslipNewMgr.do?cmd=getSALPayslipNewMgrMap"  "cmmSearchStaffId=$OID&searchYm=2026-06&searchItem=$ITEM&searchType=web"
call sal_pay  "/SALPayslipNewMgr.do?cmd=getSALPayslipNewMgrList" "cmmSearchStaffId=$OID&searchYm=2026-06&searchItem=$ITEM&searchType=web"
call sal_dedu "/SALPayslipNewMgr.do?cmd=getSALPayslipNewMgrList2" "cmmSearchStaffId=$OID&searchYm=2026-06&searchItem=$ITEM&searchType=web"
```
- 기대: `sal_map.Map` = jtotAmt(지급합)·gtotAmt(공제합)·ctotAmt(실수령). `sal_pay.DATA` = salItemNm·salAmt(지급 항목). `sal_dedu.DATA` = 공제 항목.
- 검증: `jq '.Map.ctotAmt' /tmp/kb_sal_map.json` → "2,829,306" 형. `searchType=mobile` 절대 금지.

### 3.2 근태현황 (일일 근태 대표)
```bash
call taa_status "/TAAWrkTimeStatusMgr.do?cmd=getTAAWrkTimeStatusMgrList" \
  "cmmSearchStaffId=$OID&searchBaseSYmd=20260101&searchBaseEYmd=20260722&searchSYmd=20260101&searchEYmd=20260722&orgCd=0303"
assert_rows taa_status DATA
```
- 기대: `DATA[]` (42필드) — staTime·endTime·annualLeave·lateYn(지각)·earlyYn(조퇴)·goOut(외출)·absentYn(결근)·otTime 등.

### 3.3 근무일정 달력
```bash
call taa_cldr "/TAADclzWorkSearchCldr.do?cmd=getTAADclzWorkSearchCldr" \
  "searchId=$OID&cmmSearchStaffId=$OID&searchYm=202607&searchBaseYmd=2026-07-24"
assert_rows taa_cldr DATA   # kind·ymd·workTypeNm·holidayNm·mark
```

### 3.4 휴가 발생/사용/잔여 (종류별) + 사용 상세
```bash
LV="staffId=$OID&cmmSearchStaffId=$OID&wkareaCd=1000&searchLeavCd=&gubun=A&activeTab=0&searchSymdLv=20260101&searchEymdLv=20261231&searchSymdFy=20260101&searchEymdFy=20261231&searchBaseYmd=2026-07-24&chkAppYn=Y"
call vac_bal   "/TAADclzVcatnList.do?cmd=getTAADclzVcatnList1" "$LV"   # 종류별 발생/사용/잔여
call vac_use   "/TAADclzVcatnList.do?cmd=getTAADclzVcatnList2" "$LV"   # 사용 상세(사유)
assert_rows vac_bal DATA   # workNm·creDd(발생)·useDd(사용)·remDd(잔여)·leavCd
assert_rows vac_use DATA   # ymd·leavNm·reason·useDd
```
- 필수 파라미터: `searchSymdLv/Eymd`·`searchSymdFy/Eymd`·`searchBaseYmd`(YYYY-MM-DD)·`chkAppYn=Y`·`wkareaCd`. 누락 시 빈 응답.

### 3.5 월별 지급내역
```bash
call sal_month "/SALSalaryBassMgr.do?cmd=getSALSalaryBassMgrTab110List" \
  "cmmSearchStaffId=$OID&searchSYmd=20260101&searchEYmd=20260722&searchBaseYmd=2026-07-24&orgCd=0303"
assert_rows sal_month DATA   # salYmd·jtotAmt·gtotAmt·ctotAmt
```

### 3.6 인사카드 (탭별)
```bash
# 공통 body
HC="cmmSearchStaffId=$OID&staffId=$OID&searchStaffId=$OID&searchYmd=2026-07-24&orgCd=0303"
call card_base   "/PRCHrBassiemMgrTab100.do?cmd=getPRCHrBassiemMgrTab100List" "$HC"  # 기본(주민번호 복호화 포함)
call card_family "/PRCHrBassiemMgrTab140.do?cmd=getPRCHrBassiemMgrTab140List" "$HC"  # 가족
call card_career "/PRCHrBassiemMgrTab170.do?cmd=getPRCHrBassiemMgrTab170List" "$HC"  # 경력
call card_edu    "/PRCHrBassiemMgrTab120.do?cmd=getPRCHrBassiemMgrTab120List" "$HC"  # 교육
call card_school "/PRCHrBassiemMgrTab150.do?cmd=getPRCHrBassiemMgrTab150List" "$HC"  # 학력
call card_cert   "/PRCHrBassiemMgrTab160.do?cmd=getPRCHrBassiemMgrTab160List" "$HC"  # 자격
for l in card_base card_family card_career card_edu card_school card_cert; do assert_rows $l DATA; done
```
- ⚠ 개인정보: `card_base.DATA[0].ctzNoDecrypt`(주민번호)·`card_family.DATA[].famresDecrypt`(가족 주민번호)·연락처는 **마스킹 후** 사용.

### 3.7 결재함(내 신청 전체) + 본문
```bash
call eap_inbox "/EAPRequestMgr.do?cmd=getEAPRequestMgrList" \
  "searchGubun=&searchStatusCd=&searchSYmd=20260101&searchEYmd=20260722"
assert_rows eap_inbox DATA   # reqNo·docTypeNm(기안/기결/반려)·title·applNm·reqStatusNm
# 본문(reqNo 는 위 목록 결과만 화이트리스트)
REQ=$(jq -r '.DATA[0].reqNo' /tmp/kb_eap_inbox.json)
call eap_detail "/getApprovalDetailJson.do" "reqNo=$REQ"
```

### 3.8 평가결과 / 대출 / 증명서
```bash
call pfm  "/PFMResCurrState.do?cmd=getPFMResCurrStateList" "cmmSearchStaffId=$OID&searchSYmd=20260101&searchEYmd=20260722"
call lon  "/LONLoanReqstListMgr.do?cmd=getLONLoanReqstListMgrList1" "cmmSearchStaffId=$OID&searchBaseSYmd=20250101&searchBaseEYmd=20260722"
call cti  "/CTIMcrtfReqstRefromMgr.do?cmd=getCTIMcrtfReqstRefromMgrList" "cmmSearchStaffId=$OID&staffId=$OID&searchStaffId=$OID&reqNoExist=N&searchSYmd=20250101&searchEYmd=20260722"
for l in pfm lon cti; do assert_rows $l DATA; done
# ⚠ lon: cmmSearchStaffId 누락 시 전사 노출 → self 강제 필수. lon/cti = 금액·계좌·주소 민감.
```

### 3.9 접근 가능한 메뉴 (좌측 네비 + 모바일)
```bash
# 좌측 네비 트리(직원 menu01 / 담당자 menu02)
call nav_emp   "/getSubLowMenuList.do" "mainMenuCd=100-0401&grpCd=10&sDataRwType=&dataRwType=&dataProgType=&menuKind=menu01"
call nav_admin "/getSubLowMenuList.do" "mainMenuCd=100-0401&grpCd=10&sDataRwType=&dataRwType=&dataProgType=&menuKind=menu02"
assert_rows nav_emp result    # lvl·menuCd·priorMenuCd·progCd·type(M/P/T)·progFile·menuNm
# 대분류 / 권한그룹 / 최근·자주
call nav_major "/getMainMajorMenuList.do" ""       ; assert_rows nav_major result    # mainMenuCd·mainMenuNm·grpCd
call nav_grp   "/getCollectAuthGroupList.do" ""    ; assert_rows nav_grp   result    # ssnGrpCd·ssnGrpNm
call nav_last  "/getLastestMenuList.do" ""         ; assert_rows nav_last  DATA
call nav_often "/getOftenMenuList.do" ""           ; assert_rows nav_often DATA
# 모바일 메뉴(Referer=MobileMain)
curl -sS -b "$CK" -H "Referer: $HOST/MobileMain.do" -H "X-Requested-With: XMLHttpRequest" \
  -o /tmp/kb_nav_mobile.json "$HOST/getMobileMenuList.do" --data ""
assert_rows nav_mobile Result   # MOS-* progCd 계층 트리
# 전체 메뉴 검색(네비 아님·상단 검색용)
call menu_search "/Popup.do?cmd=getMenuSearchPopupMainList" "searchText=" ; assert_rows menu_search DATA
```

---

## 4. 전체 스모크 러너

```bash
#!/usr/bin/env bash
# 전제: HOST, CK, OID export 됨. jq 필요.
set -u
pass=0; fail=0
check(){ # <라벨> <경로> <body> <최상위키>
  call "$1" "$2" "$3" >/tmp/kb_hdr 2>&1
  local code; code=$(awk '{print $1}' /tmp/kb_hdr)
  if [ "$code" = "200" ] && jq -e ".${4} // .Map // .result // .Result" "/tmp/kb_$1.json" >/dev/null 2>&1; then
    echo "✓ $1"; pass=$((pass+1))
  else echo "✗ $1 (http=$code)"; fail=$((fail+1)); fi
}
# 세션 우선 확인
jq -e '.loginInfo=="Login!"' <(curl -sS -b "$CK" "$HOST/chkLoginSession.do") >/dev/null \
  || { echo "세션 만료 — 재로그인 필요"; exit 1; }

check taa_status "/TAAWrkTimeStatusMgr.do?cmd=getTAAWrkTimeStatusMgrList" "cmmSearchStaffId=$OID&searchBaseSYmd=20260101&searchBaseEYmd=20260722&searchSYmd=20260101&searchEYmd=20260722" DATA
check vac_bal    "/TAADclzVcatnList.do?cmd=getTAADclzVcatnList1" "staffId=$OID&cmmSearchStaffId=$OID&wkareaCd=1000&searchLeavCd=&gubun=A&activeTab=0&searchSymdLv=20260101&searchEymdLv=20261231&searchSymdFy=20260101&searchEymdFy=20261231&searchBaseYmd=2026-07-24&chkAppYn=Y" DATA
check eap_inbox  "/EAPRequestMgr.do?cmd=getEAPRequestMgrList" "searchSYmd=20260101&searchEYmd=20260722" DATA
check card_base  "/PRCHrBassiemMgrTab100.do?cmd=getPRCHrBassiemMgrTab100List" "cmmSearchStaffId=$OID&staffId=$OID&searchYmd=2026-07-24" DATA
check nav_emp    "/getSubLowMenuList.do" "menuKind=menu01" result
echo "== PASS $pass / FAIL $fail =="
```

---

## 5. 응답 검증 체크리스트

- [ ] `chkLoginSession.do` → `loginInfo:"Login!"` (세션 유효)
- [ ] 각 호출 HTTP 200 + 최상위 키(`DATA`/`Map`/`result`) 존재
- [ ] 데이터 있는 계정에서 `rows>0`, 응답 필드가 카탈로그와 일치
- [ ] 급여: 콤보(`searchItem`) 선조회 후 명세 호출, `searchType=web`
- [ ] 휴가: `searchSymdLv/Fy`·`chkAppYn=Y`·`wkareaCd` 포함
- [ ] 결재 본문: `reqNo`는 결재함 목록 결과만 사용(임의 생성 금지)
- [ ] 민감필드(주민번호 `ctzNoDecrypt`/`famresDecrypt`, 계좌 `accNo`, 급여 금액) 마스킹
- [ ] `searchType=mobile` 등 게이트 스킵 파라미터 미주입
- [ ] 비-JSON/302 응답 = 세션 만료로 처리

## 6. 참고
- 엔드포인트 정본(파라미터·응답 필드 전량·민감도·정정 이력): kiwibox 리포 `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md`.
- 실측 기준 계정: 오사공(사번 20070133, grpCd 10 인사팀 과장, SERVAREA 100). 다른 계정은 권한그룹에 따라 접근 메뉴·행수가 다르다.
