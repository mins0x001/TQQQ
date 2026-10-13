#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
무한매수 LOC 자동주문 봇 — 메리츠증권 Open API                     MUHANBOT V1.1 (261013)

매일 미국 정규장 중(한국시간 00:10 무렵) GitHub Actions에서 실행됩니다.

  ① 계획   무한매수 앱(soxl.html · tqqq.html)을 클라우드에서 그대로 실행해 '오늘의 LOC 주문'을 받는다.
           → 앱과 봇이 같은 코드로 계산하므로 숫자가 어긋날 수 없다. 기록·설정은 Gist 동기화로 가져온다.
  ② 검수   주문 전에 8가지를 확인하고, 하나라도 어긋나면 그 종목은 주문하지 않는다.
  ③ 주문   해외주식 LOC(oder_cls_code "32" · 조건 "7")로 접수. 경고(warn_cls_code≠"0")는 자동 확인하지 않는다.
  ④ 대조   접수 직후 당일 주문내역을 다시 읽어 종목·매매·LOC·수량·가격이 맞는지 확인. 다르면 즉시 취소.
  ⑤ 보고   결과를 Gist(muhan-bot-status.json)에 기록 → 앱의 🤖 카드에 모든 기기에서 표시. 실패 시 Actions 실패(메일 알림).

모드(앱에서 전환, Gist muhan-bot.json): off(끄기) · dry(리허설 — 주문만 안 냄) · live(실전)
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

VERSION = "MUHANBOT V1.1 (261013)"
MERITZ_BASE = os.environ.get("MERITZ_BASE_URL", "https://openapi.imeritz.com:9443").rstrip("/")
ET, KST = ZoneInfo("America/New_York"), ZoneInfo("Asia/Seoul")
APP_PAGES = {"SOXL": "soxl.html", "TQQQ": "tqqq.html"}
CONFIG_FILE, STATUS_FILE = "muhan-bot.json", "muhan-bot-status.json"
DEFAULT_CONFIG = {"mode": "dry", "symbols": {"SOXL": True, "TQQQ": True}, "max_order_usd": 20000, "app_base": ""}
# 거래소: 주문용 벤더코드 ↔ 시세용 2자리 코드
EXCH_TO_MKT = {"0537": "OQ", "0321": "NY", "0066": "AX"}
EXCH_GUESS = {"SOXL": ["0066", "0321", "0537"], "TQQQ": ["0537", "0066", "0321"]}

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


QUERY_OK = {"0000", "5766", "5820", "5822"}
TOKEN_DEAD = {"EGW00121", "EGW00123"}


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
        st, d = http("POST", self.base + "/oauth2/token",
                     form={"grant_type": "client_credentials", "client_id": self.key,
                           "client_secret": self.secret, "scope": "login"})
        if st != 200 or not isinstance(d, dict) or "access_token" not in d:
            code = d.get("rsp_cd") or d.get("error") if isinstance(d, dict) else ""
            msg = (d.get("rsp_msg") or d.get("error_description") or "") if isinstance(d, dict) else ""
            raise MeritzError(f"토큰 발급 실패 (HTTP {st}) {code} {msg}".strip(), "AUTH")
        self._token = d["access_token"]
        self._exp = time.time() + int(d.get("expires_in", 43200)) - 120
        return self._token

    def _req(self, method, path, params=None, _retry=True):
        time.sleep(0.12)                            # API별 초당 10건 한도
        h = {"authorization": "Bearer " + self.token(), "mac_address": self.mac}
        url = self.base + path
        if method == "GET":
            if params:
                url += "?" + urllib.parse.urlencode(params)
            st, body = http("GET", url, h)
        else:
            st, body = http("POST", url, h, body=params or {})
        code = body.get("rsp_cd") if isinstance(body, dict) else None
        if code in TOKEN_DEAD and _retry:
            self._token = None
            return self._req(method, path, params, _retry=False)
        return st, body

    def query(self, path, params=None) -> list:
        st, body = self._req("GET", path, params)
        if not isinstance(body, dict):
            raise MeritzError(f"{path}: 응답 형식 오류 (HTTP {st})", "BAD_RESPONSE")
        code = str(body.get("rsp_cd") or "")
        if st != 200 or code not in QUERY_OK:
            raise MeritzError(f"{path}: {code} {body.get('rsp_msg', '')} {body.get('rsp_sub_msg', '')}".strip(), code)
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

    # 주문
    def place_loc(self, side, symbol, exch, price, qty):
        path = "/trading/v1/overseas/orders/" + ("buy" if side == "buy" else "sell")
        st, body = self._req("POST", path, {
            "ovrs_stck_symb_iscd": symbol, "ovrs_exch_vndr_idno": exch,
            "oder_cls_code": "32", "oder_cond_cls_code": "7",          # LOC = 장마감 지정가 · 종가 조건
            "odqt": int(qty), "ovrs_stck_oder_prc": f"{price:.2f}"})
        return judge_order(st, body)

    def cancel(self, oder_date, oder_no, qty):
        st, body = self._req("POST", "/trading/v1/overseas/orders/cancel", {
            "oder_date": oder_date, "orgl_oder_no": int(oder_no), "oder_cls_code": "32", "odqt": int(qty)})
        return judge_order(st, body)


