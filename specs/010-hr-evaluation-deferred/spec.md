# Feature Note: hr-evaluation (평가) — 보류 (Deferred)

**Status**: **보류 확정** (2026-07-16)
**Input**: kiwibox §4.11 + §7 + kiwibox AI(cmmAiAssistant) 소스 실측

## 결정

평가 도메인은 **agent-skill로 반영하지 않는다.** 카탈로그 최고위험(§7) + kiwibox 자체 AI의
설계 판단(전용 도구 미구현) + §4.11 전 endpoint c범위(self 검증 없음)라 self 강제만으로
안전을 보장할 수 없다. 정책·게이트 실측이 선행돼야 한다.

## 보류 근거 (3중)

1. **kiwibox AI 설계 의도** — cmmAiAssistant는 평가 전용 조회 도구를 만들지 않았다.
   self 도구 목록(결재·교육·근태·휴가·프로필)에 평가 없음. 대신 `MY_KEYWORD`(CMMF_KEYWD_INFO
   자유텍스트)에 평가가 섞여 있으면 **"있을 때만 요약·마스킹"**, @타인 평가는 **절대 제공 금지**
   (CMMAiAssistantController.java 465·470·552·2464행). 구조화 점수·등급 조회는 의도적 배제.
2. **카탈로그 §7** — 평가결과·확정등급·피드백 = "보류(고위험), 조직 승인 필수".
3. **§4.11 전부 c범위** — PFMOwn/PFMConfirmMgr/PFMCmpEvlOwn 등 staffId/evalStaffId를
   self 치환해도 서버 게이트 없음. 카탈로그가 "**평가 확정 전 열람 차단 + 직원 공개
   게이트(FEEDBACK_YN) 정책 확인 후에만**"이라 명시 — self여도 "확정 전·미공개면 노출 금지"
   업무 규칙이 있어 기술 self 강제로 안 풀린다.

## 다른 도메인과의 결정적 차이

근태·급여·연말정산 등도 c범위였지만 `cmmSearchStaffId`를 `$SELF_STAFF_ID`로 치환하면
본인 데이터만 반환됐다. 평가는 self 강제로도 "확정 여부·공개 여부"라는 업무 게이트를
넘지 못한다 — 미확정·미공개 평가를 본인이라도 열람 금지하는 정책이 있기 때문.

## 재개 조건 (미래)

아래가 확인·승인되면 재검토:
- 조직(고객사)의 **평가 공개 정책 승인** (어떤 평가를 직원 본인에게 노출할지)
- `FEEDBACK_YN`(또는 유사) 직원 공개 게이트 실측 — 확정·공개된 평가만 필터하는 조건
- 저민감 후보 우선: `PFMResCurrState`(평가 진행상태, **점수 미포함**) — 카탈로그가
  "cmmSearchStaffId=self 강제 시 무난"이라 명시한 유일 항목. 점수·피드백·확정등급은 그 다음.

## 참고

- MY_KEYWORD 흡수(hr-personnel 키워드 요약) 방식도 가능하나 CMMF_KEYWD_INFO는 자유텍스트라
  구조화 평가가 아니고 profile_detail과 성격이 겹쳐 별 가치 없음 — 미채택.
- 이로써 카탈로그 §4 전 도메인 처리 완료: 근태·급여·인사(교육)·결재·증명서·연말정산·복리후생(대출)
  반영 / 평가 보류.
