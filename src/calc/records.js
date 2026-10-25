// src/calc/records.js — 매수 기록·사이클 집계
// ⚠ 함수 하나하나는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include records:이름 자리로 빌드 때 들어갑니다

//@@fn sortedBuyRecords
function sortedBuyRecords() {
  return loadBuyRecords().slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.id - b.id;
  });
}

//@@fn findCloseOnDate
function findCloseOnDate(dateStr) {
  if (!last⟦Lev⟧Hist) return null;
  for (const d of last⟦Lev⟧Hist) {
    if (new Date(d.x).toISOString().split("T")[0] === dateStr) return d.y;
  }
  return null;
}

//@@fn resolveAutoPrice
function resolveAutoPrice(dateStr) {
⟦@s019⟧     ① 입력한 날짜의 확정 종가가 있으면 그 종가
     ② 주말·휴장일이면 그 날짜 이전 가장 가까운 거래일 종가
     ③ 오늘(뉴욕 기준) 장중이라 종가가 아직 없으면 실시간 현재가
     ④ 데이터 범위(최근 200봉)보다 과거이거나 미래 날짜면 자동 입력 불가 → 직접 입력 요청
     이전 버전은 날짜가 데이터에 없으면 무조건 현재가를 넣고 "종가 자동"으로 표시해 평단이 틀어질 수 있었다. */
  if (!last⟦Lev⟧Hist || last⟦Lev⟧Hist.length === 0) return null;
  const exact = findCloseOnDate(dateStr);
  if (exact !== null) return { price: exact, note: "종가 자동" };
  const firstDate = fmtDateFull(last⟦Lev⟧Hist[0].x);
  const lastBar = last⟦Lev⟧Hist[last⟦Lev⟧Hist.length - 1];
  const lastDate = fmtDateFull(lastBar.x);
  const nyToday = nyNowParts().date;
  if (dateStr < firstDate) return { error: `${dateStr}은(는) 불러온 데이터(${firstDate}~) 이전이라 종가를 알 수 없습니다. 매수가를 직접 입력해주세요.` };
  if (dateStr > nyToday) return { error: `${dateStr}은(는) 미래 날짜입니다. 날짜를 확인해주세요.` };
  if (dateStr === nyToday && dateStr > lastDate) {
    if (last⟦Lev⟧Price !== null) return { price: last⟦Lev⟧Price, note: "현재가 자동(장중)" };
    return { error: "오늘 종가가 아직 확정되지 않았습니다. 매수가를 직접 입력해주세요." };
  }
  // 휴장일: 직전 거래일 종가
  let prev = null;
  for (const d of last⟦Lev⟧Hist) { if (fmtDateFull(d.x) <= dateStr) prev = d; else break; }
  if (prev) return { price: prev.y, note: `직전 거래일(${fmtCompactDate(prev.x)}) 종가` };
  return null;
}

//@@fn cyclesNamed
function cyclesNamed() {
  const cnt = {};
  return loadTrades().slice().sort((x, y) => x.sellDate < y.sellDate ? -1 : x.sellDate > y.sellDate ? 1 : x.id - y.id).map(t => {
    const year = t.sellDate.slice(0, 4); cnt[year] = (cnt[year] || 0) + 1;
    const ms = (t.tdays === undefined || t.mdd === undefined) ? cycleMarketStats(t) : { tdays: t.tdays, mdd: t.mdd };
    return Object.assign({}, t, { year, seq: cnt[year], name: `${year}.${cnt[year]}차`, days: cycleDays(t.firstBuy, t.sellDate), tdays: ms.tdays, mdd: ms.mdd, win: t.profit >= 0 });
  });
}

//@@fn tradeStats
function tradeStats(trades) {
  const n = trades.length, cost = trades.reduce((x, t) => x + t.cost, 0), profit = trades.reduce((x, t) => x + t.profit, 0);
  const wins = trades.filter(t => t.profit >= 0).length;
  const avg = f => n ? trades.reduce((x, t) => x + f(t), 0) / n : null;
  const by = (f) => n ? trades.reduce((x, t) => f(t, x) ? t : x) : null;
  return { n, cost, profit, wins, losses: n - wins, rate: cost > 0 ? profit / cost * 100 : null, avgPct: avg(t => t.pct),
           avgDays: avg(t => cycleDays(t.firstBuy, t.sellDate)), avgRounds: avg(t => t.rounds),
           best: by((t, x) => t.pct > x.pct), worst: by((t, x) => t.pct < x.pct) };
}

//@@fn computeBuyRecordsSummary
function computeBuyRecordsSummary() {
  const sorted = sortedBuyRecords();
  let qtyCum = 0, costCum = 0;
  const rows = sorted.map((r, idx) => {
    qtyCum += r.qty;
    costCum += r.qty * r.price;
    return { id: r.id, date: r.date, qty: r.qty, price: r.price, amount: r.qty * r.price, autoRecorded: r.autoRecorded, api: !!r.api, synthetic: !!r.synthetic, round: idx + 1, cumQty: qtyCum, cumAvg: costCum / qtyCum };
  });
  return { rows, totalQty: qtyCum, totalCost: costCum, avgPrice: qtyCum > 0 ? costCum / qtyCum : null };
}
