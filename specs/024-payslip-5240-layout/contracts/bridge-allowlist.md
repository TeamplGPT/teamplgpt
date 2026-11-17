# Contract: 위젯 브리지 허용 목록 변경 (024, okrservice)

파일: okrservice `widgets/client/messenger/widget/hrBridge.ts`

| 항목 | 전 | 후 |
|---|---|---|
| `ALLOWED_PATHS` | `/SALSalaryDtstmnMgr.do` 포함 | 변경 없음 |
| `CMD_ALLOWLIST['/SALSalaryDtstmnMgr.do']` | `getSALSalaryDtstmnMgrList`, `getSALSalaryDtstmnMgrList2`, `getSALSalaryDtstmnMgrMap` | + `getSALSalaryDtstmnMgrList3` |
| `REQUIRED_STAFF_PARAMS['/SALSalaryDtstmnMgr.do']` | `['cmmSearchStaffId']` | 변경 없음 — List3도 본인 사번 강제 |

- 다른 경로·cmd는 추가하지 않는다(`List4`는 데드코드라 허용하지 않음).
- 테스트: List3 허용, 본인 아닌 `cmmSearchStaffId`면 거부, `List4` 거부.


## 추가 (2026-11-18, 코드 리뷰)

- TeamplGPT `extras/kiwibox-bridge/teamplgpt-hr-bridge.js`의 `/SALSalaryDtstmnMgr.do` cmd 목록에도 `getSALSalaryDtstmnMgrList3`을 넣었다(위젯 브리지와 양쪽 갱신 원칙).
