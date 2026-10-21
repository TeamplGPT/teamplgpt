/**
 * TeamplGPT HR Bridge — kiwibox 페이지에 삽입되는 부모 브리지 (specs/003 R1).
 *
 * 역할: iframe으로 임베드된 TeamplGPT 채팅 위젯의 HR 도구 실행 요청(postMessage)을 받아
 * kiwibox 엔드포인트를 same-origin fetch(JSESSIONID 자동 동반)로 실행하고 결과를 회신한다.
 * 세션 쿠키는 이 페이지(브라우저) 밖으로 절대 나가지 않는다.
 *
 * 보안 장치:
 *  - postMessage origin 검증: 등록된 위젯 origin에서 온 요청만 처리
 *  - endpoint allowlist: 등록된 kiwibox 경로 외 실행 거부 (임의 URL 실행 차단)
 *  - path + cmd 조합 allowlist: 허용 경로라도 조회 cmd 외(save*·delete* 등) 거부
 *  - self 강제: "$SELF_STAFF_ID" 마커를 페이지 컨텍스트의 본인 사번으로만 치환.
 *    사번 파라미터(STAFF_PARAM_KEYS)는 마커만 허용 — 리터럴 STAFF_ID(다른 직원)는 거부
 *  - 게이트 스킵 값 차단: searchType=mobile 등 금지 조합 거부
 *  - 다른 직원 정보 차단(specs/016): 조직 휴가캘린더·휴가 상세 경로 제외, 결재함은
 *    본인 기안함(selectGubun=2)만 — okrservice hrBridge.ts와 같은 정책
 *
 * 사용법: extras/kiwibox-bridge/README.md 참조.
 */
