# Research: 위젯 회사별 사규 문서 RAG

**Spec**: [spec.md](./spec.md) | **Date**: 2026-11-10

## R1. HWP·HWPX 텍스트 추출

- **Decision**: `kordoc`(MIT, `parseHwp`/`parseHwpx`)을 정확한 버전으로 고정(`"kordoc": "4.24.59"`)해 collector 신규 변환기 `asHwp.js`에서 사용한다. 표는 kordoc이 Markdown 표로 내보내는 결과를 그대로 `pageContent`에 넣는다.
- **Rationale**: Node 순수 JS(네이티브 빌드 불필요), HWP 5.0(OLE + zlib)·배포용 문서 복호화·HWPX를 한 라이브러리로 처리, 2026-11-09까지 유지보수 중(`npm view` 확인). 표가 Markdown으로 남아 사규의 "구분/일수" 표가 청크에서 깨지지 않는다.
- **Alternatives considered**:
  - `hwp.js` — 2022년 이후 방치, 배포용 문서 미지원.
  - `@ohah/hwpjs` — RC 단계, 변환 API 방향 전환 중.
  - `pyhwp`(hwp5txt) — AGPL-3, 2020년 이후 방치, Docker 이미지에 Python 추가 필요.
  - LibreOffice + H2Orestart — 이미지 수백 MB 증가, JRE 필요, 느림.
  - HWPX 직접 파싱(jszip + xmldom) — 가능하지만 section 순서·각주·글상자·표 구조를 직접 처리해야 함. kordoc 도입이 막힐 때의 대안으로만 둔다.
- **Risks**:
  - kordoc은 `engines: node >=20`. Docker amd64 단계가 Node 18(`docker/Dockerfile` 94행 `node_18.x`), 로컬 개발 환경도 v18.20.4 → **Node 20으로 올려야 한다**(arm64 단계는 이미 20). upstream 파일 1줄 변경.
  - 1인 메인테이너·빠른 릴리스 → 버전 고정 + 회귀 샘플(HWP/HWPX 각 1개 이상, 표 포함) 필수.
  - 한컴 DRM 문서는 어떤 오픈소스로도 불가 → "실패" 상태 + 사유 표시.
  - 의존성 증가(`@modelcontextprotocol/sdk` 등). 이미지 크기 증가 감수.

## R2. 회사별 검색 공간

- **Decision**: 회사 문서 벡터는 LanceDB 별도 테이블(namespace) `${workspace.slug}-co-${hash}`에 저장한다. `hash` = `sha256(companyKey)` 앞 16자리 hex, `companyKey` = `companyData.name.trim()`.
- **Rationale**: `VectorDb.addDocumentToNamespace(namespace, …)`는 namespace 문자열만 받고 workspace 행을 요구하지 않는다(`lance/index.js:351-463`). 테이블이 물리적으로 분리돼 다른 회사 문서가 섞일 경로가 없다(D17). 해시로 한글·특수문자·길이 문제를 없앤다.
- **Alternatives considered**:
  - 워크스페이스 namespace 하나에 메타데이터 `companyKey`를 넣고 검색 시 `where` 필터 — Lance `performSimilaritySearch` 본검색에 필터 인자가 없어(`where`는 인접 청크 전용) 업스트림 벡터 계층을 고쳐야 하고, 필터 누락 버그 한 번이 곧 회사 간 누출이다.
  - 회사마다 TeamplGPT 워크스페이스 생성 — 관리자 화면에 고객사 수만큼 워크스페이스가 쌓이고, HR 스킬·프롬프트 설정을 회사마다 복제해야 한다.
- **Note**: 워크스페이스 삭제·리셋은 `slug` namespace만 지운다(`workspaces.js:272-287`). 회사 namespace는 embed 삭제 시 함께 정리하도록 embed 삭제 경로에 정리 훅을 둔다(R6).

## R3. 업로드 처리 방식 (동기 vs 백그라운드)

