# HR 휴가/휴직 정보 조회

AnythingLLM Custom Agent Skill - 사원번호로 휴가/휴직 정보를 조회합니다.

## 기능

- HR REST API (`/api/v1/leave/info`)를 호출하여 휴가/휴직 정보 15개 필드를 조회
- 휴가코드, 기준일로 필터링 가능

## 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| emp_no | string | Yes | 사원번호 |
| leav_cd | string | No | 휴가 코드 |
| base_ymd | string | No | 기준일 (YYYYMMDD) |
| site_id | string | No | 사이트 ID |

## 설정

| 설정 | 설명 | 기본값 |
|------|------|--------|
| HR_API_BASE_URL | HR REST API 서버 주소 | http://host.docker.internal:8000 |

## 사용 예시

```
@agent 사원번호 12345의 휴가 정보 알려줘
@agent 직원 00100의 오늘 기준 휴가 현황
@agent 사번 A0001 연차 사용내역 조회
```

## 응답 필드

사원번호, 근태코드, 근태종류, 시작일자, 종료일자, 연차번호, 신청사유, 근무유형코드, 근무유형명, 조직코드, 조직명, 직위코드, 직위명, 상태코드, 비고

## 요구사항

- AnythingLLM v1.2.2+ (Docker) 또는 Desktop v1.6.5+
- HR REST API 서버 실행 중
