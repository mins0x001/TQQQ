/* ======================== 💰 매도 · 수익 기록 (평균단가법) ======================== */
const TRADES_KEY = "qld_trades_v1";
function loadTrades() { try { const a = JSON.parse(localStorage.getItem(TRADES_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function saveTrades(a) { try { localStorage.setItem(TRADES_KEY, JSON.stringify(a.slice().sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : String(x.id).localeCompare(String(y.id))))); } catch (e) {} }
const pnlCol = v => v === null || v === undefined ? "var(--text-faint)" : v > 0 ? "var(--up)" : v < 0 ? "var(--down)" : "var(--text-dim)";
const usd0s = n => (n === null || n === undefined || isNaN(n)) ? "--" : (n >= 0 ? "+" : "-") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
function validBuys() { return guideResolveRecords(guideCtx ? guideCtx.hist : null).filter(r => r.price !== null && r.qty > 0); }
function sellCloseOn(dateStr) {
  const ctx = guideCtx;
  if (!ctx || !ctx.hist || !ctx.hist.length) return { error: "시세를 불러온 뒤 다시 시도하거나 매도가를 직접 입력해주세요." };
  const hist = ctx.hist, last = hist[hist.length - 1], lastDate = fmtDateFull(last.x);
  if (dateStr > lastDate) {
    if (dateStr === nyNowParts().date && ctx.livePrice > 0) return { price: ctx.livePrice, note: "현재가 자동(장중)" };
    return { error: "그날 종가가 아직 없습니다. 매도가를 직접 입력해주세요." };
  }
  const near = findNearestBefore(hist, new Date(dateStr).getTime());
  if (!near) return { error: "불러온 데이터 범위 밖입니다. 매도가를 직접 입력해주세요." };
  return { price: near.y, note: "종가 자동" };
}
function addSellRecord() {
  const msg = document.getElementById("sellRecMsg");
  const say = (t, ok) => { msg.textContent = t; msg.style.color = ok ? "var(--glow)" : "var(--amber)"; };
  const dateStr = document.getElementById("sellRecDate").value;
  const qIn = document.getElementById("sellRecQty").value.trim(), pIn = document.getElementById("sellRecPrice").value.trim();
  const valid = validBuys();
  if (!valid.length) { say("매수 기록이 없어 팔 수량이 없습니다.", false); return; }
  if (!dateStr) { say("매도 날짜를 선택해주세요.", false); return; }
  const pos = positionAt(valid, dateStr);
  if (!(pos.qty > 0)) { say(`${dateStr} 기준 보유 수량이 없습니다.`, false); return; }
  const qty = qIn === "" ? pos.qty : parseInt(qIn, 10);
  if (!(qty > 0)) { say("매도 수량을 확인해주세요.", false); return; }
  if (qty > pos.qty) { say(`${dateStr} 기준 보유 ${pos.qty}주보다 많이 팔 수 없습니다.`, false); return; }
  let price = pIn !== "" ? parseFloat(pIn) : null, note = "직접 입력";
  if (price === null) { const r = sellCloseOn(dateStr); if (r.error) { say(r.error, false); return; } price = r.price; note = r.note; }
  if (!(price > 0)) { say("매도가를 확인해주세요.", false); return; }
  const avg = pos.cost / pos.qty, cost = avg * qty, proceeds = qty * price;
  const t = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: dateStr, qty, price, avg, cost, proceeds,
              profit: proceeds - cost, pct: (price / avg - 1) * 100, holdBefore: pos.qty, note };
  const all = loadTrades(); all.push(t); saveTrades(all);
  document.getElementById("sellRecQty").value = ""; document.getElementById("sellRecPrice").value = "";
  say(`매도 기록 저장: ${qty}주 × ${usd(price)} = ${fmtUsd0(proceeds)} · 그때 평단 ${usd(avg)} · 수익금 ${usd0s(t.profit)} · 수익률 ${fmtPctSigned(t.pct)} · 남은 보유 ${pos.qty - qty}주`, true);
  if (guideCtx) renderGuideResult(); else renderRecordsCard();
}
function deleteTrade(id) {
  const t = loadTrades().find(x => x.id === id);
  if (!t) return;
  if (!confirm(`${t.date} 매도 ${t.qty}주 기록을 지울까요? 보유 수량이 그만큼 다시 늘어납니다.`)) return;
  saveTrades(loadTrades().filter(x => x.id !== id));
  if (guideCtx) renderGuideResult(); else renderRecordsCard();
}
function tradeStats(trades) {
  const n = trades.length, cost = trades.reduce((x, t) => x + t.cost, 0), profit = trades.reduce((x, t) => x + t.profit, 0);
  const wins = trades.filter(t => t.profit > 0).length;
  return { n, cost, profit, wins, rate: cost > 0 ? profit / cost * 100 : null, avgPct: n ? trades.reduce((x, t) => x + t.pct, 0) / n : null, qty: trades.reduce((x, t) => x + t.qty, 0) };
}
function renderTrades() {
  const sumEl = document.getElementById("tradeSummary"), el = document.getElementById("tradeContent");
  if (!sumEl || !el) return;
  const dEl = document.getElementById("sellRecDate");
  if (dEl && !dEl.value) {
    if (guideCtx && guideCtx.hist && guideCtx.hist.length) dEl.value = fmtDateFull(guideCtx.hist[guideCtx.hist.length - 1].x);
    else { const y = new Date(Date.now() - 864e5); dEl.value = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`; }
  }
  const trades = loadTrades(), st = tradeStats(trades);
  sumEl.innerHTML = `<div class="pl-tiles">
      <div class="pl-tile"><div class="l">실현 수익금</div><div class="v" style="color:${pnlCol(st.n ? st.profit : null)};">${st.n ? usd0s(st.profit) : "--"}</div><div class="s">매도 원가 ${st.n ? fmtUsd0(st.cost) : "--"}</div></div>
      <div class="pl-tile"><div class="l">실현 수익률</div><div class="v" style="color:${pnlCol(st.rate)};">${st.rate !== null ? fmtPctSigned(st.rate) : "--"}</div><div class="s">매도 평균 ${st.avgPct !== null ? fmtPctSigned(st.avgPct) : "--"}</div></div>
      <div class="pl-tile"><div class="l">매도</div><div class="v">${st.n}회</div><div class="s">${st.qty}주 · 승률 ${st.n ? Math.round(st.wins / st.n * 100) + "%" : "--"}</div></div>
    </div>`;
  if (!trades.length) { el.innerHTML = '<div class="empty" style="margin-top:12px;">아직 매도 기록이 없습니다. 평생매수는 매도 주문이 없어, 실제로 판 경우에만 위에서 기록하세요.</div>'; return; }
  const rows = trades.slice().reverse().map(t => `<tr>
      <td>${fmtCompactDate(new Date(t.date).getTime())}<span class="sell-tag">보유 ${t.holdBefore}주 중</span></td>
      <td class="num">${t.qty}주<span class="sub-price">${fmtUsd0(t.proceeds)}</span></td>
      <td class="num">${usd(t.price)}<span class="sub-price">평단 ${usd(t.avg)}</span></td>
      <td class="num" style="color:${pnlCol(t.profit)};font-weight:800;">${usd0s(t.profit)}<span class="sub-price" style="color:${pnlCol(t.pct)};">${fmtPctSigned(t.pct)}</span></td>
      <td><button class="guide-del" type="button" onclick="deleteTrade('${t.id}')" aria-label="삭제" title="삭제">✕</button></td>
    </tr>`).join("");
  el.innerHTML = `<div class="sub-title"><span class="n">≡</span>매도 기록<span class="tag">${trades.length}건 · 최근 순</span></div>
    ${tableWrap(`<table class="stat-table detail-table rec-table trade-table"><colgroup><col style="width:23%"><col style="width:20%"><col style="width:23%"><col style="width:23%"><col style="width:11%"></colgroup><thead><tr><th>매도일</th><th>수량·금액</th><th>매도가</th><th>수익금·률</th><th></th></tr></thead><tbody>${rows}</tbody></table>`)}
    <div class="note">검산: 수익금 = 매도 수량 × (매도가 − 그때 평단). 실현 수익률 = 수익금 합계 ${usd0s(st.profit)} ÷ 매도 원가 합계 ${fmtUsd0(st.cost)}. 수수료·세금 미반영.</div>`;
}
document.getElementById("sellRecSaveBtn").addEventListener("click", addSellRecord);
renderTrades();

