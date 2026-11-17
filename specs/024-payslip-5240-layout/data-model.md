# Data Model: 급여명세서 (024)

저장소 없음 — 5240 응답을 받아 표로 바꾸는 값 모양만 정한다. 5240 응답 키는 camelCase(실측 관례), 래퍼는 `DATA`(목록) / `Map`(합계).

## 지급 건 (Pay item)
- 코드 `searchItem` = 급여일자(8) + 지급유형(예: `20261025P`). `pay_periods` 결과에서만 얻는다. 표에 보이지 않는다.

## 합계 (Map)
| 키 | 표 칸 |
|---|---|
| `jtotAmt` | 지급금액 |
| `gtotAmt` | 공제금액 |
| `ctotAmt` | 실지급액 |
그 밖의 키(성명·소속·입사일·급여일자·고지사항 `notice`)는 명세서 답에 쓰지 않는다(고지사항 D5).

## 지급 항목 (List)
| 키 | 표 칸 | 비고 |
|---|---|---|
| `salItemNm` | 지급항목 | |
| `salAmt` | 지급금액 | 합계 줄에 합산 |
| `resalAmt` | 소급금액 | 지급 건 합이 0이면 칸 없음 |
| `salTypeNm`, `salYm` | — | 숨김(5240 화면과 같음) |

## 공제 항목 (List2)
| 키 | 표 칸 |
|---|---|
| `salItemNm` | 공제항목 |
| `salAmt` | 공제금액 (합계 줄에 합산) |

## 기재 항목 (List3)
| 키 | 표 칸 | 비고 |
|---|---|---|
| `salEntrCd` | 기재구분 | E→기준항목, T→근태항목, 그 밖은 원래 값 |
| `salItemNm` | 기재항목 | |
| `salAmt` | 금액/시간등 | 5240 포맷 문자열 그대로(다시 계산·쉼표 변환 안 함) |
| `salYm` | — | 숨김 |

## 영역 상태
각 영역은 `ok(rows)` · `empty` · `error(message)` 중 하나. 표시 규칙은 [contracts/payslip-answer.md](contracts/payslip-answer.md) §2.
