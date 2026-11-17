# Data Model: 위젯 HR 메뉴 권한 (모바일 + PC)

모두 위젯 브라우저 메모리 안의 값이다. 저장·전송하지 않는다.

## MobileMenuPermissions (현행, 변경 없음)

`/getMobileMenuList.do` 응답에서 만든다.

| 필드 | 뜻 |
|---|---|
| keys | 쓸 수 있는 모바일 화면 이름(주소 끝 조각, 소문자). 결재 양식은 `화면|신청종류` |
| openPaths | 결재 양식 버튼을 여는 주소(신청 종류별) |

## PcMenuPermissions (신규)

`/getSubLowMenuList.do` 직원용·담당자용 응답을 합쳐 만든다. 프로그램 코드가 빈 행(권한 그룹·대분류)은 버린다.

| 필드 | 뜻 |
|---|---|
| progCds | PC에서 쓸 수 있는 프로그램 코드 집합 (예: `TAA-0070`) |
| applCds | PC 결재 양식 행의 신청 종류 집합 (공백 제거, 예: `1590`) |
| approvalOpenPaths | 신청 종류 → 결재 양식을 여는 주소(PC 행의 progFile·progCd·dataRwType로 만든 것) |

## MenuPermissionState (훅 상태, 확장)

| 필드 | 값 |
|---|---|
| mobile | MobileMenuPermissions \| null (null = 아직 없음 또는 실패) |
| pc | PcMenuPermissions \| null (직원용·담당자용 중 받은 쪽만 합침, 둘 다 실패면 null) |
| status | loading → ready(한쪽 이상 성공) / failed(전부 실패) |

## MenuPcMap (신규, 정적 표)

버튼 id → `{ kind: 'progCd', codes: string[] } | { kind: 'applCd', applCd: string } | { kind: 'none' }`. 값은 [contracts/menu-pc-map.md](contracts/menu-pc-map.md).

## 판단 규칙 (spec FR-004·FR-004a·FR-005)

```
보임(버튼, 상태) =
     항상허용(버튼)
  || 모바일허용(버튼, 상태.mobile)            -- 현행 isMenuAllowed 규칙 그대로, mobile이 null이면 false
  || PC허용(버튼, 상태.pc)                    -- pc가 null이거나 표가 'none'이면 false
PC허용 = 표가 progCd → 상태.pc.progCds ∩ codes ≠ ∅
       | 표가 applCd → 상태.pc.applCds ∋ applCd
```

여는 주소: 결재 양식이면 `mobile.openPaths` → 없으면 `pc.approvalOpenPaths` → 없으면 버튼 주소 그대로(현행).

버튼 판단은 버튼 id가 아니라 화면 주소로 들어오는 경우가 있다(근태 알림 버튼, 직접 열기). 주소 → 버튼 id는 `CHATBOT_MENUS`의 path로 찾고, 못 찾으면 PC 허용은 false(모바일 규칙만 적용).
