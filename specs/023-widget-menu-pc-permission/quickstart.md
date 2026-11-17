# Quickstart: 검증 절차

## 사전 조건

- 테스트 계정: 5240corp(회사 오이사공) — PC에 휴가신청(직원)·경조휴가신청(직원)·월별근무계획조회 있음, 모바일에는 없음.
- 대조 계정(필수 D10 확인용): 어떤 메뉴(예: 급여명세서)가 PC·모바일 모두 없는 계정. 없으면 Q4는 자동 테스트로만 확인하고 그 사실을 보고에 적는다.
- okrservice `widgets` 로컬 기동 + 5240 로그인 페이지에서 위젯 열기(현행 모바일 권한 확인과 같은 방식).

## Q0. PC 메뉴 조회 실응답 확인 (구현 전)

5240에 로그인한 브라우저 개발자도구 콘솔에서:

```js
await (await fetch('/getSubLowMenuList.do', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'}, body:'menuKind=menu01'})).text()
```

확인: 최상위 키(`result`), 행 키(`progCd`·`progFile`·`applCd`·`dataRwType`), TAA-0070·TAA-0076·TAA-0950 존재. `menu02`도 같은 방식. 결과 키가 research R1과 다르면 파서를 그에 맞춘다.

## Q1. 자동 테스트

```bash
cd $OKRSERVICE/widgets
npx jest client/messenger/components/chatbot/__tests__/menuPermission.test.ts client/messenger/widget/__tests__/hrBridge.test.ts
```

기대: 전건 PASS. 포함 항목 — 대응표 34행 불변식, D10 전수 조합(버튼 34 × 권한 4 × 실패 3), 브리지 허용·거부 요청(contracts/bridge-allowlist.md).

## Q2. 실위젯 — PC 권한만 있는 메뉴가 보인다 (SC-001)

테스트 계정, **새 대화**에서:

| 질문 | 기대 버튼 |
|---|---|
| 반차 신청은 어떻게 해요? | 휴가신청 보임, 경조휴가신청 보임 |
| 오늘 출근 처리가 됐나요? | 근무일정조회 보임 |

휴가신청을 눌러 모바일 휴가신청 화면이 위젯 안에서 열리는지 본다.

## Q3. 실위젯 — 결재 양식 주소

사직서(직원) 버튼이 보이면 눌러서 신청서가 열리는지 본다(research R4).

## Q4. 실위젯 — 권한 없는 메뉴는 안 보인다 (SC-002, 필수)

대조 계정으로 그 메뉴가 붙는 질문(예: "이번 달 급여명세서 보여줘") → 버튼 없음. 메뉴 목록 화면에도 없음.

## Q5. 조회 실패 (SC-004)

개발자도구 Network에서 `/getSubLowMenuList.do`를 차단(Block request URL)하고 챗봇을 새로 연다 → 모바일 권한 메뉴는 그대로 보이고, PC 권한만 있던 휴가신청은 사라진다.
