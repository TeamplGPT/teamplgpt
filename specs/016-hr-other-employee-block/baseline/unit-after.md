# 단위 테스트 변경 후 비교 (016 T028)

- 실행: `cd server && npx jest --json` (Node v18.19.0), US1~US3 구현 완료 후
- 비교 대상: `unit-baseline.md`·`unit-baseline-passed.txt` (T001 — 015 + 즉시 완화 가드)

| 항목 | 기준선 | 변경 후 |
|---|---|---|
| 스위트 (통과/실패/전체) | 67 / 11 / 79 | 69 / 11 / 81 |
| 테스트 (통과/실패/건너뜀/전체) | 1161 / 98 / 9 / 1268 | 1171 / 98 / 9 / 1278 |
| 골든 스냅샷 | 188 | 155 (의도적 정리 33 — T018, 정리 전후 비교 "삭제만") |
| **새로 생긴 실패** | — | **0건** (실패 이름 98건 동일) |
| 기준선 통과 → 이름이 사라진 테스트 | — | 39건 — 전부 D8 의도적 정리(아래) |
| 새 통과 | — | 49건 |

1161 − 39 + 49 = 1171.

## 기준선 통과 → 사라진 39건 (전부 spec D8 / contracts/test-expectations.md §5)

- 015 골든 `period-golden.test.js`: vacation_calendar 4 · birthday 4 · approval pending/completed/rejected/referenced 16 = 24
- 015 골든 보강 `period-golden-extra.test.js`: approval completed 9
- `period-year-mode.test.js`:
  - 결재 pending·completed·rejected·referenced 연도 테스트 4
  - birthday 연도 테스트 1
  - vacation_calendar 연도 테스트 1 — "제공 중단(호출 0 + 거절 문구)" 테스트로 이름을 바꿔 새로 통과

```text
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=(빈 문자열)
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=202512
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=2026-03
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=2026년 3월
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=3
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=3(숫자)
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=3월 전체
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=다음달
__tests__/storage/plugins/agent-skills/period-golden-extra.test.js › 기간 파라미터 골든 보강 — 연도 단위가 아닌 입력은 변경 전과 동일 (specs/015 L-10) hr-approval completed year_month=올해 3월
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval completed year_month=(없음)
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval completed year_month=202503
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval completed year_month=3월
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval completed year_month=지난달
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval pending year_month=(없음)
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval pending year_month=202503
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval pending year_month=3월
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval pending year_month=지난달
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval referenced year_month=(없음)
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval referenced year_month=202503
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval referenced year_month=3월
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval referenced year_month=지난달
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval rejected year_month=(없음)
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval rejected year_month=202503
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval rejected year_month=3월
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-approval rejected year_month=지난달
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-attendance vacation_calendar year_month=(없음)
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-attendance vacation_calendar year_month=202503
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-attendance vacation_calendar year_month=3월
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-attendance vacation_calendar year_month=지난달
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-personnel birthday year_month=(없음)
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-personnel birthday year_month=202503
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-personnel birthday year_month=3월
__tests__/storage/plugins/agent-skills/period-golden.test.js › 기간 파라미터 골든 — 월 단위·기간 없음 입력은 변경 전과 동일 (specs/015) hr-personnel birthday year_month=지난달
__tests__/storage/plugins/agent-skills/period-year-mode.test.js › range 모드 — 1회 호출, 기간만 1년 (US1) 결재 completed 올해 → sdt/edt 1/1~오늘
__tests__/storage/plugins/agent-skills/period-year-mode.test.js › range 모드 — 1회 호출, 기간만 1년 (US1) 결재 pending 올해 → sdt/edt 1/1~오늘
__tests__/storage/plugins/agent-skills/period-year-mode.test.js › range 모드 — 1회 호출, 기간만 1년 (US1) 결재 referenced 올해 → sdt/edt 1/1~오늘
__tests__/storage/plugins/agent-skills/period-year-mode.test.js › range 모드 — 1회 호출, 기간만 1년 (US1) 결재 rejected 올해 → sdt/edt 1/1~오늘
__tests__/storage/plugins/agent-skills/period-year-mode.test.js › 일정 조회 — 올해도 1/1~12/31 (US2) birthday 이번년도 → staYmd/endYmd 1년 + 머리 줄
__tests__/storage/plugins/agent-skills/period-year-mode.test.js › 일정 조회 — 올해도 1/1~12/31 (US2) vacation_calendar 2026 → searchSYmd/EYmd 1/1~12/31
```

## 새 통과 49건

