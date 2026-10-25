#!/usr/bin/env python3
"""1회용: soxl.html · tqqq.html · qldm.html (90%+ 동일) → src/mu/template.html + config.json + slots.json
 · 3개 파일을 줄 단위로 정렬 → 다른 구간만 '슬롯'으로 분리
 · 슬롯 중 종목 이름 치환(SOXL→TQQQ 등)만으로 설명되는 것은 토큰(⟦LEV⟧…)으로 자동 흡수
 · 결과로 다시 빌드하면 원본 3개와 바이트까지 같아야 함 (tools/build_mu.py 가 검증)"""
import difflib, json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ["soxl", "tqqq", "qldm"]
SRC = {n: open(f"{ROOT}/{n}.html", encoding="utf-8", newline="").read().splitlines(keepends=True) for n in NAMES}
import re as _re
def _ver(n):   # 파일에서 실제 버전·날짜를 읽어 토큰 값으로 (빌드 후에도 같은 값이 나오도록)
    t = open(f"{ROOT}/{n}.html", encoding="utf-8").read(); m = _re.search(r'APP_VERSION = "(V\d+\.\d+)", RELEASE_DATE = "(\d{6})"', t); return m.group(1), m.group(2)
CFG = {"soxl": {"LEV": "SOXL", "lev": "soxl", "Lev": "Soxl", "BASE": "SOXX", "base": "soxx", "Base": "Soxx", "API": "soxl"},
       "tqqq": {"LEV": "TQQQ", "lev": "tqqq", "Lev": "Tqqq", "BASE": "QQQ", "base": "qqq", "Base": "Qqq", "API": "tqqq"},
       "qldm": {"LEV": "QLD", "lev": "qldm", "Lev": "Tqqq", "BASE": "QQQ", "base": "qqq", "Base": "Qqq", "API": "qm"}}
for _n in NAMES:
    _v, _d = _ver(_n); CFG[_n].update({"VER": _v, "VERU": _v.replace(".", "_"), "DATE": _d})
TOK = {k: f"⟦{k}⟧" for k in CFG["soxl"]}
base = SRC["soxl"]
ops = {n: difflib.SequenceMatcher(None, base, SRC[n], autojunk=False).get_opcodes() for n in NAMES[1:]}
iv = sorted((i1, i2) for n in NAMES[1:] for t, i1, i2, j1, j2 in ops[n] if t != "equal")
merged = []
for a, b in iv:
    if merged and a <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], b)
    else: merged.append([a, b])
def mp(n, q, end=False):
    ne = [o for o in ops[n] if o[0] != "equal"]
    if end:
        c = [o for o in ne if o[2] == q]
        if c: return c[-1][4]
    else:
        c = [o for o in ne if o[1] == q]
        if c: return c[0][3]
    for t, i1, i2, j1, j2 in ops[n]:
        if t == "equal" and i1 <= q <= i2: return j1 + (q - i1)
    raise SystemExit(f"map fail {n} {q}")
def fwd(text, n):   # 토큰 → 종목 이름
    for k, v in CFG[n].items(): text = text.replace(TOK[k], v)
    return text
def rev(text):      # soxl 이름 → 토큰 (긴 것부터)
    for k in ["VERU", "VER", "DATE", "Lev", "Base", "LEV", "BASE", "lev", "base"]: text = text.replace(CFG["soxl"][k], TOK[k])
    return text
out, slots, pos, auto, resid = [], {}, 0, 0, 0
for a, b in merged:
    out.append("".join(base[pos:a]))
    var = {"soxl": "".join(base[a:b])}
    for n in NAMES[1:]: var[n] = "".join(SRC[n][mp(n, a):mp(n, b, True)])
    cand = rev(var["soxl"])
    if all(fwd(cand, n) == var[n] for n in NAMES) and not any(t in var["soxl"] for t in TOK.values()):
        out.append(cand); auto += 1
    else:
        sid = f"s{len(slots):03d}"; slots[sid] = {"line": a + 1, **var}; out.append(f"⟦@{sid}⟧"); resid += 1
    pos = b
out.append("".join(base[pos:]))
os.makedirs(f"{ROOT}/src/mu", exist_ok=True)
open(f"{ROOT}/src/mu/template.html", "w", encoding="utf-8", newline="").write("".join(out))
json.dump(CFG, open(f"{ROOT}/src/mu/config.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(slots, open(f"{ROOT}/src/mu/slots.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"구간 {len(merged)}개 → 이름 치환으로 자동 흡수 {auto}개 · 남은 슬롯 {resid}개")
