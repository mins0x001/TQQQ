/* ---------- 나의 매수 기록 (localStorage 저장) ---------- */
⟦@s018⟧const LOC_QTY_UNIT = 1;   // LOC 매수 수량 단위(주) — V0.74/V0.47: 5주 → 1주 (2단계 소액 매수도 금액만큼 정확히)

//@@include format:fmtKrDate

function loadBuyRecords() {
  try {
    const raw = localStorage.getItem(BUY_RECORDS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
function saveBuyRecordsToStorage(records) {
  try { localStorage.setItem(BUY_RECORDS_KEY, JSON.stringify(records)); } catch (e) {}
}
//@@include records:sortedBuyRecords
//@@include records:findCloseOnDate
//@@include records:resolveAutoPrice
function showBuyRecMsg(msg, ok) {
  const el = document.getElementById("buyRecMsg");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.toggle("ok", !!ok);
}
function hideBuyRecMsg() {
  const el = document.getElementById("buyRecMsg");
  if (el) el.classList.add("hidden");
}

function addBuyRecord() {
  const dateEl = document.getElementById("buyRecDate");
  const qtyEl = document.getElementById("buyRecQty");
  const priceEl = document.getElementById("buyRecPrice");
  const dateStr = dateEl.value;
  const qtyInput = qtyEl.value.trim();
  const priceInput = priceEl.value.trim();

  if (!dateStr) { showBuyRecMsg("매수 날짜를 입력해주세요.", false); return; }
  if (qtyInput !== "" && !(parseInt(qtyInput, 10) > 0)) { showBuyRecMsg("매수 수량을 올바르게 입력해주세요.", false); return; }

  let price, autoClose = false, priceNote = "";
  if (priceInput === "") {
    const resolved = resolveAutoPrice(dateStr);
    if (!resolved) { showBuyRecMsg("시세 데이터가 없어 종가를 자동으로 채울 수 없습니다. 먼저 시세를 불러오거나 매수가를 직접 입력해주세요.", false); return; }
    if (resolved.error) { showBuyRecMsg(resolved.error, false); return; }
    price = resolved.price; autoClose = true; priceNote = resolved.note;
  } else {
    price = parseFloat(priceInput);
    if (!(price > 0)) { showBuyRecMsg("매수가를 올바르게 입력해주세요.", false); return; }
  }

  // 매수 수량: 입력값 우선, 비어 있으면 디폴트 = 1분할 금액 ÷ 매수가 → 1주 단위 내림 (LOC 가이드와 동일 공식)
  let qty, autoQty = false;
  if (qtyInput === "") {
    const d = computeDefaultBuyQty(price);
    if (!d) { showBuyRecMsg("매수 수량을 자동 계산할 수 없습니다. 시드 분할매수 시뮬레이션의 시드·분할 수를 확인하거나 수량을 직접 입력해주세요.", false); return; }
    if (d.qty <= 0) { showBuyRecMsg(`1분할 금액(${fmtUsd0(d.perSplit)})으로는 ${LOC_QTY_UNIT}주를 살 수 없습니다(매수가 ${usd(price)}). 수량을 직접 입력해주세요.`, false); return; }
    qty = d.qty; autoQty = true;
  } else {
    qty = parseInt(qtyInput, 10);
  }

  const records = loadBuyRecords();
  records.push({ id: Date.now() * 1000 + Math.floor(Math.random() * 1000), date: dateStr, qty, price, autoClose, autoQty, priceNote });
  saveBuyRecordsToStorage(records);

  qtyEl.value = ""; priceEl.value = "";
  setDefaultBuyDate(true);
  updateBuyQtyHint();
  showBuyRecMsg(autoQty ? `매수 기록이 저장되었습니다. 수량 ${qty.toLocaleString("en-US")}주 자동 입력 (1분할 ÷ ${usd(price)}, ${LOC_QTY_UNIT}주 단위 내림)` : "매수 기록이 저장되었습니다.", true);
  renderBuyRecords();
  renderLocGuideCard();
}

/* ---------- 매수 수량 디폴트 ---------- */
document.getElementById("buyRecDate").addEventListener("input", e => { e.target.dataset.autoDefault = "0"; });
function computeDefaultBuyQty(price) {
  const seed = parseFloat((document.getElementById("seedSimSeed1") || {}).value);
  const splits = parseInt((document.getElementById("seedSimSplits1") || {}).value, 10);
  if (!(seed > 0) || !(splits >= 1) || !(price > 0)) return null;
  const perSplit = seed / splits;
  const qty = Math.floor(Math.floor(perSplit / price) / LOC_QTY_UNIT) * LOC_QTY_UNIT;
  return { qty, perSplit };
}
// 입력칸 안내: 날짜·매수가를 넣으면 비워둘 때 들어갈 수량을 미리 보여준다
function updateBuyQtyHint() {
  const qtyEl = document.getElementById("buyRecQty");
  if (!qtyEl) return;
  const dateStr = document.getElementById("buyRecDate").value;
  const priceInput = document.getElementById("buyRecPrice").value.trim();
  let price = priceInput !== "" ? parseFloat(priceInput) : null;
  if (price === null && dateStr) { const r = resolveAutoPrice(dateStr); price = r && !r.error ? r.price : null; }
  if (price === null && last⟦Lev⟧Hist) price = last⟦Lev⟧Hist[last⟦Lev⟧Hist.length - 1].y;
  const d = price ? computeDefaultBuyQty(price) : null;
  qtyEl.placeholder = d && d.qty > 0 ? `비우면 ${d.qty.toLocaleString("en-US")}주` : "비우면 자동";
}
["buyRecDate", "buyRecPrice", "seedSimSeed1", "seedSimSplits1"].forEach(id => {
  const el = document.getElementById(id);
  if (el) { el.addEventListener("input", updateBuyQtyHint); el.addEventListener("change", updateBuyQtyHint); }
});

/* ---------- 매수 날짜 기본값: 어제 ---------- */
function setDefaultBuyDate(force) {
  const el = document.getElementById("buyRecDate");
  if (!el || (el.value && !force)) return;
  let d;
  if (last⟦Lev⟧Hist && last⟦Lev⟧Hist.length) {
    d = fmtDateFull(last⟦Lev⟧Hist[last⟦Lev⟧Hist.length - 1].x);          // 가장 최근 확정 종가일 (미국장 기준 어제)
  } else {
    const y = new Date(Date.now() - 86400000);           // 시세 조회 전: 달력상 어제
    d = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  }
  el.value = d;
  el.dataset.autoDefault = "1";
}

/* ---------- 어제 LOC 매수 조건 충족 시 자동 저장 ----------
   어제(가장 최근 확정 종가일 D)에 LOC 가이드가 제시했을 매수 주문을 그대로 다시 계산한다.
     · 기준가 = min(평단가, D-1 종가) 를 센트 단위 내림  (LOC 가이드와 동일)
     · 수량   = 1분할 금액 ÷ 기준가 → 1주 단위 내림
     · 최대 회차(1단계 N + 2단계 (분할−N)×3)를 다 샀으면 주문이 없었던 것으로 본다 (V0.72: 2단계는 대기 없음 · 시드÷(분할×3))
     · 💼 증권사 체결 자동 등록이 켜져 있으면 이 추정은 쓰지 않는다 (실제 체결이 우선)
   D 종가 ≤ 기준가 이면 LOC가 체결된 것이므로 (체결가 = D 종가) 기록을 자동 추가한다.
   · 이미 D 이후 기록이 있거나, 사용자가 이 자동 기록을 삭제한 적이 있으면 추가하지 않는다
   · 기록이 하나도 없는 신규 진입 전 상태는 실제 진입 여부를 알 수 없어 자동 저장하지 않는다 */
const AUTO_SKIP_KEY = BUY_RECORDS_KEY + "_auto_skip";
function loadAutoSkip() { try { return JSON.parse(localStorage.getItem(AUTO_SKIP_KEY) || "[]"); } catch (e) { return []; } }
function saveAutoSkip(a) { try { localStorage.setItem(AUTO_SKIP_KEY, JSON.stringify(a.slice(-60))); } catch (e) {} }
let lastAutoRecordMsg = "", lastAutoRecordInfo = "";

/* ---------- 매도·수익 기록 ---------- */
const TRADES_KEY = LEV_TICKER.toLowerCase() + "_trades_v1";
function loadTrades() { try { const a = JSON.parse(localStorage.getItem(TRADES_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function saveTrades(a) { try { localStorage.setItem(TRADES_KEY, JSON.stringify(a.slice().sort((x, y) => x.sellDate < y.sellDate ? -1 : x.sellDate > y.sellDate ? 1 : x.id - y.id))); } catch (e) {} }
const tradeTombOf = t => "T|" + (t && t.auto ? "sell:" + t.sellDate : "t:" + (t && t.id));
/* 보유 전량 매도 → 거래 1건 생성 (그 사이클의 매수 기록을 안에 보관) + 매수 기록 비우기 */
/* 보유 구간(첫 매수일~매도일)의 거래일 수 · 최대 낙폭(최저 종가 ÷ 평단 − 1). 시세 범위 밖이면 null */
function cycleMarketStats(t) {
  const hist = last⟦Lev⟧Hist;
  if (!hist || !hist.length) return { tdays: null, mdd: null };
  const bars = hist.filter(d => { const ds = fmtDateFull(d.x); return ds >= t.firstBuy && ds <= t.sellDate; });
  if (!bars.length || fmtDateFull(hist[0].x) > t.firstBuy) return { tdays: null, mdd: null };
  const minClose = Math.min(...bars.map(d => d.y));
  return { tdays: bars.length, mdd: Math.min(0, (minClose / t.avg - 1) * 100) };
}
const cycleDays = (a, b) => Math.max(0, Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5));
/* 매도일 순으로 '연도.순번차' 이름 부여 (저장하지 않고 매번 계산 → 삭제·동기화 후에도 번호가 항상 맞음) */
//@@include records:cyclesNamed
const cycleNameOf = id => { const c = cyclesNamed().find(x => x.id === id); return c ? c.name : ""; };

function closeCycle(sellDate, sellPrice, o) {
  o = o || {};
  const recs = sortedBuyRecords();
  if (!recs.length || !(sellPrice > 0)) return null;
  const qty = recs.reduce((x, r) => x + r.qty, 0), cost = recs.reduce((x, r) => x + r.qty * r.price, 0);
  const avg = cost / qty, proceeds = qty * sellPrice;
  const t = { id: Date.now() * 1000 + Math.floor(Math.random() * 1000), sellDate, sellPrice, qty, avg, cost, proceeds,
              profit: proceeds - cost, pct: (sellPrice / avg - 1) * 100, rounds: recs.length, firstBuy: recs[0].date,
              auto: !!o.auto, limit: o.limit || null, note: o.note || "",
              buys: recs.map(r => ({ date: r.date, qty: r.qty, price: r.price, auto: !!r.autoRecorded })) };
  /* 사이클 분석 지표 (종료 시점에 한 번 계산해 영구 보관) */
  const mt = cycleMarketStats(t);
  if (mt.tdays !== null) t.tdays = mt.tdays;
  if (mt.mdd !== null) t.mdd = mt.mdd;
  const sp = parseInt((document.getElementById("seedSimSplits1") || {}).value, 10);
  if (sp >= 1) t.splits = sp;
  const ml = parseInt((document.getElementById("seedSimCycle1") || {}).value, 10);
  if (ml >= 1) t.mult = ml;
  const all = loadTrades(); all.push(t); saveTrades(all);
  saveBuyRecordsToStorage([]);
  return t;
}

function autoRecordYesterdayBuy() {
  /* 마지막 기록(매수 또는 매도) 다음 거래일부터 어제(D)까지 하루씩 LOC 체결 여부를 재생한다 (최대 15거래일).
     하루마다 ① 보유 중이면 LOC 매도(익절) 체결 여부 → 체결 시 전량 매도 기록 ② 아니면 LOC 매수 체결 여부.
     매도 후에는 신규 진입(전일 종가 이하 LOC)부터 다시 이어서 기록한다. */
  lastAutoRecordMsg = ""; lastAutoRecordInfo = "";
  const hist = last⟦Lev⟧Hist;
  if (!hist || hist.length < 3) return null;
  if (typeof apiActive === "function" && apiActive()) { lastAutoRecordInfo = apiInfoLine(); return null; }
  let records = sortedBuyRecords();
  const trades = loadTrades();
  const lastSell = trades.length ? trades.reduce((x, t) => t.sellDate > x ? t.sellDate : x, "") : "";
  const anchor = records.length ? records[records.length - 1].date : lastSell;
  if (!anchor) { lastAutoRecordInfo = "기록이 없는 신규 진입 전이라 자동 저장하지 않습니다 (첫 매수는 직접 저장)"; return null; }
  const seed = parseFloat(document.getElementById("seedSimSeed1").value);
  const splits = parseInt(document.getElementById("seedSimSplits1").value, 10);
  const mult = parseInt(document.getElementById("seedSimCycle1").value, 10) || STAGE2_MULT;
  if (!(seed > 0) || !(splits >= 1)) return null;
  const strategy = getSellAnalysis(hist);
  if (!strategy || !strategy.recommendedN) return null;
  const sellPct = strategy.best.pct;
  const sp = stagePlan(seed, splits, strategy.recommendedN, mult);
  const D = hist.length - 1;
  const dates = hist.map(d => fmtDateFull(d.x));
  let start = dates.findIndex(dd => dd > anchor);
  if (start === -1) { lastAutoRecordInfo = `어제(${fmtCompactDate(hist[D].x)})까지 이미 기록되어 있습니다`; return null; }
  start = Math.max(start, D - 14, 1);
  const skip = loadAutoSkip();
  const added = [];
  let lastReason = "";
  for (let i = start; i <= D; i++) {
    const day = dates[i];
    const rounds = records.length;
    // ① 보유 중 → LOC 매도(익절) 체결 확인
    if (rounds > 0) {
      const q0 = records.reduce((x, r) => x + r.qty, 0);
      const avg0 = records.reduce((x, r) => x + r.qty * r.price, 0) / q0;
      const sellLimit = Math.ceil(avg0 * (1 + sellPct / 100) * 100 - 1e-6) / 100;
      if (hist[i].y >= sellLimit) {
        if (skip.includes("sell:" + day)) { lastReason = `${fmtCompactDate(hist[i].x)} 자동 매도 기록은 직접 삭제하셔서 다시 만들지 않습니다`; continue; }
        const t = closeCycle(day, hist[i].y, { auto: true, limit: sellLimit });
        records = [];
        if (t) added.push(`🏁 ${cycleNameOf(t.id)} 사이클 종료 — ${fmtCompactDate(hist[i].x)} 전량 ${t.qty}주 매도 @ ${usd(t.sellPrice)} (LOC ${usd(sellLimit)} 이상 체결) → ${fmtUsd0Signed(t.profit)} · ${fmtPctSigned(t.pct)}`);
        lastReason = "";
        continue;
      }
    }
    // ② LOC 매수 체결 확인
    if (skip.includes(day)) { lastReason = `${fmtCompactDate(hist[i].x)} 자동 기록은 직접 삭제하셔서 다시 만들지 않습니다`; continue; }
    if (rounds >= sp.maxRounds) { lastReason = `최대 ${sp.maxRounds}회(1단계 ${sp.n1} + 2단계 ${sp.maxRounds - sp.n1})를 모두 매수해 추가 매수 주문이 없습니다`; continue; }
    let basisRaw = hist[i - 1].y;
    if (rounds > 0) {
      const qtySum = records.reduce((x, r) => x + r.qty, 0);
      basisRaw = Math.min(records.reduce((x, r) => x + r.qty * r.price, 0) / qtySum, basisRaw);
    }
    const basis = Math.floor(basisRaw * 100 + 1e-6) / 100;
    const qty = Math.floor(Math.floor(perOfRound(sp, rounds + 1) / basis) / LOC_QTY_UNIT) * LOC_QTY_UNIT;
    if (qty <= 0) { lastReason = `1분할 금액으로 ${LOC_QTY_UNIT}주를 살 수 없습니다`; continue; }
    if (hist[i].y > basis) { lastReason = `${fmtCompactDate(hist[i].x)} 종가 ${usd(hist[i].y)} > LOC 매수가 ${usd(basis)} → 미체결`; continue; }
    const rec = { id: Date.now() * 1000 + Math.floor(Math.random() * 1000), date: day, qty, price: hist[i].y, autoRecorded: true };
    const all = loadBuyRecords(); all.push(rec); saveBuyRecordsToStorage(all);
    records = sortedBuyRecords();
    added.push(`${fmtCompactDate(hist[i].x)} ${rounds === 0 ? "신규 진입 " : ""}${qty}주 @ ${usd(hist[i].y)} (LOC ${usd(basis)} 이하 체결)`);
    lastReason = "";
  }
  if (added.length) lastAutoRecordMsg = `LOC 체결 조건 충족 → 자동 저장: ${added.join(", ")}. 실제로 체결되지 않았다면 ✕로 지워주세요.`;
  if (lastReason) lastAutoRecordInfo = "자동 저장 안 함 — " + lastReason;
  return added;
}

/* 수동 매도(손절·직접 매도) */
function setDefaultSellDate() {
  const el = document.getElementById("sellRecDate");
  if (!el || el.value) return;
  const hist = last⟦Lev⟧Hist;
  if (hist && hist.length) el.value = fmtDateFull(hist[hist.length - 1].x);
  else { const y = new Date(Date.now() - 864e5); el.value = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`; }
}
function showSellMsg(msg, ok) { const el = document.getElementById("sellRecMsg"); el.textContent = msg; el.classList.remove("hidden"); el.classList.toggle("ok", !!ok); }
function addSellRecord() {
  const dateStr = document.getElementById("sellRecDate").value;
  const pIn = document.getElementById("sellRecPrice").value.trim();
  const recs = sortedBuyRecords();
  if (!recs.length) { showSellMsg("보유 중인 매수 기록이 없어 매도할 수량이 없습니다.", false); return; }
  if (!dateStr) { showSellMsg("매도 날짜를 선택해주세요.", false); return; }
  if (dateStr < recs[recs.length - 1].date) { showSellMsg(`매도 날짜가 마지막 매수일(${fmtKrDate(recs[recs.length - 1].date)})보다 빠릅니다.`, false); return; }
  let price = pIn !== "" ? parseFloat(pIn) : null, note = "직접 입력";
  if (price === null) {
    const r = resolveAutoPrice(dateStr);
    if (!r || r.error) { showSellMsg(r && r.error ? r.error.replace("매수가", "매도가") : "시세를 불러온 뒤 다시 시도하거나 매도가를 직접 입력해주세요.", false); return; }
    price = r.price; note = r.note || "종가 자동";
  }
  if (!(price > 0)) { showSellMsg("매도가를 확인해주세요.", false); return; }
  const t = closeCycle(dateStr, price, { auto: false, note });
  document.getElementById("sellRecPrice").value = "";
  showSellMsg(`🏁 ${cycleNameOf(t.id)} 사이클 종료: ${t.qty}주 × ${usd(price)} = ${fmtUsd0(t.proceeds)} · 수익금 ${fmtUsd0Signed(t.profit)} · 수익률 ${fmtPctSigned(t.pct)}`, true);
  renderBuyRecords(); renderLocGuideCard();
}
function deleteTrade(id) {
  const all = loadTrades(), t = all.find(x => x.id === id);
  if (!t) return;
  if (t.api && apiActive()) { showCopyToast("💼 증권사 체결로 만든 사이클은 자동으로 다시 생깁니다 — 지우려면 [자동 등록 끄기] 후 삭제", false); return; }
  const latest = all.reduce((x, y) => (y.sellDate > x.sellDate || (y.sellDate === x.sellDate && y.id > x.id)) ? y : x);
  const cur = loadBuyRecords();
  const restore = t === latest && cur.every(r => r.date <= t.sellDate) && Array.isArray(t.buys) && t.buys.length;
  const msg = restore
    ? `${fmtKrDate(t.sellDate)} 매도 기록을 지우고, 그 사이클의 매수 기록 ${t.buys.length}건을 되살릴까요?`
    : `${fmtKrDate(t.sellDate)} 매도 기록을 지울까요? (이후 새 사이클이 있어 매수 기록은 되살리지 않습니다)`;
  if (!confirm(msg)) return;
  if (t.auto) { const sk = loadAutoSkip(); sk.push("sell:" + t.sellDate); saveAutoSkip(sk); }
  saveTrades(all.filter(x => x.id !== id));
  if (restore) {
    const base = Date.now() * 1000;
    const back = t.buys.map((b, k) => ({ id: base + k * 7 + Math.floor(Math.random() * 5), date: b.date, qty: b.qty, price: b.price, restored: true }));
    saveBuyRecordsToStorage([...back, ...cur]);
  }
  lastAutoRecordMsg = "";
  renderBuyRecords(); renderLocGuideCard();
}
//@@include records:tradeStats
const mdShort = ds => `${+ds.slice(5, 7)}/${+ds.slice(8, 10)}`;
function renderTrades() {
  const sumEl = document.getElementById("tradeSummary"), el = document.getElementById("tradeContent");
  if (!sumEl || !el) return;
  setDefaultSellDate();
  (() => { const all = loadTrades(); let ch = false;
    all.forEach(t => { if (t.mdd === undefined || t.tdays === undefined) { const ms = cycleMarketStats(t); if (ms.mdd !== null) { t.mdd = ms.mdd; t.tdays = ms.tdays; ch = true; } } });
    if (ch) saveTrades(all); })();
  const cs = cyclesNamed(), st = tradeStats(cs);
  const col = v => v === null || v === undefined ? "var(--text-faint)" : v > 0 ? "var(--up)" : v < 0 ? "var(--down)" : "var(--text-dim)";
  sumEl.innerHTML = `<div class="pl-tiles four">
      <div class="pl-tile"><div class="l">누적 손익</div><div class="v" style="color:${col(st.n ? st.profit : null)};">${st.n ? fmtUsd0Signed(st.profit) : "--"}</div><div class="s">실현 수익률 ${st.rate !== null ? fmtPctSigned(st.rate) : "--"}</div></div>
      <div class="pl-tile"><div class="l">종료 사이클 · 승률</div><div class="v">${st.n}회 · ${st.n ? Math.round(st.wins / st.n * 100) + "%" : "--"}</div><div class="s">익절 ${st.wins} · 손절 ${st.losses}</div></div>
      <div class="pl-tile"><div class="l">평균 기간</div><div class="v">${st.avgDays !== null ? st.avgDays.toFixed(st.avgDays < 10 ? 1 : 0) + "일" : "--"}</div><div class="s">첫 매수 → 매도</div></div>
      <div class="pl-tile"><div class="l">평균 매수 횟수</div><div class="v">${st.avgRounds !== null ? st.avgRounds.toFixed(1) + "회" : "--"}</div><div class="s">사이클당 평균 ${st.avgPct !== null ? fmtPctSigned(st.avgPct) : "--"}</div></div>
    </div>
    ${st.n >= 2 ? `<div class="cy-best"><div>최고 <b>${st.best.name}</b> <span style="color:${col(st.best.pct)}">${fmtPctSigned(st.best.pct)}</span></div><div>최저 <b>${st.worst.name}</b> <span style="color:${col(st.worst.pct)}">${fmtPctSigned(st.worst.pct)}</span></div></div>` : ""}`;

  let html = "";
  /* 진행 중인 사이클 */
  const cur = sortedBuyRecords();
  if (cur.length) {
    const y = String(new Date().getFullYear()), seq = cs.filter(c => c.year === y).length + 1;
    const q = cur.reduce((x, r) => x + r.qty, 0), cost = cur.reduce((x, r) => x + r.qty * r.price, 0), avg = cost / q;
    const hist = last⟦Lev⟧Hist;
    const px = (last⟦Lev⟧Price !== null && !isNaN(last⟦Lev⟧Price)) ? last⟦Lev⟧Price : (hist && hist.length ? hist[hist.length - 1].y : null);
    const today = new Date(); const tds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const ev = px !== null ? (px / avg - 1) * 100 : null;
    html += `<div class="cy-year"><b>진행 중</b></div>
      <details class="cy live"><summary>
        <span class="cy-name">${y}.${seq}차<span class="cy-pill">진행 중</span></span><span class="cy-pl" style="color:${col(ev)}">${ev !== null ? fmtUsd0Signed(px * q - cost) : "--"}</span>
        <span class="cy-meta">${mdShort(cur[0].date)} → · ${cycleDays(cur[0].date, tds)}일째 · 매수 ${cur.length}회</span><span class="cy-pct" style="color:${col(ev)}">${ev !== null ? fmtPctSigned(ev) : "시세 필요"}</span>
      </summary><div class="cy-body">
        <div class="cy-kv"><div><span>평단</span><b>${usd(avg)}</b></div><div><span>수량</span><b>${q.toLocaleString("en-US")}주</b></div><div><span>투입</span><b>${fmtUsd0(cost)}</b></div></div>
        <div class="cy-buys">${cur.map((r, k) => `<i>${k + 1}회</i> ${mdShort(r.date)} · ${r.qty}주 @ ${usd(r.price)}`).join("<br>")}</div>
      </div></details>`;
  }
  if (!cs.length) {
    html += `<div class="fg-empty" style="margin-top:12px;">아직 종료된 사이클이 없습니다.<br>전량 매도되면 <b>${new Date().getFullYear()}.1차</b>부터 자동으로 기록됩니다.</div>`;
  } else {
    const years = [...new Set(cs.map(c => c.year))].sort().reverse();
    years.forEach(yr => {
      const list = cs.filter(c => c.year === yr), ys = tradeStats(list);
      html += `<div class="cy-year"><b>${yr}년</b>${ys.n}사이클 · 승률 ${Math.round(ys.wins / ys.n * 100)}%<span style="color:${col(ys.profit)}">${fmtUsd0Signed(ys.profit)} · ${fmtPctSigned(ys.rate)}</span></div>`;
      list.slice().reverse().forEach(c => {
        html += `<details class="cy${c.win ? "" : " loss"}"><summary>
          <span class="cy-name">${c.name}<span class="cy-pill">${c.win ? "익절" : "손절"}</span></span><span class="cy-pl">${fmtUsd0Signed(c.profit)}</span>
          <span class="cy-meta">${mdShort(c.firstBuy)} → ${mdShort(c.sellDate)} · ${c.days}일 · 매수 ${c.rounds}회</span><span class="cy-pct">${fmtPctSigned(c.pct)}</span>
        </summary><div class="cy-body">
          <div class="cy-kv">
            <div><span>평단 → 매도</span><b>${usd(c.avg)} → ${usd(c.sellPrice)}</b></div>
            <div><span>수량 · 투입</span><b>${c.qty.toLocaleString("en-US")}주 · ${fmtUsdCompact(c.cost)}</b></div>
            <div><span>최대 낙폭</span><b style="color:${c.mdd !== null && c.mdd < 0 ? "var(--down)" : "var(--text)"}">${c.mdd !== null ? (c.mdd < 0 ? fmtPctSigned(c.mdd, 1) : "0.0%") : "—"}</b></div>
            <div><span>거래일</span><b>${c.tdays !== null ? c.tdays + "일" : "—"}</b></div>
            <div><span>분할 사용</span><b>${c.rounds}회${c.splits ? " · " + c.splits + "분할" + (c.mult > 1 ? "×" + c.mult : "") : ""}</b></div>
            <div><span>종료 방식</span><b>${c.api ? "💼 증권사 체결" : c.auto ? "LOC 자동" : "직접 기록"}</b></div>
          </div>
          <div class="cy-buys">${(c.buys || []).map((r, k) => `<i>${k + 1}회</i> ${mdShort(r.date)} · ${r.qty}주 @ ${usd(r.price)}`).join("<br>")}<br><i>매도</i> ${mdShort(c.sellDate)} · ${c.qty}주 @ ${usd(c.sellPrice)}</div>
          <button class="cy-del" type="button" onclick="deleteTrade(${c.id})">이 사이클 삭제</button>
        </div></details>`;
      });
    });
  }
  const gid = (typeof syncGist === "function") ? syncGist() : "";
  html += `<a class="cy-link" id="cyLink" href="https://gist.github.com/${gid}" target="_blank" rel="noopener"${gid ? "" : " hidden"}>📄 GitHub에 보관된 사이클 기록 보기 ↗</a>`;
  el.innerHTML = html;
}

/* 사이클 기록을 읽기 좋은 Markdown 문서로 (동기화 때 Gist에 함께 저장 → 앱 없이도 평생 열람) */
const CYCLE_MD_FILE = LEV_TICKER + "-cycles.md";
function buildCycleMarkdown() {
  const cs = cyclesNamed(), st = tradeStats(cs);
  const L = [`# ${LEV_TICKER} 무한매수 사이클 기록`, "", "> 앱이 사이클 종료 때마다 자동으로 다시 쓰는 문서입니다. 직접 고치면 다음 동기화 때 덮어써집니다.", ""];
  if (!cs.length) { L.push("아직 종료된 사이클이 없습니다."); return L.join("\n") + "\n"; }
  L.push(`**누적** ${st.n}사이클 · 익절 ${st.wins} · 손절 ${st.losses} · 승률 ${Math.round(st.wins / st.n * 100)}% · 손익 **${fmtUsd0Signed(st.profit)}** (${fmtPctSigned(st.rate)}) · 평균 ${st.avgDays.toFixed(1)}일 · 평균 매수 ${st.avgRounds.toFixed(1)}회`, "");
  L.push(`최근 종료: ${cs[cs.length - 1].name} (${cs[cs.length - 1].sellDate})`, "");
  [...new Set(cs.map(c => c.year))].sort().reverse().forEach(yr => {
    const list = cs.filter(c => c.year === yr), ys = tradeStats(list);
    L.push(`## ${yr}년 · ${ys.n}사이클 · ${fmtUsd0Signed(ys.profit)} (${fmtPctSigned(ys.rate)}) · 승률 ${Math.round(ys.wins / ys.n * 100)}%`, "");
    L.push("| 사이클 | 결과 | 기간 | 일수 | 매수 | 투입 | 평단 → 매도 | 손익 | 수익률 | 최대 낙폭 |", "|:--|:--:|:--|--:|--:|--:|:--|--:|--:|--:|");
    list.slice().reverse().forEach(c => L.push(`| **${c.name}** | ${c.win ? "🟢 익절" : "🔴 손절"} | ${c.firstBuy.slice(5)} → ${c.sellDate.slice(5)} | ${c.days}일 | ${c.rounds}회 | ${fmtUsd0(c.cost)} | ${usd(c.avg)} → ${usd(c.sellPrice)} | ${fmtUsd0Signed(c.profit)} | ${fmtPctSigned(c.pct)} | ${c.mdd !== null ? (c.mdd < 0 ? fmtPctSigned(c.mdd, 1) : "0.0%") : "—"} |`));
    L.push("");
  });
  L.push("_수수료·세금·환율 미반영. 최대 낙폭 = 보유 중 최저 종가 ÷ 평단 − 1._");
  return L.join("\n") + "\n";
}
document.getElementById("sellRecSaveBtn").addEventListener("click", addSellRecord);

function deleteBuyRecord(id) {
  const target = loadBuyRecords().find(r => r.id === id);
  if (target && target.api && apiActive()) { showCopyToast("💼 증권사 체결 기록은 자동으로 맞춰집니다 — 지우려면 위 [자동 등록 끄기] 후 삭제", false); return; }
  if (target && target.autoRecorded) { const sk = loadAutoSkip(); sk.push(target.date); saveAutoSkip(sk); lastAutoRecordMsg = ""; }
  saveBuyRecordsToStorage(loadBuyRecords().filter(r => r.id !== id));
  hideBuyRecMsg();
  renderBuyRecords();
  renderLocGuideCard();
}

function resetBuyRecords() {
  if (!confirm("저장된 매수 기록을 모두 삭제하시겠습니까?")) return;
  saveBuyRecordsToStorage([]);
  hideBuyRecMsg();
  renderBuyRecords();
  renderLocGuideCard();
}

//@@include records:computeBuyRecordsSummary

function renderBuyRecords() {
  try { renderTrades(); } catch (e) {}
  try { renderApiStrips(); } catch (e) {}
  const el = document.getElementById("buyRecordContent");
  if (!el) return;
  const summary = computeBuyRecordsSummary();
  if (summary.rows.length === 0) {
    const tr = loadTrades();
    el.innerHTML = `${lastAutoRecordMsg ? `<div class="banner ok" style="margin:12px 0 0;">🤖 ${lastAutoRecordMsg}</div>` : ""}
      ${lastAutoRecordInfo ? `<div class="auto-info">ℹ️ ${lastAutoRecordInfo}</div>` : ""}
      <div class="fg-empty" style="margin-top:14px;">${tr.length ? (() => { const c = cyclesNamed().pop(); return `🏁 <b data-goto="pg-order" style="cursor:pointer;text-decoration:underline;">${c.name}</b> 사이클 종료 (${fmtKrDate(c.sellDate)} · ${fmtUsd0Signed(c.profit)} · ${fmtPctSigned(c.pct)})<br>신규 진입(전일 종가 이하 LOC)이 체결되면 다음 사이클이 자동으로 시작됩니다.`; })() : "📝 아직 저장된 매수 기록이 없습니다.<br>위에 날짜를 입력하고 저장해 보세요."}</div>`;
    return;
  }
  const rowsHtml = summary.rows.map(r => `
    <tr>
      <td class="num">${r.round}</td>
      <td>${fmtKrDate(r.date)}</td>
      <td class="num">${r.qty.toLocaleString("en-US")}주<span class="sub-price">${fmtUsdCompact(r.amount)}</span></td>
      <td class="num">${usd(r.price)}${r.api ? `<span class="sub-price auto-tag api">${r.synthetic ? "부분매도 후 잔여" : "💼 증권사 체결"}</span>` : r.autoRecorded ? '<span class="sub-price auto-tag">자동 저장</span>' : ''}</td>
      <td class="num">${usd(r.cumAvg)}</td>
      <td class="buyrec-del-cell"><button class="buy-del-btn" type="button" onclick="deleteBuyRecord(${r.id})" aria-label="삭제" title="삭제">✕</button></td>
    </tr>
  `).join("");

  // 평가 기준가: 실시간 현재가 → 없으면 최근 확정 종가
  const refPx = (last⟦Lev⟧Price !== null && !isNaN(last⟦Lev⟧Price)) ? last⟦Lev⟧Price : (last⟦Lev⟧Hist ? last⟦Lev⟧Hist[last⟦Lev⟧Hist.length - 1].y : null);
  const evalPl = refPx !== null ? refPx * summary.totalQty - summary.totalCost : null;
  const evalPct = refPx !== null ? (refPx / summary.avgPrice - 1) * 100 : null;
  const plCol = v => v === null ? "var(--text-faint)" : (v >= 0 ? "var(--up)" : "var(--down)");
  el.innerHTML = `
    <div class="hold-hero">
      <div class="hold-main">
        <div class="l">내 평단가</div>
        <div class="v">${usd(summary.avgPrice)}</div>
        <div class="s">총 ${summary.totalQty.toLocaleString("en-US")}주 · 매수금액 ${fmtUsd0(summary.totalCost)}</div>
      </div>
      <div class="hold-side">
        <div class="hold-mini"><div class="l">평가손익</div><div class="v" style="color:${plCol(evalPl)};">${evalPl !== null ? fmtUsd0Signed(evalPl) : "--"}</div></div>
        <div class="hold-mini"><div class="l">수익률${refPx !== null ? ` · ${usd(refPx)}` : ""}</div><div class="v" style="color:${plCol(evalPct)};">${evalPct !== null ? fmtPctSigned(evalPct) : "시세 조회 필요"}</div></div>
      </div>
    </div>
    ${lastAutoRecordMsg ? `<div class="banner ok" style="margin:12px 0 0;">🤖 ${lastAutoRecordMsg}</div>` : ""}
    ${lastAutoRecordInfo ? `<div class="auto-info">ℹ️ ${lastAutoRecordInfo}</div>` : ""}
    <div class="buysim-sub-title">저장된 매수 기록 · ${summary.rows.length}건</div>
    <table class="stat-table detail-table sim-table">
      <thead><tr><th>회</th><th>매수일</th><th class="num">수량</th><th class="num">매수가</th><th class="num">누적 평단</th><th></th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p class="verify-note">검산: 누적 매수금액 ${usd(summary.totalCost)} ÷ 누적 수량 ${summary.totalQty.toLocaleString("en-US")}주 = 평단가 <b>${usd(summary.avgPrice)}</b> · 수량 아래 금액은 행별 매수금액(수량×매수가)입니다. 평단이 이상하면 매수가가 튀는 행을 찾아 ✕로 삭제 후 다시 입력하세요.</p>
  `;
}

