# 단위 테스트 기준선 (016 T001 — 015 + 즉시 완화 가드 E4 상태)

- 실행: `cd server && npx jest --json` (Node v18.19.0), 2026-10-15T12:34:36.103Z
- 스위트: 통과 67 · 실패 11 · 전체 79
- 테스트: 통과 1161 · 실패 98 · 건너뜀 9 · 전체 1268

## 실패 스위트

| 스위트 | 실패 테스트 수 | 비고 |
|---|---|---|
| `__tests__/e2e/hybrid-search.e2e.test.js` | 23 |  |
| `__tests__/models/workspaceLlmMessageLogs.test.js` | 1 |  |
| `__tests__/storage/plugins/agent-skills/hr-api-mock.integration.test.js` | 6 |  |
| `__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js` | 16 |  |
| `__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js` | 19 |  |
| `__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js` | 14 |  |
| `__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js` | 19 |  |
| `__tests__/storage/plugins/agent-skills/plugin-json-schema.test.js` | 0 | ● Test suite failed to run ENOENT: no such file or directory, open '/Users/shin-yeji/teamplgpt/server/storage/plugins/ag |
| `storage/plugins/agent-skills-backup/20260716/_shared/__tests__/dateResolver.test.js` | 0 | ● Test suite failed to run Your test suite must contain at least one test. |
| `storage/plugins/agent-skills/_shared/__tests__/dateResolver.test.js` | 0 | ● Test suite failed to run Your test suite must contain at least one test. |
| `storage/plugins/agent-skills/_shared/__tests__/hrSession.test.js` | 0 | ● Test suite failed to run Your test suite must contain at least one test. |

## 실패 테스트 전체 이름

