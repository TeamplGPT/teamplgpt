# HR skill raw 렌더 13종 — 컬럼 대조 화이트리스트 (kiwibox 정본 대조)

- 작성: 2026-07-28
- 목적: 화이트리스트 미정의 query_type 13종의 응답 컬럼을 kiwibox 정본(sqlmap SQL·spec-db Table/Function·화면 JSP/JS grid)과 3원 대조하여 노출/차단 화이트리스트 확정
- 근거 소스 루트: `/home/sdh/5240/kiwibox_eGov4.2` (sqlmap XML = 컬럼 정본, spec-db/Table = 한글 정의, JSP/JS = 화면 라벨)
- 현재 상태: `_shared/formatTable.js` `INTERNAL_KEYS`(servareaId·staffId·staffNo·corpId·loginId·oid)가 raw 폴백 최후 방어선으로 동작 중. 아래 화이트리스트 적용 시 각 handler `columns` 정의가 정본이 됨.

## 등급 정의

- **노출**: 화이트리스트 포함(한글 라벨 렌더)
- **차단**: 내부 식별자·코드값·중복·레거시 — 미노출
- **★긴급**: 민감정보 — 즉시 차단 필요
- **유지(기능)**: 내부값이지만 체이닝에 필요 — 노출 유지

## 1. hr-attendance (4종)

### 1.1 overtime — getTAADclzWorkOtSchdulList2 (주별 연장근무)

| API키 | 라벨 | 판정 |
|---|---|---|
| staffNm | 성명 | 노출 |
| orgNm | 소속 | 노출 |
| posNm | 직위 | 노출 |
| otWeek01~otWeek06 | 1주~6주 | 노출 |
| otWeekSum | 합계 | 노출 |
| staffId, workStaffId, orgCd, empOrder, staffNo | — | 차단 |

### 1.2 overtime_limit — getTAADclzWorkOtSchdulList (일별 연장근무 매트릭스)

| API키 | 라벨 | 판정 |
|---|---|---|
| staffNm | 성명 | 노출 |
| orgNm | 소속 | 노출 |
| posNm | 직위 | 노출 |
| ot01~ot31 | 1일~31일 | 노출 |
| sumOt | 합계 | 노출 |
| staffId, workStaffId, orgCd, empOrder, staffNo | — | 차단 |

### 1.3 work_calendar — getTAADclzWorkSearchCldr

| API키 | 라벨 | 판정 |
|---|---|---|
| ymd | 일자 | 노출 |
| workTypeNm | 근무유형 | 노출 |
| holidayNm | 공휴일 | 노출 (spec-db TAAT_CLDR 정의 "공휴일명칭" — SQL 주석 "휴가자"는 오기) |
| mark | 상태 | 노출 |
| kind, wktypeCd, reqNo | — | 차단 |

### 1.4 vacation_calendar — getTAADclzVcatnCldrMgr

| API키 | 라벨 | 판정 |
|---|---|---|
| title | 내용 | 노출 |
| leavNm | 휴가종류 | 노출 |
| personInfo | 직원정보 | 노출 |
| orgNm | 소속 | 노출 |
| posNm | 직위 | 노출 |
| resNm | 직책 | 노출 |
| wktypeNm | 근무유형 | 노출 |
| staYmd | 시작일 | 노출 |
| endYmd | 종료일 | 노출 |
| staHm | 시작시각 | 노출 |
| endHm | 종료시각 | 노출 |
| agentName | 대결자 | 노출 |
| reason | 사유 | 노출 |
| note | 비고 | 노출 |
| kind, leavCd, orgCd, posCd, resCd, wktypeCd, endYmdAdd, allDay, reqStatusCd, hideLeavCds | — | 차단 |

## 2. hr-salary (4종)

### 2.1 payslip — getSALPayslipNewMgrList

