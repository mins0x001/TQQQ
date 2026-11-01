#!/usr/bin/env python3
"""src/mu/{template.html,config.json,slots.json} → soxl.html · tqqq.html · qldm.html 생성
 사용: python3 tools/build_mu.py [--check]   (--check: 현재 파일과 바이트 비교만)"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(f"{ROOT}/{p}", encoding="utf-8", newline="").read()
T, CFG, SL = rd("src/mu/template.html"), json.loads(rd("src/mu/config.json")), json.loads(rd("src/mu/slots.json"))
def load_fns():   # src/calc/*.js : '//@@fn 이름' 으로 시작하는 함수 조각 → {모듈:이름: 본문}
    fns = {}
    for f in sorted(os.listdir(f"{ROOT}/src/calc")) + sorted("../lib/" + x for x in os.listdir(f"{ROOT}/src/lib")):
        if not f.endswith(".js"): continue
        mod = "lib" if f.startswith("../lib/") else f[:-3]
        for m in re.finditer(r"^//@@fn (\w+)\n(.*?)\n(?=//@@fn |\Z)", rd(f"src/calc/{f}") + "\n", re.S | re.M): fns[f"{mod}:{m.group(1)}"] = m.group(2).rstrip("\n")
    return fns
FNS = load_fns()
def inc(m):
    k = m.group(1)
    if k not in FNS: raise SystemExit(f"include 없음: {k}")
    return FNS[k]
T = re.sub(r"^//@@include-file (\S+)$", lambda m: rd(m.group(1))[:-1], T, flags=re.M)
T = re.sub(r"^//@@include ([\w:]+)$", inc, T, flags=re.M)
bad = 0; BUILT = {}
for n, c in CFG.items():
    s = re.sub(r"⟦@(s\d+)⟧", lambda m: SL[m.group(1)][n], T)
    for k, v in c.items(): s = s.replace(f"⟦{k}⟧", v)
    BUILT[n] = s
    if "--check" in sys.argv:
        same = rd(f"{n}.html") == s; bad += not same; print(("OK  " if same else "DIFF"), n)
    else:
        open(f"{ROOT}/{n}.html", "w", encoding="utf-8", newline="").write(s); print("built", n, len(s))
# qld.html (QLD평생): 템플릿 + 모듈 포함만 (앱별 토큰 없음)
Q = rd("src/qld/template.html")
Q = re.sub(r"^//@@include-file (\S+)$", lambda m: rd(m.group(1))[:-1], Q, flags=re.M)
Q = re.sub(r"^//@@include ([\w:]+)$", inc, Q, flags=re.M)
Q0 = Q; Q = Q0.replace("  /*@usd-mic*/\n", "")   # USD 전용 줄은 usd 빌드에서만 채움
if "--check" in sys.argv:
    same = rd("qld.html") == Q; bad += not same; print(("OK  " if same else "DIFF"), "qld")
else:
    open(f"{ROOT}/qld.html", "w", encoding="utf-8", newline="").write(Q); print("built qld", len(Q))
# usd.html (USD평생 · ProShares Ultra Semiconductors): QLD평생 소스를 그대로 치환해 생성 (QLD→USD · 기준지수 QQQ→SOXX · 저장 키·파일명 모두 USD 전용)
UC = json.loads(rd("src/usd/config.json"))
m = re.search(r'APP_VERSION = "(V[\d.]+)", RELEASE_DATE = "(\d+)"', Q0); qv, qd = m.group(1), m.group(2)
U = Q0
for a, b in ((f"{qv}-{qd}", f"{UC['VER']}-{UC['DATE']}"), (f"({qv} - {qd})", f"({UC['VER']} - {UC['DATE']})"), (f"_{qv.replace('.', '_')}_{qd}.", f"_{UC['VER'].replace('.', '_')}_{UC['DATE']}."),
             (f"{qv} ({qd})", f"{UC['VER']} ({UC['DATE']})"), (f'APP_VERSION = "{qv}", RELEASE_DATE = "{qd}"', f'APP_VERSION = "{UC["VER"]}", RELEASE_DATE = "{UC["DATE"]}"'), (f'content="{qd}"', f'content="{UC["DATE"]}"')):
    assert a in U, a; U = U.replace(a, b)
keep = {"TQQQ": "\x01A", "tqqq": "\x01B", "QLDM": "\x01C", "qldm": "\x01D"}     # 다른 앱 이름은 건드리지 않음
for k, v in keep.items(): U = U.replace(k, v)
for a, b in (("QLD", "USD"), ("Qld", "Usd"), ("qld", "usd"), ("QQQ", "SOXX"), ("Qqq", "Soxx"), ("qqq", "soxx")): U = U.replace(a, b)
for k, v in keep.items(): U = U.replace(v, k)
U = U.replace("/*@usd-mic*/", 'if (symbol === "USD") url.searchParams.set("mic_code", "ARCX");   // USD = 통화와 겹치는 이름 → NYSE Arca ETF')
assert "SIG_BASE = 2.5" in U; U = U.replace("SIG_BASE = 2.5", "SIG_BASE = 3.5")   # σ 기준: QLD 2.5(장기 σ 2.78%의 0.9배) → USD 장기 σ 3.9%(SOXL×2/3 환산 2010~)의 0.9배
U = U.replace("USD(2배)", "USD(반도체 2배)")
if "--check" in sys.argv:
    same = rd("usd.html") == U; bad += not same; print(("OK  " if same else "DIFF"), "usd")
else:
    open(f"{ROOT}/usd.html", "w", encoding="utf-8", newline="").write(U); print("built usd", len(U))
# usdm.html (USD무한매수): 빌드된 qldm.html 을 같은 방식으로 치환 (QLD→USD · QQQ→SOXX · 저장 키·파일명 USD 전용)
UM = json.loads(rd("src/usd/config_m.json")); X = BUILT["qldm"]
m = re.search(r'APP_VERSION = "(V[\d.]+)", RELEASE_DATE = "(\d+)"', X); qv, qd = m.group(1), m.group(2)
for a, b in ((f"{qv}-{qd}", f"{UM['VER']}-{UM['DATE']}"), (f"({qv} - {qd})", f"({UM['VER']} - {UM['DATE']})"), (f"_{qv.replace('.', '_')}_{qd}.", f"_{UM['VER'].replace('.', '_')}_{UM['DATE']}."),
             (f"{qv} ({qd})", f"{UM['VER']} ({UM['DATE']})"), (f'APP_VERSION = "{qv}", RELEASE_DATE = "{qd}"', f'APP_VERSION = "{UM["VER"]}", RELEASE_DATE = "{UM["DATE"]}"'), (f'content="{qd}"', f'content="{UM["DATE"]}"')):
    assert a in X, a; X = X.replace(a, b)
keep = {"TQQQ": "\x01A", "tqqq": "\x01B", "Tqqq": "\x01C"}
for k, v in keep.items(): X = X.replace(k, v)
for a, b in (("QLD", "USD"), ("Qld", "Usd"), ("qld", "usd"), ("QQQ", "SOXX"), ("Qqq", "Soxx"), ("qqq", "soxx")): X = X.replace(a, b)
for k, v in keep.items(): X = X.replace(v, k)
X = X.replace("USD 변동성 최적화판", "QLD무한 구조 · USD(반도체 2배) 적용판")
# USD 변동성 보정: 실제 USD 2007~ 롤링 200봉 백테스트(120구간) — 일간σ 중앙값 3.57%(10%분위 2.3 · 90%분위 5.8) = TQQQ 평상시(3.6%)와 같음 → 기준σ·기본 파라미터를 TQQQ판 값으로
for a0, b0 in (("const REF_SIGMA = 2.4;", "const REF_SIGMA = 4.2;"), ("= USD 평상시 변동성", "= USD 평상시 변동성 (2007~ 롤링 200봉 σ 중앙값 3.57% · 최근 5년 4.90%의 중간)"),
               ("USD 일간σ는 통상 2.2~2.7%로, 이 파일의 기준값(REF_SIGMA 2.4%)이 곧", "USD 일간σ는 2007~ 롤링 200봉 중앙값 3.6%·최근 5년 중앙값 4.9%이고, 이 파일의 기준값(REF_SIGMA 4.2%, 둘의 중간)이 곧"),
               ("k = σ ÷ 2.4 만큼", "k = σ ÷ 4.2 만큼"), ("일간σ 약 2.4%에 맞춰져", "일간σ 약 4.2%에 맞춰져"),
               ("예시: USD σ가 2.9%라면 k = 2.9 ÷ 2.4 ≈ 1.21", "예시: USD σ가 5.0%라면 k = 5.0 ÷ 4.2 ≈ 1.19")):
    assert a0 in X, a0; X = X.replace(a0, b0)
a = '  url.searchParams.set("apikey", TWELVE_DATA_API_KEY);\n'; assert X.count(a) == 1
X = X.replace(a, a + '  if (symbol === "USD") url.searchParams.set("mic_code", "ARCX");   // USD = 통화와 겹치는 이름 → NYSE Arca ETF\n')
if "--check" in sys.argv:
    same = rd("usdm.html") == X; bad += not same; print(("OK  " if same else "DIFF"), "usdm")
else:
    open(f"{ROOT}/usdm.html", "w", encoding="utf-8", newline="").write(X); print("built usdm", len(X))
sys.exit(1 if bad else 0)
