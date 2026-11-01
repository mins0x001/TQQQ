/* ---------- 📌 LOC 매수/매도 예약 가이드 ---------- */
/* ---------- 2단계 주기: 예상 재개일 ---------- */
//@@include time:nextTradingDay
//@@include format:fmtResume

//@@include loc:locPlanCore
function renderLocGuideCard() {
  const el = document.getElementById("locGuideContent") || document.createElement("div");   // 카드는 삭제 — 계산(lastLocOrder·주문 카드)은 그대로
  if (!last⟦Lev⟧Hist) {
    el.innerHTML = '<div class="fg-empty">데이터를 불러오면 LOC 예약 가이드가 표시됩니다.</div>';
    return;
  }

  const seed = parseFloat(document.getElementById("seedSimSeed1").value);
  const splits = parseInt(document.getElementById("seedSimSplits1").value, 10);
  const multInput = document.getElementById("seedSimCycle1");
  const mult = multInput ? parseInt(multInput.value, 10) : STAGE2_MULT;
  if (!(seed > 0) || !(splits >= 1) || !(mult >= 1)) {
    el.innerHTML = '<div class="fg-empty">시드 분할매수 시뮬레이션의 시드·분할 수·2단계 배수를 올바르게 입력해주세요.</div>';
    return;
  }

  const strategy = getSellAnalysis(last⟦Lev⟧Hist);
  if (!strategy || !strategy.recommendedN) {
    el.innerHTML = '<div class="fg-empty">최근 200봉 데이터로는 매수/매도 목표를 계산할 수 없습니다.</div>';
    return;
  }

  const recommendedN = strategy.recommendedN;
  const sp = stagePlan(seed, splits, recommendedN, mult);
  const sellPctRule = strategy.best.pct, sellPct = sellPctGet(sellPctRule);
  const stopPct = strategy.stopLossByRound ? strategy.stopLossByRound.worstDrawdown : null;

  const summary = computeBuyRecordsSummary();
  const SPLAN = STOP_SPLIT_ON ? stopSplitPlan(summary.rows, sp, last⟦Lev⟧Hist[last⟦Lev⟧Hist.length - 1].y, STRAT2_MODE_RATIO, loadParamMode().stop || null, nyNowParts().date) : null;   // 🛡 분할 손절 순서
  const { rounds, hasPosition, avgPrice, lastRecord, lastClose, lastCloseDate, nextRound, inStage1, canBuyMore, perSplit, buyBasisPrice, buyBasisLabel, bindingLabel, rawBuyQty, buyQty, cycleStatusText, buyReady, cycleInfo, canSell, sellPrice, sellQty, inStopMode, stageLabel } = locPlanCore(last⟦Lev⟧Hist, sp, summary, sellPct, !!(SPLAN && SPLAN.buyHold));
  const stageColor = !hasPosition ? "var(--text-dim)" : (inStage1 ? "var(--glow)" : "var(--amber)");
  const stageBg = !hasPosition ? "rgba(75,90,115,0.14)" : (inStage1 ? "rgba(94,234,212,0.12)" : "rgba(245,165,36,0.12)");
  const stageBorder = !hasPosition ? "var(--border-soft)" : (inStage1 ? "rgba(94,234,212,0.35)" : "rgba(245,165,36,0.4)");

⟦@s020⟧  const buyBoxClass = buyBoxOff ? "loc-box off" : "loc-box buy";
  let buyNote;
  if (!canBuyMore) buyNote = `최대 ${sp.maxRounds}회(1단계 ${sp.n1} + 2단계 ${sp.maxRounds - sp.n1})를 모두 매수해 시드를 다 썼습니다. 매도 후 새 진입을 준비하세요.`;
  else if (hasPosition && !inStage1) buyNote = `${buyBasisLabel} · ${cycleStatusText}`;
  else buyNote = `${buyBasisLabel} · ${nextRound}회차 매수 트리거 (종가가 이 가격 이하일 때 체결)`;

  /* Termux 자동주문 봇용 주문 데이터 (화면에 보이는 숫자와 동일한 값) */
⟦@s021⟧  const exportOrders = [];
  if (!buyBoxOff && buyQty > 0) exportOrders.push({ side: "buy", type: "LOC", price: Number(buyBasisPrice.toFixed(2)), qty: buyQty });
  if (canSell && sellQty > 0) exportOrders.push({ side: "sell", type: "LOC", price: Number(sellPrice.toFixed(2)), qty: sellQty });
  lastLocOrder = {
    schema: "loc-order/1",
    app: `${LEV_TICKER}무한매수`, version: APP_VERSION, release: RELEASE_DATE,
    symbol: LEV_TICKER,
    basis_close_date: lastCloseDate,
    generated_at: new Date().toISOString(),
    stage: stageLabel.replace(/<[^>]+>/g, ""),
    avg_price: hasPosition ? Number(avgPrice.toFixed(4)) : null,
    holding_qty: hasPosition ? summary.totalQty : 0,
    orders: exportOrders,
    /* 🛡 분할 손절 자동 매도(봇 ☑손절 ON 일 때만 사용) — 1일차·2일차 매도 지시 원자료. 봇이 평단·종가·보유로 다시 검증 */
    stop: (SPLAN && (SPLAN.state === "day1" || SPLAN.state === "day2")) ? { day: SPLAN.day, sell_qty: SPLAN.sellQty, next_qty: SPLAN.day === 1 && summary.rows.length > 1 ? summary.rows[summary.rows.length - 2].qty : 0,
      ref_price: Number(SPLAN.refPrice.toFixed(2)), ratio: SPLAN.ratio, rounds: SPLAN.rounds, total: SPLAN.total, since: summary.rows[0].date } : null,
    /* 자동주문 봇이 같은 공식으로 다시 계산해 대조(검수 V2)하는 원자료 */
⟦@s022⟧           seed, splits, mult: sp.mult, stage1_n: sp.n1, max_rounds: sp.maxRounds, per_split_1: sp.per1, per_split_2: sp.per2,
           rounds, recommended_n: recommendedN, in_stop_mode: !!inStopMode, buy_off: !!buyBoxOff,
           records_src: (typeof apiActive === "function" && apiActive()) ? "meritz" : "app", param_mode: (typeof loadParamMode === "function" ? loadParamMode().mode : "rule") }
  };

  try { updateRuleChips(); } catch (e) {}   // 총 회차(1단계+2단계) 표시 갱신
  const heroEl = document.getElementById("locHeroContent");
  let cycleBanner = "";
  if (cycleInfo && cycleInfo.ready && buyQty > 0) {
    cycleBanner = `<div class="cycle-alert ${cycleInfo.firstDay ? "first" : ""}">
      <div class="ca-title">🔔 ${cycleInfo.firstDay ? "오늘이 2단계 매수 재개일입니다" : "2단계 매수 주기 도래 · 매수 가능"}</div>
      <div class="ca-body">지금 LOC 매수 예약을 걸어두세요 → <b>${usd(buyBasisPrice)} × ${buyQty}주</b></div>
      <div class="ca-sub">마지막 매수 후 ${cycleInfo.nextGap}번째 거래일 (주기 ${cycleInfo.cycle}일) · 종가가 예약가 이하일 때만 체결</div>
    </div>`;
  } else if (cycleInfo && !cycleInfo.ready) {
    const pctDone = Math.min(100, cycleInfo.nextGap / cycleInfo.cycle * 100);
    cycleBanner = `<div class="cycle-wait">
      <div class="cw-top"><span>⏳ 2단계 매수 대기</span><b>${cycleInfo.remain}거래일 남음</b></div>
      <div class="cw-bar"><i style="width:${pctDone.toFixed(0)}%"></i></div>
      <div class="cw-sub">예상 재개 <b>${fmtResume(cycleInfo.resumeDate)}</b> · 그날 이 카드가 🔔 알림으로 바뀝니다 (미국 휴장일은 반영 안 됨)</div>
    </div>`;
  }
  if (cycleInfo && cycleInfo.ready && buyQty > 0) document.title = "🔔 " + document.title.replace(/^🔔 /, "");
  else document.title = document.title.replace(/^🔔 /, "");
  if (heroEl) heroEl.innerHTML = `
    ${cycleBanner}
    <span class="loc-status-badge" style="color:${stageColor};background:${stageBg};border-color:${stageBorder};">${stageLabel}</span>
    ${inStopMode ? `<span class="loc-status-badge" style="color:var(--down);background:rgba(240,71,90,0.12);border-color:rgba(240,71,90,0.4);margin-left:6px;">⚠ 손절모드 (평단 -${((1 - STRAT2_MODE_RATIO) * 100).toFixed(0)}% 이탈)</span>` : ""}
⟦@s023⟧    <div class="loc-grid">
      <div class="${buyBoxClass}">
        <div class="loc-tag">LOC 매수 예약가</div>
        <div class="loc-price copyable" role="button" tabindex="0" data-copy="${buyBasisPrice.toFixed(2)}" data-label="매수가">${usd(buyBasisPrice)}</div>
        <div class="loc-qty ${buyQty > 0 ? "copyable" : ""}" ${buyQty > 0 ? `role="button" tabindex="0" data-copy="${buyQty}" data-label="매수수량"` : ""}>${buyQty > 0 ? buyQty.toLocaleString("en-US") + "주" : "매수 불가"}</div>
        <div class="loc-sub">${LOC_QTY_UNIT}주 단위 내림${canBuyMore ? ` (${inStage1 ? "1분할" : "2단계 1회 " + fmtUsd0(perSplit)} 기준 ${rawBuyQty.toLocaleString("en-US")}주${buyQty > 0 ? ` → 실투입 ${usd(buyQty * buyBasisPrice)}` : ` → ${LOC_QTY_UNIT}주 미만`})` : ""}</div>
        <div class="loc-sub">${buyNote}</div>
      </div>
      <div class="loc-box ${canSell ? "sell" : "off"}">
        <div class="loc-tag">LOC 매도 예약가 (익절)</div>
        <div class="loc-price ${canSell ? "copyable" : ""}" ${canSell ? `role="button" tabindex="0" data-copy="${sellPrice.toFixed(2)}" data-label="매도가"` : ""}>${canSell ? usd(sellPrice) : "--"}</div>
        <div class="loc-qty">${canSell ? sellQty.toLocaleString("en-US") + "주 (전량)" : "보유 수량 없음"}</div>
        <div class="loc-sub">${canSell ? `평단가 ${usd(avgPrice)} 대비 +${sellPct.toFixed(2)}%` : "매수 기록을 추가하면 매도 목표가가 계산됩니다."}</div>
      </div>
    </div>
    <div class="sell-row"><div class="sell-adj" data-cur="${sellPct}"><button type="button" data-sellpct="-1" aria-label="매도 % 내리기">▼</button><span class="pv">+${sellPct.toFixed(2)}%<small>${sellPct !== sellPctRule ? "수동" : "규칙 기반"}</small></span><button type="button" data-sellpct="1" aria-label="매도 % 올리기">▲</button><button type="button" class="rs" data-sellpct="0" ${sellPct !== sellPctRule ? "" : "disabled"}>↺ 초기화</button></div><div class="loc-sub">규칙 기반 +${sellPctRule.toFixed(2)}% · ▲▼ 0.5%씩 · 모든 기기 영구 저장</div></div>
    <p class="copy-hint">👆 매수가·매수수량·매도가 숫자를 누르면 각각 복사됩니다 ($·쉼표 없이 숫자만)</p>
  `;
  el.innerHTML = `
    <div class="loc-moved-note">LOC 매수·매도 예약가와 수량은 <b data-goto="pg-order" style="cursor:pointer;text-decoration:underline;">⚡ 주문 탭 · 오늘의 LOC 주문</b> 카드에 있습니다</div>
    <div class="kv-row"><span class="k">매수 조건 ① 평단가 이하</span><span class="v">${hasPosition ? usd(avgPrice) + (avgPrice <= lastClose ? " ← 적용" : "") : "보유 없음 (해당 없음)"}</span></div>
    <div class="kv-row"><span class="k">매수 조건 ② 전일 확정 종가 이하 (${lastCloseDate})</span><span class="v">${usd(lastClose)}${!hasPosition || lastClose < avgPrice ? " ← 적용" : ""}</span></div>
    <div class="kv-row"><span class="k">입력된 시드 / 분할 수</span><span class="v">${fmtUsd0(seed)} / ${splits}분할 (1분할 ${fmtUsd0(sp.per1)})</span></div>
    <div class="kv-row"><span class="k">2단계 분할 배수 (대기 없음)</span><span class="v">×${sp.mult} → ${sp.splits * sp.mult}분할 · 1회 ${fmtUsd0(sp.per2)}</span></div>
    <div class="kv-row"><span class="k">AI 추천 분할매수 회차 (1단계)</span><span class="v">${recommendedN}회${recommendedN > sp.n1 ? ` → 분할 수로 제한 ${sp.n1}회` : ""}</span></div>
    <div class="kv-row"><span class="k">현재 매수 회차 (저장된 기록 기준)</span><span class="v">${rounds}회 / 최대 ${sp.maxRounds}회 (${sp.n1} + ${sp.maxRounds - sp.n1})</span></div>
    <div class="kv-row"><span class="k">이번 회차 1회 매수금</span><span class="v">${canBuyMore ? fmtUsd0(perSplit) + (inStage1 ? " (1단계)" : " (2단계)") : "시드 소진"}</span></div>
    ${hasPosition ? `<div class="kv-row"><span class="k">현재 평단가 / 보유 수량</span><span class="v">${usd(avgPrice)} · ${summary.totalQty.toLocaleString("en-US")}주</span></div>` : ""}
    ${hasPosition ? `<div class="kv-row"><span class="k">손절모드 기준가 (평단×${STRAT2_MODE_RATIO.toFixed(2)})</span><span class="v" style="color:var(--down);">${usd(avgPrice * STRAT2_MODE_RATIO)}</span></div>` : ""}
    ${stopPct !== null && hasPosition && !canBuyMore ? `<div class="kv-row"><span class="k">손절 참고선 (평단가 대비)</span><span class="v" style="color:var(--down);">${fmtPctSigned(stopPct)}</span></div>` : ""}
    <p class="desc" style="margin:12px 0 0;">LOC(지정가-종가) 주문은 지정한 가격보다 유리하거나 같은 종가가 형성될 때만 체결됩니다. 매수 LOC는 표시된 가격 이하로 종가가 형성될 때, 매도 LOC는 표시된 가격 이상으로 종가가 형성될 때 체결되도록 예약하는 용도입니다. 매수 예약가는 평단가와 전일 확정 종가 중 더 낮은 값이며(평단 &amp; 전일종가 이하 조건), 매수 회차·단계 판정은 "나의 매수 기록" 카드에 저장된 실제 매수 내역을, 시드·분할 수·2단계 배수(대기 없이 조건 충족 시마다 시드÷(분할×배수)씩)는 시드 분할매수 시뮬레이션의 입력값을 사용합니다.</p>
  `;
}

