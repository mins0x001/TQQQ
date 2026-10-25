/* ---------- 연속 하락/상승 구간 탐색 ---------- */
//@@include streak:findDownStreaks
//@@include streak:findUpStreaks
function metaTile(label, value, color) {
  return `<div class="fg-meta-item"><div class="fg-meta-label">${label}</div><div class="fg-meta-value"${color ? ` style="color:${color};"` : ""}>${value}</div></div>`;
}
function tableWrap(inner) { return `<div class="table-wrap">${inner}</div>`; }

/* ---------- QLD 연속 하락 통계 ---------- */
//@@include streak:computeStreakStatsForLength
//@@include streak:computeStreakStats
//@@include streak:computeDayChangeCounts
function renderQldStreakStats(hist) {
  const container = document.getElementById("qldStreakContent");
  const { downDays, upFlatDays } = computeDayChangeCounts(hist);
  const stats = computeStreakStats(hist);
  const summaryRow = `<div class="fg-meta-row" style="margin-top:0;">
    ${metaTile("전일 대비 하락한 날", downDays + "일", "var(--down)")}
    ${metaTile("같거나 상승한 날", upFlatDays + "일", "var(--up)")}
    ${metaTile("최대 연속 하락", (stats ? stats.maxLen : 0) + "일")}
    ${metaTile("하락 구간 표본", (stats ? stats.totalStreaks : 0) + "회")}
  </div>`;
  if (!stats) { container.innerHTML = summaryRow + '<div class="fg-empty">최근 200봉 내 연속 하락 구간이 없습니다.</div>'; return; }
  const sm = computeStreakSummary(hist, true);
  const smRow = sm ? `<div class="fg-meta-row hl-row" style="margin:0 0 14px;">
    ${metaTile("평균 연속일수", sm.avgLength.toFixed(1) + "일")}
    ${metaTile("평균 하락률", fmtPctSigned(sm.avgRate), "var(--down)")}
    ${metaTile("최대 하락률", fmtPctSigned(sm.extremeRate), "var(--down)")}
  </div>` : "";
  const rowsHtml = stats.rows.map(r => `
    <tr>
      <td><b>${r.k}일</b></td>
      <td class="num">${r.probability.toFixed(1)}%</td>
      <td class="num" style="color:${r.avgReturn === null ? 'var(--text-faint)' : signColor(r.avgReturn)};">${r.avgReturn !== null ? (r.avgReturn >= 0 ? "+" : "") + r.avgReturn.toFixed(2) + "%" : "--"}</td>
      <td class="num">${r.resolvedCount}/${r.sampleCount}${r.unresolved > 0 ? `<span class="sub-price">미회수 ${r.unresolved}</span>` : ""}</td>
    </tr>`).join("");
  container.innerHTML = `${summaryRow}${smRow}
    ${tableWrap(`<table class="stat-table even-cols"><thead><tr><th>연속일수</th><th class="num">N일 이상 확률</th><th class="num">평균 수익률</th><th class="num">회수/전체</th></tr></thead><tbody>${rowsHtml}</tbody></table>`)}
    <div class="note">평균 연속일수·평균 하락률·최대 하락률은 최근 200봉에서 실제 발생한 하락 구간 ${sm ? sm.count : 0}건 기준이며, 평균 하락률은 최대·최소 각 1건을 제외한 값입니다.<br>평균 수익률은 하락일마다 종가로 1주씩 매수한 뒤, 하락 시작 전 종가(직전 고점) 도달 시 전량 매도했다고 가정한 값입니다. 아직 회복하지 못한 구간(미회수)은 평균에서 제외했습니다.</div>`;
}