- **Decision**: 업로드 요청은 파일을 hotdir에 저장하고 문서 행을 `processing`으로 만든 뒤 **즉시 202 응답**한다. 변환(collector) → 임베딩 → `ready`/`failed` 갱신은 같은 서버 프로세스 안의 직렬 큐(동시 1건)에서 처리한다. 서버 재시작 시 `processing`으로 남은 행은 `failed`("서버 재시작으로 중단")로 바꾼다.
- **Rationale**: 기존 임베딩은 요청 안에서 동기로 돈다(`lance/index.js:415`). 50MB PDF나 음성 파일은 수 분이 걸려 위젯 서버·nginx 타임아웃에 걸린다. 위젯은 목록 폴링으로 상태를 본다(SC-004 "2분 안에 사용 가능"). 동시 1건은 임베딩 API 사용량 급증을 막는다.
- **Alternatives considered**: Bree 워커(기존 `BackgroundService`) — 워커는 별도 스레드라 Prisma·VectorDb 초기화를 다시 해야 하고 업스트림 파일(BackgroundWorkers/index.js)을 고쳐야 한다. 1차 규모에는 과하다.

## R4. 업로드 경로와 인가

- **Decision**: 신규 fork 파일 `server/endpoints/embedCompanyDocuments.js`에 아래 3개 라우트를 둔다. `server/endpoints/embed/index.js`에서 등록 한 줄만 추가한다.
  - `GET /embed/:embedId/company-documents`
  - `POST /embed/:embedId/company-documents`(multipart, 파일 1개)
  - `DELETE /embed/:embedId/company-documents/:id`
- 미들웨어:
  - `validEmbedConfig`(기존)
  - 신규 `companyDocsAllowed`: embed `enabled`, `allow_company_documents`, Origin allowlist 검사, `companyName` 정규화. 비어 있으면 400.
- **삭제·조회 권한**: 행의 `embed_id`와 `company_key`가 요청 값과 모두 같을 때만 허용한다. 다른 회사 문서 ID를 넣으면 404로 응답해, 문서가 있다는 사실도 드러내지 않는다.
- **Rationale**: 기존 embed 공개 경로와 같은 신뢰 모델이다. 실제 embed ID는 okrservice 위젯 서버 env에만 있고 브라우저에는 노출되지 않는다. 그래서 TeamplGPT를 직접 호출하려면 embed ID를 알아야 한다.
- **Opt-in 컬럼**: `embed_configs.allow_company_documents`(기본 false)를 추가하고, 관리자 embed 생성·수정 모달에 토글을 둔다. specs/003 `client_tool_execution`과 같은 패턴이다. 기존 embed는 꺼진 상태라 동작이 바뀌지 않는다.
- **Alternatives considered**: 위젯 서버 ↔ TeamplGPT 공유 시크릿 헤더. 직접 호출 방어는 강해지지만 기존 채팅 경로와 신뢰 모델이 달라진다. D5에서 위조 위험을 감수하기로 했으므로 1차에서는 넣지 않는다.

## R5. 답변 근거 결합과 회사 문서 우선 (L1/L2)

- **Decision**:
  - `performMergedSearch`(fork 파일)에 선택 인자 `companyNamespace`를 추가한다.
  - 회사 검색은 공통 검색과 같은 재작성 질의(`searchInput`)로 병렬 실행하고, 결과는 `{ ...기존, companyContextTexts, companySources }`로 **분리해서** 돌려준다.
  - embed.js는 회사 근거를 공통 근거보다 **앞에** 두고, 각 회사 청크 앞에 표지 문구를 붙인다(L2).
  - 시스템 프롬프트에는 우선순위 지시문을 회사 근거가 있을 때만 덧붙인다(L1).
  - 문구 정본은 [contracts/prompt-contract.md](./contracts/prompt-contract.md)에 둔다.
- **Rationale**:
  - 공통 `mergeAndRank`에 섞으면 점수 순으로 회사 청크가 밀리거나, `chunkSource` 중복 제거에서 짝이 어긋날 수 있다(인덱스 짝짓기, `mergeSharedResults.js:89-122`). 분리하면 기존 local+shared 병합 동작이 전혀 바뀌지 않는다(FR-014).
  - 회사 검색 실패는 `catch`로 빈 결과를 돌려준다(FR-013).
- **Gating**:
  - embed.js 상단의 "문서 0개 + query 모드면 거절" 분기와 `embeddingsCount !== 0` 검색 조건이 회사 namespace 문서 수도 함께 보도록 한다.
  - 검색 후 "근거 0개면 거절" 분기는 회사 근거까지 합친 개수로 판단한다.
- **Alternatives considered**: 공통 근거와 회사 근거에 서로 다른 점수 보정치를 줘서 한 번에 정렬하는 방식. 보정치를 튜닝해야 하고, 결과를 예측하기 어렵다.

## R6. 정리(cleanup)

