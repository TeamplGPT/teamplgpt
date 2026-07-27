# Feature Specification: HR 조회 답변 품질 제어 (echo·fan-out 억제)

**Feature Branch**: `012-hr-answer-quality`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "HR skill 조회 결과를 LLM이 통째로 재출력하는 문제 개선 — 고정 길이 제약(1~3문장) 없이 질문 적합적 요약을 유도하는 응답 제어 설계. echo(표 통짜 재출력)와 fan-out(질문 하나에 query_type 과잉 호출) 두 원인 모두 해결."

## 배경 및 문제

사용자가 "남은 연차 개수는?"처럼 특정 값을 묻는 자연어 질문을 하면, HR agent skill이
조회 데이터를 markdown 표로 반환하고 LLM이 그 표를 **통째로 재출력**한다(echo).
또한 "이번 달 지각" 같은 질문 하나에 query_type 3건(work_status·work_calendar·timesheet)이
**과잉 호출**되어(fan-out) 무관한 표까지 답변에 유입된다. 결과: 사용자는 질문의 답
한 줄을 얻기 위해 수십 행의 표를 읽어야 한다.

고정 분량 제약("1~3문장 요약")은 목록성 질문의 답변 품질을 훼손하므로 배제한다.
제어 원칙은 **질문 유형 적응**: 답변의 형식·분량을 질문이 결정하게 한다.

## 사전 결정표 (브레인스토밍 승인 완료)

| ID | 결정 사항 | 선택 | 근거 |
|----|----------|------|------|
| D1 | 피처 범위 | echo 억제 + fan-out 억제 둘 다 | 답변 품질 저하의 두 원인을 한 스펙에서 봉합 |
| D2 | 응답 제어 철학 | 질문 유형 적응 규칙 (고정 분량 숫자 금지) | 단일값/내역/전체요청 3분기 조건부 규칙 — 인위적 통일 제약 배제 |
| D3 | 방어 계층 | 3겹: L1 description + L2 tool 결과 footer + L3 E2E | 헌장 IV Multi-Layer Defense 준수 |
| D4 | E2E 검증 방식 | 시나리오별 regex 쌍 + tool 호출 횟수 상한 | 결정적·재현 가능·기존 runner 패턴 연장. LLM judge 배제 |
| D5 | footer 주입점 | `_shared/formatTable.js` 렌더 함수 내부 | 1파일 수정으로 HR skill 7종 자동 적용, 각 skill handler.js 무수정 유지 |
| D6 | 헌장 IV 정합 | footer = "L2 코드 가드(출력 검증·enrichment)" 범주로 해석 | description 단독 제어가 아닌 Multi-Layer의 L2 층. CLAUDE.md에 예외 한 줄 명문화 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 단일값 질문은 값 중심 답변 (Priority: P1)

직원이 "남은 연차 개수는?"이라고 물으면, 잔여 연차 값과 이해에 필요한 최소 맥락
(발생/사용)만 답변으로 받는다. 무관한 휴가종류(배우자출산휴가, 난임휴가 등) 행이나
조회 표 전체가 답변에 나타나지 않는다.

**Why this priority**: 관측된 사용자 불편의 직접 원인. 가장 빈번한 질문 유형.

**Independent Test**: E2E 시나리오 — "남은 연차" 질문 후 최종 답변 텍스트에
잔여값 포함·무관 행 부재를 검증. 이 스토리 하나만 구현해도 체감 개선.

**Acceptance Scenarios**:

1. **Given** 연차 잔여 22일·유급휴가 등 6종이 조회되는 상태, **When** "남은 연차 개수는?" 질문, **Then** 답변에 연차 잔여값(22)이 포함되고 무관 휴가종류 행·표 전체 echo가 없다
2. **Given** 동일 상태, **When** "휴가 현황 전체 표로 보여줘" 질문, **Then** 전체 표가 제공된다 (명시 요청 예외)

---

### User Story 2 - 질문 하나에 조회 하나 (Priority: P2)

직원이 "이번 달 지각 있어?"라고 물으면 가장 적합한 조회 1건만 실행되고,
그 결과에서 질문 관련 값만 답변된다. 무관한 조회(월 근무캘린더, 출퇴근 기록)가
함께 실행되어 답변을 오염시키지 않는다.

**Why this priority**: fan-out은 echo를 증폭시키는 2차 원인 + 불필요한 HR 시스템 부하.

**Independent Test**: E2E 시나리오 — 지각 질문 후 tool 호출 횟수 1건·대상 query_type 검증.

**Acceptance Scenarios**:

1. **Given** 근무현황 조회 가능 상태, **When** "이번 달 지각 있어?" 질문, **Then** 조회 호출은 1건(work_status)이며 답변은 지각 여부 중심
2. **Given** 동일 상태, **When** 복합 질문("지각이랑 연차 잔여 알려줘"), **Then** 서로 다른 정보 요구에는 각각의 query_type 호출 허용 (억제 대상은 동일 정보의 중복 조회)

---

### User Story 3 - 내역성 질문은 관련 행만 추린 표 (Priority: P3)

직원이 "이번 달 휴가 사용내역 알려줘"처럼 목록을 요구하면, 고정 분량 제약 없이
질문과 관련된 행·열로 구성된 표를 받는다. 요약 강제(1~3문장)로 정보가 소실되지 않는다.

**Why this priority**: 고정 길이 제약의 부작용 방지 — 본 피처가 새 품질 문제를 만들지 않음을 보증.

