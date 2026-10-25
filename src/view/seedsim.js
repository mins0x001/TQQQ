/* ---------- 시드 분할매수 시뮬레이션 (시드 ÷ 분할수 = 1회 매수금, 종가 기준 정수 주식) ---------- */
//@@include strategy:simulateSeedBacktest

//@@include format:fmtUsd0Signed
//@@include format:fmtUsdCompact
//@@include format:fmtUsd0

function renderSeedSimCard(n, requirePrevDown) {
  const el = document.getElementById("seedSimContent" + n);
  if (!el || !last⟦Lev⟧Hist) return;

  const seed = parseFloat(document.getElementById("seedSimSeed" + n).value);
  const splits = parseInt(document.getElementById("seedSimSplits" + n).value, 10);
  const cycleInput = document.getElementById("seedSimCycle" + n);
  const cycleDays = cycleInput ? parseInt(cycleInput.value, 10) : 1;
  if (!(seed > 0) || !(splits >= 1) || !(cycleDays >= 1)) {
    el.innerHTML = '<div class="fg-empty">시드·분할 수·2단계 배수를 올바르게 입력해주세요.</div>';
    return;
  }

  const r = simulateSeedBacktest(last⟦Lev⟧Hist, seed, splits, requirePrevDown, cycleDays);
  if (!r) {
    el.innerHTML = '<div class="fg-empty">최근 200봉 내 연속 하락 구간이 없어 시뮬레이션할 수 없습니다.</div>';
    return;
  }

  const col = v => v >= 0 ? "color:var(--up);" : "color:var(--down);";
  const retOnSeed = r.grandTotal / r.seed * 100;

  const rowsHtml = r.trades.map(t => {
    const label = t.outcome === "profit" ? "익절" : t.outcome === "loss" ? "손절" : "보유중(평가)";
    const lc = t.outcome === "profit" ? "var(--up)" : t.outcome === "loss" ? "var(--down)" : "var(--text-faint)";
    const buysHtml = t.buys.map(b => {
      const phaseTag = b.round <= r.n1 ? "" : `<span class="bt">2단계</span>`;
      return `<div class="buy-event"><span class="bn">${b.round}회</span><span class="bd">${fmtCompactDate(b.x)}</span><span class="bp">${usd(b.price)}</span>${phaseTag}</div>`;
    }).join("");
    return `
      <tr>
        <td class="buy-events-cell">${buysHtml}<span class="sub-price">평단 ${usd(t.avg)} · 총 ${t.rounds}회</span></td>
        <td>${t.exitX ? fmtCompactDate(t.exitX) : "--"}<span class="sub-price" style="color:${lc};">${label}</span>${t.exitPrice !== null ? `<span class="sub-price">${usd(t.exitPrice)}</span>` : ""}</td>
        <td class="num" style="${col(t.pnl)}">${fmtUsd0Signed(t.pnl)}<span class="sub-price" style="${col(t.pnl)}">${fmtPctSigned(t.pnlPct)}</span></td>
      </tr>
    `;
  }).join("");

  el.innerHTML = `
    <div class="hl-grid">
      <div class="hl-item star"><div class="hl-label">총 수익금 (실현+평가)</div><div class="hl-value" style="${col(r.grandTotal)}">${fmtUsd0Signed(r.grandTotal)}</div></div>
      <div class="hl-item line"><div class="hl-label">시드 대비 수익률</div><div class="hl-value" style="${col(retOnSeed)}">${fmtPctSigned(retOnSeed)}</div></div>
    </div>
    <div class="kv-row"><span class="k">적용 규칙</span><span class="v">최대 ${r.maxRounds}회 매수 · +${r.sellPct.toFixed(2)}% 익절 · ${r.stopPct !== null ? fmtPctSigned(r.stopPct) + " 손절" : "손절선 없음"}</span></div>
    <div class="kv-row"><span class="k">매매 결과</span><span class="v">익절 ${r.profit.length} · 손절 ${r.loss.length} · 보유중 ${r.open.length} (총 ${r.trades.length}건)</span></div>
    <div class="kv-row"><span class="k">1건 최대 투입금</span><span class="v">${fmtUsd0(r.maxInvested)} (시드의 ${(r.maxInvested / r.seed * 100).toFixed(1)}%)</span></div>
    <table class="stat-table trade-table" style="margin-top:12px;">
      <thead><tr><th>매수 내역 (회차·날짜·종가)</th><th>청산</th><th class="num">손익</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p class="desc" style="margin:12px 0 0;">1분할(시드÷분할수)어치를 종가로 정수 주식만큼 매수하고, 손익은 재투자 없이 고정 분할금액으로 계산했습니다. ⟦LEV⟧ 매도 목표는 ${SELL_SWEEP_MIN}~${SELL_SWEEP_MAX}% 구간(${SELL_SWEEP_STEP}%p 간격)을 전수 탐색해 기대수익률이 가장 높은 값을 사용합니다. AI 추천 분할매수 회차(${r.n1}회)까지는 1분할(시드÷${r.splits})씩, 그 뒤 2단계는 기다리지 않고 조건이 충족될 때마다 시드÷${r.splits * r.mult}(${r.splits}분할×${r.mult})씩 매수합니다([2단계] 표시 · 최대 ${r.maxRounds}회 = 시드 전액). 수수료·세금·슬리피지는 반영하지 않았고, 종가 기준 체결을 가정한 과거 데이터 시뮬레이션이므로 실제 성과를 보장하지 않습니다.</p>
  `;
}


//@@include strategy:simTrades
function renderSeedSimCards() {
  renderSeedSimCard(1, true); // 종가 < 평단 그리고 종가 < 전일 종가
}

[["seedSimSeed1", 1, true], ["seedSimSplits1", 1, true], ["seedSimCycle1", 1, true]].forEach(([id, n, prevDown]) => {
  const inp = document.getElementById(id);
  if (inp) inp.addEventListener("input", () => renderSeedSimCard(n, prevDown));
});

["seedSimSeed1", "seedSimSplits1", "seedSimCycle1"].forEach(id => {
  const inp = document.getElementById(id);
  if (inp) inp.addEventListener("input", renderLocGuideCard);
});

