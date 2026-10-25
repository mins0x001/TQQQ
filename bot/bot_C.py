#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
무한매수 LOC 자동주문 봇 — 메리츠증권 Open API                     MUHANBOT V1.16 (261017)

매일 미국 정규장 중(한국시간 00:10 무렵) GitHub Actions에서 실행됩니다.

  ① 계획   무한매수 앱(soxl.html · tqqq.html)을 클라우드에서 그대로 실행해 '오늘의 LOC 주문'을 받는다.
           → 앱과 봇이 같은 코드로 계산하므로 숫자가 어긋날 수 없다. 기록·설정은 Gist 동기화로 가져온다.
  ② 검수   주문 전에 8가지를 확인하고, 하나라도 어긋나면 그 종목은 주문하지 않는다.
  ③ 주문   메리츠 실제 주문내역(최근 16시간)에 같은 종목·매매가 있으면 🔁 중복, 없으면 설정한 주문코드로 바로 실제 주문.
  ④ 보고   주문 결과·실패 이유(메리츠 응답 해석)를 Gist·텔레그램으로.
  ⑤ 보고   결과를 Gist(muhan-bot-status.json)에 기록 → 앱의 🤖 카드에 모든 기기에서 표시. 실패 시 Actions 실패(메일 알림).

  ⑥ 계좌   보유·평단·평가손익·주문가능 USD + 체결내역(전 기간)으로 사이클을 복원해 Gist(muhan-account.json)에 기록
           → SOXL·TQQQ 앱이 '나의 매수 기록'·'사이클 기록'을 자동으로 맞춘다 (수동 입력도 그대로 가능)

모드(앱에서 전환, Gist muhan-bot.json): off(끄기) · dry(리허설 — 주문만 안 냄) · live(실전)
실행 모드(RUN_MODE): config(정기) · dry · live · check(연결 점검) · account(계좌·체결 동기화만, 약 20초)
앱키·시크릿은 GitHub Actions Secrets 에만 있습니다(MERITZ_APP_KEY / MERITZ_APP_SECRET). 로그에 출력하지 않습니다.
표준 라이브러리 + Playwright(앱 실행용)만 사용합니다.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

VERSION = "MUHANBOT V1.18 (261019)"
MERITZ_BASE = os.environ.get("MERITZ_BASE_URL", "https://openapi.imeritz.com:9443").rstrip("/")
ET, KST = ZoneInfo("America/New_York"), ZoneInfo("Asia/Seoul")
APP_PAGES = {"QLD": "qldm.html"}
CONFIG_FILE, STATUS_FILE, ACCOUNT_FILE = "muhan-bot-qldm.json", "muhan-bot-qldm-status.json", "muhan-account-qldm.json"
DEFAULT_CONFIG = {"mode": "dry", "symbols": {"SOXL": True, "TQQQ": True}, "max_order_usd": 20000, "app_base": "",
                  "sides": {"SOXL": {"buy": True, "sell": True}, "TQQQ": {"buy": True, "sell": True}}}
# 거래소: 주문용 벤더코드 ↔ 시세용 2자리 코드
EXCH_TO_MKT = {"0537": "OQ", "0321": "NY", "0066": "AX"}
EXCH_GUESS = {"SOXL": ["0066", "0321", "0537"], "TQQQ": ["0537", "0066", "0321"], "QLD": ["0066", "0321", "0537"]}

# NYSE 휴장일 · 조기폐장(13:00 ET) — 2026~2027 (NYSE 공시 기준)
NYSE_HOLIDAYS = {
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
    "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05",
    "2027-09-06", "2027-11-25", "2027-12-24",
}
NYSE_EARLY_CLOSE = {"2026-11-27", "2026-12-24", "2027-11-26"}


# ───────────────────────────────────────────── 공통
def log(msg: str) -> None:
    print(f"[{dt.datetime.now(KST):%H:%M:%S}] {msg}", flush=True)


def is_trading_day(d: dt.date) -> bool:
    return d.weekday() < 5 and d.isoformat() not in NYSE_HOLIDAYS


def next_trading_day(d: dt.date) -> dt.date:
    d += dt.timedelta(days=1)
    while not is_trading_day(d):
        d += dt.timedelta(days=1)
    return d


def target_session(now_et: dt.datetime):
    """계획의 기준 정규장(T) — 앱 계획 기준 종가일 확인용 (주문 방식과 무관)."""
    d = now_et.date()
    close_hm = (12, 40) if d.isoformat() in NYSE_EARLY_CLOSE else (15, 40)
    hm = (now_et.hour, now_et.minute)
    t = d if (is_trading_day(d) and hm <= close_hm) else next_trading_day(d)
    regular = t == d and hm >= (9, 31)
    return t, regular


def prev_trading_day(d: dt.date) -> dt.date:
    d -= dt.timedelta(days=1)
    while not is_trading_day(d):
        d -= dt.timedelta(days=1)
    return d


def floor_cent(x: float) -> float:          # 앱과 같은 식: Math.floor(x*100 + 1e-6) / 100
    return math.floor(x * 100 + 1e-6) / 100


def ceil_cent(x: float) -> float:           # 앱과 같은 식: Math.ceil(x*100 - 1e-6) / 100
    return math.ceil(x * 100 - 1e-6) / 100


def fp(x) -> str:                           # 29.875 → "29.875", 32.5 → "32.50"
    t = f"{float(x):.4f}".rstrip("0")
    return t + "0" * max(0, 2 - len(t.split(".")[1])) if "." in t else t + ".00"