| API키 | 라벨 | 판정 |
|---|---|---|
| salItemNm | 지급항목 | 노출 |
| salTypeNm | 지급구분 | 노출 |
| salYm | 급여연월 | 노출 |
| salAmt | 지급금액 | 노출 (본인 명세) |
| resalAmt | 소급금액 | 노출 |

### 2.2 deductions — getSALPayslipNewMgrList2

| API키 | 라벨 | 판정 |
|---|---|---|
| salItemNm | 공제항목 | 노출 |
| salYm | 급여연월 | 노출 |
| salAmt | 공제금액 | 노출 |

### 2.3 payslip_summary — getSALPayslipNewMgrMap (resultMap 고정 키)

| API키 | 라벨 | 판정 |
|---|---|---|
| staffNm | 성명 | 노출 |
| orgNm | 소속 | 노출 |
| posNm | 직위 | 노출 |
| resNm | 직책 | 노출 |
| empYmd | 입사일 | 노출 |
| salYmd | 급여일자 | 노출 |
| jtotAmt | 지급총액 | 노출 |
| gtotAmt | 공제총액 | 노출 |
| ctotAmt | 실지급액 | 노출 |
| staffId, staffNo, salTypeCd, salKindCd, retYmd, notice(CLOB/HTML) | — | 차단 |

### 2.4 daylabor — getSALDaylabMgrList (68컬럼)

★긴급 차단: **accNo(계좌번호 암호문)·accNoDecrypt(계좌번호 복호화 평문)·bankCd** — 현재 raw 렌더 시 계좌번호 평문 노출 경로 존재. `cryptAuthYn`은 화면 마스킹 판단용일 뿐 서버단 차단 아님.

| API키 | 라벨 | 판정 |
|---|---|---|
| workYmd | 근무일자 | 노출 |
| salYmd | 급여일자 | 노출 |
| staffNm | 성명 | 노출 |
| corpNm | 회사 | 노출 |
| orgNm | 소속 | 노출 |
| posNm | 직위 | 노출 |
| clsNm | 직급 | 노출 |
| empTypeNm | 직원구분 | 노출 |
| wktypeNm | 근무유형 | 노출 |
| staTime | 출근시간 | 노출 |
| endTime | 퇴근시간 | 노출 |
| workTime | 정상근무시간 | 노출 |
| overTime | 연장시간 | 노출 |
| hourlyAmt | 시급 | 노출 |
| dailyAmt | 일급 | 노출 |
| otAmt | 연장수당 | 노출 |
| etcAmt | 추가금액 | 노출 |
| payAmt | 지급액 | 노출 |
| taxEarnAmt | 과세금액 | 노출 |
| ntaxEarnAmt | 비과세금액 | 노출 |
| itaxAmt | 소득세 | 노출 |
| rtaxAmt | 지방소득세 | 노출 |
| insuranceAmt | 고용보험 | 노출 |
| deducAmt | 공제액 | 노출 |
| rpayAmt | 실지급액 | 노출 |
| memo | 특이사항 | 노출 |
| accNo, accNoDecrypt, bankCd | — | **★긴급 차단** |
| servareaId, staffId, staffNo, corpId, orgCd, posCd, resCd, clsCd, salClassCd, wkareaCd, wktypeCd, empTypeCd, salKindCd, cryptAuthYn, costcnCd, chgStaffId, chgDate | — | 차단 |
| salClassNm | — | 차단 (SQL alias 중복 — 호봉명이 은행명에 덮어써짐, 값 신뢰 불가. spec-db `SALDaylabMgr_SQL.md:41` 박제) |
| statYm, fixYn, closeYn, resNm, salKindNm, costcnNm, nextYn, baseTime, offTime, nightTime, hworkTime, hoverTime, hnightTime, nightAmt, hworkAmt, hoverAmt, hnightAmt, incomeDeducAmt, note | — | 선택 (2차 상세 — 기본 미노출 권장, 표 폭 억제) |

## 3. hr-personnel (5종)

### 3.1 org_tree — getMBLHrBassiemOrgList