def judge_order(st, body) -> dict:
    """접수 판정 — HTTP 200 만으로 성공이라 하지 않는다.
    rsp_cd "0001" 이고 warn_cls_code "0" 일 때만 접수. 경고는 사람이 확인해야 하므로 자동 재전송하지 않는다."""
    if not isinstance(body, dict):
        return {"ok": False, "why": f"응답 형식 오류 (HTTP {st})"}
    code = str(body.get("rsp_cd") or "")
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    if st != 200 or code != "0001":
        return {"ok": False, "why": f"{code} {body.get('rsp_msg', '')} {body.get('rsp_sub_msg', '')}".strip()}
    warn = str(data.get("warn_cls_code", body.get("warn_cls_code", "0")) or "0").strip()
    if warn != "0":
        return {"ok": False, "why": f"접수 보류(warn_cls_code={warn}) {data.get('warn_msg', '')} — MTS에서 직접 확인하세요".strip()}
    return {"ok": True, "oder_no": data.get("oder_no")}


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
        page.goto(page_url + ("&" if "?" in page_url else "?") + "bot=" + str(int(time.time())), wait_until="load", timeout=60000)
        # 기록·설정 동기화 완료 대기
        page.wait_for_function("() => typeof syncMeta==='function' && syncMeta().last>0 && !__syncBusy", timeout=60000)
        err = page.evaluate("() => __syncErr || ''")
        if err:
            raise RuntimeError("앱 동기화 실패: " + err)
        t0 = page.evaluate("() => Date.now()")
        page.click("#fetchBtn")
        page.wait_for_function(f"() => lastLocOrder && Date.parse(lastLocOrder.generated_at) >= {t0}", timeout=120000)
        # 자동 체결 기록(어제 LOC 체결분) 저장·동기화가 끝날 때까지 — 끝나면 계획이 다시 계산된다
        page.wait_for_timeout(2500)
        page.wait_for_function("() => !__syncBusy && !syncMeta().dirty", timeout=60000)
        page.wait_for_timeout(800)
        plan = page.evaluate("() => JSON.parse(JSON.stringify(lastLocOrder))")
        banner = page.evaluate("() => { const e=document.getElementById('errorBanner'); return e? e.textContent.trim().slice(0,200):''; }")
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
    age = (now_utc - gen).total_seconds() / 60
    if not (-2 <= age <= 30):
        c.fail(f"V1 계획이 {age:.0f}분 전 것입니다")
    if plan.get("basis_close_date") != expect_basis:
        c.fail(f"V1 기준 종가일 {plan.get('basis_close_date')} ≠ 직전 거래일 {expect_basis} (시세 미갱신)")
    else:
        c.ok(f"V1 계획 최신 · 기준 종가일 {expect_basis}")
    b = plan.get("bot") or {}
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
        # V7 1건 한도는 매수에만 — 매도는 전량 매도라 수량이 실제 보유(V4·V6)로 묶여 있다
        if o["side"] == "buy" and price * qty > float(cfg.get("max_order_usd") or 20000):
            c.fail(f"V7 매수 ${price * qty:,.0f} > 1건 한도 ${cfg.get('max_order_usd'):,}", "buy")
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