```text
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-1: tsvector 생성 검증 plainto_tsquery로 한국어 검색이 매칭된다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-1: tsvector 생성 검증 모든 행에 text_search tsvector가 생성되어 있다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-1: tsvector 생성 검증 한국어 어절이 tsvector 토큰으로 분리되어 있다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-2: keywordSearchResponse 실제 DB 검증 pg_trgm similarity가 한국어에서 동작한다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-2: keywordSearchResponse 실제 DB 검증 영어 텍스트는 한국어 키워드 검색에 매칭되지 않는다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-2: keywordSearchResponse 실제 DB 검증 점수가 양수이고 내림차순이다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-2: keywordSearchResponse 실제 DB 검증 한국어 키워드로 관련 문서를 찾는다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-3: similarityResponse 실제 DB 검증 cosine distance가 유사도로 올바르게 변환된다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-3: similarityResponse 실제 DB 검증 먼 벡터는 낮은 유사도를 가진다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-3: similarityResponse 실제 DB 검증 쿼리 벡터와 유사한 문서가 상위에 위치한다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-4: hybrid search 전체 파이프라인 RRF 점수는 양쪽 랭킹에 모두 나타난 문서가 가장 높다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-4: hybrid search 전체 파이프라인 벡터+키워드 병렬 검색 후 RRF 융합이 올바르게 동작한다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-4: hybrid search 전체 파이프라인 벡터만 매칭되는 문서와 키워드만 매칭되는 문서가 모두 결과에 포함된다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-5: filterIdentifiers 적용 지정된 source가 키워드 검색 결과에서 제외된다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-6: 빈 결과 처리 매칭되지 않는 쿼리에 대해 빈 결과를 반환한다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-6: 빈 결과 처리 존재하지 않는 네임스페이스에서 검색하면 빈 결과
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-7: PGVector 모듈 메서드 직접 호출 connect()로 실제 DB에 연결할 수 있다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-7: PGVector 모듈 메서드 직접 호출 hybridSearchResponse()가 RRF 융합 결과를 반환한다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-7: PGVector 모듈 메서드 직접 호출 keywordSearchResponse()가 키워드 검색 결과를 반환한다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-7: PGVector 모듈 메서드 직접 호출 namespaceExists()가 테스트 네임스페이스를 찾는다
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-7: PGVector 모듈 메서드 직접 호출 performSimilaritySearch(hybridSearch=false) 벡터 전용 검색
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-7: PGVector 모듈 메서드 직접 호출 performSimilaritySearch(hybridSearch=true) 전체 파이프라인
__tests__/e2e/hybrid-search.e2e.test.js › Hybrid Search E2E (Real PostgreSQL) E2E-7: PGVector 모듈 메서드 직접 호출 similarityResponse()가 벡터 검색 결과를 반환한다
__tests__/models/workspaceLlmMessageLogs.test.js › WorkspaceLlmMessageLogs new should create a new LLM message log with all fields
__tests__/storage/plugins/agent-skills/hr-api-mock.integration.test.js › HR API mock integration hr-attendance가 year_month를 포함해 mock fetch를 호출한다
__tests__/storage/plugins/agent-skills/hr-api-mock.integration.test.js › HR API mock integration hr-personnel-search가 POST + JSON body로 university_names/region을 전달한다
__tests__/storage/plugins/agent-skills/hr-api-mock.integration.test.js › HR API mock integration hr-personnel-search가 빈 결과 응답을 '결과 없음' 메시지로 처리한다
__tests__/storage/plugins/agent-skills/hr-api-mock.integration.test.js › HR API mock integration hr-personnel이 mock fetch로 요청을 보내고 결과를 포맷한다
__tests__/storage/plugins/agent-skills/hr-api-mock.integration.test.js › HR API mock integration hr-salary가 compare 파라미터를 mock fetch까지 전달한다
__tests__/storage/plugins/agent-skills/hr-api-mock.integration.test.js › HR API mock integration hr-year-end-tax가 cal_yy를 mock fetch까지 전달한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler PARAMS_MAP 정합성 business_trips는 limit 파라미터를 허용해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler PARAMS_MAP 정합성 leave_requests는 months와 status 파라미터를 허용해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler PARAMS_MAP 정합성 overtime은 year_month 파라미터를 허용해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler PARAMS_MAP 정합성 timesheet은 year_month 파라미터를 허용해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler PARAMS_MAP 정합성 work_plan_weekly는 base_date 파라미터를 허용해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 날짜 파라미터 해석 (resolveDateParam 연동) 비표준 포맷 '2025-03'은 sugar-date가 '202503'으로 해석해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 날짜 파라미터 해석 (resolveDateParam 연동) 한국어 상대 표현 '어제'를 YYYYMMDD로 변환해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 날짜 파라미터 해석 (resolveDateParam 연동) 한국어 상대 표현 '지난달'을 YYYYMM으로 변환해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 날짜 파라미터 해석 (resolveDateParam 연동) 해석 불가 문자열은 제거되어야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 무효 파라미터 무시 annual_leave_balance에 year_month를 전달하면 무시해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 무효 파라미터 무시 work_type에 모든 선택 파라미터를 전달해도 무시해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 빈값/미전달 파라미터 처리 선택 파라미터가 null이면 전송하지 않아야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 빈값/미전달 파라미터 처리 선택 파라미터가 undefined이면 전송하지 않아야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 빈값/미전달 파라미터 처리 선택 파라미터가 빈 문자열이면 전송하지 않아야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 필수 파라미터 유효성 검증 emp_no가 없으면 에러 메시지를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-attendance-handler.test.js › hr-attendance handler 하위 호환성 선택 파라미터 없이 기존 방식으로 호출해도 정상 동작해야 한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler Guard: query_type 유효성 query_type이 enum에 없으면 에러를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler Guard: query_type 유효성 query_type이 없으면 에러를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler Guard: university_names 유효성 university_names 원소가 모두 공백·빈문자열이면 에러를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler Guard: university_names 유효성 university_names가 누락되면 에러를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler Guard: university_names 유효성 university_names가 배열이 아니면 에러를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler Guard: university_names 유효성 university_names가 빈 배열이면 에러를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler POST + JSON body 전송 baseUrl runtimeArgs가 없으면 default docker 주소를 사용한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler POST + JSON body 전송 region이 공백문자열이면 body에서 제외한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler POST + JSON body 전송 region이 제공되면 POST body에 함께 포함한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler POST + JSON body 전송 university_names 원소의 공백을 trim하고 빈 원소를 제외한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler POST + JSON body 전송 university_names만 있을 때 POST body에 배열만 포함하고 region은 생략한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler Truncation (MAX_RESULTS=200) items 210건이면 상위 200건만 표시하고 cap 안내를 포함한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler Truncation (MAX_RESULTS=200) items 30건이면 cap 메시지 없이 전량 표시한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler 에러 분기 AbortSignal TimeoutError는 타임아웃 안내 메시지를 반환한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler 에러 분기 HTTP 400 실패 응답은 parseErrorMessage로 message를 추출한다 (A.3.3)
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler 에러 분기 HTTP 500 실패이고 message가 없으면 fallback 메시지를 반환한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler 에러 분기 기타 예외는 일반 에러 메시지를 반환한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler 응답 처리 — A.3.1 `{success, data:{items, total}}` (중첩) items 배열을 표로 렌더링하고 total을 요약에 반영한다
__tests__/storage/plugins/agent-skills/hr-personnel-search-handler.test.js › hr-personnel-search handler 응답 처리 — A.3.2 `{success, data:[]}` (결과 없음) 빈 배열 응답이면 결과 없음 메시지를 반환한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler PARAMS_MAP - 유효 파라미터 전송 annual_total은 year를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler PARAMS_MAP - 유효 파라미터 전송 bonus는 year를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler PARAMS_MAP - 유효 파라미터 전송 compare는 current_month와 previous_month를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler PARAMS_MAP - 유효 파라미터 전송 payslip은 year_month를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler PARAMS_MAP - 유효 파라미터 전송 retroactive는 year_month와 limit을 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 날짜 파라미터 해석 (resolveDateParam 연동) compare의 상대 표현 '이번달'/'지난달'을 변환해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 날짜 파라미터 해석 (resolveDateParam 연동) 비표준 포맷 '2025-03'은 sugar-date가 '202503'으로 해석해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 날짜 파라미터 해석 (resolveDateParam 연동) 한국어 상대 표현 '작년'을 YYYY로 변환해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 날짜 파라미터 해석 (resolveDateParam 연동) 한국어 상대 표현 '지난달'을 YYYYMM으로 변환해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 무효 파라미터 무시 account에 모든 선택 파라미터를 전달해도 무시해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 무효 파라미터 무시 payslip에 current_month를 전달하면 무시해야 한다 (year_month만 유효)
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 숫자형 파라미터 처리 limit이 숫자로 전달되어도 문자열로 변환되어야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 필수 파라미터 유효성 검증 emp_no가 없으면 에러를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-salary-handler.test.js › hr-salary handler 하위 호환성 선택 파라미터 없이 호출해도 정상 동작해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 미전달 시 하위 호환성 cal_yy 없이 호출하면 emp_no만 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 credit_card에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 donation에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 education에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 family에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 insurance에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 medical에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 previous_employer에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 result에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 savings에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler cal_yy 파라미터 전송 summary에서 cal_yy를 전송해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler 날짜 파라미터 해석 (resolveDateParam 연동) 정확한 YYYY 형식은 그대로 전달해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler 날짜 파라미터 해석 (resolveDateParam 연동) 한국어 상대 표현 '작년'을 YYYY로 변환해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler 날짜 파라미터 해석 (resolveDateParam 연동) 해석 불가 문자열은 제거되어야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler 빈값 처리 cal_yy가 null이면 전송하지 않아야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler 빈값 처리 cal_yy가 빈 문자열이면 전송하지 않아야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler 응답 포맷팅 빈 데이터면 안내 메시지를 반환해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler 응답 포맷팅 정상 데이터를 마크다운 테이블로 포맷해야 한다
__tests__/storage/plugins/agent-skills/hr-year-end-tax-handler.test.js › hr-year-end-tax handler 필수 파라미터 유효성 검증 emp_no가 없으면 에러를 반환해야 한다
```

## 통과 테스트 전체 이름 수

1161
