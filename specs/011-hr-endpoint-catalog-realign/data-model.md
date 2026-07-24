# Data Model: HR 스킬 엔드포인트 신판 카탈로그 재정렬

DB 스키마 변경 없음 — 본 피처의 "데이터 모델"은 skill 내부 선언 구조 3종.

## 1. ENDPOINT_MAP 항목 (handler.js 선언)

```
{
  path: string,            // kiwibox .do 경로
  cmd?: string,            // 데이터 cmd (query string 아님 — form의 cmd 파라미터)
  period?: "range" | "range-alt" | "range-both" | "ym" | "none",
  //  range      = searchBaseSYmd/EYmd
  //  range-alt  = searchSYmd/EYmd
  //  range-both = 둘 다 (신판 §2.1 — 신규)
  staffParam?: string | string[] | null,
  //  string[] 신규: 다중 사번 파라미터 동시 마커 주입 (§3 staffId+cmmSearchStaffId, §6.4 3중)
  fixed?: Record<string,string>,   // 고정 BODY (searchType=2, chkAppYn=Y 등)
  leaveBody?: boolean,     // §3 공통 BODY(wkareaCd·연도범위·searchBaseYmd) 주입 플래그 — 신규
  baseYmdDashed?: boolean, // searchBaseYmd={오늘 YYYY-MM-DD} 주입 — 신규
  gate: boolean,
}
```

검증 규칙:
- `FORBIDDEN_FIXED_VALUES`(searchType=mobile 차단) 유지.
- hr-welfare: cmmSearchStaffId 마커 치환 결과 공란이면 호출 자체 중단(L2).
- pay_item → searchYm 유도 실패(`/^\d{6}/` 불일치) 시 오류 반환, 호출 안 함.

## 2. 컬럼 화이트리스트 (COLUMNS_BY_QT)

research.md R-4 표가 정본. 원칙:
- 신판 ★민감 필드(주민번호·계좌·주소·휴대폰)는 어떤 화이트리스트에도 미포함.
- 코드 필드(*Cd)·내부 PK(servareaId·staffId·staffNo)·HTML 필드(detail·notice) 차단.
- 키 매칭은 기존 camel/lower 3중 폴백 유지.

## 3. hrSession 공유 계층

- `parseKiwiboxBody` 언랩 순위: `result` → `DATA` → **`Map`** → **`codeList`** → `data` → passthrough (R-5).
- 신규 헬퍼 `todayDashed(): "YYYY-MM-DD"`, `monthsAgoFirstYmd(n): "YYYYMM01"` (18개월 기본 기간용).
- `SELF_STAFF_ID_MARKER` 치환 로직 불변 — 다중 파라미터 주입은 handler 측 배열 순회로 처리(hrSession 계약 불변).

## 4. E2E 시나리오 스키마 확장 (scenarios.json)

```
expect: {
  tool_call: boolean,
  mock_url_pattern: string|null,     // 기존 — fullUrl 정규식 (.do path 매칭에 사용)
  mock_body_pattern?: string[],      // 신규 — mock 로그 body(urlencoded 파싱 객체의 "k=v" 직렬화)에
                                     //        대해 전 항목 매칭해야 PASS (필수 파라미터 검증)
}
```

runner 대조 대상 확장: `^\/api\/v1\//` 또는 `\.do$` path. mock은 urlencoded body를 객체 파싱해 로그.