def verify_account(api: Meritz, plan: dict, sym: str, expect_basis: str, c: Checks) -> str:
    """V3 독립 시세 · V4 실제 잔고 · V5 주문가능금액 · V6 매도가능수량. 거래소 코드를 돌려준다."""
    hold_rows = [r for r in api.holdings() if str(r.get("ovrs_stck_symb_iscd", "")).upper() == sym]
    real_qty = sum(num(r.get("rmnd_dqty")) for r in hold_rows)
    sellable = sum(num(r.get("seln_able_dqty")) for r in hold_rows)
    real_avg = num(hold_rows[0].get("avrg_unpr")) if hold_rows else 0.0
    exch = str(hold_rows[0].get("ovrs_exch_vndr_idno")) if hold_rows else ""
    plan_qty = int(plan.get("holding_qty") or 0)
    if abs(real_qty - plan_qty) > 1e-6:
        c.fail(f"V4 실제 보유 {real_qty:g}주 ≠ 앱 기록 {plan_qty}주 → 기록을 맞춘 뒤 다시 실행")
    else:
        c.ok(f"V4 실제 보유 {real_qty:g}주 = 앱 기록")
        avg = (plan.get("bot") or {}).get("avg_exact")
        if avg and real_avg and abs(real_avg / float(avg) - 1) > 0.02:
            c.warn(f"V4 평단 차이: 계좌 {real_avg:.4f} vs 앱 {float(avg):.4f} (수수료·환산 차이일 수 있음)")

    # 거래소 코드 + 독립 시세(메리츠 일봉) — 앱(Twelve Data)과 다른 출처로 전일 종가 대조
    last_close = float((plan.get("bot") or {}).get("last_close") or 0)
    ymd = expect_basis.replace("-", "")
    cands = [exch] if exch else EXCH_GUESS.get(sym, ["0537", "0066", "0321"])
    closes = {}
    for ex in cands:
        try:
            closes = api.daily_closes(sym, EXCH_TO_MKT.get(ex, "OQ"))
        except MeritzError as e:
            log(f"  일봉 조회 실패({ex}): {e}")
            closes = {}
        if closes:
            exch = ex
            break
    if not exch:
        exch = EXCH_GUESS.get(sym, ["0537"])[0]
    mc = closes.get(ymd)
    if mc and last_close:
        diff = abs(mc / last_close - 1) * 100
        if diff > 0.3:
            c.fail(f"V3 전일 종가 불일치: 메리츠 {fp(mc)} vs 앱 {fp(last_close)} ({diff:.2f}%)")
        else:
            c.ok(f"V3 전일 종가 대조 일치: 메리츠 {fp(mc)} · 앱 {fp(last_close)}")
    else:
        c.warn("V3 메리츠 일봉에서 전일 종가를 찾지 못해 대조 생략")

    for o in plan.get("orders") or []:
        amt = float(o["price"]) * int(o["qty"])
        if o["side"] == "buy":
            try:
                cash = api.usd_orderable()
            except MeritzError as e:
                cash = None
                c.warn(f"V5 주문가능금액 조회 실패: {e}")
            if cash is not None:
                if cash + 1e-6 < amt:
                    c.fail(f"V5 주문가능 ${cash:,.2f} < 매수 ${amt:,.2f}", "buy")
                else:
                    c.ok(f"V5 주문가능 ${cash:,.2f} ≥ 매수 ${amt:,.2f}")
        else:
            if int(o["qty"]) > sellable + 1e-6:
                c.fail(f"V6 매도가능 {sellable:g}주 < 매도 {o['qty']}주", "sell")
            else:
                c.ok(f"V6 매도가능 {sellable:g}주 ≥ 매도 {o['qty']}주")
    return exch


def live_rows(rows, sym, side):
    code = "2" if side == "buy" else "1"
    return [r for r in rows if str(r.get("ovrs_stck_symb_iscd", "")).upper() == sym
            and str(r.get("seln_byov_clcd")) == code and str(r.get("oder_rctf_cncl_cls_code", "0")) == "0"
            and str(r.get("ovrs_stck_oder_stat_cls_code", "0")) == "0"
            and num(r.get("odqt")) - num(r.get("cncl_cnfr_qty")) > 0]


def same_order(r, o) -> bool:
    return (str(r.get("aspr_type_code")) == "5" and abs(num(r.get("ovrs_stck_oder_prc")) - float(o["price"])) < 0.005
            and abs(num(r.get("odqt")) - int(o["qty"])) < 1e-6)