- **Decision**: embed 삭제(`DELETE /embed/:embedId`, 관리자)에서 해당 embed의 회사 문서 행을 조회해 각 namespace를 `delete-namespace`로 지우고, 저장 폴더도 함께 지운다. 행은 FK cascade로 삭제된다.
- **Rationale**: 고아 벡터 테이블을 남기지 않는다.
- **Not in scope**: 워크스페이스 자체 삭제 시 정리(embed가 먼저 cascade 삭제되므로 행은 사라지지만 namespace가 남을 수 있음). 1차에서는 알려진 한계로 남긴다.

## R7. 위젯 서버 프록시 (okrservice)

- **Decision**:
  - 업로드는 `POST /ai-chat/company-documents`가 들어온 multipart 요청 본문을 **그대로 스트림으로** TeamplGPT에 넘긴다(`fetch(..., { body: req, duplex: 'half' })`, `content-type`·`content-length` 유지).
  - 위젯 서버는 multer로 파싱하지 않는다.
  - `content-length`가 51MB를 넘으면 413을 돌려준다.
  - 목록·삭제는 JSON 프록시로 처리한다.
  - 모든 요청에 `Origin: TEAMPLGPT_WIDGET_ORIGIN`을 붙인다.
- **Rationale**:
  - 위젯 서버의 JSON 상한(2MB)과는 별도 경로가 된다.
  - 디스크·메모리에 버퍼링하지 않는다.
  - 클라이언트는 파일을 1개씩 순차 업로드하므로 요청 하나의 상한이 파일 상한과 같다.
- **Deployment note**: 운영 nginx·ingress의 `client_max_body_size`를 위젯 경로에서 **≥ 51M**로 확인해야 한다. 이 설정은 리포 밖에 있다. 확인된 `packages/core-ui/nginx/nginx.conf`는 20M로 다른 서비스 설정이다.

## R8. 위젯 UI (okrservice)

- **Decision**: `ChatbotView` 헤더 아이콘 행(새 채팅·이력·매뉴얼)에 "회사 문서" 아이콘을 추가한다. 아이콘을 누르면 챗봇 화면 안에 `CompanyDocsPanel`을 덮어 표시하고, 라우트는 추가하지 않는다. `companyData.name`이 비면 아이콘을 숨긴다.
- **목록 갱신**: 처리 중인 문서가 있는 동안 5초 간격으로 목록을 다시 읽는다.
- **업로드 전 검사**: 확장자와 50MB 상한을 업로드 전에 클라이언트에서 먼저 검사한다. 서버에서도 다시 검사한다.
- **문자열**: 신규 문자열은 `__()`와 `widgets/locales/{ko,en}.json`으로 제공한다. 기존 챗봇은 한글을 하드코딩하고 있지만, 신규 화면은 i18n 규칙(FR-016)을 따른다.
- **채팅 요청**: `streamChat` 요청 본문에 `companyName`을 추가한다. 위젯 서버 `/ai-chat/stream`은 이 값을 그대로 TeamplGPT에 넘긴다.
- **올린 사람 표시**: `connection.setting.name` → `connection.setting.email` → "알 수 없음" 순으로, 앞의 값이 없을 때 다음 값을 쓴다. 이 값을 업로드 multipart 필드 `uploaderName`으로 보낸다.

## R9. E2E

- **Decision**: 기존 embed 러너 `server/scripts/e2e-embed-hr-skill/runner.js`를 확장한다.
  - 시나리오에 `company`(요청 `companyName`)와 `company_docs_seed`(시나리오 전 업로드할 픽스처 목록)를 추가한다.
  - 러너는 시드 업로드 → `ready`까지 폴링 → 질문 → `answer_pattern`/`answer_not_pattern` 순서로 판정한다.
  - axis `company-rag`로 묶는다.
- **픽스처**: `server/scripts/e2e-embed-hr-skill/fixtures/company-docs/`에 둔다.
  - A사 취업규칙(PDF·HWP·HWPX 각 1개, 같은 고유 문구 "경조휴가 본인 결혼 5일" + 표 포함)
  - 공통 문서(경조휴가 3일)
- **Dependency**: 실제 한글 프로그램으로 저장한 HWP·HWPX 샘플이 필요하다. 라이브러리로는 HWP를 생성할 수 없다. → 사용자에게 샘플 제공을 요청하거나, 공공 사이트의 공개 사규 HWP를 쓴다.
