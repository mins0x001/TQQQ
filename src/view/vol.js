/* ---------- ⟦LEV⟧ · ⟦BASE⟧ 변동성 프로파일 ---------- */
//@@include stats:calcDailyReturns
//@@include stats:calcStdev

function renderVolProfileCard(lvHist, bsHist) {
  const el = document.getElementById("⟦lev⟧VolContent");
  if (!el) return;
  const lvRet = calcDailyReturns(lvHist);
  if (lvRet.length < 30) {
    el.innerHTML = '<div class="fg-empty">데이터가 부족하여 변동성을 계산할 수 없습니다.</div>';
    return;
  }

  const sd200 = calcStdev(lvRet);
  const sd20 = calcStdev(lvRet.slice(-20));
  const annual = sd200 * Math.sqrt(252);
  const avgAbs = lvRet.reduce((a, b) => a + Math.abs(b), 0) / lvRet.length;
  const maxDrop = Math.min(...lvRet);
  const maxGain = Math.max(...lvRet);

  const regime = sd200 > 0 ? sd20 / sd200 : 1;
  let regimeLabel = "보통 변동", regimeColor = "var(--text)";
  if (regime < 0.8) { regimeLabel = "저변동 국면"; regimeColor = "var(--up)"; }
  else if (regime > 1.2) { regimeLabel = "고변동 국면"; regimeColor = "var(--down)"; }

  const lastClose = lvHist[lvHist.length - 1].y;
  const bandLo = lastClose * (1 - sd20 / 100);
  const bandHi = lastClose * (1 + sd20 / 100);
  const band2Lo = lastClose * (1 - 2 * sd20 / 100);

  let ratioText = "--", bsSdText = "--", ratioN = 0;
  if (bsHist && bsHist.length > 21) {
    const bsRet = calcDailyReturns(bsHist);
    ratioN = Math.min(bsRet.length, lvRet.length);
    const bs = calcStdev(bsRet.slice(-ratioN));
    const ls = calcStdev(lvRet.slice(-ratioN));
    if (bs > 0 && ls !== null) { ratioText = (ls / bs).toFixed(2) + "배"; bsSdText = bs.toFixed(2) + "%"; }
  }

  const baseDropPct = (1 - STRAT2_MODE_RATIO) * 100;
  const factor = clamp(regime, VOL_FACTOR_MIN, VOL_FACTOR_MAX);
  const adjDropPct = baseDropPct * factor;

  el.innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:${regimeColor};">${regime.toFixed(2)}배</div>
      <div class="fg-badge" style="color:${regimeColor};border-color:${regimeColor};background:rgba(255,255,255,0.03);">${regimeLabel}</div>
    </div>
    <div class="fg-meta-row">
      <div class="fg-meta-item"><div class="fg-meta-label">⟦LEV⟧ 일간σ (200봉)</div><div class="fg-meta-value">${sd200.toFixed(2)}%</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">⟦LEV⟧ 일간σ (20봉)</div><div class="fg-meta-value">${sd20.toFixed(2)}%</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">연환산 변동성</div><div class="fg-meta-value">${annual.toFixed(1)}%</div></div>
    </div>
    <div class="kv-row"><span class="k">평균 일간 변동폭(절대값)</span><span class="v">${avgAbs.toFixed(2)}%</span></div>
    <div class="kv-row"><span class="k">최대 일간 하락 / 상승</span><span class="v"><span style="color:var(--down);">${fmtPctSigned(maxDrop)}</span> / <span style="color:var(--up);">${fmtPctSigned(maxGain)}</span></span></div>
⟦@s024⟧    <div class="kv-row"><span class="k">최근 확정 종가 ${usd(lastClose)} 기준 1σ 범위</span><span class="v">${usd(bandLo)} ~ ${usd(bandHi)}</span></div>
    <div class="kv-row"><span class="k">2σ 하단 (급락 대비 참고가)</span><span class="v" style="color:var(--down);">${usd(band2Lo)}</span></div>
    <div class="kv-row"><span class="k">손절모드 기준선 (고정 / 변동성 보정)</span><span class="v" style="color:var(--down);">-${baseDropPct.toFixed(1)}% / -${adjDropPct.toFixed(1)}%</span></div>
⟦@s025⟧  `;
}

/* ---------- 🤖 ⟦LEV⟧ 변동성 최적화 AI 엔진 ---------- */
let engineRecs = null;

function renderVolEngineCard(hist) {
  const el = document.getElementById("⟦lev⟧EngineContent");
  if (!el) return;
  const ret = calcDailyReturns(hist);
  if (ret.length < 30) {
    el.innerHTML = '<div class="fg-empty">데이터가 부족하여 최적 파라미터를 계산할 수 없습니다.</div>';
    return;
  }

⟦@s026⟧  const sd200 = calcStdev(ret);
⟦@s027⟧
  // ② 백테스트 그리드 서치 (시뮬레이션 규칙: 종가 < 평단 그리고 종가 < 전일 종가)
  const seedInput = parseFloat(document.getElementById("seedSimSeed1").value);
⟦@s028⟧  const grid = [];
  ENGINE_SPLITS_GRID.forEach((s, si) => {
    [STAGE2_MULT].forEach((c, ci) => {           // V0.72: 2단계 배수 ×3 고정 → 분할 수만 탐색
      const r = simulateSeedBacktest(hist, seed, s, true, c);
      grid.push({ s, c, si, ci, ret: r ? r.grandTotal / seed * 100 : null, losses: r ? r.loss.length : 0, trades: r ? r.trades.length : 0 });
    });
  });
  const valid = grid.filter(g => g.ret !== null);
  if (valid.length === 0) {
    el.innerHTML = '<div class="fg-empty">최근 200봉 내 연속 하락 구간이 없어 백테스트를 수행할 수 없습니다.</div>';
    return;
  }
  // 과최적화 완화: 자신 + 상하좌우 인접 조합 수익률의 평균을 "견고성 점수"로 사용
  valid.forEach(g => {
    const nb = valid.filter(o => Math.abs(o.si - g.si) + Math.abs(o.ci - g.ci) <= 1);
    g.robust = nb.reduce((a, o) => a + o.ret, 0) / nb.length;
  });
  const bestBt = valid.reduce((a, b) => {
    if (b.robust > a.robust + 1e-9) return b;
    if (Math.abs(b.robust - a.robust) <= 1e-9 && b.losses < a.losses) return b;
    return a;
  });
  const ruleRun = simulateSeedBacktest(hist, seed, ruleSplits, true, STAGE2_MULT);
  const ruleRet = ruleRun ? ruleRun.grandTotal / seed * 100 : null;
  const ruleOld = simulateSeedBacktest(hist, seed, ruleSplits, true, 1, undefined, ruleCycle);   // 비교: 옛 규칙(주기 대기)
  const ruleOldRet = ruleOld ? ruleOld.grandTotal / seed * 100 : null;
⟦@s029⟧
  engineRecs = { rule: { splits: ruleSplits, cycle: STAGE2_MULT }, bt: { splits: bestBt.s, cycle: bestBt.c }, oldCycle: ruleCycle };   // cycle = 2단계 배수

  const top = valid.slice().sort((a, b) => b.robust - a.robust).slice(0, 5);
  const col = v => v === null ? "" : (v >= 0 ? "color:var(--up);" : "color:var(--down);");
  const topRows = top.map((g, i) => `
    <tr${i === 0 ? ' style="background:linear-gradient(90deg, rgba(94,234,212,0.14), rgba(94,234,212,0.02));"' : ''}>
      <td${i === 0 ? ' style="color:var(--glow);font-weight:700;"' : ''}>${i === 0 ? "★ " : ""}${g.s}분할</td>
      <td class="num">×${g.c} 연속</td>
      <td class="num" style="${col(g.ret)}">${fmtPctSigned(g.ret)}</td>
      <td class="num" style="${col(g.robust)}">${fmtPctSigned(g.robust)}</td>
    </tr>
  `).join("");

  const a = getSellAnalysis(hist);

  el.innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:var(--amber);">k = ${k.toFixed(2)}</div>
⟦@s030⟧    </div>
    <div class="engine-grid">
      <div class="engine-box rule">
        <div class="eb-tag">① 규칙 기반 환산</div>
        <div class="eb-line"><span>분할 수 (6×√k)</span><span>${ruleSplits}분할</span></div>
        <div class="eb-line"><span>2단계 (대기 없음)</span><span>×${STAGE2_MULT} → ${ruleSplits * STAGE2_MULT}분할</span></div>
        <div class="eb-line"><span>손절모드 (12%×k)</span><span>-${ruleStopMode.toFixed(1)}%</span></div>
        <div class="eb-ret" style="${col(ruleRet)}">${fmtPctSigned(ruleRet)}</div>
      </div>
      <div class="engine-box bt">
        <div class="eb-tag">② 백테스트 최적 (견고성)</div>
        <div class="eb-line"><span>분할 수</span><span>${bestBt.s}분할</span></div>
        <div class="eb-line"><span>2단계 (대기 없음)</span><span>×${bestBt.c} → ${bestBt.s * bestBt.c}분할</span></div>
        <div class="eb-line"><span>견고성 점수</span><span>${fmtPctSigned(bestBt.robust)}</span></div>
        <div class="eb-ret" style="${col(bestBt.ret)}">${fmtPctSigned(bestBt.ret)}</div>
      </div>
    </div>
    <div class="buysim-actions">
      <button class="buysim-btn amber" type="button" data-engine-apply="rule" onclick="applyEngineRec('rule')">① 규칙 적용</button>
      <button class="buysim-btn save" type="button" data-engine-apply="bt" onclick="applyEngineRec('bt')">② 최적 적용</button>
    </div>
    <div class="kv-row" style="margin-top:8px;"><span class="k">규칙 비교 · ${ruleSplits}분할: 신규 ×${STAGE2_MULT} 연속 / 기존 ${ruleCycle}일 대기</span><span class="v"><b style="${col(ruleRet)}">${fmtPctSigned(ruleRet)}</b> / <span style="${col(ruleOldRet)}">${fmtPctSigned(ruleOldRet)}</span></span></div>
⟦@s031⟧    <div class="kv-row"><span class="k">AI 최적 매도 목표 / 추천 분할매수 회차</span><span class="v">${a ? "+" + a.best.pct.toFixed(2) + "%" : "--"} / ${a && a.recommendedN ? a.recommendedN + "회" : "--"}</span></div>
    <div class="buysim-sub-title">견고성 상위 5개 조합 (시드 ${fmtUsd0(seed)}, 평단&전일종가 이하 규칙)</div>
    <table class="stat-table even-cols">
      <thead><tr><th>분할 수</th><th class="num">2단계</th><th class="num">시드 대비 수익률</th><th class="num">견고성(인접 평균)</th></tr></thead>
      <tbody>${topRows}</tbody>
    </table>
⟦@s032⟧  `;
}