/* ---------- QLD 연속 상승 통계 ---------- */
//@@include streak:computeUpStreakStatsForLength
//@@include streak:computeUpStreakStats
//@@include streak:computeUpDayChangeCounts
function renderQldUpStreakStats(hist) {
  const container = document.getElementById("qldUpStreakStatsContent");
  if (!container) return;
  const { upDays, downFlatDays } = computeUpDayChangeCounts(hist);
  const stats = computeUpStreakStats(hist);
  const summaryRow = `<div class="fg-meta-row" style="margin-top:0;">
    ${metaTile("전일 대비 상승한 날", upDays + "일", "var(--up)")}
    ${metaTile("같거나 하락한 날", downFlatDays + "일", "var(--down)")}
    ${metaTile("최대 연속 상승", (stats ? stats.maxLen : 0) + "일")}
    ${metaTile("상승 구간 표본", (stats ? stats.totalStreaks : 0) + "회")}
  </div>`;
  if (!stats) { container.innerHTML = summaryRow + '<div class="fg-empty">최근 200봉 내 연속 상승 구간이 없습니다.</div>'; return; }
  const sm = computeStreakSummary(hist, false);
  const smRow = sm ? `<div class="fg-meta-row hl-row" style="margin:0 0 14px;">
    ${metaTile("평균 연속일수", sm.avgLength.toFixed(1) + "일")}
    ${metaTile("평균 상승률", fmtPctSigned(sm.avgRate), "var(--up)")}
    ${metaTile("최대 상승률", fmtPctSigned(sm.extremeRate), "var(--up)")}
  </div>` : "";
  const rowsHtml = stats.rows.map(r => `
    <tr>
      <td><b>${r.k}일</b></td>
      <td class="num">${r.probability.toFixed(1)}%</td>
      <td class="num" style="color:${r.avgRiseRate === null ? 'var(--text-faint)' : 'var(--up)'};">${r.avgRiseRate !== null ? "+" + r.avgRiseRate.toFixed(2) + "%" : "--"}</td>
      <td class="num">${r.sampleCount}회</td>
    </tr>`).join("");
  container.innerHTML = `${summaryRow}${smRow}
    ${tableWrap(`<table class="stat-table even-cols"><thead><tr><th>연속일수</th><th class="num">N일 이상 확률</th><th class="num">평균 상승률</th><th class="num">표본</th></tr></thead><tbody>${rowsHtml}</tbody></table>`)}
    <div class="note">평균 연속일수·평균 상승률·최대 상승률은 최근 200봉에서 실제 발생한 상승 구간 ${sm ? sm.count : 0}건 기준이며, 평균 상승률은 최대·최소 각 1건을 제외한 값입니다.<br>표의 평균 상승률은 정확히 N일로 끝난 상승 구간들의, 상승 시작 전 종가(직전 저점) 대비 종료일 종가 평균 변화율입니다.</div>`;
}

/* ---------- 상세 내역 ---------- */
//@@include format:fmtDateFull
function buildStreakRows(hist, streaks) {
  return streaks.map(s => {
    const preClose = hist[s.preIdx].y, endClose = hist[s.endIdx].y;
    return { preDate: hist[s.preIdx].x, preClose, startDate: hist[s.startIdx].x, endDate: hist[s.endIdx].x, length: s.length, endClose, rate: (endClose - preClose) / preClose * 100 };
  });
}

/* 실제 발생한 연속 구간들의 요약: 평균 연속일수 · 평균(절사) 등락률 · 최대 등락률
   (V0.10에서 '상세 내역' 카드를 없애고 이 3개 값만 통계 카드로 옮겨 왔습니다) */
//@@include qld:computeStreakSummary

/* ---------- 상단: 오늘 기준 QLD 연속 하락/상승 배너 ---------- */
//@@include qld:computeCurrentQldStreakStatus
function renderQldStreakBanner(hist) {
  const el = document.getElementById("qldStreakBanner");
  if (!el) return;
  const status = computeCurrentQldStreakStatus(hist);
  if (!status || status.direction === "flat") { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const isDown = status.direction === "down";
  const colorVar = isDown ? "var(--down)" : "var(--up)";
  const bg = isDown ? "rgba(240,71,90,0.12)" : "rgba(56,217,140,0.12)";
  const border = isDown ? "rgba(240,71,90,0.35)" : "rgba(56,217,140,0.35)";
  const sign = status.rate >= 0 ? "+" : "";
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="ssb-top">
      <span class="ssb-badge" style="color:${colorVar};background:${bg};border-color:${border};">${isDown ? "▼ QLD 연속 하락 중" : "▲ QLD 연속 상승 중"}</span>
      <span class="ssb-rate mono" style="color:${colorVar};">${sign}${status.rate.toFixed(2)}%</span>
    </div>
    <div class="ssb-grid">
      <div class="ssb-item"><div class="ssb-label">기준일 (${isDown ? "하락" : "상승"} 전일)</div><div class="ssb-value mono">${fmtDateFull(status.preDate)}</div><div class="ssb-sub mono">${usd(status.preClose)}</div></div>
      <div class="ssb-item"><div class="ssb-label">${isDown ? "하락" : "상승"} 구간</div><div class="ssb-value mono">${fmtDateFull(status.startDate)} ~ ${fmtDateFull(status.endDate)}</div></div>
      <div class="ssb-item"><div class="ssb-label">연속일수</div><div class="ssb-value mono">${status.length}일</div></div>
      <div class="ssb-item"><div class="ssb-label">${isDown ? "하락률" : "상승률"}</div><div class="ssb-value mono" style="color:${colorVar};">${sign}${status.rate.toFixed(2)}%</div></div>
    </div>`;
}

//@@include format:fmtPctSigned
//@@include format:fmtPct1
//@@include qld:fmtMoneySigned
//@@include stats:trimmedMeanExcludingMinMax
