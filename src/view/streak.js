/* ---------- ⟦LEV⟧ 연속 하락 통계 (최근 200봉) ---------- */
//@@include streak:findDownStreaks

//@@include streak:computeStreakStatsForLength

//@@include streak:computeStreakStats

//@@include streak:computeDayChangeCounts

function render⟦Lev⟧StreakStats(hist) {
  const container = document.getElementById("⟦lev⟧StreakContent");
  const { downDays, upFlatDays } = computeDayChangeCounts(hist);
  const stats = computeStreakStats(hist);
  const detail = computeStreakDetailStats(hist);   // 평균 연속일수·평균 하락률·최대 하락률

  const summaryRow = `
    <div class="fg-meta-row" style="margin-bottom:14px;">
      <div class="fg-meta-item"><div class="fg-meta-label">전일 대비 하락한 날</div><div class="fg-meta-value" style="color:var(--down);">${downDays}일</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">전일과 같거나 상승한 날</div><div class="fg-meta-value" style="color:var(--up);">${upFlatDays}일</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">최대 연속 하락일수</div><div class="fg-meta-value">${stats ? stats.maxLen : 0}일</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">전체 하락 구간 표본</div><div class="fg-meta-value">${stats ? stats.totalStreaks : 0}회</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">평균 연속일수</div><div class="fg-meta-value">${detail ? detail.avgLength.toFixed(1) + "일" : "--"}</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">평균 하락률</div><div class="fg-meta-value" style="color:var(--down);">${detail ? detail.avgDeclineRate.toFixed(2) + "%" : "--"}</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">최대 하락률</div><div class="fg-meta-value" style="color:var(--down);">${detail ? detail.maxDeclineRate.toFixed(2) + "%" : "--"}</div></div>
    </div>
  `;

  if (!stats) {
    container.innerHTML = summaryRow + '<div class="fg-empty">최근 200봉 내 연속 하락 구간이 없습니다.</div>';
    return;
  }

  const rowsHtml = stats.rows.map(r => `
    <tr>
      <td>${r.k}일</td>
      <td class="num">${r.probability.toFixed(1)}%</td>
      <td class="num" style="${r.avgReturn === null ? '' : (r.avgReturn >= 0 ? 'color:var(--up);' : 'color:var(--down);')}">${r.avgReturn !== null ? (r.avgReturn >= 0 ? "+" : "") + r.avgReturn.toFixed(2) + "%" : "--"}</td>
      <td class="num">${r.resolvedCount}/${r.sampleCount}${r.unresolved > 0 ? `<span class="unres-note">미회수 ${r.unresolved}</span>` : ""}</td>
    </tr>
  `).join("");

  container.innerHTML = `
    ${summaryRow}
    <table class="stat-table even-cols">
      <thead><tr><th>연속일수</th><th class="num">N일 이상 하락 확률</th><th class="num">평균 수익률</th><th class="num">표본<br>(회수/전체)</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p class="desc" style="margin:12px 0 0;">평균 수익률은 연속 하락 구간의 하락일마다(전일 대비 하락한 날) 종가로 1주씩 매수한 뒤, 하락 시작 전 종가(직전 고점)에 도달한 시점에 전량 매도했다고 가정한 값입니다. 조회 기간 내 아직 그 가격을 회복하지 못한 구간(미회수)은 평균 계산에서 제외했습니다.</p>
  `;
}

/* ---------- ⟦LEV⟧ 연속 상승 통계 (최근 200봉) ---------- */
//@@include streak:computeUpStreakStatsForLength

//@@include streak:computeUpStreakStats

//@@include streak:computeUpDayChangeCounts

function render⟦Lev⟧UpStreakStats(hist) {
  const container = document.getElementById("⟦lev⟧UpStreakStatsContent");
  if (!container) return;
  const { upDays, downFlatDays } = computeUpDayChangeCounts(hist);
  const stats = computeUpStreakStats(hist);
  const detail = computeUpStreakDetailStats(hist);   // 평균 연속일수·평균 상승률·최대 상승률

  const summaryRow = `
    <div class="fg-meta-row" style="margin-bottom:14px;">
      <div class="fg-meta-item"><div class="fg-meta-label">전일 대비 상승한 날</div><div class="fg-meta-value" style="color:var(--up);">${upDays}일</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">전일과 같거나 하락한 날</div><div class="fg-meta-value" style="color:var(--down);">${downFlatDays}일</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">최대 연속 상승일수</div><div class="fg-meta-value">${stats ? stats.maxLen : 0}일</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">전체 상승 구간 표본</div><div class="fg-meta-value">${stats ? stats.totalStreaks : 0}회</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">평균 연속일수</div><div class="fg-meta-value">${detail ? detail.avgLength.toFixed(1) + "일" : "--"}</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">평균 상승률</div><div class="fg-meta-value" style="color:var(--up);">${detail ? "+" + detail.avgRiseRate.toFixed(2) + "%" : "--"}</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">최대 상승률</div><div class="fg-meta-value" style="color:var(--up);">${detail ? "+" + detail.maxRiseRate.toFixed(2) + "%" : "--"}</div></div>
    </div>
  `;

  if (!stats) {
    container.innerHTML = summaryRow + '<div class="fg-empty">최근 200봉 내 연속 상승 구간이 없습니다.</div>';
    return;
  }

  const rowsHtml = stats.rows.map(r => `
    <tr>
      <td>${r.k}일</td>
      <td class="num">${r.probability.toFixed(1)}%</td>
      <td class="num" style="${r.avgRiseRate === null ? '' : 'color:var(--up);'}">${r.avgRiseRate !== null ? "+" + r.avgRiseRate.toFixed(2) + "%" : "--"}</td>
      <td class="num">${r.sampleCount}회</td>
    </tr>
  `).join("");

  container.innerHTML = `
    ${summaryRow}
    <table class="stat-table even-cols">
      <thead><tr><th>연속일수</th><th class="num">N일 이상 상승 확률</th><th class="num">평균 상승률</th><th class="num">표본</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p class="desc" style="margin:12px 0 0;">평균 상승률은 해당 연속일수(N일)로 정확히 끝난 상승 구간들의, 상승 시작 전 종가(직전 저점) 대비 상승 종료일 종가의 평균 변화율입니다.</p>
  `;
}

