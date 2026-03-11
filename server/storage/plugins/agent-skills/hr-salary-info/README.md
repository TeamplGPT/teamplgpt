# HR 급여정보 조회

AnythingLLM Custom Agent Skill - 사원번호로 급여정보를 조회합니다.

## 기능

- HR REST API (`/api/v1/salary/info`)를 호출하여 급여 산출일자 정보 17개 필드를 조회
- 조회 기간(시작일~종료일) 지정 가능

## 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| emp_no | string | Yes | 사원번호 |
| sta_ymd | string | No | 조회 시작일 (YYYYMMDD) |
| end_ymd | string | No | 조회 종료일 (YYYYMMDD) |
| site_id | string | No | 사이트 ID |

## 설정

| 설정 | 설명 | 기본값 |
|------|------|--------|
| HR_API_BASE_URL | HR REST API 서버 주소 | http://host.docker.internal:8000 |

## 사용 예시

```
@agent 사원번호 12345의 급여 정보 조회해줘
@agent 직원 00100의 2026년 1월 급여 알려줘
@agent 사번 A0001 3월 급여내역
```

## 응답 필드

사원번호, 귀속년월, 급여일자, 근무시간, 시급, 일급, 평일연장수당, 평일야간수당, 휴일근무수당, 휴일연장수당, 휴일야간수당, 과세금액, 비과세금액, 지급액, 실지급액

## 요구사항

- AnythingLLM v1.2.2+ (Docker) 또는 Desktop v1.6.5+
- HR REST API 서버 실행 중
