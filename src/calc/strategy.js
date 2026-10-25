// src/calc/strategy.js — AI 전략·익절/손절 분석·시드 분할매수 시뮬레이션
// ⚠ 함수 하나하나는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include strategy:이름 자리로 빌드 때 들어갑니다

//@@fn stagePlan
function stagePlan(seed, splits, recommendedN, mult) {
  const s = Math.max(1, Math.floor(splits) || 1), m = Math.max(1, Math.floor(mult) || 1);
  const n1 = Math.max(0, Math.min(Math.floor(recommendedN) || 0, s));
  return { splits: s, mult: m, n1, per1: seed / s, per2: seed / (s * m), maxRounds: n1 + (s - n1) * m };
}

//@@fn paramsCore
function paramsCore(pm) {
  const o = { mode: (pm && pm.mode) || "rule", seed: String((pm && pm.seed) || "") };
  if (o.mode === "manual") { o.splits = String(pm.splits || ""); o.mult = String(pm.mult || ""); }
  if (pm && parseFloat(pm.sellPct) > 0) o.sellPct = String(pm.sellPct);
⟦@s033⟧  return o;
}

//@@fn buildAiStrategy
function buildAiStrategy(hist) {
  const streaks = calculateStreakDetails(hist);
  if (streaks.length === 0) return null;
  const summary = summarizeByLength(streaks);
  const maxLen = Math.max(...streaks.map(s => s.length));

  const candidates = [];
  for (let N = 2; N <= maxLen; N++) {
    const g = summary.get(N);
    if (!g) continue;
    const recoveryProb = g.count > 0 ? g.recovered / g.count : 0;
    const avgReturn = g.returns.length > 0 ? g.returns.reduce((a, b) => a + b, 0) / g.returns.length : 0;
    candidates.push({ N, count: g.count, recovered: g.recovered, unrecovered: g.unrecovered, recoveryProb, avgReturn, expectedReturn: recoveryProb * avgReturn });
  }
  if (candidates.length === 0) return null;

  const qualified = candidates.filter(c => c.count >= 2);
  const pool = qualified.length > 0 ? qualified : candidates;
  const best = pool.reduce((a, b) => (b.expectedReturn > a.expectedReturn ? b : a));

  const length1Count = streaks.filter(s => s.length === 1).length;
  return {
    recommendedN: best.N,
    avgReturn: best.avgReturn,
    within1DayRatio: (length1Count / streaks.length) * 100,
    over2DaysRatio: probAtLeast(streaks, 2),
    recoveryProb: best.recoveryProb * 100,
    sampleCount: best.count, recovered: best.recovered, unrecovered: best.unrecovered,
    totalStreaks: streaks.length,
    usedFallbackPool: qualified.length === 0,
    candidates
  };
}

//@@fn simulateSellTargets
function simulateSellTargets(hist, streaks, minPct, maxPct, stepPct) {
  const targets = [];
  for (let p = minPct; p <= maxPct + 1e-9; p += stepPct) targets.push(Math.round(p * 100) / 100);

  return targets.map(p => {
    const returns = [], days = [], unresolvedStreaks = [];
    streaks.forEach(s => {
      const targetPrice = s.avgBuyPrice * (1 + p / 100);
      let hitIdx = -1;
      for (let m = s.endIdx + 1; m < hist.length; m++) {
        if (hist[m].y >= targetPrice) { hitIdx = m; break; }
      }
      if (hitIdx !== -1) {
        returns.push((hist[hitIdx].y - s.avgBuyPrice) / s.avgBuyPrice * 100);
        days.push(hitIdx - s.endIdx);
      } else {
        unresolvedStreaks.push(s);
      }
    });
    const total = streaks.length;
    const successCount = returns.length;
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    return {
      pct: p, total, successCount, unresolvedCount: unresolvedStreaks.length,
      successRate: total > 0 ? successCount / total * 100 : 0,
      avgReturn,
      avgDays: days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null,
      maxDays: days.length > 0 ? Math.max(...days) : null,
      expectedReturn: (successCount / total) * avgReturn,
      unresolvedStreaks
    };
  });
}