/* 🛡 분할 손절 매도 안내 카드 (계산 = stopSplitPlan · 여기서는 문구·버튼만) — 1일차 손절 매도 → 2일차 손절 매도 → 3일차 평소 무한매수 규칙 매수 */
function stopSplitHtml(P) {
  if (P.state === "none") return "";
  const u = v => fmtUsd0(v), px = v => "$" + v.toFixed(2), head = `<div class="kv-row"><span class="k">🛡 분할 손절 매도 (총 ${P.total}회)</span>`;
  if (P.state === "wait") return `${head}<span class="v">소진 뒤 손절선 ${px(P.line)} 이하 → 1일차·2일차 손절 매도 → 3일차 평소 매수 (지금 ${P.rounds}/${P.total}회)</span></div>`;
  if (P.state === "hold") return `${head}<span class="v">분할 소진 · 종가 &gt; 손절선 ${px(P.line)} → 익절 대기</span></div>`;
  const box = inner => `<div style="margin:8px 0;padding:10px 11px;border-radius:12px;border:1px solid rgba(240,71,90,0.5);background:rgba(240,71,90,0.08);font-size:12.5px;line-height:1.6;">${inner}</div>`;
  if (P.state === "wait2") return box(`<b style="color:var(--down);">🛡 분할 손절 · 1일차 매도 완료</b> — 다음 거래일 <b>2일차: 다음 1회분 손절 매도</b> (그동안 매수 멈춤)`);
  if (P.state === "wait3") return box(`<b style="color:var(--down);">🛡 분할 손절 · 2일차 매도 완료</b> — 다음 거래일 <b>3일차: 평소 무한매수 규칙으로 매수</b> (그동안 매수 멈춤)`);
  const col = P.realized >= 0 ? "var(--up)" : "var(--down)", why = P.day === 1 ? `분할 소진(${P.rounds}/${P.total}회) + 종가 ≤ 손절선 ${px(P.line)}` : "1일차에 이어 계속";
  return box(`<b style="color:var(--down);">🔴 분할 손절 ${P.day}일차</b> · ${why}<br>
    ① 마지막 1회분 <b>${P.sellQty.toLocaleString("en-US")}주</b> 매도 (기준 ${px(P.refPrice)} · 약 ${u(P.proceeds)} · 손익 <b style="color:${col};">${fmtUsd0Signed(P.realized)}</b>)<br>
    ② 남는 ${P.keepQty.toLocaleString("en-US")}주${P.keepAvg ? ` · 평단 ${px(P.keepAvg)}` : ""} · 회차 ${P.afterRounds}/${P.total}<br>
    ③ ${P.day === 1 ? "내일 2일차: 다음 1회분 손절 매도 → 그다음 3일차" : "다음 거래일 3일차"}: 평소 규칙(평단 &amp; 전일 종가 이하 LOC)으로 <b>${P.buyRound}회차 ${u(P.rebuyAmt)}</b> 매수
    <button type="button" data-stopstep="${P.day}" style="margin-top:6px;padding:7px 12px;border-radius:9px;border:1px solid rgba(240,71,90,0.6);background:rgba(240,71,90,0.15);color:var(--text);font-weight:700;cursor:pointer;">✅ ${P.day}일차 손절 매도 완료</button>
    <div style="margin-top:4px;color:var(--text-dim);font-size:11.5px;">직접 매도(MOC·LOC 낮은 가격)한 뒤 누르세요 · 마지막 매수 기록이 지워져 평단·회차가 다시 계산되고 매수는 3일차까지 멈춥니다 (증권사 연동 중이면 기록은 체결로 자동 반영) · 자동주문 봇은 아직 손절 매도를 내지 않음</div>`);
}
/* 엔진 카드(①규칙 기반 적용 중 ↗)에 넣는 분할 손절 안내 — 지금 적용 중인 시드·분할 수 기준으로 계산 */
function stopSplitLive() {
  const h = last⟦Lev⟧Hist; if (!STOP_SPLIT_ON || !h || h.length < 3) return "";
  const seed = parseFloat(document.getElementById("seedSimSeed1").value), splits = parseInt(document.getElementById("seedSimSplits1").value, 10), mult = parseInt(document.getElementById("seedSimCycle1").value, 10) || STAGE2_MULT;
  const a = getSellAnalysis(h); if (!(seed > 0) || !(splits >= 1) || !a || !a.recommendedN) return "";
  const sp = stagePlan(seed, splits, a.recommendedN, mult);
  return stopSplitHtml(stopSplitPlan(computeBuyRecordsSummary().rows, sp, h[h.length - 1].y, STRAT2_MODE_RATIO, loadParamMode().stop || null, nyNowParts().date));
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-stopstep]"); if (!b) return;
  const day = +b.dataset.stopstep, recs = sortedBuyRecords(), last = recs[recs.length - 1]; if (!last) return;
  if (!confirm(`${day}일차 손절 매도를 마쳤나요?\n마지막 매수 기록(${last.qty}주 @ $${(+last.price).toFixed(2)})을 지우고, 매수는 3일차까지 멈춥니다.`)) return;
  saveParamMode({ stop: { n: day, date: nyNowParts().date, since: recs[0].date } });
  if (last.api && typeof apiActive === "function" && apiActive()) showCopyToast("💼 증권사 연동 중 — 매도 체결이 반영되면 기록이 자동으로 맞춰집니다", true);
  else deleteBuyRecord(last.id);
  renderLocGuideCard(); try { renderVolEngineCard(last⟦Lev⟧Hist); } catch (x) {}
});