| API키 | 라벨 | 판정 |
|---|---|---|
| orgNm | 조직명 | 노출 |
| orgFnm | 조직전체명 | 노출 |
| chiefInfo | 조직장 | 노출 |
| staffCnt | 인원수 | 노출 |
| orgCd | 조직코드 | 유지(기능) — org_members 체이닝 필수 |
| priorOrgCd | 상위조직코드 | 유지(기능) — 트리 계층 |
| level, seqNo, staYmd, endYmd | — | 차단 |

주의: `_LEVEL` 별칭은 EgovMap 변환 시 키가 `Level`(대문자 시작)일 수 있음 — 차단 목록에 두 표기 모두 반영.

### 3.2 org_members — getMBLHrBassiemMemberList

| API키 | 라벨 | 판정 |
|---|---|---|
| staffNm | 성명 | 노출 |
| staffNo | 사번 | 노출 (조직원 목록 업무상 필요) |
| orgNm | 소속 | 노출 |
| posNm | 직위 | 노출 |
| resNm | 직책 | 노출 |
| corpNm | 회사 | 노출 |
| workType | 근무정보 | 노출 |
| workInfo | 근무상황 | 노출 (화상조직도 모드 한정 출력) |
| detail, seqNo, empOrder(alias 중복), staffId, orgCd, orgCdOld, orgCdNew, posSeqNo, name(staffNm 중복), imgExYn | — | 차단 |

민감 없음 확인: CMMF_DECR 0건 (`cmmAiAssistantToolEndpoints.md:244,248`).

### 3.3 contact_directory — getContactList

| API키 | 라벨 | 판정 |
|---|---|---|
| staffNm | 성명 | 노출 |
| orgNm | 소속 | 노출 |
| posNm | 직위 | 노출 |
| resNm | 직책 | 노출 |
| positionNm | 담당업무 | 노출 |
| corpTel | 전화 | 노출 (회사 대표번호 — 공개 성격) |
| staffId, orgCd, staffNo, seq | — | 차단 |

### 3.4 schedule_day — getScheduleDay

| API키 | 라벨 | 판정 |
|---|---|---|
| md | 날짜(월일) | 노출 |
| holidayYn | 공휴일여부 | 노출 |
| result | 건수 | 노출 |

집계 전용 — 개인 식별자 미노출 확인.

### 3.5 todo_count — getTodoIconCnt

| API키 | 라벨 | 판정 |
|---|---|---|
| cnt1 | 미확인 할일 | 노출 |
| cnt2 | 미확인 쪽지 | 노출 |
| cnt3 | 미결 결재 | 노출 |

## 4. 종합 판정

1. **★긴급**: `hr-salary.daylabor` — 계좌번호 평문(`accNoDecrypt`)·암호문(`accNo`)·은행코드 raw 노출 경로. 화이트리스트 적용 전이라도 `INTERNAL_KEYS` 계열 차단 우선 반영 가치 있음.
2. SERVAREA_ID·CORP_ID·LOGIN_ID는 13종 중 daylabor 외 최외곽 미출력 (WHERE/함수 인자 전용) — empcard(기수정)와 daylabor가 예외였음.
3. `getMBLPrtEmpCard`(profile)·`profile_detail`은 2026-07-28 화이트리스트 적용 완료 — 본 문서 범위 외.
4. 구현 시 각 handler `columns`(또는 `COLUMNS_BY_QT`) 정의 추가로 기존 `renderWhitelisted`/`formatWhitelisted` 경로 재사용 — handler 3파일 + E2E fixture/시나리오.
5. 부수 발견(kiwibox 원천 결함, 본 리포 범위 외): `main.js:2462` `ofcTel` 참조 오류(SQL은 corpTel — 전화 칸 항상 공백), `mblHrBassiemList.jsp` `posResNm` 미생성 참조, `SALDaylabMgr` `SAL_CLASS_NM` alias 중복.
