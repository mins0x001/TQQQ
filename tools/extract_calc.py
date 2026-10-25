#!/usr/bin/env python3
"""1회용: src/mu/template.html 의 순수 계산 함수를 src/calc/*.js 로 옮기고 그 자리에 //@@include 표시만 남김
 · 함수 본문은 한 글자도 바꾸지 않음 → build_mu.py 가 표시를 원문으로 되돌리므로 결과 HTML 은 바이트까지 동일"""
import re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODS = {
 "time":    ["nyNowParts", "lastNyClose", "dropIncompleteBar", "nextTradingDay"],
 "stats":   ["calcDailyReturns", "calcStdev", "trimmedMeanExcludingMinMax", "probAtLeast"],
 "streak":  ["findDownStreaks", "computeStreakStatsForLength", "computeStreakStats", "computeDayChangeCounts", "findUpStreaks",
             "computeUpStreakStatsForLength", "computeUpStreakStats", "computeUpDayChangeCounts", "computeStreakDetailStats",
             "computeUpStreakDetailStats", "computeStreakContinuationProb", "calculateStreakDetails", "summarizeByLength"],
 "strategy":["stagePlan", "paramsCore", "buildAiStrategy", "simulateSellTargets", "analyzeStopLossForRound", "analyzeSellStrategy",
             "getSellAnalysis", "simulateSeedBacktest", "simTrades"],
 "records": ["sortedBuyRecords", "findCloseOnDate", "resolveAutoPrice", "cyclesNamed", "tradeStats", "computeBuyRecordsSummary"],
 "format":  ["fmtCompactDate", "fmtShortDate", "fmtDateFull", "fmtPctSigned", "fmtPct1", "fmtUsd0Signed", "fmtUsdCompact", "fmtUsd0", "fmtKrDate", "fmtResume"],
}
HEAD = {"time": "시간·거래일 (뉴욕 장 기준)", "stats": "기초 통계", "streak": "연속 상승·하락 통계", "strategy": "AI 전략·익절/손절 분석·시드 분할매수 시뮬레이션",
        "records": "매수 기록·사이클 집계", "format": "표시용 포맷 (날짜·달러·퍼센트)"}
p = f"{ROOT}/src/mu/template.html"; L = open(p, encoding="utf-8", newline="").read().split("\n")
def span(name):
    s = [i for i, l in enumerate(L) if re.match(rf"^(async )?function {name}\(", l)]
    assert len(s) == 1, (name, s)
    i = s[0]; j = i
    while not (j > i and L[j].startswith("}")) and not (j == i and L[j].rstrip().endswith("}") and L[j].count("{") == L[j].count("}")): j += 1
    return i, j
spans = {n: span(n) for ns in MODS.values() for n in ns}
order = sorted(spans.items(), key=lambda kv: kv[1][0])
for (a, (i1, j1)), (b, (i2, j2)) in zip(order, order[1:]): assert j1 < i2, ("겹침", a, b)
os.makedirs(f"{ROOT}/src/calc", exist_ok=True)
for mod, names in MODS.items():
    out = [f"// src/calc/{mod}.js — {HEAD[mod]}\n// ⚠ 함수 하나하나는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include {mod}:이름 자리로 빌드 때 들어갑니다\n"]
    for n in names:
        i, j = spans[n]; out.append(f"//@@fn {n}\n" + "\n".join(L[i:j + 1]) + "\n")
    open(f"{ROOT}/src/calc/{mod}.js", "w", encoding="utf-8", newline="").write("\n".join(out))
for mod, names in MODS.items():
    for n in names:
        i, j = spans[n]; L[i] = f"//@@include {mod}:{n}"
        for k in range(i + 1, j + 1): L[k] = None
open(p, "w", encoding="utf-8", newline="").write("\n".join(l for l in L if l is not None))
print("옮긴 함수", len(spans), "개 →", ", ".join(f"{m}({len(n)})" for m, n in MODS.items()))