def num(v, default=0.0) -> float:
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def http(method: str, url: str, headers: dict | None = None, body=None, form=None, timeout=20):
    data = None
    headers = dict(headers or {})
    headers.setdefault("User-Agent", f"muhan-bot/{VERSION.split()[1]}")
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["content-type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers.setdefault("content-type", "application/json; charset=utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:            # 메리츠는 업무 오류도 HTTP 500 + rsp_cd 로 준다
        status, raw = e.code, e.read()
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, {"rsp_cd": "", "rsp_msg": f"연결 실패: {e}"}
    text = raw.decode("utf-8", "replace")
    try:
        return status, json.loads(text) if text else {}
    except ValueError:
        return status, text


# ───────────────────────────────────────────── 메리츠 Open API
class MeritzError(RuntimeError):
    def __init__(self, msg, code=""):
        super().__init__(msg)
        self.code = code


QUERY_OK = {"0000", "5762", "5766", "5820", "5822"}      # 5762 = 연속조회 남음
TOKEN_DEAD = {"EGW00121", "EGW00123"}
# 메리츠 공식 응답 코드표(docs/errors.md · 명세 2026-10-13) → 무엇을 하면 되는지
HINTS = {
    "EGW00103": "앱키(App Key)가 틀렸습니다 — 포털의 운영 앱키를 다시 등록하세요 (재발급으로 풀리지 않음)",
    "EGW00121": "토큰이 무효입니다 — 자동으로 다시 발급합니다",
    "EGW00123": "토큰이 만료됐습니다 — 자동으로 다시 발급합니다",
    "EGW00200": "초당 호출 한도 초과 — 잠시 뒤 자동 재시도",
    "EGW00202": "권한 없음 — 포털에서 이 앱키의 API 권한(해외주식)을 확인하세요",
    "EGW00002": "메리츠 서버 오류 — 앱키 문제가 아닙니다. 잠시 뒤 다시 실행",
    "0760": "이 앱키·계좌에 해당 API 권한이 없습니다 — 포털에서 해외주식 권한 신청 (재시도로 풀리지 않음)",
    "IGW50024": "필수 헤더(mac_address) 누락",
    "IGW50004": "전문 길이 초과·필수값 누락",
    "IGW50006": "시장구분코드 오류",
    "5806": "거래소 벤더코드 오류",
    "7936": "필수 입력 누락",
    "IGW50002": "필수 항목 누락",
}


def explain(code, msg="", sub=""):
    code = str(code or "")
    t = f"{code} {msg or ''}".strip() + (f" ({sub})" if sub and sub != msg else "")
    return t + (f" → {HINTS[code]}" if code in HINTS else "")


class Meritz:
    def __init__(self, app_key: str, app_secret: str, base: str = MERITZ_BASE):
        if not app_key or not app_secret:
            raise MeritzError("MERITZ_APP_KEY / MERITZ_APP_SECRET 이 없습니다 → 앱의 🤖 카드에서 [앱키 등록]", "NO_KEY")
        self.key, self.secret, self.base = app_key, app_secret, base
        # 게이트웨이 필수 헤더(12자리). 실행 서버가 매번 바뀌므로 앱키로 고정값을 만든다.
        self.mac = hashlib.sha256(app_key.encode()).hexdigest()[:12].upper()
        self._token, self._exp = None, 0.0

    def token(self) -> str:
        if self._token and time.time() < self._exp:
            return self._token
        for wait in (0, 2, 5, 10, 20, 30):         # 토큰 발급은 주문이 아니라 재시도해도 안전 — 순간 끊김이면 최대 약 1분
            time.sleep(wait)
            st, d = http("POST", self.base + "/oauth2/token",
                         form={"grant_type": "client_credentials", "client_id": self.key,
                               "client_secret": self.secret, "scope": "login"})
            if st != 0:
                break
        if st != 200 or not isinstance(d, dict) or "access_token" not in d:
            code = (d.get("rsp_cd") or d.get("error") or "") if isinstance(d, dict) else ""
            msg = (d.get("rsp_msg") or d.get("error_description") or "") if isinstance(d, dict) else str(d)[:80]
            if st == 0:
                raise MeritzError(f"메리츠 서버에 1분 동안 6번 연결을 시도했지만 실패 — 메리츠 서버 점검·일시 장애 가능성 (다음 재시도 때 자동으로 다시 실행) · 상세: {msg}", "UNREACHABLE")
            raise MeritzError(f"토큰 발급 실패 (HTTP {st}) " + explain(code, msg), code or "AUTH")
        self._token = d["access_token"]
        self._exp = time.time() + int(d.get("expires_in", 43200)) - 120
        return self._token

    def _req(self, method, path, params=None, _retry=True):
        time.sleep(0.12)                            # API별 초당 10건 한도
        h = {"authorization": "Bearer " + self.token(), "mac_address": self.mac}
        url = self.base + path
        if method == "GET":
            if params:
                url += "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)   # 연속조회 키의 공백도 원본 그대로
            st, body = http("GET", url, h)
            # 조회는 몇 번 다시 해도 안전 — 순간 끊김(SSL EOF·연결 재설정·시간 초과)이면 1.5초·3초 뒤 재시도.
            # 주문(POST)은 결과가 애매할 때 다시 보내면 중복 위험이 있어 재시도하지 않는다.
            for wait in (1.5, 3.0, 6.0, 12.0):
                if st != 0:
                    break
                log(f"  ↻ {path.rsplit('/', 1)[-1]} 연결 끊김 → {wait:g}초 뒤 다시 조회 ({str(body.get('rsp_msg', ''))[:60]})")
                time.sleep(wait)
                st, body = http("GET", url, h)
        else:
            st, body = http("POST", url, h, body=params or {})
        code = body.get("rsp_cd") if isinstance(body, dict) else None
        if code in TOKEN_DEAD and _retry:
            self._token = None
            return self._req(method, path, params, _retry=False)
        if code == "EGW00200" and _retry:          # 초당 한도 — 1초 뒤 한 번 더
            time.sleep(1.1)
            return self._req(method, path, params, _retry=False)
        return st, body

    def query(self, path, params=None) -> list:
        st, body = self._req("GET", path, params)
        if not isinstance(body, dict):
            raise MeritzError(f"{path}: 응답 형식 오류 (HTTP {st})", "BAD_RESPONSE")
        code = str(body.get("rsp_cd") or "")
        if st != 200 or code not in QUERY_OK:
            raise MeritzError(f"{path.rsplit('/', 2)[-2]}/{path.rsplit('/', 1)[-1]}: " + explain(code, body.get('rsp_msg', ''), body.get('rsp_sub_msg', '')), code)
        data = body.get("data")
        if data in (None, "", {}):
            return []
        return data if isinstance(data, list) else [data]

    # 조회
    def holdings(self):
        return self.query("/accounts/v1/me/overseas/holdings")

    def usd_orderable(self):
        for r in self.query("/trading/v1/overseas/orders/estimate"):
            if str(r.get("crcd", "")).upper() == "USD":
                return num(r.get("oder_crnc_oder_able_camt"))
        return None

    def orders_today(self):
        return self.query("/trading/v1/overseas/orders/today", {"cntg_cls_code": "0", "seln_byov_clcd": "0"})

    def daily_closes(self, symbol, mkt):
        rows = self.query("/market/v1/overseas/candles/days", {
            "mrkt_div_code": "OV", "mrkt_cls_code": mkt, "iscd": symbol.upper(),
            "dely_rltm_cls_code": "1", "mod_stpr_cls_code": "0"})
        return {str(r.get("date")): num(r.get("prpr")) for r in rows if num(r.get("prpr")) > 0}

    def history(self, start="00000000", end=None, max_pages=80, cntg="1"):
        """해외주식 주문체결내역 — 체결분만(cntg_cls_code "1"), 전 기간, 30건씩 연속조회.
        명세: 시작 "00000000" + 종료 오늘 = 전체 이력 · tr_cont "1"이면 tr_cont_key(공백 포함 원본)로 다음 페이지 · 5820 = 자료 없음."""
        end = end or (dt.datetime.now(KST) + dt.timedelta(days=1)).strftime("%Y%m%d")
        out, key, done = [], None, False
        for _ in range(max_pages):
            p = {"oder_sta_date": start, "oder_fin_date": end, "seln_byov_clcd": "0", "cntg_cls_code": cntg}
            if key is not None:
                p.update(tr_cont="1", tr_cont_key=key)
            st, body = self._req("GET", "/trading/v1/overseas/orders/history", p)
            if not isinstance(body, dict):
                raise MeritzError(f"orders/history: 응답 형식 오류 (HTTP {st})", "BAD_RESPONSE")
            code = str(body.get("rsp_cd") or "")
            if code == "5820":
                done = True
                break
            if st != 200 or code not in QUERY_OK:
                raise MeritzError("orders/history: " + explain(code, body.get("rsp_msg", ""), body.get("rsp_sub_msg", "")), code)
            data = body.get("data") or []
            out += data if isinstance(data, list) else [data]
            if str(body.get("tr_cont", "0")).strip() == "1" and body.get("tr_cont_key") not in (None, ""):
                key = body["tr_cont_key"]
            else:
                done = True
                break
        return out, not done

    # 주문
    def place_order(self, side, symbol, exch, code, price, qty):
        """설정한 주문코드 그대로 실제 주문 (장 시간 판단 없음 — 메리츠가 받는지 그대로 보고)."""
        path = "/trading/v1/overseas/orders/" + ("buy" if side == "buy" else "sell")
        st, body = self._req("POST", path, {
            "ovrs_stck_symb_iscd": symbol, "ovrs_exch_vndr_idno": exch, "oder_cls_code": code,
            "oder_cond_cls_code": ORDER_COND.get(code, "0"), "odqt": int(qty),
            "ovrs_stck_oder_prc": "0" if code in MARKET_CODES else f"{price:.2f}"})
        return judge_order(st, body)


def judge_order(st, body, ok_code="0001", no_key="oder_no") -> dict:
    """주문 결과 판정 — HTTP 200 만으로 성공이라 하지 않는다.
    rsp_cd "0001" 이고 warn_cls_code "0" 일 때만 주문 성공. 경고는 사람이 확인해야 하므로 자동 재전송하지 않는다."""
    if not isinstance(body, dict):
        return {"ok": False, "why": f"응답 형식 오류 (HTTP {st})"}
    code = str(body.get("rsp_cd") or "")
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    if st != 200 or code != ok_code:
        return {"ok": False, "code": code if st else "UNREACHABLE", "why": explain(code, body.get('rsp_msg', ''), body.get('rsp_sub_msg', ''))}
    warn = str(data.get("warn_cls_code", body.get("warn_cls_code", "0")) or "0").strip()
    if warn != "0":
        return {"ok": False, "warn": warn, "code": code, "why": f"주문 보류(warn_cls_code={warn}) {data.get('warn_msg', '')} — MTS에서 직접 확인하세요".strip()}
    return {"ok": True, "oder_no": data.get(no_key)}


# ───────────────────────────────────────────── GitHub Gist (앱과 공유하는 상태)
class Gist:
    def __init__(self, token, gist_id):
        self.h = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"}
        self.id = gist_id

    def files(self) -> dict:
        st, g = http("GET", f"https://api.github.com/gists/{self.id}", self.h)
        if st != 200:
            raise RuntimeError(f"Gist 읽기 실패 HTTP {st} — MUHAN_TOKEN·GIST_ID 확인")
        return {k: (v.get("content") or "") for k, v in (g.get("files") or {}).items()}

    def write(self, name, obj):
        st, _ = http("PATCH", f"https://api.github.com/gists/{self.id}", self.h,
                     body={"files": {name: {"content": json.dumps(obj, ensure_ascii=False, indent=1)}}})
        if st != 200:
            log(f"⚠ 상태 기록 실패 HTTP {st}")


# ───────────────────────────────────────────── ① 앱 실행 → 오늘의 LOC 계획
def plan_from_app(page_url: str, token: str, gist_id: str, ctx_hook=None) -> dict:
    """앱을 그대로 띄워 동기화(기록·설정) → [시세 조회] → 화면과 같은 lastLocOrder 를 받는다."""
    from playwright.sync_api import sync_playwright
    boot = ("try{localStorage.setItem('muhansync_token'," + json.dumps(token) + ");"
            "localStorage.setItem('muhansync_gist'," + json.dumps(gist_id) + ");}catch(e){}"
            "window.__MUHAN_BOT__=true;")
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(timezone_id="Asia/Seoul", locale="ko-KR", service_workers="block",
                            viewport={"width": 412, "height": 900})
        ctx.add_init_script(boot)
        if ctx_hook:                                   # 테스트용(가짜 시세·Gist 연결)
            ctx_hook(ctx)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        def why():
            try:
                return page.evaluate("() => [typeof __syncErr!=='undefined'?__syncErr:'', (document.getElementById('errorBanner')||{}).textContent||''].join(' ').trim().slice(0,200)")
            except Exception:  # noqa: BLE001
                return ""

        def step(name, fn):
            try:
                return fn()
            except Exception as e:  # noqa: BLE001
                raise RuntimeError(f"[{name}] {str(e).splitlines()[0][:120]} {why()} {'· 앱 오류: ' + errors[0][:120] if errors else ''}".strip()) from None

        url = page_url + ("&" if "?" in page_url else "?") + "bot=" + str(int(time.time()))
        step("앱 열기", lambda: page.goto(url, wait_until="load", timeout=60000))
        if not page.evaluate("() => typeof syncMeta==='function' && typeof lastLocOrder!=='undefined'"):
            raise RuntimeError(f"[앱 버전] {page_url} 이 자동주문 지원 버전(V0.70 이상)이 아닙니다 — soxl.html·tqqq.html 을 새 버전으로 올리세요")
        step("기록 동기화", lambda: page.wait_for_function("() => syncMeta().last>0 && !__syncBusy", timeout=60000))
        err = page.evaluate("() => __syncErr || ''")
        if err:
            raise RuntimeError("[기록 동기화] " + err)
        t0 = page.evaluate("() => Date.now()")
        page.click("#fetchBtn")
        step("시세 조회·계산", lambda: page.wait_for_function(f"() => lastLocOrder && Date.parse(lastLocOrder.generated_at) >= {t0}", timeout=120000))
        # 자동 체결 기록(어제 LOC 체결분) 저장·동기화가 끝날 때까지 — 끝나면 계획이 다시 계산된다
        page.wait_for_timeout(2500)
        step("체결 기록 저장", lambda: page.wait_for_function("() => !__syncBusy && !syncMeta().dirty", timeout=60000))
        page.wait_for_timeout(800)
        plan = page.evaluate("() => JSON.parse(JSON.stringify(lastLocOrder))")
        banner = why()
        b.close()
    if errors:
        log("  앱 스크립트 경고: " + " | ".join(errors[:3]))
    plan["_banner"] = banner
    return plan


# ───────────────────────────────────────────── ② 검수
class Checks:
    def __init__(self):
        self.items, self.block_buy, self.block_sell = [], [], []

    def ok(self, msg):
        self.items.append({"ok": True, "msg": msg})

    def warn(self, msg):
        self.items.append({"ok": None, "msg": msg})

    def fail(self, msg, side="both"):
        self.items.append({"ok": False, "msg": msg})
        if side in ("both", "buy"):
            self.block_buy.append(msg)
        if side in ("both", "sell"):
            self.block_sell.append(msg)


def verify_plan(plan: dict, sym: str, expect_basis: str, cfg: dict, now_utc: dt.datetime, c: Checks):
    """V1 형식·신선도 · V2 같은 공식으로 재계산(앱 계산 오류·변조 차단)."""
    if plan.get("schema") != "loc-order/1" or str(plan.get("symbol", "")).upper() != sym:
        c.fail("V1 계획 형식이 아닙니다")
        return
    gen = dt.datetime.fromisoformat(str(plan["generated_at"]).replace("Z", "+00:00"))
    age = (dt.datetime.now(dt.timezone.utc) - gen).total_seconds() / 60   # 실행 시작 시각이 아니라 '지금' 기준 (앱 계산이 몇 분 걸려도 오판 없음)
    if not (-5 <= age <= 30):
        c.fail(f"V1 계획 시각이 맞지 않습니다 ({age:.0f}분 차이)")
    if plan.get("basis_close_date") != expect_basis:
        c.fail(f"V1 기준 종가일 {plan.get('basis_close_date')} ≠ 직전 거래일 {expect_basis} (시세 미갱신)")
    else:
        c.ok(f"V1 계획 최신 · 기준 종가일 {expect_basis}")
    b = plan.get("bot") or {}
    if b.get("kind") == "lifetime":                     # V5.10+ 평생매수(QLD): 매수 전용 · 주 1회
        return verify_lifetime(plan, b, c)
    need = ("last_close", "sell_pct", "per_split", "qty_unit")
    if any(b.get(k) in (None, "") for k in need):
        c.fail("V2 재계산 정보(bot)가 없습니다 — 앱을 V0.68/V0.41 이상으로 올리세요")
        return
    last_close, pct, per_split, unit = float(b["last_close"]), float(b["sell_pct"]), float(b["per_split"]), int(b["qty_unit"])
    avg = b.get("avg_exact")
    hold = int(plan.get("holding_qty") or 0)
    for o in plan.get("orders") or []:
        price, qty = float(o["price"]), int(o["qty"])
        if o.get("type") != "LOC" or qty < 1 or round(price, 2) != price or not (0.5 <= price <= 5000):
            c.fail(f"V2 {o.get('side')} 주문 형식 이상: {price} × {qty}", o.get("side"))
            continue
        if o["side"] == "buy":
            exp_p = floor_cent(min(float(avg), last_close)) if (avg and hold > 0) else floor_cent(last_close)
            exp_q = (math.floor(per_split / exp_p) // unit) * unit
            if abs(price - exp_p) > 1e-9 or qty != exp_q:
                c.fail(f"V2 매수 재계산 불일치: 앱 {price}×{qty} ≠ 검산 {exp_p}×{exp_q}", "buy")
            elif price > last_close + 1e-9:
                c.fail(f"V2 매수가 {price} > 전일 종가 {last_close}", "buy")
            else:
                c.ok(f"V2 매수 검산 일치 {price:.2f} × {qty} (전일종가 {fp(last_close)}{f' · 평단 {fp(avg)}' if avg else ''})")
        elif o["side"] == "sell":
            if not avg or hold <= 0:
                c.fail("V2 보유 없음인데 매도 주문", "sell")
                continue
            exp_p = ceil_cent(float(avg) * (1 + pct / 100))
            if abs(price - exp_p) > 1e-9 or qty != hold:
                c.fail(f"V2 매도 재계산 불일치: 앱 {price}×{qty} ≠ 검산 {exp_p}×{hold}", "sell")
            elif price <= float(avg):
                c.fail(f"V2 매도가 {price} ≤ 평단 {avg}", "sell")
            else:
                c.ok(f"V2 매도 검산 일치 {price:.2f} × {qty} (평단 {fp(avg)} × (1+{pct:g}%) 올림)")


def verify_lifetime(plan: dict, b: dict, c: Checks):
    """평생매수 V2: 기준가(ref_peak) × (1 − 하락목표%) 센트 내림 = 매수가 · 수량 ≥ 1 · 매도 없음."""
    if any(b.get(k) in (None, "") for k in ("ref_peak", "pct", "loc_px")):
        c.fail("V2 평생매수 재계산 정보(bot)가 없습니다 — qld.html 을 V0.21 이상으로 올리세요")
        return
    exp = max(0.01, floor_cent(float(b["ref_peak"]) * (1 - float(b["pct"]) / 100)))
    for o in plan.get("orders") or []:
        price, qty = float(o["price"]), int(o["qty"])
        if o.get("side") != "buy":
            c.fail("V2 평생매수는 매도 주문을 내지 않습니다", "sell")
        elif o.get("type") != "LOC" or qty < 1 or abs(price - exp) > 0.0101 or abs(price - float(b["loc_px"])) > 1e-9:
            c.fail(f"V2 매수 재계산 불일치: 앱 {price}×{qty} ≠ 검산 {exp:.2f} (기준가 {fp(b['ref_peak'])} × (1−{float(b['pct']):g}%))", "buy")
        else:
            c.ok(f"V2 평생매수 검산 일치 {price:.2f} × {qty} = 기준가 {fp(b['ref_peak'])} × (1−{float(b['pct']):g}%) 센트 내림")


def build_lifetime(plan: dict, sides: dict, c: Checks) -> list:
    """평생매수(V5.20): 이번 주에 아직 안 샀으면(앱 bot.order_today) 매일 앱 계획의 LOC 매수 그대로 — 체결되면 다음 주까지 쉰다(주 1회). 매도 없음."""
    b = plan.get("bot") or {}
    o = next((x for x in plan.get("orders") or [] if x.get("side") == "buy"), None)
    if not sides.get("buy"):
        return []
    if not b.get("order_today"):
        c.warn("이번 주는 이미 매수 체결됨 — 다음 주 첫 거래일부터 다시 주문 (주 1회)")
        return []
    if not o:
        c.warn("매수: 앱 계획에 이번 주 주문이 없음 (수량 0)")
        return []
    c.ok(f"평생매수 이번 주 LOC {float(o['price']):.2f} × {int(o['qty'])} (이번 주 미체결 → 오늘도 주문)")
    return [{"side": "buy", "price": float(o["price"]), "qty": int(o["qty"]), "src": "앱 계획 · 평생매수 주 1회 LOC (체결까지 매일)"}]


def account_info(api: Meritz, sym: str) -> dict:
    rows = [r for r in api.holdings() if str(r.get("ovrs_stck_symb_iscd", "")).upper() == sym]
    qty = sum(num(r.get("rmnd_dqty")) for r in rows)
    cost = sum(num(r.get("rmnd_dqty")) * num(r.get("avrg_unpr")) for r in rows)
    return {"qty": qty, "sellable": sum(num(r.get("seln_able_dqty")) for r in rows),
            "avg": (cost / qty) if qty else 0.0, "exch": str(rows[0].get("ovrs_exch_vndr_idno")) if rows else ""}


def exchange_and_close(api: Meritz, sym: str, exch: str, ymd: str):
    for ex in ([exch] if exch else EXCH_GUESS.get(sym, ["0537", "0066", "0321"])):
        try:
            closes = api.daily_closes(sym, EXCH_TO_MKT.get(ex, "OQ"))
        except MeritzError as e:
            log(f"  일봉 조회 실패({ex}): {e}")
            continue
        if closes:
            return ex, closes.get(ymd)
    return exch or EXCH_GUESS.get(sym, ["0537"])[0], None


def auto_limit(plan: dict, cfg: dict) -> float:
    """매수 1건 자동 한도 — 이번 회차 1회 매수금 × 2 (평생매수는 🤖 시드 엔진 1회 금액 × 1.02). 계획 값이 없을 때만 설정값."""
    b = plan.get("bot") or {}
    if b.get("kind") == "lifetime" and float(b.get("engine_amt") or 0) > 0:
        return float(b["engine_amt"]) * 1.02
    per = float(b.get("per_split") or 0)
    return per * 2 if per > 0 else float(cfg.get("max_order_usd") or 20000)


def build_orders(plan: dict, sides: dict, acct: dict, c: Checks) -> list:
    """☑매수·☑매도 체크에 따라 최종 주문을 만든다.
    · 매수: 앱 계획에 있으면 그대로, 규칙상 매수 없음(분할 소진 등)이어도 체크돼 있으면 같은 공식으로 계산해 주문
            가격 = min(평단, 전일종가) 센트 내림(보유 없으면 전일종가) · 수량 = 이번 회차 1분할 ÷ 가격 → 수량 단위 내림
            (앱 V0.72+: 1단계 = 시드÷분할 · 2단계 = 시드÷(분할×배수) — 앱이 bot.per_split 에 이번 회차 금액을 넣어 준다)
    · 매도: 수량 = 메리츠 계좌의 매도가능 수량 전량 · 가격 = 평단 × (1+익절%) 센트 올림 (앱 기록 평단, 없으면 계좌 평단)"""
    b = plan.get("bot") or {}
    if b.get("kind") == "lifetime":
        return build_lifetime(plan, sides, c)
    last, pct, per_split, unit = float(b["last_close"]), float(b["sell_pct"]), float(b["per_split"]), int(b["qty_unit"])
    avg_app = float(b["avg_exact"]) if b.get("avg_exact") else None
    hold_app = int(plan.get("holding_qty") or 0)
    plan_by = {o["side"]: o for o in plan.get("orders") or []}
    out = []
    if sides.get("buy"):
        if b.get("dd_gate") is not None and not b.get("dd_ok", True):     # QLD 무한매수: 1년 고점 대비 -기준% 이하일 때만 매수
            c.ok(f"매수 대기: 1년 고점 대비 {float(b.get('dd_now') or 0):.1f}% · -{float(b['dd_gate']):g}% 이하에서만 매수 (☑매수여도 주문 안 함)")
        elif "buy" in plan_by:
            o = plan_by["buy"]
            out.append({"side": "buy", "price": float(o["price"]), "qty": int(o["qty"]), "src": "앱 계획"})
        else:
            price = floor_cent(min(avg_app, last)) if (avg_app and hold_app > 0) else floor_cent(last)
            qty = (math.floor(per_split / price) // unit) * unit if price > 0 else 0
            if qty >= 1:
                out.append({"side": "buy", "price": price, "qty": int(qty), "src": f"규칙상 대기({plan.get('stage', '')}) → ☑매수로 주문"})
                c.ok(f"V2 매수(체크) 계산 {price:.2f} × {qty} = min(평단 {fp(avg_app) if avg_app else '-'}, 전일종가 {fp(last)}) · 1분할 ${per_split:,.0f}")
            else:
                c.warn("매수: 1분할 금액이 수량 단위보다 작아 매수 없음")
    seed = float(b.get("seed") or 0)
    if seed > 0 and out and out[-1]["side"] == "buy":
        room = seed - (avg_app or 0) * hold_app
        o_ = out[-1]
        if o_["price"] * o_["qty"] > room:
            fit = int((max(0.0, room) / o_["price"]) // unit * unit) if o_["price"] > 0 else 0
            if fit >= 1:
                c.warn(f"시드 상한: 남은 시드 ${room:,.0f} → 매수 {o_['qty']}주를 {fit}주로 줄임")
                o_["qty"] = fit
            else:
                out.pop()
                c.warn(f"시드 ${seed:,.0f} 모두 투입됨 — 추가 매수 없음 (매도를 켜거나 시드를 늘리면 다시 매수)")
    if sides.get("sell"):
        q = int(math.floor(min(acct["sellable"], hold_app if hold_app > 0 else acct["sellable"]) + 1e-9))   # QLD 무한매수: 이 앱 보유분까지만 (평생매수 보유분 보호)
        if q < 1:
            c.warn(f"매도: 계좌 매도가능 {acct['sellable']:g}주 — 매도 없음")
        else:
            basis, src = (avg_app, "앱 평단") if (avg_app and hold_app > 0) else (acct["avg"], "계좌 평단")
            if not basis:
                c.fail("매도: 평단을 알 수 없어 매도가를 계산할 수 없습니다", "sell")
            else:
                price = ceil_cent(basis * (1 + pct / 100))
                out.append({"side": "sell", "price": price, "qty": q, "src": f"계좌 매도가능 {q}주 전량 · {src} {fp(basis)} × (1+{pct:g}%)"})
                c.ok(f"V6 매도 = 계좌 매도가능 {q}주 전량 @ {price:.2f} ({src} {fp(basis)} × (1+{pct:g}%) 올림)")
    return out


def cancelled_nos(rows) -> set:
    """취소·정정 행이 가리키는 원주문번호 — 사람이 MTS에서 취소한 주문은 '살아 있는 주문'이 아니다."""
    return {str(r.get("orgl_oder_no")) for r in rows
            if str(r.get("oder_rctf_cncl_cls_code")) == "2" and str(r.get("orgl_oder_no") or "0").lstrip("0")}


ORDER_CODES = {"01": "지정가", "05": "시장가", "31": "LOO (장 개시 지정가)", "32": "LOC (장 마감 지정가)", "33": "MOO (장 개시 시장가)",
               "34": "MOC (장 마감 시장가)", "35": "Limit VWAP", "36": "Limit TWAP", "37": "VWAP", "38": "TWAP"}
ORDER_COND = {"31": "2", "33": "2", "32": "7", "34": "7"}          # 개장 전(2) · 종가(7) · 나머지 0
MARKET_CODES = {"05", "33", "34", "37", "38"}                      # 시장가 계열 — 단가 0


def same_session_orders(rows, sym, side, hours=16):
    """메리츠에 실제로 있는 같은 종목·매매 원주문 (취소·거부 제외, 미체결+체결) — 최근 N시간."""
    code = "2" if side == "buy" else "1"
    dead = cancelled_nos(rows)
    now = dt.datetime.now(KST)
    out, seen = [], set()
    for r in rows:
        if str(r.get("ovrs_stck_symb_iscd", "")).upper() != sym or str(r.get("seln_byov_clcd")) != code:
            continue
        if str(r.get("oder_rctf_cncl_cls_code", "0")) != "0" or str(r.get("ovrs_stck_oder_stat_cls_code", "0")) != "0":
            continue
        no = str(r.get("oder_no"))
        if no in dead or str(r.get("rctf_cncl_cls_code", "1")) == "3" or (str(r.get("oder_date")), no) in seen:
            continue
        if num(r.get("odqt")) - max(num(r.get("cncl_cnfr_qty")), num(r.get("cncl_odqt"))) <= 0:
            continue
        t = str(r.get("oder_exec_ymdh") or "")[:19]
        try:
            if (now - dt.datetime.strptime(t, "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)).total_seconds() > hours * 3600:
                continue
        except ValueError:
            if str(r.get("oder_date") or "") not in ("", now.strftime("%Y%m%d")):
                continue
        seen.add((str(r.get("oder_date")), no))
        out.append(r)
    return out


# ───────────────────────────────────────────── ⑥ 계좌 · 체결내역 → 사이클 복원
def et_date_of(ymdh: str, fallback: str = "") -> str:
    """메리츠 체결일시(국내 시각 "YYYY-MM-DD HH:MM:SS") → 미국 거래일(ET). LOC 체결 16:00 ET = 한국 다음날 05:00/06:00."""
    t = str(ymdh or "").strip()[:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y%m%d%H%M%S", "%Y-%m-%d %H:%M"):
        try:
            return dt.datetime.strptime(t, fmt).replace(tzinfo=KST).astimezone(ET).date().isoformat()
        except ValueError:
            pass
    f = str(fallback or "")
    return f"{f[:4]}-{f[4:6]}-{f[6:8]}" if len(f) == 8 else ""


def parse_fills(rows) -> list:
    """체결 행 → 정규화된 체결 목록 (중복 행 제거 · 오래된 순)."""
    seen, out = set(), []
    for r in rows or []:
        q = num(r.get("cntg_dqty"))
        if q <= 0 or str(r.get("oder_rctf_cncl_cls_code", "0")) == "2":
            continue
        od, no = str(r.get("oder_date") or ""), str(r.get("oder_no") or "")
        if (od, no) in seen:
            continue
        seen.add((od, no))
        sym = str(r.get("iscd") or r.get("ovrs_stck_symb_iscd") or "").split(".")[0].strip().upper()
        amt = num(r.get("cntg_camt"))
        price = num(r.get("cntg_crnc_prc")) or (amt / q if amt else 0.0)
        ts = str(r.get("cntg_ymdh") or r.get("oder_exec_ymdh") or "").strip()
        try:
            no_i = int(float(no))
        except ValueError:
            no_i = 0
        out.append({"sym": sym, "side": "sell" if str(r.get("seln_byov_clcd")) == "1" else "buy", "qty": q,
                    "price": round(price, 4), "amt": round(amt or q * price, 4), "date": et_date_of(ts, od), "ts": ts,
                    "key": f"{od}-{no_i:06d}", "loc": str(r.get("aspr_type_code")) == "5"})
    out.sort(key=lambda f: (f["date"], f["ts"], f["key"]))
    return out


def _cycle_doc(buys, sells):
    bq, bc = sum(f["qty"] for f in buys), sum(f["amt"] for f in buys)
    sq, sp = sum(f["qty"] for f in sells), sum(f["amt"] for f in sells)
    avg = bc / bq if bq else 0.0
    sell_avg = sp / sq if sq else 0.0
    return {"key": "api:" + sells[-1]["key"], "first_buy": buys[0]["date"] if buys else sells[0]["date"], "sell_date": sells[-1]["date"],
            "sell_price": round(sell_avg, 4), "qty": sq, "avg": round(avg, 6), "cost": round(bc, 2), "proceeds": round(sp, 2),
            "profit": round(sp - bc, 2), "pct": round((sell_avg / avg - 1) * 100, 4) if avg else 0.0, "rounds": len(buys),
            "buys": [{"key": f["key"], "date": f["date"], "qty": f["qty"], "price": f["price"]} for f in buys],
            "sells": [{"key": f["key"], "date": f["date"], "qty": f["qty"], "price": f["price"]} for f in sells]}


def reconstruct(fills: list, cur_qty: float) -> dict:
    """한 종목의 체결 목록 + 현재 보유수량 → 사이클 복원.
    ① 현재 보유에서 체결을 거꾸로 되돌려 '보유 0'이 되는 지점을 찾는다(그 이후로는 음수가 되면 안 됨).
    ② 그 지점부터 앞으로 걸으며 보유가 0으로 돌아오는 매도마다 사이클 1개를 닫는다(평균단가법).
    ③ 마지막 0 지점 이후의 매수 = 지금 사이클의 '나의 매수 기록'. 부분 매도가 끼었으면 남은 수량·평단을 1건으로 합친다.
    보유 0 지점을 못 찾으면(입고·액면분할·조회기간 밖 매수) complete=False → 앱은 자동으로 맞추지 않는다."""
    eps = 1e-6
    n = len(fills)
    before, pos = [0.0] * n, float(cur_qty)
    for i in range(n - 1, -1, -1):
        f = fills[i]
        pos = pos - f["qty"] if f["side"] == "buy" else pos + f["qty"]
        before[i] = pos
    suffix_min, m = [0.0] * n, float("inf")
    for i in range(n - 1, -1, -1):
        m = min(m, before[i])
        suffix_min[i] = m
    start = next((i for i in range(n) if abs(before[i]) < eps and suffix_min[i] > -eps), None)
    if start is None:
        ok = n == 0 and cur_qty < eps
        why = "" if ok else ("체결내역에서 보유 0 시점을 찾지 못함 (입고·분할·조회기간 밖 매수)" if n else "보유 중이지만 체결내역이 없음")
        return {"complete": ok, "why": why, "cycles": [], "current": {"records": [], "qty": 0.0, "avg": 0.0, "start": ""}}
    cycles, buys, sells, pos, cost = [], [], [], 0.0, 0.0
    for f in fills[start:]:
        if f["side"] == "buy":
            buys.append(f)
            pos += f["qty"]
            cost += f["amt"]
        else:
            avg = cost / pos if pos > eps else 0.0
            sells.append(f)
            pos -= f["qty"]
            cost -= f["qty"] * avg
            if pos < eps:
                cycles.append(_cycle_doc(buys, sells))
                buys, sells, pos, cost = [], [], 0.0, 0.0
    recs = []
    if buys:
        if sells:                                      # 부분 매도 뒤 남은 몫을 1건으로 (수량·평단 보존)
            last_sell = sells[-1]
            kept = [f for f in buys if (f["date"], f["ts"], f["key"]) > (last_sell["date"], last_sell["ts"], last_sell["key"])]
            kq = sum(f["qty"] for f in kept)
            kc = sum(f["amt"] for f in kept)
            rq, rc = pos - kq, cost - kc
            if rq > eps:
                recs.append({"key": "rest:" + last_sell["key"], "date": last_sell["date"], "qty": round(rq, 6),
                             "price": round(rc / rq, 4), "synthetic": True})
            buys_out = kept
        else:
            buys_out = buys
        recs += [{"key": f["key"], "date": f["date"], "qty": f["qty"], "price": f["price"]} for f in buys_out]
    return {"complete": True, "why": "", "since": fills[start]["date"] if n else "", "cycles": cycles,
            "current": {"records": recs, "qty": round(pos, 6), "avg": round(cost / pos, 6) if pos > eps else 0.0,
                        "start": buys[0]["date"] if buys else ""}}


def account_snapshot(api: Meritz) -> dict:
    now = dt.datetime.now(KST)
    holds = api.holdings()
    try:
        cash = api.usd_orderable()
    except MeritzError as e:
        cash = None
        log(f"  주문가능금액 조회 실패: {e}")
    rows, truncated = api.history()
    fills = parse_fills(rows)
    hl = []
    for r in holds:
        q, p, a = num(r.get("rmnd_dqty")), num(r.get("psnt_prc")), num(r.get("avrg_unpr"))
        val = num(r.get("frcr_vltn_amt")) or q * p
        hl.append({"symbol": str(r.get("ovrs_stck_symb_iscd", "")).upper(), "name": str(r.get("kor_isnm") or r.get("ovrs_item_name") or ""),
                   "exch": str(r.get("ovrs_exch_vndr_idno", "")), "qty": q, "sellable": num(r.get("seln_able_dqty")), "avg": a, "price": p,
                   "value": round(val, 2), "cost": round(q * a, 2), "pl": round(num(r.get("vltn_prls_camt")) if r.get("vltn_prls_camt") not in (None, "") else val - q * a, 2),
                   "pl_pct": num(r.get("vltn_ert")) if r.get("vltn_ert") not in (None, "") else ((p / a - 1) * 100 if a else 0.0)})
    syms = {}
    for sym in APP_PAGES:
        mine = [h for h in hl if h["symbol"] == sym]
        q = sum(h["qty"] for h in mine)
        avg = (sum(h["qty"] * h["avg"] for h in mine) / q) if q else 0.0
        rc = reconstruct([f for f in fills if f["sym"] == sym], q)
        if truncated:
            rc["complete"], rc["why"] = False, "체결내역이 너무 많아 일부만 읽음"
        cur = rc["current"]
        if rc["complete"] and q and cur["avg"] and abs(cur["avg"] / avg - 1) > 0.002:
            rc["note"] = f"체결 복원 평단 {cur['avg']:.4f} · 계좌 평단 {avg:.4f} (수수료 포함 여부 차이일 수 있음)"
        syms[sym] = {"qty": q, "avg": round(avg, 6), "price": mine[0]["price"] if mine else 0.0, **rc, "cycles": rc["cycles"][-60:]}
    # 이 스냅숏이 반영한 마지막 미국 거래일: 16:05 ET(LOC 체결) 전이면 전날까지
    covered = (now.astimezone(ET) - dt.timedelta(hours=16, minutes=5)).date().isoformat()
    return {"schema": "muhan-account/1", "version": VERSION, "as_of": now.isoformat(timespec="seconds"),
            "et_date": now.astimezone(ET).date().isoformat(), "covered": covered, "cash_usd": cash, "holdings": hl, "symbols": syms,
            "fills_n": len(fills), "truncated": truncated,
            "total": {"value": round(sum(h["value"] for h in hl), 2), "cost": round(sum(h["cost"] for h in hl), 2),
                      "pl": round(sum(h["pl"] for h in hl), 2)}}


def account_sync(api: Meritz, gist: "Gist") -> dict:
    snap = account_snapshot(api)
    gist.write(ACCOUNT_FILE, snap)
    for sym, v in snap["symbols"].items():
        log(f"  계좌 {sym} {v['qty']:g}주 @{fp(v['avg']) if v['avg'] else '-'} · 사이클 {len(v['cycles'])}건 · 이번 사이클 매수 {len(v['current']['records'])}건"
            + ("" if v["complete"] else f" · ⚠ 자동 맞춤 안 함: {v['why']}"))
    return snap


# ───────────────────────────────────────────── 실행

def cron_sync(cfg, gist=None):
    """cron-job.org 작업을 앱 설정(주문 시각 + 재시도)에 맞춘다. 이 저장소를 부르는 작업만 다룸 · 06:40 계좌 작업은 그대로.
    없는 재시도 작업은 주문 작업(헤더·토큰 포함)을 복사해 만들고, 남는 작업은 끈다. 실패해도 주문에는 영향 없음."""
    key = os.environ.get("CRONJOB_API_KEY", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not key or key == "off" or not repo:
        return
    res = {"at": dt.datetime.now(KST).isoformat(timespec="seconds"), "ok": False, "msg": "", "jobs": []}
    def done(ok, msg):
        res.update(ok=ok, msg=msg)
        log("⏰ cron-job.org: " + msg)
        if gist:
            try:
                gist.write(CONFIG_FILE.replace(".json", "-cron.json"), res)
            except Exception:  # noqa: BLE001
                pass
    try:
        api, hd = "https://api.cron-job.org", {"Authorization": "Bearer " + key}
        def call(method, path, body=None):
            st, d = http(method, api + path, hd, body=body) if body is not None else http(method, api + path, hd)
            if st not in (200, 201):
                why = {401: "API 키가 틀렸습니다 — cron-job.org Settings → API 에서 키를 다시 만들어 저장",
                       403: "접근 거부 — API 키의 IP 제한을 비워 두세요", 429: "cron-job.org 하루/초당 호출 한도 초과 — 잠시 뒤 다시"}.get(st, "")
                raise RuntimeError(f"{method} {path} → HTTP {st} {why or str(d)[:160]}")
            return d
        h, m = (int(x) for x in str(cfg.get("run_kst") or "00:10").split(":"))
        rm = int(cfg.get("retry_min") or 30) if 5 <= int(cfg.get("retry_min") or 30) <= 120 else 30
        rn = cfg.get("retry_n", 2)
        rn = int(rn) if rn is not None and 0 <= int(rn) <= 5 else 2
        want = []
        for i in range(rn + 1):
            x = (h * 60 + m + i * rm) % 1440
            hh = x // 60
            wd = [1, 2, 3, 4, 5] if hh >= 14 else ([2, 3, 4, 5, 6] if hh < 13 else [1, 2, 3, 4, 5, 6])
            want.append({"hours": [hh], "minutes": [x % 60], "wdays": wd, "mdays": [-1], "months": [-1], "timezone": "Asia/Seoul"})
        url = f"https://api.github.com/repos/{repo}/actions/workflows/muhan-bot.yml/dispatches"
        alljobs = call("GET", "/jobs").get("jobs") or []
        jobs = [j for j in alljobs if f"/repos/{repo.lower()}/actions/workflows/" in str(j.get("url", "")).lower()]
        acct = lambda j: (j.get("schedule") or {}).get("hours") == [6] and (j.get("schedule") or {}).get("minutes") == [40]
        orders = sorted([j for j in jobs if not acct(j)], key=lambda j: int(j.get("jobId", 0)))
        if not orders:
            return done(False, f"이 봇({repo})을 부르는 주문 작업이 없음 (cron-job.org 작업 {len(alljobs)}개 중) — 앱 ⑥ 안내대로 작업 1개를 먼저 만드세요")
        same = lambda s, w: all((s or {}).get(k) == w[k] for k in ("hours", "minutes", "wdays")) and (s or {}).get("timezone") == "Asia/Seoul"
        changed = 0
        for i, w in enumerate(want):
            label = ("·".join(APP_PAGES) + " 주문") if i == 0 else f"{'·'.join(APP_PAGES)} 재시도 {i} (+{i * rm}분)"
            if i < len(orders):
                j = orders[i]
                if not same(j.get("schedule"), w) or not j.get("enabled", True):
                    call("PATCH", f"/jobs/{j['jobId']}", {"job": {"enabled": True, "title": label, "schedule": w}})
                    changed += 1
            else:
                src = call("GET", f"/jobs/{orders[0]['jobId']}").get("jobDetails") or {}
                new = {k: src[k] for k in ("url", "requestMethod", "extendedData", "requestTimeout", "saveResponses") if k in src}
                new.update(enabled=True, title=label, schedule=w)
                call("PUT", "/jobs", {"job": new})
                changed += 1
                time.sleep(1.2)                     # 작업 만들기 한도 1초 1건
        for j in orders[len(want):]:
            if j.get("enabled", True):
                call("PATCH", f"/jobs/{j['jobId']}", {"job": {"enabled": False}})
                changed += 1
        t = " · ".join(f"{w['hours'][0]:02d}:{w['minutes'][0]:02d}" for w in want)
        res["jobs"] = [f"{w['hours'][0]:02d}:{w['minutes'][0]:02d}" for w in want]
        done(True, f"{'작업 ' + str(changed) + '개 고침' if changed else '이미 맞음'} — {t} (Asia/Seoul · 월~금/화~토 자동)")
    except Exception as e:  # noqa: BLE001
        done(False, f"동기화 실패 — {e}")


def run() -> int:
    t_start = time.time()
    now_utc = dt.datetime.now(dt.timezone.utc)
    now_et = now_utc.astimezone(ET)
    today = now_et.date()
    trigger = os.environ.get("RUN_TRIGGER", "schedule")
    force_mode = (os.environ.get("RUN_MODE") or "config").strip()
    _only = [x.strip().upper() for x in os.environ.get("RUN_ONLY", "").split(",") if x.strip()]
    for _k in [k for k in list(APP_PAGES) if _only and k not in _only]:
        APP_PAGES.pop(_k)                       # 종목별 앱(⚡ 바로 실행)에서 부른 실행 → 그 종목만
    gist = Gist(os.environ["MUHAN_TOKEN"], os.environ["GIST_ID"])
    if force_mode == "account":                 # 💼 계좌·체결 동기화만 (주문·앱 계산 없음 · 실행 결과 기록은 건드리지 않음)
        return run_account(gist)
    files = gist.files()
    try:
        cfg = {**DEFAULT_CONFIG, **json.loads(files.get(CONFIG_FILE) or "{}")}
    except ValueError:
        cfg = dict(DEFAULT_CONFIG)
    cron_sync(cfg, gist)                        # ⏰ cron-job.org 작업 시각을 앱 설정에 맞춤 (API 키 있을 때만)
    mode = cfg.get("mode", "off")
    if mode not in ("live", "off"):
        mode = "off"        # V5.00: 리허설 모드 삭제 — 예전 설정 "dry" 는 꺼짐으로 본다
    if force_mode in ("config", "") and mode == "off" and trigger == "schedule":
        log(f"{VERSION} · 자동 실행 꺼짐 — 아무것도 하지 않음 (결과 기록도 남기지 않음)")
        return 0
    if force_mode == "dry":
        mode = "off"        # 예전 앱의 [리허설] 요청 — 주문 없이 끝
    elif force_mode == "live":
        mode = "live"       # [⚡ 바로 실행] — 앱에서 두 번 눌러 확인한 즉시 실제 주문
    try:
        prev = json.loads(files.get(STATUS_FILE) or "{}")
    except ValueError:
        prev = {}
    status = {"schema": "muhan-bot-status/1", "version": VERSION, "run_at": dt.datetime.now(KST).isoformat(timespec="seconds"),
              "et_date": today.isoformat(), "mode": mode, "trigger": trigger, "results": {}, "overall": "ok"}
    if force_mode == "check":
        status["mode"] = mode = "check"
    log(f"{VERSION} · 모드 {mode} · ET {now_et:%Y-%m-%d %H:%M} · {trigger}")
    # V1.00 실행기 잠금: GitHub · PC · 폰 실행기가 같이 돌아도 한 곳만 주문 (다른 실행기가 진행 중이면 건너뜀)
    me = os.environ.get("RUNNER_ID", "github")
    status["runner"] = me
    if prev.get("overall") == "running" and prev.get("runner", "github") != me and trigger == "schedule":
        try:
            age = (dt.datetime.now(KST) - dt.datetime.fromisoformat(str(prev.get("run_at")))).total_seconds()
        except ValueError:
            age = 9e9
        if age < 600:
            log(f"다른 실행기({prev.get('runner', 'github')})가 {int(age)}초 전부터 실행 중 — 이번 실행은 건너뜀")
            return 0
    gist.write(STATUS_FILE, {**status, "overall": "running", "note": ("GitHub" if me == "github" else me) + "에서 실행 중… (보통 2~4분)", "history": (prev.get("history") or [])[-60:]})

    def finish(overall, note=""):
        status["overall"], status["note"] = overall, note
        status["elapsed_sec"] = round(time.time() - t_start)
        hist = (prev.get("history") or [])[-119:]
        hist.append({"at": status["run_at"], "mode": mode, "overall": overall, "trig": trigger,
                     "r": {s: v.get("summary", "") for s, v in status["results"].items()}, "note": note,
                     "o": {s: [{k: o.get(k) for k in ("side", "price", "qty", "state", "how", "oder_no", "why")} for o in v.get("orders", [])]
                           for s, v in status["results"].items() if v.get("orders")}})
        status["history"] = hist
        gist.write(STATUS_FILE, status)
        summary_md(status)
        notify(status)
        return 2 if overall in ("blocked", "error") else 0

    def work():
        if mode == "check":
            return run_check(cfg, status, finish)
        if mode == "off":
            return finish("off", "자동주문 꺼짐 — 무한매수 허브 ‘메리츠 자동주문(해외)’에서 리허설·실전을 켜세요")
        if trigger == "schedule" and not is_trading_day(today):
            return finish("closed", f"미국 휴장일 {today}")
        tday, regular = target_session(now_et)
        expect_basis = prev_trading_day(tday).isoformat()
        how = "주문코드 " + ORDER_CODES.get(str(cfg.get("oder_code") or "32"), "LOC (장 마감 지정가)") + " · 바로 실제 주문"
        status["session"] = {"date": tday.isoformat(), "regular": regular, "basis": expect_basis}
        log(f"대상 정규장 {tday} · 기준 종가일 {expect_basis} · {how}")

        api = Meritz(os.environ.get("MERITZ_APP_KEY", ""), os.environ.get("MERITZ_APP_SECRET", ""))
        try:
            api.token()
            log("메리츠 토큰 발급 OK")
        except MeritzError as e:
            return finish("error", str(e))
        # ⑥ 계좌·체결 → Gist 먼저: 곧 띄울 앱이 체결 내역으로 매수 기록·사이클을 맞춘 뒤 계획을 세운다
        snap = None
        try:
            snap = account_sync(api, gist)
            status["account_sync"] = {"at": snap["as_of"], "ok": True}
        except Exception as e:  # noqa: BLE001
            log(f"계좌·체결 동기화 실패(계획은 기존 기록으로 계속): {e}")
            status["account_sync"] = {"at": dt.datetime.now(KST).isoformat(timespec="seconds"), "ok": False, "why": str(e)[:200]}

        app_base = (cfg.get("app_base") or os.environ.get("APP_BASE") or "").rstrip("/") + "/"
        sides_cfg = cfg.get("sides") or {}
        any_block = False
        for sym in APP_PAGES:
            sides = {"buy": True, "sell": True, **(sides_cfg.get(sym) or {})}
            if not (cfg.get("symbols") or {}).get(sym, True):
                sides = {"buy": False, "sell": False}
            if not (sides["buy"] or sides["sell"]):
                continue
            res = {"state": "", "summary": "", "orders": [], "checks": [], "sides": sides}
            status["results"][sym] = res
            c = Checks()
            log(f"── {sym} (매수 {'☑' if sides['buy'] else '☐'} · 매도 {'☑' if sides['sell'] else '☐'})")
            try:
                plan = plan_from_app(app_base + APP_PAGES[sym], os.environ["MUHAN_TOKEN"], os.environ["GIST_ID"])
            except Exception as e:  # noqa: BLE001
                res.update(state="error", summary=f"앱 실행 실패: {str(e)[:200]}")
                any_block = True
                continue
            res["plan"] = {k: plan.get(k) for k in ("basis_close_date", "stage", "avg_price", "holding_qty", "orders", "version", "bot")}
            verify_plan(plan, sym, expect_basis, cfg, now_utc, c)              # V1 최신 · V2 앱 계산 재검산
            try:
                acct = account_info(api, sym)
            except MeritzError as e:
                # 재시도까지 실패하면, 이번 실행 시작 때 읽은 계좌값(보통 1~3분 전)으로 대신한다 — 매도 수량이 남는 걸 막기 위해 표시
                hs = [h for h in ((snap or {}).get("holdings") or []) if h.get("symbol") == sym]
                if snap and snap.get("holdings") is not None:
                    q = sum(h["qty"] for h in hs)
                    acct = {"qty": q, "sellable": sum(h["sellable"] for h in hs), "avg": (sum(h["qty"] * h["avg"] for h in hs) / q) if q else 0.0,
                            "exch": hs[0]["exch"] if hs else ""}
                    c.warn(f"V4 잔고 재조회 실패({str(e)[:60]}) → 실행 시작 때 읽은 계좌값 사용 ({snap['as_of'][11:19]} · {acct['qty']:g}주)")
                else:
                    c.fail(f"V4 계좌 잔고 조회 실패 → 매도 수량을 알 수 없어 매도는 내지 않음: {e}", "sell")
                    acct = {"qty": 0.0, "sellable": 0.0, "avg": 0.0, "exch": ""}
            status.setdefault("account", {})[sym] = {k: acct[k] for k in ("qty", "sellable", "avg")}
            hold_app = int(plan.get("holding_qty") or 0)
            if abs(acct["qty"] - hold_app) > 1e-6:
                c.warn(f"V4 앱 기록 {hold_app}주 · 계좌 {acct['qty']:g}주 — 매도는 계좌 수량 기준으로 냅니다 (앱 기록을 맞추면 계산이 더 정확)")
            else:
                c.ok(f"V4 계좌 보유 {acct['qty']:g}주 = 앱 기록")
            exch, mclose = exchange_and_close(api, sym, acct["exch"], expect_basis.replace("-", ""))
            res["exchange"] = exch
            last_close = float((plan.get("bot") or {}).get("last_close") or 0)
            if mclose and last_close:
                diff = abs(mclose / last_close - 1) * 100
                (c.fail if diff > 0.3 else c.ok)(f"V3 전일 종가 {'불일치' if diff > 0.3 else '대조 일치'}: 메리츠 {fp(mclose)} · 앱 {fp(last_close)}" + (f" ({diff:.2f}%)" if diff > 0.3 else ""))
            else:
                c.warn("V3 메리츠 일봉에서 전일 종가를 찾지 못해 대조 생략")
            orders = build_orders(plan, sides, acct, c) if not any(not x["ok"] and "V2 재계산 정보" in x["msg"] for x in c.items) else []
            for o in orders:
                if o["side"] == "buy":
                    amt = o["price"] * o["qty"]
                    lim = auto_limit(plan, cfg)
                    if amt > lim + 0.01:
                        c.fail(f"V7 매수 ${amt:,.0f} > 자동 한도 ${lim:,.0f} (1회 매수금 × 2 · 평생매수는 엔진 금액)", "buy")
                    try:
                        cash = api.usd_orderable()
                        if cash is not None:
                            (c.ok if cash + 1e-6 >= amt else lambda m: c.fail(m, "buy"))(f"V5 주문가능 ${cash:,.2f} {'≥' if cash + 1e-6 >= amt else '<'} 매수 ${amt:,.2f}")
                    except MeritzError as e:
                        c.warn(f"V5 주문가능금액 조회 실패: {e}")
            try:
                today_rows = api.orders_today()
                try:
                    sess_rows = today_rows + api.history(start=(dt.datetime.now(KST) - dt.timedelta(days=1)).strftime("%Y%m%d"), max_pages=5, cntg="0")[0]
                except MeritzError:
                    sess_rows = today_rows
            except MeritzError as e:
                today_rows = sess_rows = []
                c.fail(f"V8 주문내역 조회 실패 — 중복 확인 불가: {e}")
            ocode = str(cfg.get("oder_code") or "32")
            ocode = ocode if ocode in ORDER_CODES else "32"
            cname = ORDER_CODES[ocode]
            res["checks"] = c.items
            if not orders:
                res.update(state="none", summary="주문 없음 · " + ("매수·매도 체크 해제" if not (sides["buy"] or sides["sell"]) else plan.get("stage", "")))
                if c.block_buy or c.block_sell:
                    res["state"], any_block = "blocked", True
                    res["summary"] += " · ⚠ " + (c.block_buy + c.block_sell)[0]
                continue

            for o in orders:
                side, kr = o["side"], ("매수" if o["side"] == "buy" else "매도")
                item = {"side": side, "price": 0.0 if ocode in MARKET_CODES else o["price"], "qty": o["qty"], "state": "", "why": "", "src": o.get("src", ""),
                        "how": cname}
                res["orders"].append(item)
                blocks = [b for b in (c.block_buy if side == "buy" else c.block_sell) if b.startswith(("V7", "V8"))]
                if blocks:
                    item.update(state="blocked", why=blocks[0])
                    any_block = True
                    continue
                # 중복 = 메리츠에 실제로 있는 같은 종목·매매 주문(정정/취소 대상 + 체결)만 
                dups = [r for r in same_session_orders(sess_rows, sym, side) if abs(num(r.get('odqt')) - int(o['qty'])) < 1e-6 and (ocode in MARKET_CODES or abs(num(r.get('ovrs_stck_oder_prc')) - float(item['price'])) < 0.005)]   # 평생매수 주문과 구분
                if dups:
                    d0 = dups[0]
                    item.update(state="dup", why=f"중복 — 메리츠에 이미 주문 있음 (주문번호 {d0.get('oder_no')} · {num(d0.get('ovrs_stck_oder_prc')):.2f} × {int(num(d0.get('odqt')))}주) → 다시 내지 않음")
                    continue
                if mode != "live":
                    item.update(state="dry", why=f"리허설 — 실전이면 {cname} 바로 주문")
                    continue
                r = api.place_order(side, sym, exch, ocode, float(item["price"]), int(o["qty"]))
                if not r["ok"]:
                    item.update(state="rejected", why=f"주문 실패 — {r['why']}")
                    any_block = True
                    continue
                item.update(state="placed", oder_no=r.get("oder_no"), why=f"{cname} 주문 실행 완료 · 주문번호 {r.get('oder_no')} (MTS 정정/취소에 표시)")
                log(f"  {kr} {item['price']} × {o['qty']} → {item['state']} {item['why']}")

            icon = {"placed": "✅", "dup": "🔁", "exists": "☑", "dry": "◎", "blocked": "⛔", "rejected": "✖", "cancelled": "↩", "placed?": "❔"}
            res["summary"] = " · ".join(f"{icon.get(i['state'], '')} {'매수' if i['side'] == 'buy' else '매도'} {i['how']} {i['price']:.2f}×{i['qty']}" for i in res["orders"])
            res["state"] = "blocked" if any(i["state"] in ("blocked", "rejected", "cancelled", "placed?") for i in res["orders"]) else \
                ("dry" if mode != "live" else "done")
            if sides["sell"] and c.block_sell and not any(o["side"] == "sell" for o in orders):
                res["state"], any_block = "blocked", True
                res["summary"] += " · ⛔ 매도 못 냄: " + c.block_sell[0][:90]

        if not status["results"]:
            return finish("none", "매수·매도가 모두 체크 해제돼 있습니다")
        overall = "blocked" if any_block else ("dry" if mode != "live" else "done")
        return finish(overall, how)

    try:
        return work()
    except Exception as e:  # noqa: BLE001 — 어떤 오류든 앱에 보이게 남긴다
        log(f"✖ 봇 오류: {e}")
        return finish("error", f"봇 오류: {str(e)[:300]}")

def run_account(gist) -> int:
    log(f"{VERSION} · 💼 계좌·체결 동기화")
    try:
        api = Meritz(os.environ.get("MERITZ_APP_KEY", ""), os.environ.get("MERITZ_APP_SECRET", ""))
        snap = account_sync(api, gist)
        log(f"완료 · 체결 {snap['fills_n']}건 · 보유 {len(snap['holdings'])}종목 · 주문가능 ${snap['cash_usd'] if snap['cash_usd'] is not None else '-'}")
        return 0
    except Exception as e:  # noqa: BLE001
        log(f"✖ 계좌 동기화 실패: {e}")
        try:
            prev = json.loads(gist.files().get(ACCOUNT_FILE) or "{}")
        except Exception:  # noqa: BLE001
            prev = {}
        prev.update(schema="muhan-account/1", error=str(e)[:300], error_at=dt.datetime.now(KST).isoformat(timespec="seconds"))
        gist.write(ACCOUNT_FILE, prev)
        return 2


def run_check(cfg, status, finish) -> int:
    """🔧 연결 점검 — 주문 없이 메리츠 API·앱 주소를 하나씩 확인해 어디가 막혔는지 정확히 보여준다."""
    res = {"state": "", "summary": "", "orders": [], "checks": []}
    status["results"]["연결 점검"] = res
    c = Checks()

    def t(label, fn):
        try:
            c.ok(f"{label} — {fn()}")
            return True
        except Exception as e:  # noqa: BLE001
            c.fail(f"{label} — {e}")
            return False

    api = None
    try:
        api = Meritz(os.environ.get("MERITZ_APP_KEY", ""), os.environ.get("MERITZ_APP_SECRET", ""))
    except MeritzError as e:
        c.fail(f"① 앱키 — {e}")
    if api and t("① 토큰 발급", lambda: (api.token(), f"정상 · mac {api.mac}")[1]):
        holds = []

        def h():
            holds.extend(api.holdings())
            for sym in APP_PAGES:
                rows = [r for r in holds if str(r.get("ovrs_stck_symb_iscd", "")).upper() == sym]
                q = sum(num(r.get("rmnd_dqty")) for r in rows)
                status.setdefault("account", {})[sym] = {"qty": q, "sellable": sum(num(r.get("seln_able_dqty")) for r in rows),
                                                         "avg": (sum(num(r.get("rmnd_dqty")) * num(r.get("avrg_unpr")) for r in rows) / q) if q else 0.0}
            mine = {str(r.get("ovrs_stck_symb_iscd")): f"{num(r.get('rmnd_dqty')):g}주 @{fp(num(r.get('avrg_unpr')))}" for r in holds}
            pick = {k: v for k, v in mine.items() if k in ("SOXL", "TQQQ")}
            return f"{len(holds)}종목 보유" + (" · " + ", ".join(f"{k} {v}" for k, v in pick.items()) if pick else " · SOXL·TQQQ 없음")
        t("② 해외 잔고", h)
        t("③ 주문가능금액", lambda: (lambda v: f"${v:,.2f}" if v is not None else "USD 행 없음")(api.usd_orderable()))
        t("④ 당일 주문내역", lambda: f"{len(api.orders_today())}건")

        def hist():
            k = dt.datetime.now(KST).date()
            rows, more = api.history((k - dt.timedelta(days=60)).strftime("%Y%m%d"), max_pages=3)
            return f"최근 60일 체결 {len(rows)}건{'+' if more else ''} (매수 기록·사이클 자동 등록용)"
        t("④-2 체결내역", hist)
        for sym in ("SOXL", "TQQQ"):
            def q(sym=sym):
                held = [str(r.get("ovrs_exch_vndr_idno")) for r in holds if str(r.get("ovrs_stck_symb_iscd")) == sym]
                last_err = ""
                for ex in (held or EXCH_GUESS.get(sym, [])):
                    try:
                        cl = api.daily_closes(sym, EXCH_TO_MKT.get(ex, "OQ"))
                    except MeritzError as e:
                        last_err = str(e)
                        continue
                    if cl:
                        d = max(cl)
                        return f"거래소 {ex}({EXCH_TO_MKT.get(ex)}) · 최근 일봉 {d[:4]}-{d[4:6]}-{d[6:]} {fp(cl[d])}"
                raise MeritzError("일봉을 찾지 못함 " + last_err)
            t(f"⑤ {sym} 시세·거래소", q)
    base = (cfg.get("app_base") or os.environ.get("APP_BASE") or "").rstrip("/") + "/"

    def app():
        st, txt = http("GET", base + "soxl.html?t=" + str(int(time.time())))
        if st != 200 or not isinstance(txt, str):
            raise RuntimeError(f"{base}soxl.html 응답 {st}")
        import re as _re
        v = _re.search(r'const APP_VERSION = "(V[\d.]+)"', txt)
        if "lastLocOrder" not in txt or "bot: {" not in txt:
            raise RuntimeError(f"앱 {v.group(1) if v else '?'} 은 자동주문 미지원 — soxl.html·tqqq.html 을 새 버전으로")
        return f"{base} · 앱 {v.group(1) if v else '?'}"
    t("⑥ 앱 주소", app)
    res["checks"] = c.items
    n = sum(1 for x in c.items if x["ok"])
    res["summary"] = f"{n}/{len(c.items)} 통과"
    res["state"] = "ok" if n == len(c.items) else "blocked"
    return finish("checked" if n == len(c.items) else "error",
                  "모든 연결 정상 — 리허설을 실행하세요" if n == len(c.items) else "⛔ 항목의 안내대로 고친 뒤 다시 점검하세요")


def summary_md(st):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [f"## 🤖 무한매수 자동주문 · {st['mode']} · {st['overall']}", f"{st['run_at']} (KST) · {st.get('note', '')}", ""]
    for sym, r in st["results"].items():
        lines.append(f"### {sym} — {r.get('summary', '')}")
        for o in r.get("orders", []):
            lines.append(f"- {'매수' if o['side'] == 'buy' else '매도'} LOC {o['price']:.2f} × {o['qty']} → **{o['state']}** {o.get('why', '')}")
        for ch in r.get("checks", []):
            lines.append(f"  - {'✅' if ch['ok'] else ('⚠️' if ch['ok'] is None else '⛔')} {ch['msg']}")
    text = "\n".join(lines)
    print(text)
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text + "\n")


TG_STATE = {"placed": "✅ 주문 실행", "dup": "🔁 중복 (이미 주문 있음)", "exists": "☑️ 이미 있음", "blocked": "⛔ 차단", "rejected": "✖ 거부", "dry": "◎ 리허설",
            "cancelled": "↩️ 취소", "none": "· 주문 없음", "": "…"}


def tg_text(st, title, money, hub):
    """텔레그램용 — 한눈에 읽히게: 제목 · 시각 · 종목별 주문 블록 · 사유 · 버전"""
    wd = "월화수목금토일"
    try:
        t = dt.datetime.fromisoformat(str(st.get("run_at", ""))[:19])
        when = f"{t:%m/%d}({wd[t.weekday()]}) {t:%H:%M}"
    except ValueError:
        when = str(st.get("run_at", ""))[5:16].replace("T", " ")
    L = [f"{title}", "━━━━━━━━━━━━━━", f"🗓 {when} · {hub}"]
    for sym, r in (st.get("results") or {}).items():
        L += ["", f"📈 {sym}"]
        orders = r.get("orders") or []
        if not orders:
            L.append(f"   {r.get('summary', '') or '주문 없음'}")
        for o in orders:
            side = "🟢 매수" if o.get("side") == "buy" else "🔴 매도"
            L.append(f"   {side} {o.get('how', 'LOC')}  {money(float(o.get('price') or 0))} × {o.get('qty')}주")
            why = str(o.get("why") or "")
            L.append(f"      {TG_STATE.get(o.get('state', ''), o.get('state', ''))}" + (f"\n      └ {why}" if why else ""))
    note = str(st.get("note") or "").strip()
    if note:
        L += ["", f"💬 {note}"]
    L += ["━━━━━━━━━━━━━━", f"🤖 {VERSION}"]
    return "\n".join(L)[:3900]


def notify(st):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic and not os.environ.get("TELEGRAM_BOT_TOKEN", "").strip():
        return
    title = {"none": "주문 없음", "checked": "🔧 연결 점검 통과", "done": "✅ 자동주문 실행", "dry": "◎ 리허설 완료", "blocked": "⛔ 자동주문 확인 필요", "error": "✖ 자동주문 오류",
             "closed": "휴장", "off": "자동주문 꺼짐", "skipped": "주문 시간 밖"}.get(st["overall"], st["overall"])
    body = "\n".join(f"{s}: {r.get('summary', '')}" for s, r in st["results"].items()) or st.get("note", "")
    tg_tok, tg_chat = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(), os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if tg_tok and tg_chat and tg_tok != "off":           # 📨 텔레그램 (토큰은 로그에 남기지 않음)
        when = st.get("run_at", "")[5:16].replace("T", " ")
        code, _ = http("POST", f"https://api.telegram.org/bot{tg_tok}/sendMessage",
                       body={"chat_id": tg_chat, "text": tg_text(st, title, lambda p: f"${p:,.2f}", "QLD 무한매수"), "disable_web_page_preview": True}, timeout=10)
        log("  📨 텔레그램 알림 " + ("전송" if code == 200 else f"실패 HTTP {code}"))
    if not topic:
        return
    try:   # ntfy JSON 발행 — 한글 제목 그대로
        http("POST", "https://ntfy.sh/", body={"topic": topic, "title": title, "message": body[:900],
                                               "priority": 4 if st["overall"] in ("blocked", "error") else 3}, timeout=10)
    except Exception as e:  # noqa: BLE001
        log(f"알림 실패: {e}")

def self_update():
    """앱(봇의 원본)에 다른 버전 봇이 있으면 저장소의 봇 파일을 바꾸고 새 코드로 다시 실행 — 앱을 안 열어도 항상 최신"""
    import base64, re
    if os.environ.get("MUHAN_UPDATED") or not os.environ.get("GITHUB_REPOSITORY") or not os.environ.get("MUHAN_TOKEN"):
        return
    try:
        base = (os.environ.get("APP_BASE") or "https://mins0x001.github.io/QLD").rstrip("/") + "/"
        req = urllib.request.Request(base + "api-qm.html?t=" + str(int(time.time())), headers={"User-Agent": "muhan-bot", "Cache-Control": "no-cache"})
        html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
        i = html.index("const BOT_FILES = ")
        files = json.loads(html[i + 18:html.index("\n", i)].rstrip(";").replace("<\\/", "</"))
        me = os.path.basename(__file__)
        new = dict(files).get(me, "")
        m = re.search(r'VERSION = "([^"]+)"', new)
        with open(__file__, encoding="utf-8") as f:
            cur = f.read()
        if not m or new.strip() == cur.strip():
            return          # 버전 번호가 같아도 내용이 다르면 업데이트 (무조건 최신)
        api = "https://api.github.com/repos/" + os.environ["GITHUB_REPOSITORY"] + "/contents/"
        hd = {"Authorization": "Bearer " + os.environ["MUHAN_TOKEN"], "Accept": "application/vnd.github+json", "User-Agent": "muhan-bot"}
        for path, text in files:
            if path.endswith(".yml"):
                continue          # 실행 시각(워크플로)은 앱이 사용자 설정대로 관리
            try:
                sha = json.loads(urllib.request.urlopen(urllib.request.Request(api + path, headers=hd), timeout=30).read())["sha"]
            except Exception:  # noqa: BLE001
                sha = None
            body = {"message": f"자동 업데이트 {VERSION.split(' ')[1]} → {m.group(1).split(' ')[1]}", "content": base64.b64encode(text.encode("utf-8")).decode()}
            if sha:
                body["sha"] = sha
            urllib.request.urlopen(urllib.request.Request(api + path, data=json.dumps(body).encode(), headers={**hd, "Content-Type": "application/json"}, method="PUT"), timeout=30)
        with open(__file__, "w", encoding="utf-8") as f:
            f.write(new)
        print(f"🔄 봇 자동 업데이트 {VERSION} → {m.group(1)} · 새 버전으로 다시 실행", flush=True)
        os.environ["MUHAN_UPDATED"] = "1"
        os.execv(sys.executable, [sys.executable, __file__] + sys.argv[1:])
    except Exception as e:  # noqa: BLE001
        print(f"자동 업데이트 확인 건너뜀(이번 실행은 현재 버전): {e}", flush=True)


if __name__ == "__main__":
    self_update()
    try:
        sys.exit(run())
    except Exception as e:  # noqa: BLE001
        log(f"✖ 오류: {e}")
        sys.exit(9)
