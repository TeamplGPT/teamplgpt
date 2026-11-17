# Feature Specification: 고객 종료 시 회사 데이터 파기 API

**Feature Branch**: `feature/skill-modify-hrchat-merge` (022)

**Created**: 2026-11-17

**Status**: Approved (대화에서 결정·구현 지시)

**Input**: 5240이 계약 만료·해지 시 TeamplGPT로 API를 호출하면 해당 회사 관련 데이터를 즉시 파기

## User Scenarios & Testing

### User Story 1 - 5240이 해지·만료 후 파기 API 호출 (Priority: P1)

5240 관리자가 고객을 해지하거나 계약이 만료되면, 5240 서버가 TeamplGPT `POST /api/v1/company-data/purge`를 API 키와 회사 이름으로 호출한다. TeamplGPT는 즉시 그 회사 문서를 전부 지운다.

**Acceptance Scenarios**:

1. **Given** 회사명 "오이사공" 문서가 있고 유효한 API 키로 호출하면, **When** purge 요청, **Then** 200이고 해당 회사 문서·파일·벡터가 없다
2. **Given** 해당 회사 문서가 없으면, **When** 같은 요청, **Then** 200 (멱등)
3. **Given** API 키가 없으면, **When** 호출, **Then** 403
4. **Given** companyName이 비면, **When** 호출, **Then** 400 COMPANY_REQUIRED

### Edge Cases

- 같은 회사명이 여러 embed에 있어도 전부 삭제
- 일부 파일/벡터 삭제 실패 시 500 PURGE_FAILED, 로그에 남김 (재시도 가능)

## Requirements

- FR-001: `POST /api/v1/company-data/purge`, `Authorization: Bearer {API_KEY}` (`validApiKey`)
- FR-002: Body `companyName`(필수), `reason`(선택: `contract_expired`|`admin_terminated`|`other`)
- FR-003: 회사명은 `companyData.name`과 동일 규칙(trim). hash로 매칭
- FR-004: 즉시 파기. 유예 없음
- FR-005: 파기 범위 = 해당 회사의 embed 회사 문서 전부(DB 행 + storage JSON + 벡터 namespace). embed 채팅은 회사 키가 없어 v1 범위 밖
- FR-006: 성공 응답에 삭제 건수 요약. 없어도 purged 성공으로 처리

## Success Criteria

- SC-001: 단위 테스트로 인증·검증·삭제·멱등 확인
- SC-002: 배포 URL `https://demo.teamplgpt.com/api/v1/company-data/purge`
