# Quickstart: 위젯 회사별 사규 문서 RAG 검증

## 사전 조건

- Node 20 이상 (collector의 kordoc 요구). `node -v`로 확인.
- TeamplGPT: `yarn dev:all` (server `:3001`, collector `:8888`), `cd server && npx prisma migrate deploy`.
- 관리자 화면 → 채팅 임베드 위젯 → 대상 embed 수정 → **회사 문서 허용** ON, allowlist에 위젯 Origin 등록.
- 공통 문서: 대상 워크스페이스에 `fixtures/company-docs/common-경조휴가3일.pdf` 업로드·임베딩.
- okrservice 위젯: `widgets/.env`에 `TEAMPLGPT_BASE_URL`, `TEAMPLGPT_EMBED_ID`, `TEAMPLGPT_WIDGET_ORIGIN` → `cd widgets && yarn dev`.

## 1. 단위 테스트

```bash
# TeamplGPT (리포 루트)
npx jest server/__tests__/endpoints/embedCompanyDocuments.test.js \
         server/__tests__/utils/vectorSearch/mergeSharedResults.test.js \
         server/__tests__/utils/chats/embed.companyDocs.test.js \
         collector/__tests__/processSingleFile/asHwp.test.js

# okrservice 위젯
cd /Users/shin-yeji/okrservice/widgets && npx jest client/messenger/components/chatbot
```

기대: 전건 PASS. 특히 "다른 회사 문서 삭제 → 404", "회사 근거 없을 때 프롬프트 불변", "HWP/HWPX 표 텍스트 추출".

## 2. API 수동 확인 (curl)

```bash
EMBED=<embed uuid>; ORIGIN=<allowlist origin>; BASE=http://localhost:3001/api/embed/$EMBED
curl -s -H "Origin: $ORIGIN" -F companyName=오이사공 -F uploaderName=테스트 \
     -F file=@server/scripts/e2e-embed-hr-skill/fixtures/company-docs/A사-취업규칙.hwp \
     $BASE/company-documents                      # 202, status=processing
curl -s -H "Origin: $ORIGIN" "$BASE/company-documents?companyName=오이사공"   # 2분 안에 ready
curl -s -H "Origin: $ORIGIN" "$BASE/company-documents?companyName=다른회사"   # documents: []
curl -s -X DELETE -H "Origin: $ORIGIN" "$BASE/company-documents/<id>?companyName=다른회사"  # 404
```

## 3. E2E (LLM 행태)

```bash
npm run e2e:embed-company-docs      # CR-01~09 (별도 러너, --only=CR-05 가능)
npm run e2e:embed-hr-skill          # 기존 embed 시나리오 회귀 전건
npm run e2e:hr-skill                # 기존 HR 시나리오 회귀 전건
```

기대: CR 9건 PASS, 기존 시나리오 전건 PASS (SC-001~003, SC-005, SC-006). CR-01은 `repeat`로 10회 중 9회 이상(SC-001).

## 4. 위젯 실동작

1. `companyData: { name: '오이사공' }`로 위젯 테스트 페이지 열기 → 챗봇 헤더에 문서 아이콘 보임.
2. HWP 1개 + PDF 1개 동시 선택 → 둘 다 "처리 중" → 2분 안에 "사용 가능" (SC-004).
3. "결혼하면 휴가 며칠?" → 5일, 출처 표시 없음.
4. `companyData` 없이 열기 → 문서 아이콘 없음, 같은 질문에 3일.
5. `name: '다른회사'`로 열기 → 목록 비어 있음, 같은 질문에 3일.
6. 다시 '오이사공' → 문서 삭제 → 같은 질문에 3일.
7. 60MB 파일, `.zip` 파일 선택 → 올라가지 않고 사유 표시.
8. 업로드 → 목록 확인 → 삭제를 처음 보는 사람이 3분 안에 마치는지(SC-007).
9. 관리자 화면 워크스페이스에 `.hwp` 업로드 → 임베딩 → 내용 질문(US4).

## 5. 배포 체크리스트

TeamplGPT
- [ ] Node 20 이미지로 빌드 (`docker/Dockerfile` amd64 단계 `node_20.x`). collector가 기동하고 `/accepts`에 `.hwp`·`.hwpx`가 있는지 확인
- [ ] `prisma migrate deploy`로 `20261110000000_add_embed_company_documents` 적용. 앞선 마이그레이션 중 실패 상태가 있으면 먼저 해소한다(로컬은 `20260904000000_add_llm_log_tool_trace`가 실패 상태였음)
- [ ] 대상 embed 설정에서 "회사 문서 업로드 허용" ON
- [ ] embed의 허용 도메인 목록을 쓰는 경우 위젯 서버의 `TEAMPLGPT_WIDGET_ORIGIN`과 일치시킨다
- [ ] 임베더: 기본 `all-MiniLM-L6-v2`는 한국어 검색 품질이 낮다. `EMBEDDING_MODEL_PREF='MintplexLabs/multilingual-e5-small'`로 바꾸려면 기존 워크스페이스를 전부 재임베딩해야 한다(차원은 384로 같아 오류 없이 섞이지만 검색이 틀어진다)
- [ ] `storage/company-documents/`가 영속 볼륨(`STORAGE_DIR`) 안에 있는지 확인

okrservice 위젯 서버
- [ ] env: `TEAMPLGPT_BASE_URL`, `TEAMPLGPT_EMBED_ID`, (선택) `TEAMPLGPT_WIDGET_ORIGIN`
- [ ] 위젯 경로 앞단 nginx·ingress `client_max_body_size` ≥ 51M (`/ai-chat/company-documents`)
- [ ] TeamplGPT 앞단 프록시도 같은 상한(≥ 51M)
