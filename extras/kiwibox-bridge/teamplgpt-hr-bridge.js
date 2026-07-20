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
 *  - self 강제: "$SELF_STAFF_ID" 마커를 페이지 컨텍스트의 본인 사번으로만 치환
 *  - 게이트 스킵 값 차단: searchType=mobile 등 금지 조합 거부
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
    "/PRCHrBassiemMgrTab220.do",
    "/CTIMcrtfReqstRefromMgr.do",
    "/EAPRequestMgr.do",
    "/CommonCode.do",
    "/SALPayslipNewMgr.do",
    "/SALSalaryDtstmnMgr.do",
    "/SALDaylabMgr.do",
    "/TAAWrkTimeListMgrByDate.do",
    "/TAAWrkTimeStatusMgr.do",
    "/TAADclzWorkSearchCldr.do",
    "/TAADclzWorkOtSchdul.do",
    "/TAADclzVcatnCldrMgr.do",
    "/getMBLLeavDetailStaff.do",
    "/getMBLHomeLeaveDetail.do",
    "/getMBLPrtEmpCard.do",
    "/getMBLPrtEmpCardPop.do",
    "/getMBLHrBassiemOrgList.do",
    "/getMBLHrBassiemMemberList.do",
    "/getTodoIconCnt.do",
    "/getScheduleDay.do",
    "/getContactList.do",
  ];

  // 게이트 스킵/위험 파라미터 값 차단 (카탈로그 §4.5)
  var FORBIDDEN_PARAM_VALUES = { searchType: ["mobile"] };

  // 범용 endpoint(/CommonCode.do)는 queryId 화이트리스트로 제한 — 임의 쿼리 실행 차단.
  // path → 허용 queryId 목록. 목록에 없는 path는 이 제약을 받지 않음.
  var QUERY_ID_ALLOWLIST = {
    "/CommonCode.do": ["getSalYmdTypeCdList", "getSalYmdTypeCdList2"],
  };

  // 연말정산(hr-year-end-tax): 5 endpoint × 지원연도(2022~2025)만 허용.
  var YTA_PATH_RE =
    /^\/YTA(SummaryMgr|YndMedDtlMgr|YtaFamilySttusMgr|YndBefWrkDtlMgr|YndGivPayDtlMgr|InDctMgr)(2022|2023|2024|2025)\.do$/;

  function TeamplGPTHRBridge(config) {
    if (!config || !config.widgetOrigin) {
      throw new Error("TeamplGPTHRBridge: widgetOrigin is required");
    }
    this.widgetOrigin = config.widgetOrigin;
    this.iframe =
      config.iframe ||
      document.querySelector(config.iframeSelector || "iframe[data-teamplgpt]");
    this.staffId = config.staffId || null; // JSP가 렌더한 본인 사번 (self 치환용)
    // ntest.5240.kr은 루트 배포(getContextPath()="") → 기본 빈 값.
    // /kiwibox 하위 배포면 config.contextPath="/kiwibox" 명시.
    this.contextPath =
      config.contextPath !== undefined ? config.contextPath : "";
    this.allowedPaths = config.allowedPaths || DEFAULT_ALLOWED_PATHS;
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
        FORBIDDEN_PARAM_VALUES[key] &&
        FORBIDDEN_PARAM_VALUES[key].indexOf(value) !== -1
      ) {
        this._reply(callId, {
          ok: false,
          status: 0,
          body: "bridge: forbidden param value",
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
