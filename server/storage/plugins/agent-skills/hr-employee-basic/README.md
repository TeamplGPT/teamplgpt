# HR 직원 정보 조회

AnythingLLM Custom Agent Skill - 사원번호로 직원 정보를 조회합니다.

## 기능

- HR REST API (`/api/v1/employee/basic`)를 호출하여 직원 정보 13개 필드를 조회
- PII(개인식별정보)는 포함하지 않음

## 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| emp_no | string | Yes | 사원번호 |
| site_id | string | No | 사이트 ID |

## 설정

| 설정 | 설명 | 기본값 |
|------|------|--------|
| HR_API_BASE_URL | HR REST API 서버 주소 | http://host.docker.internal:8000 |

## 사용 예시

```
@agent 사원번호 12345의 정보 알려줘
@agent 직원 00100번 기본정보 조회해줘
```

## 응답 필드

사원번호, 이름, 조직코드, 조직명, 직위코드, 직위명, 직책코드, 직책명, 직급코드, 직급명, 직원구분코드, 직원구분명, 사이트ID

## 요구사항

- AnythingLLM v1.2.2+ (Docker) 또는 Desktop v1.6.5+
- HR REST API 서버 실행 중
