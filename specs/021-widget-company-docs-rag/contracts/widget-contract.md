# Contract: okrservice 위젯 (프록시 + 화면)

저장소: `/Users/shin-yeji/okrservice/widgets`

## 1. 위젯 서버 프록시 (`widgets/server/index.ts`)

공통: env `TEAMPLGPT_BASE_URL`, `TEAMPLGPT_EMBED_ID`, `TEAMPLGPT_WIDGET_ORIGIN` 재사용. EMBED_ID 미설정 시 503. 모든 upstream 요청에 `Origin: TEAMPLGPT_WIDGET_ORIGIN`(설정 시). 로그에 파일 내용·회사 이름 원문을 남기지 않는다(회사 이름은 해시 앞 8자만).

| 위젯 서버 | → TeamplGPT |
|---|---|
| `GET /ai-chat/company-documents?companyName=` | `GET /api/embed/{EMBED_ID}/company-documents?companyName=` |
| `POST /ai-chat/company-documents` (multipart) | `POST /api/embed/{EMBED_ID}/company-documents` — 요청 본문 스트림 그대로, `content-type`·`content-length` 유지, `duplex: 'half'` |
| `DELETE /ai-chat/company-documents/:id?companyName=` | `DELETE /api/embed/{EMBED_ID}/company-documents/:id?companyName=` |
| `POST /ai-chat/stream` (기존) | 본문에 `companyName`(문자열이면) 추가 전달 |

- POST: `content-length` 없거나 > 51 × 1024 × 1024 → 413 `{ error: "FILE_TOO_LARGE" }` (upstream 호출 전).
- upstream 상태 코드·JSON 본문은 그대로 돌려준다.

## 2. 클라이언트 API 모듈 (신규 `components/chatbot/companyDocs.ts`)

```ts
listCompanyDocs(companyName: string): Promise<CompanyDoc[]>
uploadCompanyDoc(companyName: string, file: File, uploaderName?: string): Promise<CompanyDoc>
deleteCompanyDoc(companyName: string, id: number): Promise<void>
getCompanyName(): string            // connection.setting.companyData?.name?.trim() ?? ""
getUploaderName(): string | undefined // setting.name → setting.email → undefined
```

`teamplgpt.ts`의 `streamChat`은 `getCompanyName()` 값이 있으면 본문에 `companyName`을 넣는다.

## 3. 화면 (신규 `components/chatbot/CompanyDocsPanel.tsx`)

- 진입: `ChatbotView` 헤더 아이콘 행에 문서 아이콘 버튼(`aria-label` = `__("Company documents")`). `getCompanyName()`이 비면 버튼을 렌더링하지 않는다.
- 패널: 챗봇 화면 위에 겹쳐 표시, 닫기 버튼으로 복귀(대화 상태 유지).
- 구성: 제목 · 안내 한 줄 · "파일 올리기" 버튼(hidden `input type=file multiple`, `accept` = 허용 확장자) · 문서 목록.
- 목록 행: 파일 이름 · 올린 사람 · 올린 날짜(YYYY-MM-DD) · 상태 배지 · 삭제 버튼. `failed`면 사유 한 줄.
- 삭제: 확인 대화(`__("Delete this document? It will no longer be used for answers.")`) 후 호출, 성공 시 목록에서 제거.
- 업로드: 선택 파일을 순서대로 1개씩. 업로드 전 확장자·50MB 검사, 위반 파일은 올리지 않고 행 단위로 사유 표시.
- 폴링: 목록에 `processing`이 있으면 5초마다 재조회, 없으면 중지. 패널 닫으면 중지.
- 안내 목록(`data-testid="company-docs-guide"`): 아래 표의 안내 5줄을 항상 표시
- 빈 목록: `__("No documents yet. Use Upload files above to add your company's rules.")`

### i18n 키 (ko / en — `widgets/locales/ko.json`, `en.json`)

| key (= en) | ko |
|---|---|
| Company documents | 우리 회사 문서 |
| Upload your company's rules (work rules, policies, benefits, etc.) and the chatbot will refer to them when answering. If they differ from the general guidance, your company's documents take priority. | 취업규칙, 사규, 복리후생 규정 같은 우리 회사 규정을 올려 두면 챗봇이 그 내용을 참고해서 답변합니다. 일반적인 기준과 다른 부분은 우리 회사 규정에 맞춰 안내합니다. |
| Only people at your company can see the list of uploaded documents, and anyone at your company can delete a document uploaded by mistake. | 올린 문서 목록은 우리 회사 직원에게만 보이고, 잘못 올린 문서는 직원 누구나 삭제할 수 있습니다. |
| PDF, Hangul (HWP/HWPX), Word, Excel, PowerPoint, text files and more, up to 50MB per file. | PDF, 한글(HWP/HWPX), Word, Excel, PowerPoint, 텍스트 파일 등을 파일당 50MB까지 올릴 수 있습니다. |
| Documents are used for answers once their status shows Ready, usually within a few minutes. Deleted documents stop being used from the next question. | 상태가 '사용 가능'으로 바뀌면(보통 몇 분 이내) 답변에 사용됩니다. 삭제하면 다음 질문부터 사용되지 않습니다. |
| Please do not upload documents containing personal information such as resident registration numbers or pay details. | 주민등록번호·급여 내역 같은 개인정보가 담긴 문서는 올리지 마세요. |
| Upload files | 파일 올리기 |
| Processing | 처리 중 |
| Ready | 사용 가능 |
| Failed | 실패 |
| Delete | 삭제 |
| Delete this document? It will no longer be used for answers. | 이 문서를 삭제할까요? 삭제하면 더 이상 답변에 쓰이지 않습니다. |
| No documents yet. Use Upload files above to add your company's rules. | 아직 올린 문서가 없습니다. 위의 '파일 올리기'로 회사 규정 파일을 올려 주세요. |
| Unsupported file type | 지원하지 않는 파일 형식입니다 |
| File is larger than 50MB | 50MB보다 큰 파일은 올릴 수 없습니다 |
| Upload failed. Please try again. | 올리지 못했습니다. 다시 시도해 주세요. |
| Unknown | 알 수 없음 |
| Close | 닫기 |
| This document is DRM-protected and cannot be read | 보안(DRM)이 걸린 문서라 읽을 수 없습니다 |
| This document is password-protected and cannot be read | 암호가 걸린 문서라 읽을 수 없습니다 |
| No text was found in this document | 문서에서 글자를 찾지 못했습니다 |
| This document could not be processed | 문서를 처리하지 못했습니다 |
| Processing was interrupted. Please upload it again | 처리 중 중단되었습니다. 다시 올려 주세요 |

처리 실패 사유는 서버 `error` 코드를 위 키로 번역한다(api 계약 "실패 사유 코드" 표). 업로드 프록시는 upstream fetch에 2분 타임아웃을 건다.
