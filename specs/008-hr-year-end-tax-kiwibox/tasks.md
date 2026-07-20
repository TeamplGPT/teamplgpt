# Tasks: hr-year-end-tax 5240 HR(kiwibox) 직접 통합

승인: 최신연도 기본+지원연도 지정 / 확정 6종 / 주민번호·계좌·PK·코드값 제외 (2026-07-16).
실측 조정: result 매핑 불가(YndList=대상자 메타, YndCal=계산 프로시저) → summary에 통합, **5종**.
상태: T1~T4 완료 + 스모크 PASS. T5·T6 잔여.

## 실측 완료

- 연말정산=YTA, `REW/YTA{연도}/`. 컨트롤러 연도별 분리(`/YTA{Name}Mgr{YYYY}.do`) — cal_yy=경로 연도.
- self 강제=cmmSearchStaffId 일관. 주민번호(CTZ_NO 등) 반환 14파일 → 화이트리스트 제외.
- result: YndList 반환=CTZ_NO_DECRYPT/ORG_NM뿐(대상자 메타), YndCal=proc(조회 아님)
  → 결정세액은 summary에 포함(P_INCOME_TAX_AMT 등)이므로 summary 겸용, result 제거.

## 완료

- [x] **T2** handler.js v2.0.0 — 5종(summary/medical/family/previous_employer/donation),
  cal_yy→경로 연도(지원 2022~2025, 기본 최신), cmmSearchStaffId self 강제,
  query_type별 컬럼 화이트리스트(주민번호·계좌·PK·코드값 제외), hrSession 공용
- [x] **T3** plugin.json v2.0.0 — emp_no 제거, cal_yy, 5종 매핑, hr-personnel 경계 유지,
  민감정보 미제공 명시
- [x] **T4** 브리지 YTA 정규식 화이트리스트(`YTA_PATH_RE`) — 5 endpoint × 4연도만 허용
- [x] 스모크 PASS: 주민번호/코드/PK 제외 실증, 연도 경로(기본 2025·지정 2024),
  미지원 연도 안내, 브리지 정규식(2019·임의 endpoint 차단), self 강제, pending 누수 0

## T5 실측 완료 (2026-07-16) — 4종 추가 (v2.1.0)

- credit_card/insurance/education/savings = 소득공제 입력화면 `YTAInDctMgr` 탭별:
  Tab08 신용카드 / Tab13 보장성보험 / Tab15 교육비 / Tab06 연금저축 (JSP 라벨로 확정).
- 경로 `/YTAInDctMgr{YYYY}.do?cmd=getYTAInDctMgrTab{NN}List`, self=cmmSearchStaffId.
- **주민번호 없음. 단 Tab06(연금저축)에 계좌(BANK_CD/ACC_NO) → 제외.** 유형 코드값(*_TYPE_CD raw)도 제외.
- 화이트리스트: FAM_NM·금액 컬럼만. 브리지 정규식에 InDctMgr 추가.
- 스모크 PASS: 계좌/코드/PK 제외 실증, InDct 경로+Tab cmd, cal_yy 반영.
- → query_type 5종 → **9종** (현행 구 skill 10종 중 result만 제외, 나머지 전부 kiwibox 반영).

## 잔여

- [ ] **T5b 실측(운영)**: family 관계(RELATION) 컬럼 유무, 각 endpoint 응답 키 케이스,
  경로 패턴 실호출 검증(YTAInDctMgr2025.do 등), 최신연도 하드코딩 갱신 유지보수
- [ ] **T6** okrservice 지시서 §1.5에 YTA 정규식 규칙(InDctMgr 포함) 추가 + E2E.
  embed allowed skills 정책 재확인(kiwibox 전환 후)