**Independent Test**: E2E 시나리오 — 내역 질문 후 답변에 사용내역 행 존재를 검증.

**Acceptance Scenarios**:

1. **Given** 휴가 사용내역 2건 존재, **When** "휴가 사용내역 알려줘" 질문, **Then** 2건 모두 답변에 포함 (과요약으로 소실 금지)

---

### Edge Cases

- 조회 결과 0건: footer 지침 없이 기존 "조회 결과가 존재하지 않습니다" 안내 유지
- 사용자가 "전체", "상세", "표로" 등 명시 요청: 표 전체 출력 허용 (지침의 예외 분기)
- 후속 질문("그럼 유급휴가는?"): 직전 조회 데이터가 대화에 남아 있으면 재조회 없이 답변 가능 — 억제 대상 아님
- 복합 질문(서로 다른 정보 2개): query_type 2건 호출은 정상 — fan-out 억제는 "동일 질문에 대한 중복·추측성 병렬 조회"에 한정
- footer 문구 자체가 답변에 노출되는 회귀: E2E 금지 패턴으로 차단

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: HR 조회 skill의 tool 결과에는 질문 유형 적응 규칙(특정 값 질문 = 값+맥락 / 내역·현황 질문 = 관련 행·열 / 전체·상세 명시 요청 = 전체 표)을 담은 응답 지침이 포함되어야 한다. 지침에 고정 분량 숫자(문장 수·행 수 상한)를 두지 않는다.
- **FR-002**: 응답 지침은 HR 조회 skill 7종(hr-attendance, hr-salary, hr-personnel, hr-year-end-tax, hr-approval, hr-certificate, hr-welfare)의 표 렌더 경로에 공통 적용되어야 한다. 각 skill의 handler.js는 수정하지 않는다.
- **FR-003**: query_type 매핑표를 보유한 skill의 description에 "한 질문에는 가장 적합한 query_type 하나만 호출, 동일 정보의 중복·병렬 조회 금지" 가드를 추가해야 한다 (관측 사례인 hr-attendance 우선).
- **FR-004**: E2E runner는 시나리오별 최종 답변 텍스트 검증(필수 포함 패턴 목록, 금지 패턴 목록)과 tool 호출 횟수 상한 검증을 지원해야 한다.
- **FR-005**: 신규 E2E 검증 필드는 전부 옵셔널이어야 하며, 미사용 기존 시나리오의 판정 결과에 영향을 주지 않아야 한다.
- **FR-006**: 응답 지침 문구(footer 원문)는 사용자 최종 답변에 노출되지 않아야 한다.
- **FR-007**: 조회 결과 0건 경로·오류 경로의 기존 안내 문구는 변경하지 않는다.

### Key Entities

- **응답 지침(footer)**: 표 렌더 결과 말미에 부가되는 LLM 대상 소비 규칙. 데이터가 아니라 지시문 — 사용자 노출 금지 대상.
- **E2E 답변 assertion**: 시나리오 단위의 최종 답변 검증 기준 — 필수 포함 regex 목록 / 금지 regex 목록 / tool 호출 횟수 상한.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 단일값 질문("남은 연차 개수는?")의 답변에 정답 값이 포함되고, 무관 휴가종류 행·표 전체 재출력이 0건 (E2E 검증)
- **SC-002**: "이번 달 지각" 유형 질문에서 HR 조회 호출이 1건으로 수렴 (기존 3건 → 1건, E2E 검증)
- **SC-003**: 전체/상세 명시 요청 시 표 제공 동작 유지 — 과억제 회귀 0건 (E2E 검증)
- **SC-004**: 내역성 질문에서 관련 항목 소실 0건 — 고정 길이 부작용 없음 (E2E 검증)
- **SC-005**: 신규 시나리오 포함 E2E tier 전건 PASS + 기존 시나리오 회귀 0건

## Assumptions

- 헌장 IV 해석: tool 결과 footer는 "L2 코드 가드(출력 검증·enrichment)" 범주 — description 단독 제어 원칙의 위반이 아니라 Multi-Layer Defense의 L2 층 (결정 D6). CLAUDE.md에 예외 한 줄 명문화는 본 피처 범위에 포함.
- `docs/conventions/hr-skill-description-pattern.md`는 현재 리포에 부재(디렉토리 없음) — description 수정 시 §6 절차는 CLAUDE.md 요약 규칙(경계 키워드·매핑표 패턴)을 준용하고, 문서 부재 사실을 별도 이슈로 기록. T-A/T-B 템플릿 적용 대상 아님(주기 파라미터 신설·수정 없음).
- E2E 실행 환경은 기존과 동일: mock HR API(`:8000`) + AnythingLLM 서버(`:3001`), `npm run e2e:hr-skill`.
- 답변 품질 판정은 결정적 regex로 한다 — LLM judge 도입은 범위 밖 (결정 D4).
- footer 추가로 tool 결과가 수백 자 증가하나, 표 echo 제거로 상쇄 — 별도 성능 목표 없음.

## Out of Scope

- handler가 표 대신 사전 집계 데이터(지각 합계 등)를 반환하는 구조 변경 — 실측 본문 전량 원칙과 충돌 여지, 별도 피처
- aibitat(agent 프레임워크) 레벨 전역 지침 주입 — 업스트림 발산
- HR 외 일반 agent skill의 응답 품질 — 본 피처는 HR 7종 한정
- 후속 질문 캐싱·대화 메모리 최적화
