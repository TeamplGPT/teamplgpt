# Contract: 위젯 버튼 ↔ 5240 PC 프로그램 대응표 (확정안)

위젯 버튼 34개(okrservice `chatbotMenus.ts` `CHATBOT_MENUS`) 전부의 판단 기준. 규칙은 [research.md R3·R3a](../research.md) — 직원용 PC 메뉴(menu01)에 같은 기능으로 걸린 프로그램만 짝짓는다.

- **progCd**: PC 메뉴 행의 `progCd`가 목록 중 하나와 같으면 PC 권한 있음.
- **applCd**: PC **결재 화면 행**(`progFile`이 `/EAPApprovalMgr.do`)의 `applCd`가 같으면 PC 권한 있음. 관리·조회 화면 행에 붙은 `applCd`는 보지 않는다. 결재 화면으로 여는 버튼(사직서(직원))은 그 행으로 여는 주소(progCd·dataRwType)를 만들 수 있을 때만 연다(코드 리뷰 반영 2026-11-17). 직원용 행이 없고 담당자용(menu02) 행만 있으면 그 행의 쓰기 권한 값으로 연다 — 담당자 메뉴로 그 신청서 권한을 받은 사람이므로 허용.
- **없음**: PC 권한을 보지 않는다 → 모바일 권한만으로 판단.
- **항상 허용**: 권한 조회 결과와 무관하게 보임(현행).

| id | 버튼 | PC 기준 | 값 |
|---|---|---|---|
| main | 출퇴근 체크 | 항상 허용 | — |
| password | 비밀번호변경 | 항상 허용 | — |
| worktimechg | 출퇴근변경 | progCd | TAA-0990, TAA-0980 |
| schedule | 근무일정조회 | progCd | TAA-0950 |
| leave | 휴가신청 | progCd | TAA-0070, EAP-5490 |
| overtime | 연장근무신청 | progCd | TAA-0430 |
| business | 출장신청 | progCd | BTR-0040, BTR-0042 |
| halfleave | 조퇴/외출신청 | progCd | TAA-0075 |
| conleave | 경조휴가신청 | progCd | TAA-0076 |
| approval | 결재함 | progCd | EAP-0070, EAP-0400 |
| ctsmn | 경조금신청 | progCd | CAC-0010 |
| worktype | 근무유형신청 | progCd | TAA-0140 |
| flex2w | 탄력신청(2주) | progCd | TAA-0860 |
| flex3w | 탄력신청(3주) | progCd | TAA-0870 |
| replcholiday | 대체휴무신청 | progCd | TAA-0470, TAA-0471 |
| education | 교육신청 | progCd | EDU-0200, EDU-0070 |
| tuition | 학자금신청 | progCd | SCE-0020 |
| certificate | 증명서신청 | progCd | CTI-0010 |
| salary | 급여명세서 | progCd | SAL-0527, SAL-0220, SAL-0230 |
| grievance | 고충신고서 | applCd | 5470 |
| resign | 사직서(직원) | applCd | 1590 |
| resignhitachi | 사직서(히타치) | applCd | 6000-303 |
| uniform | 근무복신청서 | applCd | 5200-303 |
| flexmonth | 선택신청(월) | progCd | TAA-0880 |
| replcholidaypers | 대체휴무신청(개인) | 없음 | — |
| cancelappl | 결재취소신청 | progCd | EAP-0110 |
| empcard | 인사카드 | progCd | PRC-0090 |
| orgmembers | 조직원조회 | progCd | PRC-6000 |
| leavestatus | 휴가현황 | progCd | TAA-0490 |
| otschedule | 연장근무현황 | 없음 | — |
| attendstatus | 출근현황 | 없음 | — |
| leavecalendar | 휴가캘린더 | progCd | TAA-0370 |
| otlist | OT현황 | 없음 | — |
| notice | 게시판 | 없음 | — |

합계: progCd 23 · applCd 4 · 없음 5 · 항상 허용 2 = 34. (2026-11-17 실측 반영 — research R3a, 사용자 승인)

**불변식(테스트로 고정)**

1. 표의 id 집합 = `CHATBOT_MENUS`의 id 집합(버튼 추가 시 표에 행이 없으면 테스트 실패 → 기본은 "없음").
2. 어느 버튼도 PC 권한 없음 + 모바일 권한 없음 + 항상 허용 아님이면 보이지 않는다(spec D10).
3. progCd 값은 대분류 "모바일" 프로그램(MOS-·EDU-0201 등)을 담지 않는다.
