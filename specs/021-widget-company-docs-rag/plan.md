# Implementation Plan: 위젯 회사별 사규 문서 RAG

**Branch**: `feature/skill-modify-hrchat-merge` (스펙 디렉토리 `specs/021-widget-company-docs-rag`) | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-widget-company-docs-rag/spec.md` (2026-11-10 승인)

## Summary

고객사 직원이 okrservice 위젯 챗봇에서 회사 사규 파일을 올리고 보고 지우면, 그 회사 직원의 위젯 답변이 공통 워크스페이스 문서와 회사 문서를 함께 근거로 쓴다. 두 문서가 충돌하면 회사 문서가 우선한다.

- **회사 구분**: `companyData.name`(trim)을 해시한 값으로 한다.
- **저장**: LanceDB에 회사 전용 namespace(`${slug}-co-${hash}`)를 따로 두고, 문서 목록과 상태는 신규 테이블 `embed_company_documents`로 관리한다.
- **업로드**: 신규 embed 라우트로 받아 202를 즉시 응답한다. 변환과 임베딩은 서버 안의 직렬 큐에서 처리한다.
- **검색**: `performMergedSearch`에 회사 검색을 분리된 결과로 추가한다. embed.js는 회사 근거를 앞에 표지와 함께 놓고, 우선순위 지시문을 덧붙인다(L1/L2). 이 동작은 E2E CR-01~09(L3)로 검증한다.
- **HWP·HWPX**: collector 공통 변환기에 `kordoc`으로 추가한다. 이를 위해 Node 20이 필요하다.
- **위젯 쪽**: okrservice는 프록시 3개와 기존 채팅 프록시의 `companyName` 전달을 추가하고, `CompanyDocsPanel`을 새로 만든다.

## Technical Context

**Language/Version**: Node.js **20**. kordoc 요구사항 때문에 Docker amd64 단계를 18에서 20으로 올리고, 로컬도 20 이상이어야 한다. okrservice widgets는 TypeScript와 React(기존)를 쓴다.

**Primary Dependencies**:
- TeamplGPT server: Express, multer(기존), Prisma, LanceDB(기존)
- collector: `kordoc@4.24.59`(신규, 버전 고정)
- okrservice widgets: Express, React, `i18n-react`(기존)

**Storage**:
- PostgreSQL(Prisma): 컬럼 1개와 테이블 1개를 추가한다.
- LanceDB: 회사마다 테이블 1개를 쓴다.
- 파일: `storage/documents/embed-company-<hash>/`

**Testing**:
- jest: TeamplGPT 루트 `npx jest`, okrservice `widgets` `npx jest`
- E2E: `npm run e2e:embed-hr-skill`(CR 시나리오 추가), `npm run e2e:hr-skill`(회귀)

**Target Platform**: Linux Docker(TeamplGPT), okrservice 위젯 서버 + 고객사 페이지 iframe

**Project Type**: 웹 서비스(서버, collector, 관리자 프론트) + 외부 위젯 저장소

**Performance Goals**: 10MB 이하 PDF·HWP는 업로드 후 2분 안에 "사용 가능"(SC-004). 회사 검색은 공통 검색과 병렬로 돌려 채팅 지연 증가가 거의 없어야 한다.

**Constraints**:
- 파일 하나에 50MB 이하이며, 한 요청에 파일 1개만 올린다.
- 회사 근거가 없을 때 프롬프트는 기존과 바이트 단위로 같아야 한다.
- 기존 embed는 opt-in이 꺼져 있으므로 동작이 바뀌지 않는다.

**Scale/Scope**: 고객사 수십 곳, 회사당 문서 수십 개를 가정한다. 1차에서는 개수와 용량을 제한하지 않는다.

## Constitution Check

*GATE: Phase 0 전 / Phase 1 후 재확인*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 최소 범위·업스트림 발산 최소화 | PASS (조건부) | 신규 기능은 신규 파일로 격리했다(`embedCompanyDocuments.js`, `companyDocsQueue.js`, `asHwp.js`, `CompanyDocsPanel.tsx`). 업스트림 파일은 등록 한 줄이나 분기 몇 줄만 고친다. 대상: `embed/index.js`, `embed.js`, `embedManagement.js`, `collector/utils/constants.js`, `Dockerfile`, `schema.prisma`, embed 모달 2개. 아래 Complexity Tracking 참고 |
| II. 스펙 비례 | PASS | 스펙 경로(트랙 5)이고, spec은 2026-11-10에 승인됐다 |
| III. E2E-First | PASS | LLM 행태(회사 우선, 출처 미표시, 격리)를 바꾸므로 CR-01~09를 **코드 전에** append하고 FAIL을 확인한 뒤 구현한다(tasks 순서로 강제) |
| IV. Multi-Layer Defense | PASS | L1 시스템 지시문, L2 근거 표지·앞 배치·namespace 물리 분리·서버 인가, L3 CR 시나리오. 문구 정본은 [prompt-contract.md](./contracts/prompt-contract.md). HR skill description과 handler.js는 수정하지 않는다 |
| V. 3-Mode 일관성 | PASS | 회사 정보는 embed 경로에만 있다. chat/query(`stream.js`)·react·@agent는 **변경 없음**. 공통 함수 `performMergedSearch`는 `companyNamespace`를 넘기지 않으면 기존과 동일하다(단위 테스트로 보장) |
| VI. Conventional Commits | PASS | `feat(widget-company-docs-rag): …`, 사용자가 요청할 때만 커밋한다 |
| VII. i18n | PASS | 위젯 신규 문자열은 ko/en을 함께 제공한다([widget-contract.md](./contracts/widget-contract.md)). 관리자 embed 모달 토글은 기존 003 토글처럼 한글 하드코딩 패턴을 따른다(해당 모달이 원래 i18n 미적용) |

**Convention doc**: HR skill `plugin.json`을 바꾸지 않으므로 `docs/conventions/hr-skill-description-pattern.md`의 T-A/T-B는 해당하지 않는다.

**Phase 1 후 재확인**: 설계 산출물이 위 판정을 바꾸지 않는다. PASS.

## Project Structure

### Documentation (this feature)

```text
specs/021-widget-company-docs-rag/
├── spec.md
├── plan.md                      # 이 파일
├── research.md                  # R1~R9 결정
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── embed-company-docs-api.md
│   ├── prompt-contract.md       # L1/L2 문구 정본 + CR 시나리오 표
│   └── widget-contract.md       # 위젯 프록시·화면·i18n 키
├── checklists/requirements.md
└── tasks.md                     # /speckit-tasks
```

### Source Code

```text
# TeamplGPT (/Users/shin-yeji/teamplgpt)
server/
├── prisma/schema.prisma                                   # [수정] embed_configs 컬럼 + embed_company_documents 모델
├── prisma/migrations/20261110000000_add_embed_company_documents/migration.sql   # [신규]
├── models/embedConfig.js                                  # [수정] writable 필드 allow_company_documents
├── models/embedCompanyDocument.js                         # [신규] CRUD, companyHash(), namespaceFor()
├── endpoints/embed/index.js                               # [수정] 신규 라우트 등록 1줄, stream-chat에 companyName 전달
├── endpoints/embedCompanyDocuments.js                     # [신규] GET/POST/DELETE + companyDocsAllowed 미들웨어
├── endpoints/embedManagement.js                           # [수정] embed 삭제 시 회사 namespace·폴더 정리 호출
├── utils/companyDocs/queue.js                             # [신규] 직렬 처리 큐, 부팅 시 processing→failed
├── utils/companyDocs/process.js                           # [신규] collector 호출 → 폴더 이동 → addDocumentToNamespace → 상태 갱신
├── utils/vectorSearch/mergeSharedResults.js               # [수정, fork 파일] companyNamespace 선택 인자
├── utils/chats/embed.js                                   # [수정] 회사 검색 연결, gating, L1/L2 적용
├── utils/chats/companyDocsPrompt.js                       # [신규] 표지·지시문 상수와 적용 함수
├── index.js 또는 부팅 경로                                   # [수정 최소] 큐 부팅 정리 호출 1줄
├── __tests__/endpoints/embedCompanyDocuments.test.js      # [신규]
├── __tests__/utils/chats/embed.companyDocs.test.js        # [신규]
├── __tests__/utils/vectorSearch/mergeSharedResults.test.js # [수정] companyNamespace 케이스
└── scripts/e2e-embed-hr-skill/
    ├── runner.js                                          # [수정] company / company_docs_seed 지원
    ├── scenarios.json                                     # [수정] CR-01~09 append
    └── fixtures/company-docs/                             # [신규] PDF·HWP·HWPX·공통 문서
