//@@fn computeStreakSummary
function computeStreakSummary(hist, isDown) {
  const streaks = isDown ? findDownStreaks(hist) : findUpStreaks(hist);
  if (streaks.length === 0) return null;
  const rows = buildStreakRows(hist, streaks);
  const rates = rows.map(r => r.rate);
  return {
    count: rows.length,
    avgLength: rows.reduce((a, r) => a + r.length, 0) / rows.length,
    avgRate: trimmedMeanExcludingMinMax(rates),
    extremeRate: isDown ? Math.min(...rates) : Math.max(...rates)
  };
}
//@@fn computeCurrentQldStreakStatus
function computeCurrentQldStreakStatus(hist) {
  if (!hist || hist.length < 2) return null;
  const last = hist[hist.length - 1], prev = hist[hist.length - 2];
  let streak = null, direction = null;
  if (last.y < prev.y) { direction = "down"; streak = findDownStreaks(hist).find(s => s.endIdx === hist.length - 1); }
  else if (last.y > prev.y) { direction = "up"; streak = findUpStreaks(hist).find(s => s.endIdx === hist.length - 1); }
  else return { direction: "flat" };
  if (!streak) return { direction: "flat" };
  const preClose = hist[streak.preIdx].y, endClose = hist[streak.endIdx].y;
  return { direction, preDate: hist[streak.preIdx].x, preClose, startDate: hist[streak.startIdx].x, endDate: hist[streak.endIdx].x, length: streak.length, endClose, rate: (endClose - preClose) / preClose * 100 };
}
//@@fn findAccumulateBuys
function findAccumulateBuys(hist, thresholdPct) {   // V0.22: 주중 아무 날이나 종가가 기준가 대비 −목표% 이하면 매수 · 주 1회까지
  let peak = hist[0].y, lastWk = null;
  const buys = [];
  for (let i = 1; i < hist.length; i++) {
    if (hist[i].y > peak) { peak = hist[i].y; continue; }
    if (weekKey(hist[i].x) === lastWk) continue;
    if ((peak - hist[i].y) / peak * 100 >= thresholdPct) { buys.push({ x: hist[i].x, y: hist[i].y, i }); peak = hist[i].y; lastWk = weekKey(hist[i].x); }
  }
  return buys;
}
//@@fn evaluateAccumulateBuys
function evaluateAccumulateBuys(hist, buys) {
  if (!buys || buys.length === 0) return null;
  const shares = buys.length;
  const totalCost = buys.reduce((a, b) => a + b.y, 0);
  const avgPrice = totalCost / shares;
  const lastClose = hist[hist.length - 1].y;
  const currentValue = lastClose * shares;
  return { shares, totalCost, avgPrice, lastClose, currentValue, profitAmount: currentValue - totalCost, returnPct: (lastClose - avgPrice) / avgPrice * 100 };
}
//@@fn sweepAccumulateStrategy
function sweepAccumulateStrategy(hist, minPct, maxPct, stepPct) {
  const results = [];
  for (let v = minPct; v <= maxPct + 1e-9; v += stepPct) {
    const rounded = Math.round(v * 10) / 10;
    const buys = findAccumulateBuys(hist, rounded);
    const ev = evaluateAccumulateBuys(hist, buys);
    if (ev) results.push({ pct: rounded, buys, ...ev });
  }
  return results;
}
//@@fn analyzeAccumulateStrategy
function analyzeAccumulateStrategy(hist) {
  const sweep = sweepAccumulateStrategy(hist, 1, 30, 0.5);
  if (sweep.length === 0) return null;
  let pool = sweep.filter(r => r.shares >= 3), minSampleUsed = 3;
  if (pool.length === 0) { pool = sweep.filter(r => r.shares >= 2); minSampleUsed = 2; }
  if (pool.length === 0) { pool = sweep; minSampleUsed = 1; }
  const bestByReturn = pool.reduce((a, b) => (b.returnPct > a.returnPct ? b : a));
  const bestByProfit = pool.reduce((a, b) => (b.profitAmount > a.profitAmount ? b : a));
  return { sweep, bestByReturn, bestByProfit, minSampleUsed, totalCandidates: sweep.length };
}
//@@fn accumulateStats
function accumulateStats(hist, pct) {
  const buys = findAccumulateBuys(hist, pct);
  const ev = evaluateAccumulateBuys(hist, buys);
  if (!ev) return null;
  const gaps = [];
  for (let k = 1; k < buys.length; k++) gaps.push(buys[k].i - buys[k - 1].i);
  return {
    pct, buys, ...ev,
    avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    maxGap: gaps.length ? Math.max(...gaps) : null,
    sinceLast: hist.length - 1 - buys[buys.length - 1].i
  };
}
//@@fn analyzeAiStrategy
function analyzeAiStrategy(hist) {
  if (!hist || hist.length < 80) return null;
  const half = Math.floor(hist.length / 2);
  const h1 = hist.slice(0, half), h2 = hist.slice(half);
  const rows = [];
  for (let v = 1; v <= 30 + 1e-9; v += 0.5) {
    const pct = Math.round(v * 10) / 10;
    const full = accumulateStats(hist, pct);
    if (!full) continue;
    const a = accumulateStats(h1, pct), b = accumulateStats(h2, pct);
    const r1 = a ? a.returnPct : null, r2 = b ? b.returnPct : null;
    const worst = (r1 === null || r2 === null) ? null : Math.min(r1, r2);
    rows.push({ ...full, r1, r2, n1: a ? a.shares : 0, n2: b ? b.shares : 0, worst,
      score: worst === null ? null : 0.6 * worst + 0.4 * full.returnPct });
  }
  if (rows.length === 0) return null;
  // 매수 기회가 400봉 내 4회 이상이고 두 구간 모두에서 최소 1회 매수된 후보를 우선 사용
  let pool = rows.filter(r => r.shares >= 4 && r.n1 >= 1 && r.n2 >= 1 && r.score !== null), rule = "full";
  if (pool.length === 0) { pool = rows.filter(r => r.shares >= 3 && r.score !== null); rule = "loose"; }
  if (pool.length === 0) { pool = rows.filter(r => r.score !== null); rule = "score"; }
  if (pool.length === 0) { pool = rows; rule = "return"; }
  const key = (r) => (r.score === null ? r.returnPct : r.score);
  const best = pool.reduce((a, b) => (key(b) > key(a) ? b : a));
  const bestReturnOnly = rows.reduce((a, b) => (b.returnPct > a.returnPct ? b : a));
  return { rows, best, bestReturnOnly, rule, candidates: rows.length,
    bars: hist.length, halfBars: half, h1Range: [h1[0].x, h1[h1.length - 1].x], h2Range: [h2[0].x, h2[h2.length - 1].x] };
}
//@@fn computeCciSeries
function computeCciSeries(hist, period) {
  const out = [];
  for (let i = period - 1; i < hist.length; i++) {
    const w = hist.slice(i - period + 1, i + 1).map(d => d.y);
    const sma = w.reduce((a, b) => a + b, 0) / period;
    const meanDev = w.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
    const cci = meanDev === 0 ? 0 : (hist[i].y - sma) / (0.015 * meanDev);
    out.push({ x: hist[i].x, y: cci });
  }
  return out;
}
//@@fn computeAthInfo
function computeAthInfo(hist) {
  let ath = -Infinity, athIndex = 0;
  hist.forEach((d, idx) => { if (d.y > ath) { ath = d.y; athIndex = idx; } });
  return { ath, athDate: new Date(hist[athIndex].x).toISOString().split('T')[0] };
}
//@@fn computePivotLevels
function computePivotLevels(bar) {
  const h = bar.h, l = bar.l, c = bar.y;
  const p = (h + l + c) / 3;
  return { p, r1: 2 * p - l, s1: 2 * p - h, r2: p + (h - l), s2: p - (h - l), r3: h + 2 * (p - l), s3: l - 2 * (h - p) };
}
//@@fn computeSrAnalysis
function computeSrAnalysis(hist, livePrice) {
  const lastBar = hist[hist.length - 1];
  const pivot = computePivotLevels(lastBar);
  const refPrice = (livePrice !== null && livePrice !== undefined && !isNaN(livePrice)) ? livePrice : lastBar.y;
  const last20 = hist.slice(-20), last50 = hist.slice(-50);
  const swing20High = Math.max(...last20.map(d => d.h)), swing20Low = Math.min(...last20.map(d => d.l));
  const swing50High = Math.max(...last50.map(d => d.h)), swing50Low = Math.min(...last50.map(d => d.l));
  const levels = [
    { tag: "R3", price: pivot.r3, type: "res" }, { tag: "50봉 고점", price: swing50High, type: "res" },
    { tag: "R2", price: pivot.r2, type: "res" }, { tag: "20봉 고점", price: swing20High, type: "res" },
    { tag: "R1", price: pivot.r1, type: "res" }, { tag: "P", price: pivot.p, type: "pivot" },
    { tag: "S1", price: pivot.s1, type: "sup" }, { tag: "20봉 저점", price: swing20Low, type: "sup" },
    { tag: "S2", price: pivot.s2, type: "sup" }, { tag: "50봉 저점", price: swing50Low, type: "sup" },
    { tag: "S3", price: pivot.s3, type: "sup" },
  ].sort((a, b) => b.price - a.price);
  const resistances = levels.filter(lv => lv.price > refPrice).sort((a, b) => a.price - b.price);
  const supports = levels.filter(lv => lv.price < refPrice).sort((a, b) => b.price - a.price);
  return { pivot, levels, refPrice, nearestResistance: resistances[0] || null, nearestSupport: supports[0] || null };
}
//@@fn analyzeRecentTrend
function analyzeRecentTrend(hist, refPrice, cciHist) {
  const closes = hist.map(d => d.y);
  const n = closes.length;
  const sma = (k) => { const s = closes.slice(-k); return s.reduce((a, b) => a + b, 0) / s.length; };
  const ma5 = sma(5), ma20 = sma(Math.min(20, n)), ma60 = sma(Math.min(60, n));
  const prevSlice = closes.slice(-25, -5);
  const ma20Prev = prevSlice.length > 0 ? prevSlice.reduce((a, b) => a + b, 0) / prevSlice.length : ma20;
  const slope = (ma20 / ma20Prev - 1) * 100;
  const last = closes[n - 1];
  const ret5 = n > 5 ? (last / closes[n - 6] - 1) * 100 : null;
  const ret20 = n > 20 ? (last / closes[n - 21] - 1) * 100 : null;
  const hi200 = Math.max(...closes);
  const dd200 = (refPrice / hi200 - 1) * 100;
  const s20 = closes.slice(-20), s60 = closes.slice(-60);
  const hi20 = Math.max(...s20), lo20 = Math.min(...s20);
  const hi60 = Math.max(...s60), lo60 = Math.min(...s60);
  const pos60 = hi60 > lo60 ? (refPrice - lo60) / (hi60 - lo60) * 100 : 50;
  const rets = [];
  for (let i = Math.max(1, n - 20); i < n; i++) rets.push((closes[i] / closes[i - 1] - 1) * 100);
  const meanR = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sigma = Math.sqrt(rets.reduce((a, b) => a + (b - meanR) ** 2, 0) / (rets.length || 1));
  const cci = cciHist && cciHist.length > 0 ? cciHist[cciHist.length - 1].y : null;
  const signals = [
    { on: refPrice > ma20, t: "현재가 > 20일선" },
    { on: refPrice > ma60, t: "현재가 > 60일선" },
    { on: slope > 0, t: "20일선 상승 기울기" },
    { on: ma5 > ma20, t: "5일선 > 20일선" },
  ];
  const score = signals.filter(s => s.on).length;
  const labels = ["뚜렷한 하락 추세", "약세 우위", "횡보·중립", "상승 우위", "강한 상승 추세"];
  const colors = ["#F0475A", "#FF7A6B", "#F5A524", "#5EDC9E", "#38D98C"];
  const ma20Series = [];
  for (let i = Math.max(19, n - 60); i < n; i++) {
    const w = closes.slice(i - 19, i + 1);
    ma20Series.push({ x: hist[i].x, y: w.reduce((a, b) => a + b, 0) / w.length });
  }
  return { ma5, ma20, ma60, slope, ret5, ret20, hi200, dd200, hi20, lo20, hi60, lo60, pos60, sigma, cci, signals, score, label: labels[score], color: colors[score], streak: computeCurrentQldStreakStatus(hist), ma20Series };
}
//@@fn seedSim
function seedSim(ys, xs, q, w, n) {        // 평생매수 백테스트 (시드 1 기준) → 수익률 · 투입률
  const cum = [1, 2, 3].map(k => 1 - Math.pow(1 - q, k)), per = w.map((x, i) => x / 100 / n[i]);
  let cash = 1, sh = 0, H = ys[0], ref = ys[0], wk = -1;
  for (let i = 1; i < ys.length; i++) {
    const y = ys[i]; H = Math.max(H, y);
    const k = Math.floor((xs[i] / 86400000 + 3) / 7);
    if (cash > 1e-9 && k !== wk && y <= ref * (1 - q)) {
      const d = 1 - y / H, t = d < cum[1] ? 0 : d < cum[2] ? 1 : 2;
      let amt = Math.min(per[t], cash); if (cash - amt < per[t] * 0.5) amt = cash;
      sh += amt / y; cash -= amt; ref = y; wk = k;
    } else ref = Math.max(ref, y);
  }
  return { ret: sh * ys[ys.length - 1] + cash - 1, used: 1 - cash };
}
//@@fn seedOptimize
function seedOptimize(ys, xs, q) {
  const key = ys.length + ":" + ys[ys.length - 1] + ":" + q;
  if (__seedOpt.key === key) return __seedOpt.res;
  const W = [], N = [];
  for (let a = 10; a <= 80; a += 10) for (let b = 10; a + b <= 90; b += 10) W.push([a, b, 100 - a - b]);
  for (const a of [2, 3, 4, 6, 8, 10]) for (const b of [1, 2, 3, 4, 6]) for (const c of [1, 2, 3]) N.push([a, b, c]);
  const all = [];
  for (const w of W) for (const n of N) all.push({ w, n, ...seedSim(ys, xs, q, w, n) });
  for (const r of all) {                   // 견고성 = 배분 ±10%p · 분할 같음 인접 평균
    const nb = all.filter(o => o.n === r.n && Math.abs(o.w[0] - r.w[0]) <= 10 && Math.abs(o.w[1] - r.w[1]) <= 10);
    r.rob = nb.reduce((t, o) => t + o.ret, 0) / nb.length;
  }
  all.sort((x, y) => y.rob - x.rob);
  return (__seedOpt = { key, res: all }).res;
}
//@@fn weekKey
function weekKey(x) { return Math.floor((Math.floor(x / 86400000) + 3) / 7); }   // 월요일 시작 주 번호
//@@fn nextWeekday
function nextWeekday(fromX) { const d = new Date(fromX); do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6); return d; }
//@@fn nextMonday
function nextMonday(fromX) { const d = new Date(fromX); do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== 1); return d; }
//@@fn locQtyFromBudget
function locQtyFromBudget(budgetKrw, px) {
  if (!(liveFx && liveFx.rate > 0) || !(budgetKrw > 0) || !(px > 0)) return null;
  const raw = budgetKrw / liveFx.rate / px;
  return { raw, qty: Math.floor(raw / LOC_LOT) * LOC_LOT };
}
//@@fn fmtMoneySigned
function fmtMoneySigned(n) {
  if (n === null || n === undefined || isNaN(n)) return "--";
  return (n >= 0 ? "+" : "-") + "$" + Math.abs(n).toFixed(2);
}
//@@fn positionAt
function positionAt(valid, untilDate, excludeId) {
  const ev = [];
  valid.forEach(r => { if (r.date <= untilDate) ev.push({ d: r.date, o: 0, buy: r }); });
  loadTrades().forEach(t => { if (t.date <= untilDate && t.id !== excludeId) ev.push({ d: t.date, o: 1, sell: t }); });
  ev.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.o - b.o);
  let qty = 0, cost = 0, sold = 0;
  for (const e of ev) {
    if (e.buy) { qty += e.buy.qty; cost += e.buy.qty * e.buy.price; }
    else if (qty > 0) { const q = Math.min(e.sell.qty, qty); cost -= cost / qty * q; qty -= q; sold += q; }
  }
  return { qty, cost: Math.max(0, cost), sold };
}
//@@fn holdingSummary
function holdingSummary(valid) {
  if (valid.length === 0) return null;
  const st = positionAt(valid, "9999-12-31");
  if (!(st.qty > 0)) return null;
  return { qty: st.qty, cost: st.cost, avg: st.cost / st.qty, last: valid[valid.length - 1], sold: st.sold };
}
