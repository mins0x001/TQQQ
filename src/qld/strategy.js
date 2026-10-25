/* ---------- QLD 평생 매수 전략 (매도 없음) ---------- */
//@@include qld:findAccumulateBuys
//@@include qld:evaluateAccumulateBuys
//@@include qld:sweepAccumulateStrategy
//@@include qld:analyzeAccumulateStrategy
/* ---------- LOC 가이드 전용: 400봉 워크포워드 AI 최적 전략 ----------
   200봉 한 구간에서 수익률만 보고 하락폭을 고르면 그 구간에만 맞춰진 값(과최적화)이 나오기 쉽다.
   그래서 400봉을 전반 200봉 / 후반 200봉으로 나눠 같은 하락폭을 양쪽에서 각각 시뮬레이션하고,
   '두 구간 중 나쁜 쪽 수익률'을 60%, '400봉 전체 수익률'을 40% 비중으로 더한 점수가 가장 높은 값을 채택한다.
   → 한 시기에만 잘 맞는 값이 아니라, 서로 다른 두 시기에서 모두 버티는 하락폭이 선택된다. */
//@@include qld:accumulateStats

//@@include qld:analyzeAiStrategy

function renderAccumulateCard(hist) {
  const el = document.getElementById("qldAccumulateContent");
  if (!el) return;
  const ai = analyzeAiStrategy(hist);
  if (!ai) { el.innerHTML = '<div class="fg-empty">유효한 하락 매수 시점이 없어 분석할 수 없습니다.</div>'; return; }
  const best = ai.best;
  const bars = ai.bars;

  // 금액(평가손익) 기준으로 가장 유리한 후보 — 수익률 기준 채택값과 비교용
  const profitPick = ai.rows.reduce((a, b) => (b.profitAmount > a.profitAmount ? b : a));
  const key = (r) => (r.score === null ? -Infinity : r.score);
  const top = ai.rows.filter(r => r.score !== null).sort((a, b) => key(b) - key(a)).slice(0, 5);
  if (!top.some(r => r.pct === best.pct)) top.unshift(best);

  const candRows = top.map(r => {
    const on = r.pct === best.pct;
    return `<tr${on ? ' style="background:rgba(94,234,212,0.10);"' : ""}>
      <td><b style="color:${on ? "var(--glow)" : "var(--text)"};">-${r.pct.toFixed(1)}%</b>${on ? '<span class="sub-price" style="color:var(--glow);">채택</span>' : ""}</td>
      <td class="num">${r.shares}주</td>
      <td class="num" style="color:${signColor(r.r1)};">${fmtPctSigned(r.r1, 1)}</td>
      <td class="num" style="color:${signColor(r.r2)};">${fmtPctSigned(r.r2, 1)}</td>
      <td class="num" style="color:${signColor(r.returnPct)};">${fmtPctSigned(r.returnPct, 1)}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="fg-meta-row" style="margin-top:0;">
      ${metaTile("채택 하락 목표", "-" + best.pct.toFixed(1) + "%", "var(--glow)")}
      ${metaTile("매수 횟수 (" + bars + "봉)", best.shares + "주")}
      ${metaTile("평단가", usd(best.avgPrice), "var(--amber)")}
      ${metaTile("최근 종가", usd(best.lastClose))}
    </div>
    <div class="kv-list">
      <div class="kv-row"><span class="k">평가금액 (${best.shares}주 × 최근 종가)</span><span class="v">${usd(best.currentValue)}</span></div>
      <div class="kv-row"><span class="k">평가손익</span><span class="v" style="color:${signColor(best.profitAmount)};">${fmtMoneySigned(best.profitAmount)}</span></div>
      <div class="kv-row"><span class="k">평단가 대비 수익률 (${bars}봉)</span><span class="v" style="color:${signColor(best.returnPct)};">${fmtPctSigned(best.returnPct)}</span></div>
      <div class="kv-row"><span class="k">전반 ${ai.halfBars}봉 / 후반 ${bars - ai.halfBars}봉</span><span class="v"><span style="color:${signColor(best.r1)};">${fmtPctSigned(best.r1, 1)}</span> / <span style="color:${signColor(best.r2)};">${fmtPctSigned(best.r2, 1)}</span></span></div>
      <div class="kv-row"><span class="k">평균 매수 간격 / 최장 무매수</span><span class="v">${best.avgGap === null ? "--" : best.avgGap.toFixed(0) + "일"} / ${best.maxGap === null ? "--" : best.maxGap + "일"}</span></div>
    </div>
    <div class="note"><b>매수 규칙:</b> 기준가(최초에는 구간 시작 고점) 대비 <b style="color:var(--glow);">-${best.pct.toFixed(1)}%</b> 하락할 때마다 1주 매수 → 체결가가 새 기준가. 하락 목표 1~30%를 0.5%p 단위(${ai.candidates}개 후보)로 ${bars}봉에 시뮬레이션한 뒤 <b>전반 ${ai.halfBars}봉·후반 ${bars - ai.halfBars}봉에서 각각 재검증</b>해, 점수(나쁜 쪽 구간 × 0.6 + 전체 × 0.4)가 가장 높은 값을 채택했습니다.<br>
    ${profitPick.pct === best.pct ? `평가손익 <b>금액</b> 기준으로도 -${profitPick.pct.toFixed(1)}%가 가장 유리했습니다.` : `평가손익 <b>금액</b> 기준 최적은 -${profitPick.pct.toFixed(1)}% (${profitPick.shares}주, 평단 ${usd(profitPick.avgPrice)}, ${fmtMoneySigned(profitPick.profitAmount)}). 목표를 낮출수록 매수 횟수↑·평단↑, 높일수록 매수 횟수↓·평단↓ 경향이 있습니다.`}</div>

    <div class="sub-title"><span class="n">≡</span>후보 비교<span class="tag">점수 상위 ${top.length}개</span></div>
    ${tableWrap(`<table class="stat-table detail-table"><thead><tr><th>하락 목표</th><th class="num">매수</th><th class="num">전반</th><th class="num">후반</th><th class="num">${bars}봉</th></tr></thead><tbody>${candRows}</tbody></table>`)}
    <div class="note">전반·후반 수익률이 <b>둘 다 안정적으로 높은</b> 값이 좋은 후보입니다. 한쪽만 크게 높고 다른 쪽이 낮다면 그 시기에만 맞았던 값일 가능성이 큽니다.</div>

    <div class="note">매도를 전제하지 않는 장기 누적 매수 시뮬레이션이며, 최근 ${bars}봉 과거 데이터 기준 참고값입니다.</div>`;
}

/* ---------- CCI 카드 / 라인 차트 ---------- */
function renderCciCard(containerId, cciHist, color, label) {
  const el = document.getElementById(containerId);
  if (!cciHist || cciHist.length === 0) { el.innerHTML = '<div class="fg-empty">데이터가 부족하여 CCI를 계산할 수 없습니다.</div>'; return null; }
  const last = cciHist[cciHist.length - 1];
  let high = -Infinity, low = Infinity, highIdx = 0, lowIdx = 0;
  cciHist.forEach((d, idx) => { if (d.y > high) { high = d.y; highIdx = idx; } if (d.y < low) { low = d.y; lowIdx = idx; } });
  const avg = cciHist.reduce((a, d) => a + d.y, 0) / cciHist.length;
  el.innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:${color};">${fmtNum(last.y, 1)}</div>
      <div class="fg-badge" style="color:${color};background:${color}1A;border-color:${color}59;">${label}</div>
    </div>
    <div class="fg-meta-row">
      <div class="fg-meta-item"><div class="fg-meta-label">최고점</div><div class="fg-meta-value" style="color:var(--up);">${fmtNum(high, 1)}</div><div class="fg-meta-label" style="margin:4px 0 0;">${fmtShortDate(cciHist[highIdx].x)}</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">최저점</div><div class="fg-meta-value" style="color:var(--down);">${fmtNum(low, 1)}</div><div class="fg-meta-label" style="margin:4px 0 0;">${fmtShortDate(cciHist[lowIdx].x)}</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">평균점</div><div class="fg-meta-value">${fmtNum(avg, 1)}</div></div>
    </div>
    <div class="fg-chart-wrap">${renderLineChartSvg(cciHist, color, { refLines: [100, 0, -100] })}</div>`;
  return last.y;
}

let __gradSeq = 0;
function renderLineChartSvg(hist, color = "#2FD9C4", opts = {}) {
  const W = 480, H = 170, padL = 42, padR = 10, padT = 8, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xs = hist.map(d => d.x), ys = hist.map(d => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = (maxY - minY) * 0.08 || 1;
  minY -= pad; maxY += pad;
  const xScale = (x) => padL + ((x - minX) / (maxX - minX || 1)) * plotW;
  const yScale = (y) => padT + (1 - (y - minY) / (maxY - minY || 1)) * plotH;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => minY + (maxY - minY) * f).map(v => `
    <line x1="${padL}" y1="${yScale(v)}" x2="${W - padR}" y2="${yScale(v)}" stroke="#1C2842" stroke-width="1"></line>
    <text x="${padL - 6}" y="${yScale(v) + 3}" text-anchor="end" font-size="9" fill="#5E6B84" font-family="JetBrains Mono, monospace">${v.toFixed(0)}</text>`).join("");
  const refLines = (opts.refLines || []).filter(v => v > minY && v < maxY).map(v =>
    `<line x1="${padL}" y1="${yScale(v)}" x2="${W - padR}" y2="${yScale(v)}" stroke="${v === 0 ? "#8E9AB0" : (v > 0 ? "#F0475A" : "#38D98C")}" stroke-width="1" stroke-dasharray="3 4" opacity="0.55"></line>`).join("");
  const pts = hist.map(d => `${xScale(d.x).toFixed(1)},${yScale(d.y).toFixed(1)}`);
  const last = hist[hist.length - 1];
  const gid = "lg" + (++__gradSeq);
  const area = `M${xScale(hist[0].x).toFixed(1)},${padT + plotH} L${pts.join(" L")} L${xScale(last.x).toFixed(1)},${padT + plotH} Z`;
  const fmtDate = (t) => new Date(t).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.28"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${gridLines}${refLines}
      <path d="${area}" fill="url(#${gid})"></path>
      <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
      <circle cx="${xScale(last.x)}" cy="${yScale(last.y)}" r="4.5" fill="${color}" stroke="#080D18" stroke-width="2"></circle>
      <text x="${padL}" y="${H - 4}" font-size="10" fill="#5E6B84">${fmtDate(minX)}</text>
      <text x="${W - padR}" y="${H - 4}" font-size="10" fill="#5E6B84" text-anchor="end">${fmtDate(maxX)}</text>
    </svg>`;
}