/* ---------- ⟦LEV⟧ 연속 하락 구간 상세 내역 ---------- */
//@@include format:fmtDateFull

//@@include streak:computeStreakDetailStats


/* ---------- ⟦LEV⟧ 연속 상승 구간 상세 내역 ---------- */
//@@include streak:findUpStreaks

//@@include streak:computeUpStreakDetailStats


/* ---------- 상단 카드: 오늘 기준 ⟦LEV⟧ 연속 하락/상승 현황 배너 ---------- */
function computeCurrent⟦Lev⟧StreakStatus(hist) {
  if (!hist || hist.length < 2) return null;
  const last = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  let streak = null, direction = null;
  if (last.y < prev.y) {
    direction = "down";
    streak = findDownStreaks(hist).find(s => s.endIdx === hist.length - 1);
  } else if (last.y > prev.y) {
    direction = "up";
    streak = findUpStreaks(hist).find(s => s.endIdx === hist.length - 1);
  } else {
    return { direction: "flat" };
  }
  if (!streak) return { direction: "flat" };
  const preClose = hist[streak.preIdx].y;
  const endClose = hist[streak.endIdx].y;
  return {
    direction, preDate: hist[streak.preIdx].x, preClose,
    startDate: hist[streak.startIdx].x, endDate: hist[streak.endIdx].x,
    length: streak.length, endClose, rate: (endClose - preClose) / preClose * 100
  };
}

//@@include streak:computeStreakContinuationProb

function render⟦Lev⟧StreakBanner(hist) {
  const el = document.getElementById("⟦lev⟧StreakBanner");
  if (!el) return;
  const status = computeCurrent⟦Lev⟧StreakStatus(hist);
  if (!status || status.direction === "flat") {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const isDown = status.direction === "down";
  const label = isDown ? "⟦LEV⟧ 오늘 연속 하락 중" : "⟦LEV⟧ 오늘 연속 상승 중";
  const colorVar = isDown ? "var(--down)" : "var(--up)";
  const bg = isDown ? "rgba(240,71,90,0.12)" : "rgba(56,217,140,0.12)";
  const border = isDown ? "rgba(240,71,90,0.35)" : "rgba(56,217,140,0.35)";
  const sign = status.rate >= 0 ? "+" : "";

  const contStats = computeStreakContinuationProb(hist, status.direction, status.length);
  let upProb = null, downProb = null;
  if (contStats) {
    if (isDown) { downProb = contStats.continueProb; upProb = contStats.reverseProb; }
    else { upProb = contStats.continueProb; downProb = contStats.reverseProb; }
  }

  const probBlock = contStats ? `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-soft);">
      <div class="ssb-label" style="margin-bottom:6px;">다음 거래일 방향 확률 (연속 ${status.length}일차 이상 과거 표본 ${contStats.sampleCount}건 기준)</div>
      <div class="ssb-grid">
        <div class="ssb-item"><div class="ssb-label">상승할 확률</div><div class="ssb-value mono" style="color:var(--up);">${upProb.toFixed(1)}%</div></div>
        <div class="ssb-item"><div class="ssb-label">하락할 확률</div><div class="ssb-value mono" style="color:var(--down);">${downProb.toFixed(1)}%</div></div>
      </div>
    </div>
  ` : `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-soft);">
      <div class="fg-empty" style="padding:6px 0;">과거 표본이 없어 다음 거래일 방향 확률을 계산할 수 없습니다.</div>
    </div>
  `;

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="ssb-top">
      <span class="ssb-badge" style="color:${colorVar};background:${bg};border-color:${border};">${label}</span>
      <span class="ssb-rate mono" style="color:${colorVar};">${sign}${status.rate.toFixed(2)}%</span>
    </div>
    <div class="ssb-grid">
      <div class="ssb-item"><div class="ssb-label">기준일 (${isDown ? "하락" : "상승"} 전일)</div><div class="ssb-value mono">${fmtDateFull(status.preDate)}</div><div class="ssb-sub mono">${usd(status.preClose)}</div></div>
      <div class="ssb-item"><div class="ssb-label">${isDown ? "하락" : "상승"} 구간</div><div class="ssb-value mono">${fmtDateFull(status.startDate)} ~ ${fmtDateFull(status.endDate)}</div></div>
      <div class="ssb-item"><div class="ssb-label">연속일수</div><div class="ssb-value mono">${status.length}일</div></div>
      <div class="ssb-item"><div class="ssb-label">${isDown ? "하락률" : "상승률"}</div><div class="ssb-value mono" style="color:${colorVar};">${sign}${status.rate.toFixed(2)}%</div></div>
    </div>
    ${probBlock}
  `;
}

//@@include format:fmtPctSigned
//@@include format:fmtPct1

//@@include stats:trimmedMeanExcludingMinMax