```text
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › org_members 렌더 (US3) 성명·소속·직위·직책만 보이고 사번·회사·근무정보·근무상황은 나오지 않는다
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-approval completed → 제공 중단
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-approval drafted → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-approval pending → 제공 중단
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-approval referenced → 제공 중단
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-approval rejected → 제공 중단
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-attendance annual_leave_balance → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-attendance leave_requests → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-attendance undefined → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-attendance vacation_calendar → 제공 중단
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-attendance work_calendar → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-personnel birthday → 제공 중단
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-personnel org_members → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-personnel org_tree → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-personnel schedule_day → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-personnel schedule_titles → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-personnel todo_count → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 hr-salary pending → 유지
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › otherEmployee 모듈 — 제공 중단 조회 판정 거절 문구는 고정이며 가드 메시지 접두(> ⚠️)를 쓴다
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-approval completed {"year_month": "작년"} → 호출 0건 + 거절 문구
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-approval pending {} → 호출 0건 + 거절 문구
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-approval referenced {} → 호출 0건 + 거절 문구
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-approval rejected {} → 호출 0건 + 거절 문구
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-approval 잘못된 query_type 안내에 제공 중단 값(pending)이 나오지 않는다
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-attendance vacation_calendar {"year_month": "올해"} → 호출 0건 + 거절 문구
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-attendance vacation_calendar {} → 호출 0건 + 거절 문구
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-attendance 잘못된 query_type 안내에 제공 중단 값(vacation_calendar)이 나오지 않는다
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-personnel birthday {"year_month": "3월"} → 호출 0건 + 거절 문구
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-personnel birthday {} → 호출 0건 + 거절 문구
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) hr-personnel 잘못된 query_type 안내에 제공 중단 값(birthday)이 나오지 않는다
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) 기안함(drafted)은 그대로 조회한다
__tests__/storage/plugins/agent-skills/other-employee-block.test.js › 제공 중단 조회는 HR 호출 없이 거절한다 (US2) 미결 건수(todo_count)는 그대로 조회한다
__tests__/storage/plugins/agent-skills/period-year-mode.test.js › 일정 조회 — 올해도 1/1~12/31 (US2) vacation_calendar 2026 → 다른 직원 정보라 제공 중단(호출 0 + 거절 문구, specs/016)
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice args JSON이 깨져 있으면 예외 없이 안내를 붙인다
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice args가 JSON 문자열이어도 조직도 예외를 판정한다
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice hr tool 문자열 결과 끝에 안내를 붙인다
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice hr- 가 아닌 tool·문자열이 아닌 결과는 그대로 둔다
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice 안내 문구는 다른 직원 질문에 이 결과로 답하지 말라고 지시한다
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice 오류·가드 접두(Error / > ⚠️)는 맨 앞에 그대로 남는다
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice 조직도(hr-personnel org_members)에는 붙이지 않는다
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice 조직도(hr-personnel org_tree)에는 붙이지 않는다
__tests__/utils/hrSelfDataNotice.test.js › withSelfDataNotice 조직도가 아닌 hr-personnel 조회에는 붙인다
__tests__/utils/hrSelfDataNotice.test.js › wrapHrRuntime (@agent) hr skill handler를 this 보존으로 호출하고 결과에 안내를 붙인다
__tests__/utils/hrSelfDataNotice.test.js › wrapHrRuntime (@agent) hr skill이 아니면 원래 runtime을 그대로 돌려준다
__tests__/utils/hrSelfDataNotice.test.js › wrapHrRuntime (@agent) 원래 runtime 객체를 바꾸지 않는다
__tests__/utils/hrSelfDataNotice.test.js › wrapHrRuntime (@agent) 조직도 호출은 감싸도 안내를 붙이지 않는다
utils/chats/toolCalling/__tests__/loop.test.js › toolCallingLoop — HR 결과 본인 데이터 안내 (016) hr tool 결과 끝에 안내가 붙어 모델에 전달된다
utils/chats/toolCalling/__tests__/loop.test.js › toolCallingLoop — HR 결과 본인 데이터 안내 (016) 가드 판정(resultIsGuardrail)은 안내를 붙이기 전 원래 결과로 계산한다
utils/chats/toolCalling/__tests__/loop.test.js › toolCallingLoop — HR 결과 본인 데이터 안내 (016) 조직도(hr-personnel org_members)와 hr가 아닌 tool은 그대로 전달된다
```

## 최종 (코드 리뷰·재검토 반영 후)

- 실행: `cd server && npx jest --json` (Node v18.19.0)

| 항목 | 기준선 | 최종 |
|---|---|---|
| 스위트 (통과/실패) | 67 / 11 | 71 / 11 |
| 테스트 (통과/실패/전체) | 1161 / 98 / 1268 | 1221 / 98 / 1328 |
| **새로 생긴 실패** | — | **0건** |
| 기준선 통과 → 사라진 테스트 | — | 39건 — 위 D8 의도적 정리와 같은 목록(골든·연도 모드 밖 0건) |
| 새 통과 | — | 99건 |

새로 추가한 테스트 파일:
- `__tests__/utils/hrSelfDataNotice.test.js`: 안내 종류, 조회 결과가 아닌 응답, 차단 skill, 바꿔 부른 이름, 8,000자 한도
- `__tests__/utils/agents/imported.hrNotice.test.js`: @agent 연결
- `__tests__/scripts/e2e-hr-skill-expectations.test.js`: E2E 판정 모듈
- `other-employee-block.test.js`의 원형 키·비문자열 query_type 케이스와 거절 문구 일치 확인
- `loop.test.js`의 조직도 안내·차단 skill 케이스

실패 98건은 기준선과 이름까지 같다. 모두 016 이전부터 실패하던 것이다(목록: unit-baseline.md).

## 016 후속 (research R14)

- 1230 통과 / 98 실패 / 1337. **새 실패 0**. 사라진 39건은 위와 같은 의도적 정리.
- 추가: `withHrRefusalTool` 형식 3종·불변·중복 방지·HR 없음, 거절 선택지 차단, 안내 문구 R14 문장, loop 강제 호출 시 거절 선택지 부착·실행 안 함·비강제 미부착. 변경: loop TC-8(강제 시 tool 목록에 거절 선택지 포함).
- 코드 리뷰 반영 후: 1236 통과 / 98 실패 / 1343, **새 실패 0**.
