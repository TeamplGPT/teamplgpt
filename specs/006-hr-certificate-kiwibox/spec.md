# Feature Specification: hr-certificate (증명서) 신규 skill

**Feature Branch**: `feat/5240hr`
**Created**: 2026-07-16
**Status**: **specify 단계 — 사용자 승인 대기 (풀 게이트)**
**Input**: kiwibox_eGov4.2 `spec-docs/SYS/CMM/cmmAiAssistantToolEndpoints.md` §4.6 + kiwibox 소스 실측

## 무엇을 (What)

본인 증명서 신청내역(재직/경력/퇴직 등)을 5240 HR(kiwibox)에서 조회하는 신규 agent-skill.
R1 클라이언트 위임 구조(003)·hrSession 공용. hubId `hr-certificate`. 목록 조회 전용.

## 왜 (Why)

카탈로그 §4.6 증명서 도메인 미반영. 데스크탑 정본(웹 `CTIMcrtfReqstRefromMgr`)이
staffId 기반이라 self 강제로 안전하게 도구화 가능 — kiwibox 소스 실측으로 확정.

## 실측 (kiwibox 소스)

- 정본: `CTIMcrtfReqstRefromMgr.do?cmd=getCTIMcrtfReqstRefromMgrList`
- **self 강제 가능**: `<if test='reqNoExist=="N"'> AND A.STAFF_ID = #{staffId}`
  ([CTIMcrtfReqstRefromMgr_SQL.xml:64](../../../5240/kiwibox_eGov4.2/kiwibox/src/main/resources/kiwibox/sqlmap/OPR/CTI/CTIMcrtfReqstRefromMgr_SQL.xml#L64)).
  → `reqNoExist='N'` + `staffId=$SELF_STAFF_ID`로 본인 신청내역만.
- **기간 파라미터 없음**: SQL에 REQ_YMD/APPL_YMD BETWEEN 조건 없음 — 본인 전체 신청내역 반환.
- `reqNo`는 outer-join 옵션(미전송 시 전체). reqNo 단건 상세(§4.4식 무검증 위험) 미사용.
- `applCd`: 재직/퇴직(20·21) 근속계산 기준일 분기용. 목록 조회 필수 아님(미전송 시 현재일 기준).
- 파라미터 전체: `reqNoExist`, `staffId`, `applCd`(옵션), `reqNo`(옵션), 세션(ssnStaffId 등).

## query_type ↔ 엔드포인트 계약

| query_type | 역할 | 엔드포인트 | 파라미터 | self |
|---|---|---|---|---|
| requests | 본인 증명서 신청내역 | getCTIMcrtfReqstRefromMgrList | reqNoExist=N, staffId=$SELF | c→self강제 |

- LLM 노출 파라미터: `query_type`만 (기간·reqNo 없음).
- `staffId`=`$SELF_STAFF_ID` 마커(self 강제), `reqNoExist`="N" 고정.
- 단일 query_type이지만 skill 컨벤션 유지(향후 발급상태 등 확장 여지).

## 목록 반환 컬럼 화이트리스트 (실측 — 민감 필드 선별)

- **노출**: `TYPE_NM`(증명서종류), `USE_NM`(용도), `REQ_STATUS_NM`/상태, 발급번호,
  `STAFF_NM`(성명), `ORG_NM`(소속), `POS_NM`(직위), `EMP_YMD`(입사일), `YEAR`/`MONTH`(근속),
  제출처, 신청일, `REQ_NO`(참조용)
- **제외**: `STAFF_ID`/`APPL_STAFF_ID`(내부 PK), SERVAREA_ID, 각종 코드값(TYPE_CD/USE_CD),
  **주소** — §4.6 민감(주소·인적사항). 증명서 목록엔 종류·용도·상태가 핵심, 주소 불요 → 제외
- 실제 응답 키 케이스(egovMap 소문자)는 handler 대소문자 대응(hr-approval과 동일)

## 보안·정책 (§7 — 조건부 중)

- 목록 self 강제(staffId 세션 치환)라 타인 조회 불가. reqNo 상세 미사용으로 §4.4식 위험 회피.
- 주소 화이트리스트 제외로 민감도 완화. 그럼에도 §7 "조건부(중)" — **고객사 정책 확인 후
  embed allowed skills 추가** 권고(급여·결재와 동일 게이트).

## 파급

- 브리지 allowlist += `/CTIMcrtfReqstRefromMgr.do` (extras + okrservice 지시서 §1.5, 20경로).

## 잔여 실측 (T5)

- `applCd` 미전송 시 전체 종류 반환되는지 (재직/경력/퇴직 혼재 목록)
- `reqNoExist='N'` 목록의 게이트 유무(§8) — self 강제라 방어되나 서버 게이트 있으면 이중
- 응답 키 케이스 → 컬럼 라벨 최종 매핑, 발급상태 필드명

## 범위 밖

- reqNo 단건 상세(주소·발급번호 전문) — §4.4식 무검증 위험, 미채택
- 증명서 발급 실행(출력·발급요청) — 조회 전용