# ───────────────────────────────────────────── 실행
def run() -> int:
    t_start = time.time()
    now_utc = dt.datetime.now(dt.timezone.utc)
    now_et = now_utc.astimezone(ET)
    today = now_et.date()
    trigger = os.environ.get("RUN_TRIGGER", "schedule")
    force_mode = (os.environ.get("RUN_MODE") or "config").strip()
    gist = Gist(os.environ["MUHAN_TOKEN"], os.environ["GIST_ID"])
    files = gist.files()
    try:
        cfg = {**DEFAULT_CONFIG, **json.loads(files.get(CONFIG_FILE) or "{}")}
    except ValueError:
        cfg = dict(DEFAULT_CONFIG)
    mode = cfg.get("mode", "dry")
    if force_mode == "dry":
        mode = "dry"        # [지금 리허설]은 모드(끄기·실전)와 상관없이 언제나 리허설 — 주문은 절대 내지 않는다
    try:
        prev = json.loads(files.get(STATUS_FILE) or "{}")
    except ValueError:
        prev = {}
    status = {"schema": "muhan-bot-status/1", "version": VERSION, "run_at": dt.datetime.now(KST).isoformat(timespec="seconds"),
              "et_date": today.isoformat(), "mode": mode, "trigger": trigger, "results": {}, "overall": "ok"}
    log(f"{VERSION} · 모드 {mode} · ET {now_et:%Y-%m-%d %H:%M} · {trigger}")

    def finish(overall, note=""):
        status["overall"], status["note"] = overall, note
        status["elapsed_sec"] = round(time.time() - t_start)
        hist = (prev.get("history") or [])[-59:]
        hist.append({"at": status["run_at"], "mode": mode, "overall": overall,
                     "r": {s: v.get("summary", "") for s, v in status["results"].items()}, "note": note})
        status["history"] = hist
        gist.write(STATUS_FILE, status)
        summary_md(status)
        notify(status)
        return 2 if overall in ("blocked", "error") else 0

    if mode == "off":
        return finish("off", "자동주문 꺼짐 (앱 🤖 카드에서 켤 수 있습니다)")
    if not is_trading_day(today):
        return finish("closed", f"미국 휴장일 {today}")
    close_hm = (12, 40) if today.isoformat() in NYSE_EARLY_CLOSE else (15, 40)
    in_window = (9, 31) <= (now_et.hour, now_et.minute) <= close_hm
    if mode == "live" and not in_window:
        return finish("skipped", f"주문 시간대(ET 09:31~{close_hm[0]}:{close_hm[1]:02d}) 밖 — ET {now_et:%H:%M}")
    expect_basis = prev_trading_day(today).isoformat()

    api = Meritz(os.environ.get("MERITZ_APP_KEY", ""), os.environ.get("MERITZ_APP_SECRET", ""))
    try:
        api.token()
        log("메리츠 토큰 발급 OK")
    except MeritzError as e:
        return finish("error", str(e))

    app_base = (cfg.get("app_base") or os.environ.get("APP_BASE") or "").rstrip("/") + "/"
    any_block = False
    for sym, on in (cfg.get("symbols") or {}).items():
        sym = sym.upper()
        if not on or sym not in APP_PAGES:
            continue
        res = {"state": "", "summary": "", "orders": [], "checks": []}
        status["results"][sym] = res
        c = Checks()
        log(f"── {sym}")
        try:
            plan = plan_from_app(app_base + APP_PAGES[sym], os.environ["MUHAN_TOKEN"], os.environ["GIST_ID"])
        except Exception as e:  # noqa: BLE001
            res.update(state="error", summary=f"앱 실행 실패: {str(e)[:160]}")
            any_block = True
            continue
        res["plan"] = {k: plan.get(k) for k in ("basis_close_date", "stage", "avg_price", "holding_qty", "orders", "version")}
        orders = plan.get("orders") or []
        verify_plan(plan, sym, expect_basis, cfg, now_utc, c)
        try:
            exch = verify_account(api, plan, sym, expect_basis, c)
        except MeritzError as e:
            c.fail(f"계좌 조회 실패: {e}")
            exch = EXCH_GUESS.get(sym, ["0537"])[0]
        res["exchange"] = exch
        try:
            today_rows = api.orders_today()
        except MeritzError as e:
            today_rows = []
            c.fail(f"V8 당일 주문내역 조회 실패: {e}")
        res["checks"] = c.items
        if not orders:
            res.update(state="none", summary=f"주문 없음 · {plan.get('stage', '')}")
            if c.block_buy or c.block_sell:
                res["state"], any_block = "blocked", True
                res["summary"] += " · ⚠ " + (c.block_buy + c.block_sell)[0]
            continue

        for o in orders:
            side, kr = o["side"], ("매수" if o["side"] == "buy" else "매도")
            item = {"side": side, "price": o["price"], "qty": o["qty"], "state": "", "why": ""}
            res["orders"].append(item)
            blocks = c.block_buy if side == "buy" else c.block_sell
            # V8 중복 방지: 같은 종목·매매 LOC 가 이미 살아 있으면 다시 내지 않는다
            existing = live_rows(today_rows, sym, side)
            if blocks:
                item.update(state="blocked", why=blocks[0])
                any_block = True
                continue
            if existing:
                if any(same_order(r, o) for r in existing):
                    item.update(state="exists", why=f"이미 접수됨 (주문번호 {existing[0].get('oder_no')})")
                else:
                    item.update(state="blocked", why="같은 종목에 다른 주문이 이미 있습니다 — MTS에서 확인")
                    any_block = True
                continue
            if mode != "live":
                item.update(state="dry", why="리허설 — 검수 통과, 주문은 내지 않음")
                continue
            r = api.place_loc(side, sym, exch, float(o["price"]), int(o["qty"]))
            if not r["ok"]:
                item.update(state="rejected", why=r["why"])
                any_block = True
                continue
            item["oder_no"] = r.get("oder_no")
            # ④ 접수 대조 — 다시 읽어 확인, 다르면 취소
            time.sleep(1.5)
            try:
                rows = [x for x in api.orders_today() if str(x.get("oder_no")) == str(r.get("oder_no"))]
            except MeritzError as e:
                rows = []
                item["why"] = f"대조 조회 실패: {e}"
            if rows and same_order(rows[0], o) and str(rows[0].get("ovrs_stck_symb_iscd", "")).upper() == sym:
                item.update(state="placed", why=f"접수 · 대조 일치 (주문번호 {r.get('oder_no')})")
            elif rows:
                cx = api.cancel(str(rows[0].get("oder_date") or today.strftime("%Y%m%d")), r.get("oder_no"), int(num(rows[0].get("odqt"))))
                item.update(state="cancelled", why=f"접수 내용 불일치 → 즉시 취소 {'성공' if cx['ok'] else '실패: ' + cx['why']}")
                any_block = True
            else:
                item.update(state="placed?", why=f"접수됨(주문번호 {r.get('oder_no')}) · 내역에서 아직 안 보임 — MTS 확인")
                any_block = True
            log(f"  {kr} {o['price']} × {o['qty']} → {item['state']} {item['why']}")

        icon = {"placed": "✅", "exists": "☑", "dry": "◎", "blocked": "⛔", "rejected": "✖", "cancelled": "↩", "placed?": "❔"}
        res["summary"] = " · ".join(f"{icon.get(i['state'], '')} {'매수' if i['side'] == 'buy' else '매도'} {i['price']:.2f}×{i['qty']}" for i in res["orders"])
        res["state"] = "blocked" if any(i["state"] in ("blocked", "rejected", "cancelled", "placed?") for i in res["orders"]) else \
            ("dry" if mode != "live" else "done")

    overall = "blocked" if any_block else ("dry" if mode != "live" else "done")
    return finish(overall)


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


def notify(st):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        return
    title = {"done": "✅ 자동주문 접수", "dry": "◎ 리허설 완료", "blocked": "⛔ 자동주문 확인 필요", "error": "✖ 자동주문 오류",
             "closed": "휴장", "off": "자동주문 꺼짐", "skipped": "주문 시간 밖"}.get(st["overall"], st["overall"])
    body = "\n".join(f"{s}: {r.get('summary', '')}" for s, r in st["results"].items()) or st.get("note", "")
    try:   # ntfy JSON 발행 — 한글 제목 그대로
        http("POST", "https://ntfy.sh/", body={"topic": topic, "title": title, "message": body[:900],
                                               "priority": 4 if st["overall"] in ("blocked", "error") else 3}, timeout=10)
    except Exception as e:  # noqa: BLE001
        log(f"알림 실패: {e}")


if __name__ == "__main__":
    try:
        sys.exit(run())
    except Exception as e:  # noqa: BLE001
        log(f"✖ 오류: {e}")
        sys.exit(9)