//@@fn analyzeStopLossForRound
function analyzeStopLossForRound(hist, streaksAll, sellTargetPct, N) {
  if (!N || N < 1) return null;
  let candidates = streaksAll.filter(s => s.length === N);
  let usedFallback = false;
  if (candidates.length < 2) {
    candidates = streaksAll.filter(s => s.length >= N);
    usedFallback = true;
  }
  if (candidates.length === 0) return null;

  const drawdowns = candidates.map(s => {
    const avgBuyPrice = N === s.length ? s.avgBuyPrice : hist.slice(s.startIdx, s.startIdx + N).reduce((a, d) => a + d.y, 0) / N;
    const targetPrice = avgBuyPrice * (1 + sellTargetPct / 100);
    let hitIdx = -1;
    for (let m = s.startIdx + N; m < hist.length; m++) {
      if (hist[m].y >= targetPrice) { hitIdx = m; break; }
    }
    const scanEnd = hitIdx !== -1 ? hitIdx : hist.length - 1;
    let minPrice = hist[Math.min(s.startIdx + N - 1, hist.length - 1)].y;
    for (let m = s.startIdx + N; m <= scanEnd; m++) {
      if (hist[m].y < minPrice) minPrice = hist[m].y;
    }
    return (minPrice - avgBuyPrice) / avgBuyPrice * 100;
  });

  return {
    N, sampleCount: candidates.length, usedFallback,
    avgDrawdown: drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length,
    worstDrawdown: Math.min(...drawdowns)
  };
}

//@@fn analyzeSellStrategy
function analyzeSellStrategy(hist) {
  const streaks = calculateStreakDetails(hist);
  if (streaks.length === 0) return null;

  const sweep = simulateSellTargets(hist, streaks, SELL_SWEEP_MIN, SELL_SWEEP_MAX, SELL_SWEEP_STEP);
  const best = sweep.reduce((a, b) => {
    if (b.expectedReturn > a.expectedReturn) return b;
    if (b.expectedReturn === a.expectedReturn && b.successRate > a.successRate) return b;
    return a;
  });

  const aiStrategy = buildAiStrategy(hist);
  const recommendedN = aiStrategy ? aiStrategy.recommendedN : null;
  const stopLossByRound = recommendedN ? analyzeStopLossForRound(hist, streaks, best.pct, recommendedN) : null;

  return { streaksTotal: streaks.length, sweep, best, recommendedN, stopLossByRound };
}

//@@fn getSellAnalysis
function getSellAnalysis(hist) {
  if (sellAnalysisCache.hist === hist && sellAnalysisCache.result) return sellAnalysisCache.result;
  const result = analyzeSellStrategy(hist);
  sellAnalysisCache = { hist, result };
  return result;
}

