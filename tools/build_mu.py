#!/usr/bin/env python3
"""src/mu/{template.html,config.json,slots.json} → soxl.html · tqqq.html · qldm.html 생성
 사용: python3 tools/build_mu.py [--check]   (--check: 현재 파일과 바이트 비교만)"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(f"{ROOT}/{p}", encoding="utf-8", newline="").read()
T, CFG, SL = rd("src/mu/template.html"), json.loads(rd("src/mu/config.json")), json.loads(rd("src/mu/slots.json"))
def load_fns():   # src/calc/*.js : '//@@fn 이름' 으로 시작하는 함수 조각 → {모듈:이름: 본문}
    fns = {}
    for f in sorted(os.listdir(f"{ROOT}/src/calc")):
        if not f.endswith(".js"): continue
        mod = f[:-3]
        for m in re.finditer(r"^//@@fn (\w+)\n(.*?)\n(?=//@@fn |\Z)", rd(f"src/calc/{f}") + "\n", re.S | re.M): fns[f"{mod}:{m.group(1)}"] = m.group(2).rstrip("\n")
    return fns
FNS = load_fns()
def inc(m):
    k = m.group(1)
    if k not in FNS: raise SystemExit(f"include 없음: {k}")
    return FNS[k]
T = re.sub(r"^//@@include-file (\S+)$", lambda m: rd(m.group(1))[:-1], T, flags=re.M)
T = re.sub(r"^//@@include ([\w:]+)$", inc, T, flags=re.M)
bad = 0
for n, c in CFG.items():
    s = re.sub(r"⟦@(s\d+)⟧", lambda m: SL[m.group(1)][n], T)
    for k, v in c.items(): s = s.replace(f"⟦{k}⟧", v)
    if "--check" in sys.argv:
        same = rd(f"{n}.html") == s; bad += not same; print(("OK  " if same else "DIFF"), n)
    else:
        open(f"{ROOT}/{n}.html", "w", encoding="utf-8", newline="").write(s); print("built", n, len(s))
# qld.html (QLD평생): 템플릿 + 모듈 포함만 (앱별 토큰 없음)
Q = rd("src/qld/template.html")
Q = re.sub(r"^//@@include-file (\S+)$", lambda m: rd(m.group(1))[:-1], Q, flags=re.M)
Q = re.sub(r"^//@@include ([\w:]+)$", inc, Q, flags=re.M)
if "--check" in sys.argv:
    same = rd("qld.html") == Q; bad += not same; print(("OK  " if same else "DIFF"), "qld")
else:
    open(f"{ROOT}/qld.html", "w", encoding="utf-8", newline="").write(Q); print("built qld", len(Q))
sys.exit(1 if bad else 0)
