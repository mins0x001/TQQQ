#!/usr/bin/env python3
"""src/mu/{template.html,config.json,slots.json} → soxl.html · tqqq.html · qldm.html 생성
 사용: python3 tools/build_mu.py [--check]   (--check: 현재 파일과 바이트 비교만)"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(f"{ROOT}/{p}", encoding="utf-8", newline="").read()
T, CFG, SL = rd("src/mu/template.html"), json.loads(rd("src/mu/config.json")), json.loads(rd("src/mu/slots.json"))
bad = 0
for n, c in CFG.items():
    s = re.sub(r"⟦@(s\d+)⟧", lambda m: SL[m.group(1)][n], T)
    for k, v in c.items(): s = s.replace(f"⟦{k}⟧", v)
    if "--check" in sys.argv:
        same = rd(f"{n}.html") == s; bad += not same; print(("OK  " if same else "DIFF"), n)
    else:
        open(f"{ROOT}/{n}.html", "w", encoding="utf-8", newline="").write(s); print("built", n, len(s))
sys.exit(1 if bad else 0)