//@@fn simulateSeedBacktest
function simulateSeedBacktest(hist, seed, splits, requirePrevDown, mult, sellPctOverride, legacyCycle) {
  const a = getSellAnalysis(hist);
  if (!a || !a.recommendedN) return null;

  const legacy = typeof legacyCycle === "number" && legacyCycle >= 1;   // 비교용: V0.71 이전 규칙(2단계 = 주기 대기 · 같은 1분할)
⟦@s015⟧  const stopPct = a.stopLossByRound ? a.stopLossByRound.worstDrawdown : null;
  const recommendedN = a.recommendedN;
  const sp = legacy ? { splits, mult: 1, n1: Math.min(recommendedN, splits), per1: seed / splits, per2: seed / splits, maxRounds: splits }
                    : stagePlan(seed, splits, recommendedN, mult);
  const perSplit = sp.per1, maxRounds = sp.maxRounds;
  const cycle = legacy ? Math.max(1, Math.floor(legacyCycle)) : 0;
  const lastIdx = hist.length - 1;
  const lastClose = hist[lastIdx].y;

  const trades = [];
  let i = 1;
  while (i < hist.length) {
    if (!(hist[i].y <= hist[i - 1].y)) { i++; continue; }   // 실제 LOC 주문(전일 종가 이하 체결)과 같게 '이하'

    const entryIdx = i;
    let shares = 0, cost = 0, rounds = 0, lastBuyIdx = i;
    const buys = [];
    const buy = (idx) => {
      const q = Math.floor(perOfRound(sp, rounds + 1) / hist[idx].y);
      if (q <= 0) return false;
      shares += q; cost += q * hist[idx].y; rounds++; lastBuyIdx = idx;
      buys.push({ x: hist[idx].x, price: hist[idx].y, shares: q, round: rounds });
      return true;
    };
    if (!buy(i)) { i++; continue; }

    let outcome = "open", exitIdx = -1;
    for (let m = i + 1; m < hist.length; m++) {
      const avgNow = cost / shares;
      const c = hist[m].y;
      if (c >= avgNow * (1 + sellPct / 100)) { outcome = "profit"; exitIdx = m; break; }
      if (rounds >= maxRounds && stopPct !== null && c <= avgNow * (1 + stopPct / 100)) { outcome = "loss"; exitIdx = m; break; }
      const conditionMet = c <= avgNow && (!requirePrevDown || c <= hist[m - 1].y);   // 실제 LOC 주문(평단·전일 종가 이하 체결)과 같게 '이하'
      if (rounds < maxRounds && conditionMet) {
        if (!legacy || rounds < sp.n1) buy(m);                 // V0.72: 2단계도 대기 없이 (금액만 시드÷(분할×배수))
        else if ((m - lastBuyIdx) >= cycle) buy(m);           // 비교용 옛 규칙: 마지막 매수 후 주기 대기
      }
    }

    const avg = cost / shares;
    const exitPrice = exitIdx !== -1 ? hist[exitIdx].y : null;
    const value = (exitPrice !== null ? exitPrice : lastClose) * shares;
    trades.push({
      rounds, shares, cost, avg, outcome, buys,
      entryX: hist[entryIdx].x, buyEndX: hist[lastBuyIdx].x,
      exitX: exitIdx !== -1 ? hist[exitIdx].x : null, exitPrice,
      pnl: value - cost, pnlPct: (value - cost) / cost * 100
    });
    i = exitIdx !== -1 ? exitIdx + 1 : hist.length;
  }

  const profit = trades.filter(t => t.outcome === "profit");
  const loss = trades.filter(t => t.outcome === "loss");
  const open = trades.filter(t => t.outcome === "open");
  const sum = arr => arr.reduce((acc, t) => acc + t.pnl, 0);
  const realizedProfit = sum(profit), realizedLoss = sum(loss), unrealized = sum(open);
  const realizedTotal = realizedProfit + realizedLoss;
  const maxInvested = trades.length > 0 ? Math.max(...trades.map(t => t.cost)) : 0;

  return {
    seed, splits, perSplit, maxRounds, sellPct, stopPct, recommendedN, cycle, trades, legacy,
    mult: sp.mult, n1: sp.n1, per2: sp.per2,
    profit, loss, open, realizedProfit, realizedLoss, realizedTotal, unrealized,
    grandTotal: realizedTotal + unrealized, maxInvested
  };
}

//@@fn simTrades
function simTrades(hist, seed, splits, prevDown, cycleDays, tp) {
  const r = simulateSeedBacktest(hist, seed, splits, prevDown, cycleDays, tp);
  if (!r) return null;
  const closed = r.trades.filter(t => t.exitX);
  const days = closed.map(t => (t.exitX - t.entryX) / 86400000);
  r.retOnSeed = r.grandTotal / r.seed * 100;
  r.avgDays = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
  r.winRate = (r.profit.length + r.loss.length) ? r.profit.length / (r.profit.length + r.loss.length) * 100 : null;
  return r;
}
