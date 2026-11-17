# Contract: 위젯 브리지 허용 추가 (okrservice `widgets/client/messenger/widget/hrBridge.ts`)

| 항목 | 값 |
|---|---|
| 경로 | `/getSubLowMenuList.do` (`ALLOWED_PATHS`에 추가) |
| 메서드 | POST, form |
| 허용 파라미터 키 | `menuKind` 하나 (`ALLOWED_PARAM_KEYS`) |
| 허용 값 | `menuKind` ∈ {`menu01`, `menu02`} (`PARAM_VALUE_ALLOWLIST` — 키 누락도 거부) |
| cmd | 없음 (cmd를 보내면 거부 — 기존 `isCmdAllowed` 규칙) |
| 사번 파라미터 | 없음 (`REQUIRED_STAFF_PARAMS` 대상 아님 — 5240이 세션 본인으로만 조회) |

**거부해야 하는 요청(테스트)**

- `menuKind` 없음 / `menuKind=menu03` / `menuKind=menu01` + 다른 키(`ssnId`, `grpCd`, `mainMenuCd`, `cmmSearchStaffId` 등) / `cmd=...` 동반.

**허용해야 하는 요청(테스트)**

- `{ menuKind: 'menu01' }`, `{ menuKind: 'menu02' }`.

TeamplGPT·5240 쪽 변경 없음. 이 경로는 위젯 화면만 호출하고 TeamplGPT HR skill은 호출하지 않는다.
