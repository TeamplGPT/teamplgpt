---
description: "Task list — 021 위젯 회사별 사규 문서 RAG"
---

# Tasks: 위젯 회사별 사규 문서 RAG

**Input**: `specs/021-widget-company-docs-rag/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: 포함. 헌장 III(E2E-First)에 따라 LLM 행태 시나리오(CR-01~09)를 코드보다 먼저 추가하고 FAIL을 확인한다. 단위 테스트는 각 스토리 구현 전에 작성한다.

**경로 표기**:
- `teamplgpt/` = `/Users/shin-yeji/teamplgpt`
- `okr/` = `/Users/shin-yeji/okrservice/widgets`

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: Node 20 환경, 의존성, 픽스처, E2E 골격

- [X] T001 로컬 Node 20 이상 확인(`node -v`). 18이면 중단하고 사용자에게 업그레이드를 요청한다. Node 20에서 `yarn setup` 또는 각 패키지 `yarn install` 후, 기존 jest(`npx jest server/__tests__`)와 E2E 1회(`npm run e2e:embed-hr-skill`)로 **기준선 결과를 기록**한다. 기록 위치: `teamplgpt/specs/021-widget-company-docs-rag/baseline/node20.md`
- [X] T002 `teamplgpt/docker/Dockerfile` amd64 단계의 `node_18.x`를 `node_20.x`로 바꾼다(1줄)
- [X] T003 `teamplgpt/collector/package.json`에 `"kordoc": "4.24.59"`(정확 고정)를 추가하고 `engines.node`를 `>=20`으로 올린 뒤 `yarn install`

> **구현 중 변경 (T004~T007)**: 기존 `e2e-embed-hr-skill` 러너는 HR 도구 전용(ID 형식 `EC-AXIS-NN`, 축 고정, 빈 워크스페이스)이라
> 확장하지 않고 별도 러너 `server/scripts/e2e-embed-company-docs/`(`npm run e2e:embed-company-docs`)를 만들었다.
> 헬퍼(`embedconfig.js`의 워크스페이스 생성, `apikey.js`)는 재사용한다. 공통 문서는 v1 API(`/v1/document/upload` + `update-embeddings`)로 테스트 워크스페이스에 시드한다.
> 픽스처는 PDF 대신 `.md`(내용 동일), HWP는 사용자 제공 실제 공고문, HWPX는 kordoc `markdownToHwpx`로 생성했다.
> CR-01은 충돌 없는 회사 전용 사실(동호회 7만원)로 바꿔 CR-02(충돌)와 구분했다.

- [X] T004 [P] 픽스처를 작성한다. 위치: `teamplgpt/server/scripts/e2e-embed-company-docs/fixtures/` (원안: `e2e-embed-hr-skill/fixtures/company-docs/`)
  - `common-경조휴가3일.pdf`
  - `A사-취업규칙.pdf`: "본인 결혼 경조휴가 5일"과 경조휴가 표 포함
  - `A사-취업규칙.hwp`, `A사-취업규칙.hwpx`: 같은 내용에 각 형식만의 고유 문구 1개씩
  - `A사-지시주입.pdf`: CR-09용
  - HWP·HWPX는 한글 프로그램으로 저장한 실제 파일이어야 한다. 없으면 사용자에게 요청한다
  - 같은 폴더에 `README.md`로 각 파일의 고유 문구를 기록한다
- [X] T005 `teamplgpt/server/scripts/e2e-embed-company-docs/runner.js` 신설 (원안: `e2e-embed-hr-skill/runner.js` 확장)
  - 시나리오 필드 `company`: stream-chat 본문 `companyName`으로 보낸다
  - 시나리오 필드 `company_docs_seed`: `[{ company, file }]`. 시나리오 전에 `POST /company-documents`로 업로드하고 `ready`까지 최대 180초 폴링한다
  - 시나리오 필드 `company_docs_delete`: 질문 전에 해당 회사 문서를 전부 삭제한다
  - 시나리오 종료 후 시드 문서를 정리한다
  - README에 새 필드를 기재한다
- [X] T006 `teamplgpt/server/scripts/e2e-embed-company-docs/scenarios.json`에 CR-01~09를 [prompt-contract.md](./contracts/prompt-contract.md) L3 표대로 append한다. CR-01은 `repeat: 10`, 통과 기준 9회 이상(SC-001)
- [X] T007 `npm run e2e:embed-company-docs`를 실행해 **FAIL을 확인**하고 결과 경로를 `baseline/node20.md`에 기록한다. 업로드 라우트가 없어 시드 단계에서 실패하는 것도 FAIL로 인정한다

**Checkpoint**: Node 20 기준선 통과(회귀 없음), CR 9건 FAIL 확인

---

## Phase 2: Foundational

**Purpose**: 모든 스토리가 쓰는 데이터, 인가, 처리 파이프라인

- [X] T008 `teamplgpt/server/prisma/schema.prisma` 수정 ([data-model.md](./data-model.md) §1·§2)
  - `embed_configs.allow_company_documents Boolean @default(false)` 추가
  - `embed_company_documents` 모델과 역관계 추가
- [X] T009 마이그레이션을 만들고 로컬에 적용한다(`npx prisma migrate deploy`)
  - 경로: `teamplgpt/server/prisma/migrations/20261110000000_add_embed_company_documents/migration.sql`
  - 내용: 컬럼 추가, 테이블 생성, `(embed_id, company_hash)` 인덱스
- [X] T010 [P] `teamplgpt/server/models/embedConfig.js`의 writable 필드와 validation에 `allow_company_documents`를 추가한다(`client_tool_execution`과 같은 위치·방식)
- [X] T011 [P] `teamplgpt/server/models/embedCompanyDocument.js` 신규
  - 함수: `normalizeCompanyKey(name)`, `companyHash(key)`(sha256 앞 16 hex), `namespaceFor(slug, hash)`, `folderFor(hash)`
  - CRUD: `create`, `listFor(embedId, hash)`, `getOwned(id, embedId, hash)`, `updateStatus`, `delete`, `listByEmbed`
  - `toPublic(row)`: [embed-company-docs-api.md](./contracts/embed-company-docs-api.md)의 Document 객체 형태로 변환
- [X] T012 [P] `teamplgpt/server/__tests__/models/embedCompanyDocument.test.js`
  - trim·빈 값 검증
  - 같은 이름이면 같은 해시, 표기가 다르면 다른 해시
  - namespace 형식
  - 한글 회사명 처리
- [X] T013 `teamplgpt/server/utils/companyDocs/process.js` 신규: `processCompanyDocument(row, hotdirFilename)`
  1. `CollectorApi.processDocument` 호출
  2. 결과 JSON을 `folderFor(hash)`로 이동
  3. 행이 아직 있는지 확인. 없으면 JSON을 지우고 종료
  4. `VectorDb.addDocumentToNamespace(namespace, {...doc, docId}, location)`
  5. `ready` + `doc_id`·`location` 저장
  - 실패 시 `failed`와 사유 문구를 저장한다(계약 문서의 사유 표)
- [X] T014 `teamplgpt/server/utils/companyDocs/queue.js` 신규
  - 동시 1건 직렬 큐: `enqueue(job)`
  - `recoverOnBoot()`: `processing` 행을 `failed`("처리 중 중단되었습니다. 다시 올려 주세요")로 바꾼다
  - 서버 부팅 경로에 `recoverOnBoot()` 호출 1줄을 추가한다(`teamplgpt/server/index.js`)
- [X] T015 [P] `teamplgpt/server/__tests__/utils/companyDocs/process.test.js`. collector와 VectorDb는 mock으로 처리한다
  - 성공 시 `ready`
  - 변환 실패 시 `failed`와 사유
  - 처리 중 행이 삭제되면 벡터를 만들지 않는다
  - 큐가 동시에 1건만 처리한다
  - `recoverOnBoot`

**Checkpoint**: 스키마 적용, 모델·처리기 단위 테스트 PASS

> **구현 중 변경 (Phase 2~6)**
> - 변환 JSON 보관 위치: `documents/embed-company-<hash>/`가 아니라 `storage/company-documents/<hash>/`. `documents/` 안에 두면 관리자 문서 선택 화면에 노출되기 때문이다. `doc_id`에 `@unique`를 추가했다.
> - 로컬 DB에 기존 실패 마이그레이션(`20260904000000_add_llm_log_tool_trace`)이 있어 `migrate deploy`가 막힌다. 신규 SQL은 psql로 적용하고 `prisma migrate resolve --applied`로 기록했다. 운영 DB 상태는 배포 전에 확인해야 한다.
> - 라우트 등록: `embed/index.js`가 아니라 `server/index.js`에서 `embeddedEndpoints`보다 **먼저** 등록한다. 늦게 등록하면 `/embed/:embedId/:sessionId`가 `company-documents`를 sessionId로 잡는다.
> - 회사 sources는 `embed_chats`에 저장하지 않는다. 저장하면 `fillSourceWindow`가 다음 질문에서 이력 sources를 되살려, 삭제한 문서 내용이 다시 답변에 쓰인다(SC-005).
> - 삭제 후 문서가 0건이 된 회사 namespace(lance 테이블)는 `dropNamespaceIfEmpty`로 큐에서 지운다. embed 삭제 시에도 같은 정리를 한다.
> - 로컬 임베더: 기본 `all-MiniLM-L6-v2`는 한국어 대형 문서(HWP 공고문)에서 검색이 실패해(CR-06·CR-09) 로컬 `.env.development`만 `MintplexLabs/multilingual-e5-small`(384차원)로 바꿔 검증했다. 운영은 기본값 유지(사용자 결정) — 보고서에 위험으로 남긴다.
> - CR-06 질문은 공고문 안 다른 사업과 혼동되지 않게 사업명("일자리 함께하기 지원")을 넣었다.
> - 리뷰 반영(T053): 회사 namespace에 embed id 추가(`${slug}-co-${embedId}-${hash}`), 실패 사유를 코드로 저장(위젯 번역), `doc_id`·`location` 임베딩 전 기록 + 부팅 복구 정리, 큐 상한 20·작업 15분 타임아웃, 파일명 정리(서버 종료 버그 수정), 삭제 시점 행으로 정리, 워크스페이스 문서 0건 + 회사 문서만 있을 때 채팅 중단 수정. 상세는 보고서 §6.
> - T046: 관리자 드롭존은 `accept` 제한이 없고 collector `/accepts`에 `.hwp`·`.hwpx`가 포함돼 코드 수정이 필요 없었다.

---

## Phase 3: User Story 1 — 회사 취업규칙을 근거로 답을 받는다 (P1) 🎯 MVP

**Goal**: 회사 문서가 있으면 위젯 답변이 회사 문서를 우선 근거로 쓴다. 다른 회사로 누출되지 않고, 출처는 표시하지 않는다.

**Independent Test**: T013 처리기로 A사 문서를 직접 시드한 뒤 A사·B사·회사 없음으로 각각 질문한다(CR-01~04, CR-08, CR-09).

### Tests (먼저 작성, FAIL 확인)

- [X] T016 [P] [US1] `teamplgpt/server/__tests__/utils/vectorSearch/mergeSharedResults.test.js`에 케이스를 추가한다
  - `companyNamespace`가 없으면 결과가 기존과 동일하다(회귀)
  - 있으면 `companyContextTexts`·`companySources`를 분리해서 반환한다
  - 회사 검색이 throw하면 회사 결과는 빈 배열이고 공통 결과는 유지된다
  - 회사 namespace가 없으면 회사 검색을 호출하지 않는다
- [X] T017 [P] [US1] `teamplgpt/server/__tests__/utils/chats/embed.companyDocs.test.js`
  - 회사 근거가 없으면 시스템 프롬프트와 contextTexts가 기존과 바이트 단위로 같다
  - 회사 근거가 있으면 표지가 붙은 회사 청크가 앞에 오고 L1 문단이 붙는다(문구는 [prompt-contract.md](./contracts/prompt-contract.md)와 정확히 일치)
  - `allow_company_documents=false`이면 `companyName`을 무시한다
  - 워크스페이스 문서가 0개이고 회사 문서만 있을 때 query 모드에서 거절하지 않는다

### Implementation

- [X] T018 [US1] `teamplgpt/server/utils/vectorSearch/mergeSharedResults.js`의 `performMergedSearch`에 선택 인자 `companyNamespace`를 추가한다
  - `hasNamespace` 확인 후 같은 `searchInput`·topN·rerank·hybrid 설정으로 병렬 검색한다
  - `catch`하면 빈 결과로 처리한다
  - 반환값에 `companyContextTexts`·`companySources`(`fromCompany: true`)를 추가한다. 기존 `mergeAndRank`는 변경하지 않는다
- [X] T019 [P] [US1] `teamplgpt/server/utils/chats/companyDocsPrompt.js` 신규
  - `COMPANY_DOC_MARKER`, `COMPANY_PRIORITY_RULES` 상수(계약 문구 그대로)
  - `prefixCompanyContexts(texts)`
  - `appendCompanyRules(systemPrompt, hasCompanyContext)`
- [X] T020 [US1] `teamplgpt/server/endpoints/embed/index.js` stream-chat에서 `companyName`을 읽어 `streamChatWithForEmbed` 옵션 `companyName`으로 전달한다
- [X] T021 [US1] `teamplgpt/server/utils/chats/embed.js` 수정
  - `allow_company_documents`와 `companyName`이 있을 때 namespace를 계산한다
  - 상단 거절 분기와 `embeddingsCount !== 0` 조건이 회사 namespace 문서 수도 함께 보도록 고친다
  - `performMergedSearch`에 `companyNamespace`를 전달한다
  - contextTexts를 `[...prefixCompanyContexts(company), ...기존]` 순서로 구성한다
  - sources에 회사 sources를 합친다. 위젯은 표시하지 않는다
  - 근거 0개 거절 분기는 회사 근거를 포함한 개수로 판단한다
  - 시스템 프롬프트에 `appendCompanyRules`를 적용한다
- [X] T022 [US1] `okr/server/index.ts`: `/ai-chat/stream`이 `req.body.companyName`(문자열이면)을 upstream 본문에 함께 보내도록 한다
- [X] T023 [P] [US1] `okr/client/messenger/components/chatbot/companyDocs.ts` 신규
  - `getCompanyName()`: `connection.setting.companyData?.name?.trim() ?? ""`
  - `getUploaderName()`
- [X] T024 [US1] `okr/client/messenger/components/chatbot/teamplgpt.ts`: `streamChat` 본문에 `companyName`을 추가한다(값이 있을 때만). 기존 `__tests__`가 깨지지 않는지 확인한다
- [X] T025 [US1] T016·T017 PASS를 확인한다. 이어서 T013으로 A사 문서를 시드하고 `npm run e2e:embed-hr-skill -- --only=CR-01,CR-02,CR-03,CR-04,CR-08,CR-09`가 PASS하는지 확인한다(이 단계에서 시드는 임시 스크립트로 한다). FAIL이면 prompt-contract 문구를 조정하고, 조정한 문구를 계약 문서에도 반영한다

**Checkpoint**: 회사 문서가 있으면 답변에 반영된다. 회사 간 격리 상태와 출처 미표시를 확인한다

---

## Phase 4: User Story 2 — 직원이 위젯에서 회사 문서를 올린다 (P1)

**Goal**: 위젯에서 PDF·HWP 등 허용 형식 파일을 올리면 목록에 상태가 보이고, 같은 회사 답변에 쓰인다.

**Independent Test**: 위젯에서 A사로 PDF·HWP를 업로드하면 2분 안에 ready가 되고, 다른 A사 세션에서 질문하면 그 내용으로 답한다. B사로는 목록이 비어 있다.

### Tests

- [X] T026 [P] [US2] `teamplgpt/collector/__tests__/processSingleFile/asHwp.test.js`
  - HWP·HWPX 픽스처에서 고유 문구와 표 셀 텍스트를 추출한다
  - 빈 문서는 `success:false` + "No text content"
  - kordoc이 `DRM_PROTECTED`·`ENCRYPTED`를 돌려주면(mock) 해당 사유를 반환하고 파일을 정리한다
- [X] T027 [P] [US2] `teamplgpt/server/__tests__/endpoints/embedCompanyDocuments.test.js` (GET/POST)
  - opt-in이 꺼져 있으면 403, Origin이 맞지 않으면 401, companyName이 없으면 400
  - 파일이 없으면 400, 50MB를 넘으면 413, `.zip`이면 400
  - 정상 POST는 202 + `processing`이고 큐에 들어간다
  - GET은 같은 회사 문서만 최신순으로 돌려주고, 응답에 `company_key`·`doc_id`가 없다
- [X] T028 [P] [US2] `okr/client/messenger/components/chatbot/__tests__/companyDocs.test.ts`: 확장자·크기 사전 검사, companyName·uploader 헬퍼, API 호출 형식
- [X] T029 [P] [US2] `okr/client/messenger/components/chatbot/__tests__/CompanyDocsPanel.test.tsx`
  - companyName이 없으면 헤더 버튼이 없다
  - 목록 렌더링(이름·올린 사람·날짜·상태·실패 사유)
  - 여러 파일을 순차로 올린다
  - 허용되지 않는 파일은 올리지 않고 사유를 표시한다
  - `processing`이 있는 동안 5초 폴링하고, 없어지면 중지한다

### Implementation

- [X] T030 [P] [US2] `teamplgpt/collector/processSingleFile/convert/asHwp.js` 신규
  - 확장자에 따라 kordoc `parseHwp`/`parseHwpx`를 호출하고 `try/catch`로 감싼다
  - 성공하면 기존 변환기 패턴대로 `writeToServerDocuments`를 호출한다
  - 실패하면 `trashFile` 후 `{success:false, reason, documents:[]}`를 반환한다
- [X] T031 [US2] `teamplgpt/collector/utils/constants.js` 수정
  - `ACCEPTED_MIMES`에 `application/x-hwp: [".hwp"]`, `application/hwp+zip: [".hwpx"]` 추가
  - `SUPPORTED_FILETYPE_CONVERTERS`에 `.hwp`·`.hwpx`를 `asHwp.js`로 등록
  - collector가 MIME을 판정하는 방식과 맞는지 실제 업로드로 확인한다
- [X] T032 [US2] `teamplgpt/server/endpoints/embedCompanyDocuments.js` 신규
  - `companyDocsAllowed` 미들웨어
  - GET `/embed/:embedId/company-documents`
  - POST `/embed/:embedId/company-documents`
    - multer: hotdir, 파일명 `${uuid8}-${normalized}`, `limits.fileSize` 50MB, 파일 1개
    - 확장자를 collector 허용 목록과 대조한다
    - 행을 만들고 `queue.enqueue(processCompanyDocument)`
  - `teamplgpt/server/endpoints/embed/index.js`에 등록 1줄을 추가한다
- [X] T033 [US2] `okr/server/index.ts` 프록시 2개 추가
  - `GET /ai-chat/company-documents`
  - `POST /ai-chat/company-documents`: 스트림 그대로 전달, `content-length` 51MB 상한 시 413, `duplex:'half'`
  - 로그에는 회사명 해시 앞 8자만 남긴다
- [X] T034 [US2] `okr/client/messenger/components/chatbot/companyDocs.ts`에 `listCompanyDocs`·`uploadCompanyDoc`과 허용 확장자 목록·상한 상수를 추가한다
- [X] T035 [US2] `okr/client/messenger/components/chatbot/CompanyDocsPanel.tsx` 신규: [widget-contract.md](./contracts/widget-contract.md) §3에 따른 목록·업로드·상태·폴링·빈 상태
- [X] T036 [US2] `okr/client/messenger/components/chatbot/ChatbotView.tsx`
  - 헤더 아이콘 행에 문서 버튼을 추가한다. `getCompanyName()`이 비면 렌더링하지 않는다
  - 버튼으로 패널을 열고 닫을 수 있다. 대화 상태는 유지된다
- [X] T037 [P] [US2] `okr/locales/ko.json`·`en.json`에 widget-contract의 i18n 키 14개를 추가한다
- [X] T038 [US2] T026~T029 PASS. 이어서 `--only=CR-01,CR-06,CR-07`이 PASS하는지 확인한다(이제 러너가 업로드 API로 시드)

**Checkpoint**: 위젯 업로드부터 답변 반영까지 완료. HWP·HWPX 동작

---

## Phase 5: User Story 3 — 잘못 올린 문서를 같은 회사 직원이 지운다 (P1)

**Goal**: 같은 회사 직원 누구나 삭제할 수 있고, 삭제 즉시 답변에서 빠진다. 다른 회사는 삭제할 수 없다.

**Independent Test**: A사 문서를 다른 A사 세션에서 삭제한 뒤 질문하면 그 내용이 나오지 않는다(CR-05). B사로 같은 ID를 삭제하면 404.

### Tests

- [X] T039 [P] [US3] `teamplgpt/server/__tests__/endpoints/embedCompanyDocuments.test.js`에 DELETE 케이스를 추가한다
  - 같은 회사면 200이고, 벡터·JSON·행이 삭제된다
  - 다른 회사, 다른 embed, 없는 ID는 404다
  - `processing` 상태도 삭제할 수 있다(처리기가 행 부재를 감지)
- [X] T040 [P] [US3] `okr/client/messenger/components/chatbot/__tests__/CompanyDocsPanel.test.tsx`에 케이스를 추가한다
  - 삭제 확인 대화가 뜬다
  - 확인하면 목록에서 제거된다
  - 취소하면 아무 일도 없다

### Implementation

- [X] T041 [US3] `teamplgpt/server/endpoints/embedCompanyDocuments.js`에 DELETE `/embed/:embedId/company-documents/:id`를 추가한다
  - `getOwned`로 소유를 확인한다
  - `doc_id`가 있으면 `deleteDocumentFromNamespace(namespace, doc_id)`로 벡터를 지운다
  - `document_vectors`를 정리한다
  - `location`의 JSON과 vector-cache 파일을 지운다
  - 마지막으로 행을 삭제한다
- [X] T042 [US3] `okr/server/index.ts`에 `DELETE /ai-chat/company-documents/:id` 프록시를 추가한다
- [X] T043 [US3] `okr/client/messenger/components/chatbot/companyDocs.ts`의 `deleteCompanyDoc`와 `CompanyDocsPanel.tsx`의 삭제 버튼·확인 대화를 구현한다
- [X] T044 [US3] `teamplgpt/server/endpoints/embedManagement.js`: embed 삭제 직전에 `listByEmbed`로 회사 namespace 목록을 구한다. 각 namespace에 `delete-namespace`를 호출하고 폴더를 삭제한다. 행은 cascade로 지워진다
- [X] T045 [US3] T039·T040 PASS. 이어서 `--only=CR-05`가 PASS하는지 확인한다

**Checkpoint**: 업로드·목록·삭제 전체 흐름 완료

---

## Phase 6: User Story 4 — 기존 TeamplGPT 화면에서 HWP를 올린다 (P3)

**Goal**: 관리자 워크스페이스 업로드에서도 HWP·HWPX가 처리된다(D11 부수 효과).

**Independent Test**: 관리자 화면에서 `.hwp` 업로드 → 임베딩 → 내용 질문.

- [X] T046 [US4] 관리자 화면 업로드 드롭존이 collector `/accepts`로 `.hwp`·`.hwpx`를 받는지 확인한다. 받지 못하면 프론트 허용 목록의 출처를 추적해 최소한으로 수정한다. 이후 quickstart §4-9를 실행한다

---

## Phase 7: Polish & Cross-Cutting

- [X] T047 [P] `teamplgpt/frontend/src/pages/GeneralSettings/ChatEmbedWidgets/EmbedConfigs/NewEmbedModal/index.jsx`와 `EmbedRow/EditEmbedModal/index.jsx`에 "회사 문서 허용" `BooleanInput`(`allow_company_documents`)을 추가한다. hint: "ON 시 위젯 사용자가 자기 회사 문서를 올리고, 그 회사 직원의 답변에 함께 사용합니다."
- [X] T048 회귀 전건 실행
  - `npm run e2e:embed-hr-skill` 전건과 `npm run e2e:hr-skill` 전건 PASS(SC-006). T001 기준선과 비교한다
  - CR 9건을 다시 실행해 PASS를 확인한다
- [X] T049 `cd teamplgpt && npx jest`, `cd okr && npx jest` 전건 PASS
- [X] T050 Docker 이미지를 빌드한다(amd64). — 로컬은 arm64로 빌드(성공, Node 20.20.2, kordoc 로드, 컨테이너 안에서 실제 HWP 변환 확인). amd64 빌드는 CI/배포 환경에서 확인 필요. collector가 기동하고 HWP 업로드가 처리되는지 확인한다
- [ ] T051 quickstart.md §2·§4를 실동작으로 확인한다. SC-004(2분)와 SC-007(3분)을 측정해 기록한다
- [X] T052 [P] 배포 체크리스트를 `teamplgpt/specs/021-widget-company-docs-rag/quickstart.md` 하단에 추가한다
  - 운영 nginx·ingress `client_max_body_size ≥ 51M`(위젯 경로)
  - 대상 embed opt-in ON
  - `prisma migrate deploy`
  - Node 20 이미지
- [X] T053 code-reviewer와 security-reviewer 검토를 받는다. 업로드 경로, 인가, 경로 조작(파일명), 로그 개인정보를 중점으로 본다. 지적 사항을 반영한다
- [X] T054 PDCA 보고서를 작성한다: `teamplgpt/docs/04-report/features/021-widget-company-docs-rag.report.md`. 감수한 한계(D4·D5, 큐 유실, 워크스페이스 삭제 시 namespace 잔존)를 명시한다

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → US1 → US2 → US3 → US4 → Polish**
- T001(Node 20 기준선)이 실패하면 전체를 중단하고 보고한다
- T007(E2E FAIL 확인)은 모든 구현 태스크보다 먼저 끝나야 한다(헌장 III)
- US1은 T013 처리기로 시드하므로 업로드 API(US2) 없이 검증할 수 있다
- US2의 러너 시드(T038)는 T032 이후에 가능하다
- US3은 US2의 라우트 파일과 패널 위에 얹는다
- T047(관리자 토글)은 기능 검증에 필수는 아니다. 로컬 검증 중에는 DB에서 직접 켤 수 있다. 다만 배포 전에는 반드시 완료한다

## Parallel Opportunities

- Phase 1: T004(픽스처)와 T002·T003
- Phase 2: T010, T011, T012
- US1: T016, T017, T019, T023 (서로 다른 파일)
- US2: T026~T029 테스트, T030(collector)과 T033~T037(okr)은 서로 다른 저장소라 병렬 가능
- US3: T039, T040

## Implementation Strategy

- **MVP = Phase 1 + 2 + US1**: 운영자가 처리기로 회사 문서를 넣어 주면 답변 품질(회사 우선, 격리)을 먼저 확인할 수 있다
- 다음으로 US2와 US3을 함께 배포한다. 업로드만 있고 삭제가 없는 상태로는 배포하지 않는다(D3 근거)
- US4는 변환기 등록으로 자동으로 따라오므로 확인만 한다

## 요약

- 총 54개 태스크: Setup 7, Foundational 8, US1 10, US2 13, US3 7, US4 1, Polish 8
