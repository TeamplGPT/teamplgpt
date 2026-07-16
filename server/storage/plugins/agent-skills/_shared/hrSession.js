/**
 * hrSession — HR 스킬 공통 kiwibox 호출 계층 (specs/003 R1).
 *
 * 전송 방식 자동 선택:
 *   1) client 위임 (R1 정본): handler `this.clientToolTransport`가 주입된 경우
 *      (embed.client_tool_execution=true) — kiwibox 호출 명세(spec)를 브라우저의
 *      부모 브리지로 위임. JSESSIONID는 브라우저 밖으로 나오지 않는다.
 *      대상 식별자는 "$SELF_STAFF_ID" 마커로 보내고 브리지가 페이지 세션의
 *      ssnStaffId(kiwibox 내부 STAFF_ID — 사번과 다를 수 있음)로 치환한다.
 *   2) 서버 직접 호출 (폴백/단일 사용자 테스트): setup_args의
 *      HR_BASE_URL/HR_CONTEXT_PATH/HR_SESSION_COOKIE/HR_STAFF_ID 사용.
 *
 * 반환 계약: { errorMessage } (실패/만료/빈 결과 안내) 또는 { records } (성공).
 */

const SELF_STAFF_ID_MARKER = "$SELF_STAFF_ID";

function normalizeCookie(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  return v.includes("=") ? v : `JSESSIONID=${v}`;
}

function looksLikeHtml(bodyText) {
  return typeof bodyText === "string" && /^\s*</.test(bodyText);
}

function parseKiwiboxBody(bodyText) {
  // 세션 만료 시 kiwibox는 로그인 HTML/redirect를 반환한다.
  if (looksLikeHtml(bodyText)) {
    return {
      errorMessage:
        "> ⚠️ HR 세션이 만료되었거나 로그인 페이지로 이동되었습니다. 5240 HR에 다시 로그인한 후 시도하세요.",
    };
  }
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return {
      errorMessage:
        "> ⚠️ HR 시스템 응답을 해석할 수 없습니다 (JSON 아님). 세션 상태를 확인하세요.",
    };
  }
  const records = data && "result" in data ? data.result : data;
  const isEmpty =
    records === null ||
    records === undefined ||
    (Array.isArray(records) && records.length === 0) ||
    (typeof records === "object" &&
      !Array.isArray(records) &&
      Object.keys(records).length === 0);
  if (isEmpty) return { errorMessage: null, records: null, isEmpty: true };
  return { records };
}

/**
 * @param {object} ctx - skill handler의 `this` (runtimeArgs, clientToolTransport, logger)
 * @param {object} req
 * @param {string} req.path - kiwibox 경로 (컨텍스트 경로 제외, e.g. "/getMBLHomeLeaveDetail.do")
 * @param {URLSearchParams|Object<string,string>} req.form - form 파라미터.
 *   대상 사번 자리에는 SELF_STAFF_ID_MARKER를 넣는다.
 * @param {boolean} [req.gate=false] - b범위 게이트 endpoint 여부 (서버 폴백 시 메뉴 선세팅)
 * @returns {Promise<{errorMessage?: string, records?: any, isEmpty?: boolean}>}
 */
async function hrFetch(ctx, { path, form, gate = false }) {
  const formEntries =
    form instanceof URLSearchParams
      ? Object.fromEntries(form)
      : { ...(form || {}) };

  // --- 1) 클라이언트 위임 (R1) ---
  if (typeof ctx.clientToolTransport === "function") {
    let result;
    try {
      result = await ctx.clientToolTransport({
        transport: "kiwibox-bridge",
        path,
        method: "POST",
        form: formEntries,
      });
    } catch (e) {
      if (/timed out/i.test(e.message)) {
        return {
          errorMessage:
            "> ⚠️ HR 조회 응답이 시간 내에 도착하지 않았습니다. 5240 HR 화면이 열려 있고 로그인 상태인지 확인하세요.",
        };
      }
      return {
        errorMessage: `> ⚠️ HR 조회 위임 중 오류가 발생했습니다: ${e.message}`,
      };
    }
    if (!result.ok) {
      if (looksLikeHtml(result.body)) return parseKiwiboxBody(result.body);
      return {
        errorMessage: `> ⚠️ HR 시스템 호출 실패 (HTTP ${result.status || "?"}).`,
      };
    }
    return parseKiwiboxBody(result.body);
  }

  // --- 2) 서버 직접 호출 (폴백 — 단일 사용자/테스트) ---
  const baseUrl = String(
    ctx.runtimeArgs["HR_BASE_URL"] || "https://ntest.5240.kr"
  ).replace(/\/+$/, "");
  const contextPath = String(
    ctx.runtimeArgs["HR_CONTEXT_PATH"] ?? "/kiwibox"
  ).replace(/\/+$/, "");
  const cookie = normalizeCookie(ctx.runtimeArgs["HR_SESSION_COOKIE"]);
  if (!cookie) {
    return {
      errorMessage:
        "> ⚠️ HR 연동이 구성되지 않았습니다. embed 위젯(클라이언트 위임) 또는 HR_SESSION_COOKIE(서버 폴백) 중 하나가 필요합니다.",
    };
  }

  // 서버 폴백의 self 식별자 = HR_STAFF_ID.
  // 주의: kiwibox 내부 STAFF_ID(세션 ssnStaffId와 동일 값)이며 사번(STAFF_NO)과 다를 수 있다.
  const selfStaffId = String(ctx.runtimeArgs["HR_STAFF_ID"] || "").trim();
  for (const [k, v] of Object.entries(formEntries)) {
    if (v === SELF_STAFF_ID_MARKER) {
      if (!selfStaffId) {
        return {
          errorMessage:
            "> ⚠️ 서버 폴백 모드에서는 HR_STAFF_ID(kiwibox 내부 STAFF_ID) 설정이 필요합니다.",
        };
      }
      formEntries[k] = selfStaffId;
    }
  }

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: cookie,
  };

  const activeMenuCd = String(ctx.runtimeArgs["HR_ACTIVE_MENU_CD"] || "").trim();
  if (gate && activeMenuCd) {
    await fetch(
      `${baseUrl}${contextPath}/setSessionActiveTabMenuCd.do?tabMenuCd=${encodeURIComponent(activeMenuCd)}`,
      { method: "GET", headers, signal: AbortSignal.timeout(5000) }
    ).catch(() => {});
  }

  let response, bodyText;
  try {
    response = await fetch(`${baseUrl}${contextPath}${path}`, {
      method: "POST",
      headers,
      body: new URLSearchParams(formEntries).toString(),
      signal: AbortSignal.timeout(10000),
    });
    bodyText = await response.text();
  } catch (e) {
    if (e.name === "TimeoutError") {
      return { errorMessage: "> ⚠️ HR 시스템 응답 시간이 초과되었습니다." };
    }
    return {
      errorMessage: `> ⚠️ HR 시스템 호출 중 오류가 발생했습니다: ${e.message}`,
    };
  }

  if (looksLikeHtml(bodyText)) return parseKiwiboxBody(bodyText);
  if (!response.ok) {
    return {
      errorMessage: `> ⚠️ HR 시스템 호출 실패 (HTTP ${response.status}).`,
    };
  }
  return parseKiwiboxBody(bodyText);
}

function monthRange(ym) {
  // ym: "YYYYMM" -> [YYYYMM01, YYYYMM<말일>]
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const lastDay = new Date(y, m, 0).getDate();
  return [`${ym}01`, `${ym}${String(lastDay).padStart(2, "0")}`];
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

module.exports = { hrFetch, monthRange, todayYmd, SELF_STAFF_ID_MARKER };
