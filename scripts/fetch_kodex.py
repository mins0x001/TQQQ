"""KODEX 반도체레버리지(494310) · KODEX 반도체(091160) 시세 수집기 V1.0 (2026-10-08)
GitHub Actions에서 실행 → data/kodex.json 저장. 표준 라이브러리만 사용.
1순위 네이버 금융 일봉(fchart) + 현재가(polling), 실패하면 Yahoo Finance(.KS)."""
import json, os, re, sys, urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Referer": "https://finance.naver.com/"}
SERIES = {"lev": ("494310", "KODEX 반도체레버리지"), "base": ("091160", "KODEX 반도체")}
COUNT = 520            # 약 2년치 일봉
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "kodex.json")


def get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_naver_fchart(text):
    """<item data="20261008|24000|24500|23800|24300|1234567" /> → [[YYYY-MM-DD, o, h, l, c], ...]"""
    rows = re.findall(r'data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|(\d*)"', text)
    out = []
    for d, o, h, l, c, _v in rows:
        c = float(c)
        if c <= 0:
            continue
        out.append([f"{d[:4]}-{d[4:6]}-{d[6:]}", float(o) or c, float(h) or c, float(l) or c, c])
    return out


def naver_daily(code):
    raw = get(f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count={COUNT}&requestType=0")
    return parse_naver_fchart(raw.decode("euc-kr", "ignore"))


def naver_quote(code):
    j = json.loads(get(f"https://polling.finance.naver.com/api/realtime/domestic/stock/{code}").decode("utf-8", "ignore"))
    d = (j.get("datas") or [{}])[0]
    price = float(str(d.get("closePrice", "0")).replace(",", "") or 0)
    return {"price": price, "at": d.get("localTradedAt", ""), "status": d.get("marketStatus", "")} if price > 0 else None


def yahoo_daily(code):
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.KS?range=3y&interval=1d").decode("utf-8"))
    res = j["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    out = []
    for i, ts in enumerate(res.get("timestamp") or []):
        c = q["close"][i]
        if c is None:
            continue
        d = datetime.fromtimestamp(ts, KST).strftime("%Y-%m-%d")
        o, h, l = q["open"][i] or c, q["high"][i] or c, q["low"][i] or c
        out.append([d, round(o), round(h), round(l), round(c)])
    return out[-COUNT:]


def fetch_series(code):
    errors = []
    for name, fn in (("naver", naver_daily), ("yahoo", yahoo_daily)):
        try:
            bars = fn(code)
            if len(bars) >= 60:
                # 날짜 중복 제거 · 오름차순
                uniq = {b[0]: b for b in bars}
                return name, [uniq[k] for k in sorted(uniq)]
            errors.append(f"{name}: {len(bars)}봉")
        except Exception as e:  # noqa: BLE001
            errors.append(f"{name}: {e}")
    raise RuntimeError(f"{code} 일봉 수집 실패 — " + " / ".join(errors))


def main():
    now = datetime.now(KST)
    out = {"schema": "kodex-data/1", "updated": now.isoformat(timespec="seconds"),
           "updated_kst": now.strftime("%Y-%m-%d %H:%M"), "tick_rule": "ETF: <2000원 1원, >=2000원 5원"}
    for key, (code, name) in SERIES.items():
        src, bars = fetch_series(code)
        quote = None
        try:
            quote = naver_quote(code)
        except Exception as e:  # noqa: BLE001
            print(f"현재가 실패({code}): {e}")
        out[key] = {"code": code, "name": name, "source": src, "bars": bars, "quote": quote}
        print(f"{name}({code}) {src} {len(bars)}봉 · 마지막 {bars[-1][0]} 종가 {bars[-1][4]:,.0f}원 · 현재가 {quote['price'] if quote else '-'}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("저장:", os.path.normpath(OUT))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print("수집 실패 — 기존 data/kodex.json 유지:", e)
        sys.exit(1)