(function () {
  "use strict";

  var SELF_MARKER = "$SELF_STAFF_ID";
  var REQUEST_TYPE = "teamplgpt:hr-tool-request";
  var RESULT_TYPE = "teamplgpt:hr-tool-result";

  // hr-attendance + hr-personnel + hr-salary 가 사용하는 kiwibox 경로 전체
  // (카탈로그 §4.1~4.3, §4.5, §4.8~4.9)
  var DEFAULT_ALLOWED_PATHS = [
    "/LONLoanReqstListMgr.do",
    "/Home.do", // 월 근무시간(5240 홈 "월별 근무현황") — cmd 하나만, specs/019
    "/PRCHrBassiemMgrTab220.do",
    "/CTIMcrtfReqstRefromMgr.do",
    "/CTIMcrtfIssuMgr.do", // 증명서 발급내역 목록 정본 (Refrom은 단건/초기조회용)
    "/EAPRequestMgr.do",
    "/CommonCode.do",
    "/SALPayslipNewMgr.do",
    "/SALSalaryDtstmnMgr.do",
    "/SALDaylabMgr.do",
    "/TAAWrkTimeStatusMgr.do",
    "/TAADclzVcatnList.do", // 연차 잔여/휴가 사용내역 정본 (getTAADclzVcatnList1/2)
    "/SALSalaryBassMgr.do", // 월별 지급내역 (getSALSalaryBassMgrTab110List)
    "/TAADclzWorkSearchCldr.do",
    "/TAADclzWorkOtSchdul.do", // 구 연장근무(PC) — specs/017 배포 확인 후 제거 예정(R8)
    "/getMBLDclzWorkOtSchdul.do", // 연장근무 한도·사용·잔여(모바일 연장근무현황, specs/017)
    "/getMBLDclzWorkOtSchdulPerson.do", // 연장근무 날짜별 내역(specs/017)
    // 조직 휴가캘린더(/TAADclzVcatnCldrMgr.do)·휴가 상세(/getMBLLeavDetailStaff.do,
    // /getMBLHomeLeaveDetail.do)는 다른 직원 정보라 제외(specs/016). 폐기 경로
    // /TAAWrkTimeListMgrByDate.do·미배포 /getContactList.do도 제외 — okrservice와 동기화.
    "/getMBLPrtEmpCard.do",
    "/getMBLPrtEmpCardPop.do",
    "/getMBLHrBassiemOrgList.do",
    "/getMBLHrBassiemMemberList.do",
    "/getTodoIconCnt.do",
    "/getScheduleDay.do",
    "/getHRDetailList.do", // schedule_titles — 회사 일정·공휴일 제목(개인 정보 없음)
  ];

  // 게이트 스킵/위험 파라미터 값 차단 (카탈로그 §4.5)
  var FORBIDDEN_PARAM_VALUES = { searchType: ["mobile"] };

  // 대상 사번 파라미터 — 값은 반드시 self 마커(specs/016). 리터럴 STAFF_ID를 받으면
  // 다른 직원의 데이터를 이 페이지 세션으로 조회하게 되므로 거부한다.
  // staffIdNm: 증명서 발급내역의 사번·성명 검색 칸(LIKE '값%') — 비우면 조회 권한 범위 전체(specs/017).
  var STAFF_PARAM_KEYS = ["staffId", "cmmSearchStaffId", "searchStaffId", "searchId", "staffIdNm"];

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // 파라미터 값 allowlist — 같은 cmd가 값에 따라 다른 사람의 데이터를 돌려주는 경로.
  // 키는 반드시 있어야 하고 값은 목록 안이어야 한다(미지정 = 서버 기본 범위라 거부).
  // EAPRequestMgr selectGubun: 2=기안함(본인 기안)만. 3 미결·4 기결·5 참조·6 반려는
  // 다른 직원 문서다(EAPRequestMgr_SQL appl_kind, specs/016 D4).
  // 연장근무현황 searchType: 2=주간, 3=월간 한도·사용·잔여(specs/017).
  var PARAM_VALUE_ALLOWLIST = {
    "/EAPRequestMgr.do": { selectGubun: ["2"] },
    "/getMBLDclzWorkOtSchdul.do": { searchType: ["2", "3"] },
  };

  // 사번 키가 반드시 있어야 하는 경로 — 키가 아예 없으면 값 검사(아래 키별 루프)를 건너뛰고,
  // kiwibox SQL 다수가 대상 직원이 비면 "본인소속조회"/"null이면 전체"로 조회 권한 범위 직원
  // 전체를 돌려준다(MBLDclzWorkOtSchdul·TAADclzWorkOtSchdul·TAAWrkTimeStatusMgr_SQL 등).
  // 목록 = HR handler가 각 경로에 항상 보내는 사번 키(specs/017 보안 리뷰 전수 조사).
  // handler의 사번 키를 바꾸면 이 목록과 okrservice hrBridge.ts 양쪽 갱신.
  var REQUIRED_STAFF_PARAMS = {
    "/TAAWrkTimeStatusMgr.do": ["cmmSearchStaffId"],
    "/TAADclzWorkSearchCldr.do": ["cmmSearchStaffId", "searchId"],
    "/TAADclzWorkOtSchdul.do": ["cmmSearchStaffId"],
    "/getMBLDclzWorkOtSchdul.do": ["cmmSearchStaffId"],
    "/getMBLDclzWorkOtSchdulPerson.do": ["cmmSearchStaffId"],
    "/TAADclzVcatnList.do": ["staffId", "cmmSearchStaffId"],
    "/getMBLPrtEmpCard.do": ["searchStaffId"],
    "/getMBLPrtEmpCardPop.do": ["searchStaffId"],
    "/PRCHrBassiemMgrTab220.do": ["staffId", "cmmSearchStaffId", "searchStaffId"],
    "/CommonCode.do": ["staffId"],
    "/SALSalaryBassMgr.do": ["staffId"],
    "/SALSalaryDtstmnMgr.do": ["cmmSearchStaffId"],
    "/SALDaylabMgr.do": ["cmmSearchStaffId"],
    "/CTIMcrtfIssuMgr.do": ["staffIdNm"],
    "/LONLoanReqstListMgr.do": ["cmmSearchStaffId"],
    "/Home.do": ["cmmSearchStaffId"],
  };

  // 연말정산(YTA*)은 경로에 연도가 붙어 컨트롤러명으로 찾는다 — InDctMgr만 searchStaffId
  function requiredStaffKeys(path) {
    var yta = YTA_PATH_RE.exec(path);
    if (yta) return yta[1] === "InDctMgr" ? ["searchStaffId"] : ["cmmSearchStaffId"];
    return hasOwn(REQUIRED_STAFF_PARAMS, path) ? REQUIRED_STAFF_PARAMS[path] : [];
  }

  function hasRequiredStaffParams(path, formObj) {
    return requiredStaffKeys(path).every(function (key) {
      return hasOwn(formObj, key);
    });
  }

  // 키를 정확히 정한 경로 — 그 밖의 키는 거부한다. 쓸모없는 키 수천 개로 파라미터 수 한도를
  // 넘겨 사번 키를 잘라내는 시도까지 막는다(specs/017 보안 리뷰 MEDIUM-1). 신규 경로부터 적용.
  var ALLOWED_PARAM_KEYS = {
    "/getMBLDclzWorkOtSchdul.do": ["searchType", "searchBaseSYmd", "cmmSearchStaffId"],
    "/getMBLDclzWorkOtSchdulPerson.do": ["searchBaseSYmd", "searchBaseEYmd", "cmmSearchStaffId"],
    "/Home.do": ["cmd", "searchYmd", "cmmSearchStaffId"],
  };

  function areParamKeysAllowed(path, formObj) {
    if (!hasOwn(ALLOWED_PARAM_KEYS, path)) return true;
    var allowed = ALLOWED_PARAM_KEYS[path];
    return Object.keys(formObj).every(function (key) {
      return allowed.indexOf(key) !== -1;
    });
  }

  function areParamValuesAllowed(path, formObj) {
    if (!Object.prototype.hasOwnProperty.call(PARAM_VALUE_ALLOWLIST, path)) return true;
    var rules = PARAM_VALUE_ALLOWLIST[path];
    return Object.keys(rules).every(function (key) {
      return (
        Object.prototype.hasOwnProperty.call(formObj, key) &&
        rules[key].indexOf(String(formObj[key])) !== -1
      );
    });
  }

  // 범용 endpoint(/CommonCode.do)는 queryId 화이트리스트로 제한 — 임의 쿼리 실행 차단.
  // path → 허용 queryId 목록. 목록에 없는 path는 이 제약을 받지 않음.
  var QUERY_ID_ALLOWLIST = {
    "/CommonCode.do": ["getSalYmdTypeCdList", "getSalYmdTypeCdList2"],
  };

  // 연말정산(hr-year-end-tax): 5 endpoint × 지원연도(2022~2025)만 허용.
  var YTA_PATH_RE =
    /^\/YTA(SummaryMgr|YndMedDtlMgr|YtaFamilySttusMgr|YndBefWrkDtlMgr|YndGivPayDtlMgr|InDctMgr)(2022|2023|2024|2025)\.do$/;

  // path + cmd 조합 allowlist — kiwibox 컨트롤러는 cmd로 조회/저장/삭제를 분기하므로
  // 경로만 검사하면 같은 경로의 save*/delete* 명령이 사용자 세션으로 실행될 수 있다.
  // 등록 경로는 목록의 조회 cmd만 허용(cmd 부재도 거부), 미등록 경로(cmd 분기 없는
  // 모바일 경로, config.allowedPaths로 추가한 경로)는 cmd 파라미터 자체를 거부.
  // 스킬 handler의 cmd 추가·변경 시 이 목록과 okrservice hrBridge.ts 양쪽 갱신.
  var CMD_ALLOWLIST = {
    "/TAAWrkTimeStatusMgr.do": ["getTAAWrkTimeStatusMgrList"],
    "/TAADclzWorkSearchCldr.do": ["getTAADclzWorkSearchCldr"],
    "/TAADclzWorkOtSchdul.do": [
      "getTAADclzWorkOtSchdulList",
      "getTAADclzWorkOtSchdulList2",
    ],
    "/TAADclzVcatnList.do": ["getTAADclzVcatnList1", "getTAADclzVcatnList2"],
    "/PRCHrBassiemMgrTab220.do": ["getPRCHrBassiemMgrTab220List"],
    "/SALPayslipNewMgr.do": [
      "getSALPayslipNewMgrList",
      "getSALPayslipNewMgrList2",
      "getSALPayslipNewMgrMap",
    ],
    "/SALSalaryDtstmnMgr.do": [
      "getSALSalaryDtstmnMgrList",
      "getSALSalaryDtstmnMgrList2",
      "getSALSalaryDtstmnMgrMap",
    ],
    "/SALSalaryBassMgr.do": ["getSALSalaryBassMgrTab110List"],
    "/SALDaylabMgr.do": ["getSALDaylabMgrList"],
    "/CommonCode.do": ["getCommonNSCodeList"],
    "/EAPRequestMgr.do": ["getEAPRequestMgrList"],
    "/CTIMcrtfReqstRefromMgr.do": ["getCTIMcrtfReqstRefromMgrList"],
    "/CTIMcrtfIssuMgr.do": ["getCTIMcrtfIssuMgrList"],
    "/LONLoanReqstListMgr.do": ["getLONLoanReqstListMgrList1"],
    // 홈 경로에는 팀·회사 단위 위젯 조회가 함께 있다 — 본인 월 근무시간 하나만(specs/019)
    "/Home.do": ["getHomeWorkStatusBarWidgetMap"],
  };

  // YTA 경로는 연도를 뗀 컨트롤러명 기준 cmd allowlist
  var YTA_CMD_ALLOWLIST = {
    YTASummaryMgr: ["getYTASummaryMgrList"],
    YTAYndMedDtlMgr: ["getYTAYndMedDtlMgrList"],
    YTAYtaFamilySttusMgr: ["getYTAYtaFamilySttusMgrList"],
    YTAYndBefWrkDtlMgr: ["getYTAYndBefWrkDtlMgrList"],
    YTAYndGivPayDtlMgr: ["getYTAYndGivPayDtlMgrList"],
    YTAInDctMgr: [
      "getYTAInDctMgrTab06List",
      "getYTAInDctMgrTab08List",
      "getYTAInDctMgrTab13List",
      "getYTAInDctMgrTab15List",
    ],
  };

  function isCmdAllowed(path, formObj) {
    var hasCmd = Object.prototype.hasOwnProperty.call(formObj, "cmd");
    var yta = YTA_PATH_RE.exec(path);
    var allowed = yta
      ? YTA_CMD_ALLOWLIST["YTA" + yta[1]]
      : Object.prototype.hasOwnProperty.call(CMD_ALLOWLIST, path)
      ? CMD_ALLOWLIST[path]
      : null;
    if (!allowed) return !hasCmd;
    return hasCmd && allowed.indexOf(String(formObj.cmd)) !== -1;
  }

  function TeamplGPTHRBridge(config) {
    if (!config || !config.widgetOrigin) {
      throw new Error("TeamplGPTHRBridge: widgetOrigin is required");
    }
    this.widgetOrigin = config.widgetOrigin;
    this.iframe =
      config.iframe ||
      document.querySelector(config.iframeSelector || "iframe[data-teamplgpt]");
    // JSP가 렌더한 본인 사번 (self 치환용). 공백뿐이면 SQL에서 빈 값(XTRIM → NULL) = 조회 권한
    // 범위 전체가 되므로 없는 것으로 본다(specs/017 보안 리뷰).
    this.staffId = config.staffId != null && String(config.staffId).trim() !== ""
      ? String(config.staffId).trim()
      : null;
    // ntest.5240.kr은 루트 배포(getContextPath()="") → 기본 빈 값.
    // /kiwibox 하위 배포면 config.contextPath="/kiwibox" 명시.
    this.contextPath =
      config.contextPath !== undefined ? config.contextPath : "";
    // 설정으로 경로를 줄일 수는 있어도 늘릴 수는 없다 — 예전 목록을 넘겨 016/017에서 뺀 경로가
    // 되살아나는 것을 막는다(specs/017 보안 리뷰 MEDIUM-2)
    this.allowedPaths = config.allowedPaths
      ? config.allowedPaths.filter(function (p) {
          return DEFAULT_ALLOWED_PATHS.indexOf(p) !== -1;
        })
      : DEFAULT_ALLOWED_PATHS;
    this.timeoutMs = config.timeoutMs || 20000;
    this._listener = this._onMessage.bind(this);
    window.addEventListener("message", this._listener);
  }

  TeamplGPTHRBridge.prototype.destroy = function () {
    window.removeEventListener("message", this._listener);
  };

  TeamplGPTHRBridge.prototype._reply = function (callId, result) {
    if (!this.iframe || !this.iframe.contentWindow) return;
    this.iframe.contentWindow.postMessage(
      {
        type: RESULT_TYPE,
        callId: callId,
        ok: result.ok,
        status: result.status,
        body: result.body,
      },
      this.widgetOrigin
    );
  };

  TeamplGPTHRBridge.prototype._onMessage = function (event) {
    if (event.origin !== this.widgetOrigin) return; // origin 검증
    var msg = event.data;
    if (!msg || msg.type !== REQUEST_TYPE || !msg.callId || !msg.spec) return;

    var spec = msg.spec;
    var callId = msg.callId;
    var self = this;

    // 연말정산(YTA)은 컨트롤러가 연도별 분리 → 경로에 연도 박힘(/YTA{Name}Mgr{YYYY}.do).
    // endpoint명 + 지원연도(2022~2025)를 정규식으로 정확 제한(임의 YTA 경로 차단).
    var isAllowedPath =
      this.allowedPaths.indexOf(spec.path) !== -1 ||
      YTA_PATH_RE.test(spec.path);
    if (!isAllowedPath) {
      this._reply(callId, {
        ok: false,
        status: 0,
        body: "bridge: path not allowed",
      });
      return;
    }

    if (!isCmdAllowed(spec.path, spec.form || {})) {
      this._reply(callId, {
        ok: false,
        status: 0,
        body: "bridge: cmd not allowed",
      });
      return;
    }

    if (!areParamValuesAllowed(spec.path, spec.form || {})) {
      this._reply(callId, {
        ok: false,
        status: 0,
        body: "bridge: param not allowed",
      });
      return;
    }

    if (!hasRequiredStaffParams(spec.path, spec.form || {})) {
      this._reply(callId, {
        ok: false,
        status: 0,
        body: "bridge: staff param required",
      });
      return;
    }

    if (!areParamKeysAllowed(spec.path, spec.form || {})) {
      this._reply(callId, {
        ok: false,
        status: 0,
        body: "bridge: param key not allowed",
      });
      return;
    }

    // 범용 endpoint queryId 화이트리스트 검사
    var allowedQueryIds = QUERY_ID_ALLOWLIST[spec.path];
    if (allowedQueryIds) {
      var reqQueryId = spec.form ? String(spec.form.queryId || "") : "";
      if (allowedQueryIds.indexOf(reqQueryId) === -1) {
        this._reply(callId, {
          ok: false,
          status: 0,
          body: "bridge: queryId not allowed",
        });
        return;
      }
    }

    var form = new URLSearchParams();
    var formObj = spec.form || {};
    for (var key in formObj) {
      if (!Object.prototype.hasOwnProperty.call(formObj, key)) continue;
      var value = String(formObj[key]);
      if (
        hasOwn(FORBIDDEN_PARAM_VALUES, key) &&
        FORBIDDEN_PARAM_VALUES[key].indexOf(value) !== -1
      ) {
        this._reply(callId, {
          ok: false,
          status: 0,
          body: "bridge: forbidden param value",
        });
        return;
      }
      if (STAFF_PARAM_KEYS.indexOf(key) !== -1 && value !== SELF_MARKER) {
        this._reply(callId, {
          ok: false,
          status: 0,
          body: "bridge: staff param must be self",
        });
        return;
      }
      if (value === SELF_MARKER) {
        if (!this.staffId) {
          this._reply(callId, {
            ok: false,
            status: 0,
            body: "bridge: staffId not configured",
          });
          return;
        }
        value = String(this.staffId); // self 강제 — 페이지 컨텍스트 사번만
      }
      form.append(key, value);
    }

    var controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, this.timeoutMs)
      : null;

    fetch(this.contextPath + spec.path, {
      method: "POST",
      credentials: "same-origin", // JSESSIONID 자동 동반 — 세션은 페이지 밖으로 안 나감
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        return response.text().then(function (body) {
          self._reply(callId, {
            ok: response.ok,
            status: response.status,
            body: body,
          });
        });
      })
      .catch(function (e) {
        self._reply(callId, {
          ok: false,
          status: 0,
          body: "bridge: fetch failed - " + e.message,
        });
      })
      .then(function () {
        if (timer) clearTimeout(timer);
      });
  };

  window.TeamplGPTHRBridge = TeamplGPTHRBridge;
})();