/* ---------- 자동주문 파일 저장 (Termux 봇 연동) ---------- */
let lastLocOrder = null;
//@@include lib:exportLocOrder
document.addEventListener("click", e => { if (e.target.closest("[data-export-loc]")) exportLocOrder(); });

/* ---------- 숫자 탭 복사 (LOC 가이드) ---------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) {}
  // 대체: 파일로 연 HTML·일부 모바일 브라우저는 클립보드 API가 막혀 있어 임시 입력칸으로 복사
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}
//@@include lib:showCopyToast
//@@include lib:handleCopyTap
document.addEventListener("click", e => {
  const el = e.target.closest(".copyable[data-copy]");
  if (el) handleCopyTap(el);
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".copyable[data-copy]")) { e.preventDefault(); handleCopyTap(e.target); }
});

["seedSimSplits1", "seedSimCycle1"].forEach(id => document.getElementById(id).addEventListener("input", () => { saveParamMode({ mode: "manual" }); updateRuleChips(); }));
document.getElementById("seedSimSeed1").addEventListener("input", () => { saveParamMode(); updateRuleChips(); });
document.getElementById("buyRecSaveBtn").addEventListener("click", addBuyRecord);
document.getElementById("buyRecResetBtn").addEventListener("click", resetBuyRecords);
setDefaultBuyDate(false);
renderBuyRecords();
renderLocGuideCard();