collector/
├── package.json                                           # [수정] kordoc 4.24.59, engines node>=20
├── utils/constants.js                                     # [수정] .hwp/.hwpx MIME·변환기 등록
├── processSingleFile/convert/asHwp.js                     # [신규]
└── __tests__/processSingleFile/asHwp.test.js              # [신규]
frontend/src/pages/GeneralSettings/ChatEmbedWidgets/EmbedConfigs/
├── NewEmbedModal/index.jsx                                # [수정] "회사 문서 허용" 토글
└── EmbedRow/EditEmbedModal/index.jsx                      # [수정] 동일
docker/Dockerfile                                          # [수정] amd64 node_18.x → node_20.x (1줄)

# okrservice (/Users/shin-yeji/okrservice/widgets)
server/index.ts                                            # [수정] /ai-chat/company-documents 3개 + stream에 companyName
client/messenger/components/chatbot/companyDocs.ts         # [신규] API·companyName/uploader 헬퍼
client/messenger/components/chatbot/CompanyDocsPanel.tsx   # [신규]
client/messenger/components/chatbot/ChatbotView.tsx        # [수정] 헤더 아이콘 + 패널 토글
client/messenger/components/chatbot/teamplgpt.ts           # [수정] streamChat 본문에 companyName
client/messenger/components/chatbot/__tests__/CompanyDocsPanel.test.tsx  # [신규]
client/messenger/components/chatbot/__tests__/companyDocs.test.ts        # [신규]
locales/ko.json, locales/en.json                           # [수정] i18n 키 14개
```

**Structure Decision**: 기존 TeamplGPT 3-패키지 구조(server, collector, frontend)와 okrservice widgets 구조를 그대로 쓴다. 회사 문서 로직은 신규 파일(`embedCompanyDocuments.js`, `utils/companyDocs/*`, `companyDocsPrompt.js`, `asHwp.js`)에 모은다. 업스트림·공용 파일에는 연결 지점만 둔다.

## 구현 순서 (tasks.md 입력)

1. **E2E 먼저 (헌장 III)**
   - 픽스처를 준비하고, runner에 `company`·`company_docs_seed`를 지원한 뒤 CR-01~09를 append한다.
   - 실행해서 FAIL을 확인한다. 이 시점에는 업로드 라우트가 없어 시드 단계에서 실패하는 것도 "FAIL 확인"으로 인정한다.
2. **HWP 변환기**
   - Node 20 환경을 맞추고 kordoc을 추가한다.
   - `asHwp.js`와 constants 등록 → 단위 테스트(HWP·HWPX 표 텍스트, DRM·암호·빈 문서 실패 사유).
3. **데이터**: 스키마와 마이그레이션, `EmbedConfig` writable, `embedCompanyDocument` 모델.
4. **업로드·처리**: 큐와 처리기 → 라우트 3개와 미들웨어 → 단위 테스트(인가 404, 크기 413, 형식 400, 처리 중 삭제).
5. **검색·프롬프트**
   - `performMergedSearch` 확장과 테스트: 인자가 없으면 기존과 같음, 회사 검색 실패 시 빈 결과.
   - embed.js 연결과 gating, `companyDocsPrompt` 적용, 테스트: 회사 근거가 없으면 프롬프트 불변.
6. **정리**: embed 삭제 시 namespace와 폴더를 정리한다.
7. **관리자 토글**: 모달 2개.
8. **okrservice**: 프록시 → 클라이언트 API → 패널·헤더 → i18n → jest.
9. **검증**
   - CR 전건 PASS, 기존 embed와 HR E2E 전건 PASS.
   - quickstart §4 위젯 실동작 확인.
   - Docker 빌드에서 collector 기동과 HWP 처리 확인.

## 위험과 대응

| 위험 | 대응 |
|---|---|
| Node 20 상향으로 기존 collector·server 의존성이 깨짐 | 2단계에서 Node 20으로 `yarn install`과 기존 jest·E2E를 먼저 돌린다. 깨지면 중단하고 보고한다 |
| HWP 샘플 부족으로 추출 품질 미검증 | 사용자 고객사 실제 사규 HWP를 1개 이상 받아 비공개 로컬 검증에 쓴다(리포에 커밋하지 않음). 커밋용 픽스처는 직접 작성한 문서로 만든다 |
| 운영 nginx 업로드 상한(리포 밖) | 배포 체크리스트에 `client_max_body_size ≥ 51M`(위젯 경로)를 넣는다. 위젯 서버는 413을 명확한 사유와 함께 돌려준다 |
| 회사 이름 위조·표기 차이(D4·D5) | 감수한 한계로 보고서에 남긴다. 서버 검증은 후속 과제 |
| 큐가 프로세스 메모리에만 있어 재시작 시 유실 | 부팅 시 `processing`을 `failed`로 바꾸고 "다시 올려 주세요"라고 안내한다 |
| LLM이 충돌 시 공통 문서를 따름 | L1과 L2를 함께 적용하고 CR-02를 `repeat`로 반복 확인한다. FAIL이 나면 지시문을 조정한다(문구 정본 갱신) |

## Complexity Tracking

| 업스트림·공용 파일 수정 | 왜 필요한가 | 더 단순한 대안을 버린 이유 |
|---|---|---|
| `server/utils/chats/embed.js` 분기·gating | 회사 근거를 embed 채팅에 넣는 유일한 지점이다 | embed 전용 래퍼 파일을 만들면 `streamChatWithForEmbed` 전체(fork 커스텀 다수)를 복제해야 한다 |
| `docker/Dockerfile` node 18→20 (1줄) | kordoc이 요구한다. Node 18은 수명이 끝났다 | HWPX만 직접 파싱하고 HWP를 포기하는 방안은 사용자 결정(HWP 1차 포함)과 충돌한다 |
| `collector/utils/constants.js` 등록 | 변환기 등록 지점 | 대안 없음 |
| embed 관리 모달 2개 토글 | opt-in 없이 켜면 모든 embed에서 공개 업로드가 열린다 | env로 embed ID 목록을 받는 방안은 관리자가 화면에서 상태를 볼 수 없다 |
