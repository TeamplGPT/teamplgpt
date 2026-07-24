# Quickstart: 검증 가이드 — 011 HR 엔드포인트 재정렬

## 전제

1. AnythingLLM 서버 기동: 리포 루트 `yarn dev:all` → `curl http://localhost:3001/api/ping` 200.
2. 테스트 워크스페이스(`eshelsoft` 또는 `E2E_WORKSPACE_SLUG`)에 HR skill 6종 활성.
3. **HR skill setup_args를 서버 폴백 + mock으로 전환** (E2E 동안):
   - `HR_BASE_URL=http://localhost:8000`
   - `HR_SESSION_COOKIE=JSESSIONID=e2e-dummy`
   - `HR_STAFF_ID=100:2007:00204:kkHT` (임의값 가능 — mock은 값 무검증, body 로깅용)
   - hr-attendance `HR_WKAREA_CD=1000` (신규)
4. 포트 8000 비점유 (`lsof -i :8000`).

## E2E (L3) — FAIL-first 순서

```bash
# 0) 스위트 재편: 기존 scenarios.json → scenarios-legacy-20260716.json 보존,
#    신규 스위트(BODY 검증 + legacy 개편분)로 교체 (FR-015)

# 1) runner 확장 + 신규 스위트 반영 후, BODY 검증 시나리오만 실행 → FAIL 확인
E2E_ONLY=<BODY 검증 ID 목록, tasks.md 확정> npm run e2e:hr-skill

# 2) handler/plugin 수정 후 동일 명령 → PASS

# 3) 전체 스위트 (legacy 개편분 포함 행태 회귀)
npm run e2e:hr-skill
```

신규 BODY 검증 시나리오(ID 체계 tasks.md 확정)는 각 query_type의 `.do` path + `mock_body_pattern`으로 신판 필수 파라미터 전량을 검증한다. 예: E131 연차잔여 → `mock_url_pattern: "^/TAADclzVcatnList\\.do"`, `mock_body_pattern: ["cmd=getTAADclzVcatnList1", "chkAppYn=Y", "wkareaCd=", "searchSymdLv=\\d{4}0101", "searchBaseYmd=\\d{4}-\\d{2}-\\d{2}"]`.

## 단위 검증 (L2)

```bash
node --test server/storage/plugins/agent-skills/_shared/__tests__/
# hrSession 언랩(Map/codeList)·todayDashed·monthsAgoFirstYmd 테스트 추가분 포함
```

## 실동작 검증 (운영 스모크 — 완료 보고 전)

1. setup_args를 실환경(`https://ntest.5240.kr` + 실세션 쿠키 또는 embed 위임)으로 복원.
2. 채팅에서 확인:
   - "연차 얼마 남았어?" → 종류별 발생/사용/잔여 테이블 (NULL 아님 = SC-002)
   - "이번 달 출퇴근 기록" → TAA-1410 기반 테이블
   - "6월 급여명세" → pay_periods → payslip 2단 체인 정상
   - "월별 급여 이력" → SAL-0050 테이블
3. 렌더에 주민번호·계좌·주소 미노출 육안 확인 (SC-005).
4. 3-Mode: @agent 모드 + chat/query 모드 각 1회, embed 위젯(클라이언트 위임) 1회 — 브리지가 신규 `.do` path를 제한 없이 통과시키는지 확인.

## 판정 기준 요약

- 신규 E2E 전건 PASS (수정 전 FAIL 재현 로그 보존 — `runs/{ts}/result.json`)
- SC-004: `grep -rn "MBLLeavDetail\|MBLHomeLeave\|WrkTimeListMgrByDate\|SalaryDtstmn" server/storage/plugins/agent-skills/` → 0건
- 계약 불변: 6개 plugin.json diff가 HR_WKAREA_CD 신설 + salary_statement 라벨 문구에 한정
