/* ---------- Finnhub ---------- */
//@@include lib:fhFetch
async function fetchQuote(symbol) {
  const data = await fhFetch("/quote", { symbol });
  if (!data || data.c === undefined || data.c === 0) throw new Error(`${symbol} 시세를 가져오지 못했습니다.`);
  return data.c;
}

/* ---------- Twelve Data ---------- */
/* 📦 매일 한국 10:10 자동 저장된 일봉(data/<심볼>.json)을 먼저 읽음 — 최신이면 시세 API 호출 없음 (한도 초과 실패↓ · 속도↑)
   유효 판단: 파일의 asof_ny(뉴욕 시각) ≥ 가장 최근 평일 뉴욕 16:15 마감 → 아니면(마감 직후~10:10 등) 기존처럼 API */
//@@include time:lastNyClose
let dataSrc = {};
async function dataFileBars(symbol, n) {
  try {
    const r = await fetch(`data/${symbol}.json?h=${new Date().toISOString().slice(0, 13)}`, { cache: "no-cache" });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !Array.isArray(j.bars) || j.bars.length < n - 1 || String(j.asof_ny || "") < lastNyClose()) return null;
    dataSrc[symbol] = j.updated_kst || "";
    return j.bars.slice(-n).map(b => ({ d: b[0], x: new Date(b[0]).getTime(), o: b[1], h: b[2], l: b[3], y: b[4] }));
  } catch (e) { return null; }
}
async function tdFetchTimeSeries(symbol, outputsize) {
  { const c = await dataFileBars(symbol, outputsize); if (c && c.length) return dropIncompleteBar(c); }
  delete dataSrc[symbol];
  const url = new URL(`${TWELVE_DATA_BASE_URL}/time_series`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", outputsize);
  url.searchParams.set("apikey", TWELVE_DATA_API_KEY);
  const res = await fetchRetry(url.toString());
  if (!res.ok) throw new Error(`HTTP 오류 (${res.status})`);
  const data = await res.json();
  if (data.status === "error" || !data.values) {
    throw new Error(`${symbol} 과거 시세를 가져오지 못했습니다: ${data.message || "알 수 없는 오류"}`);
  }
  const bars = data.values.map(v => ({
    d: String(v.datetime).slice(0, 10),
    x: new Date(v.datetime).getTime(),
    o: parseFloat(v.open), h: parseFloat(v.high), l: parseFloat(v.low), y: parseFloat(v.close)
  })).reverse();
  return dropIncompleteBar(bars);
}

/* ---------- 미확정(장중) 일봉 제외 ----------
   미국 장중(뉴욕 16:15 이전)에 받은 일봉의 마지막 봉은 '오늘 진행 중인 봉'이고 close는 확정 종가가 아닌 현재가다.
   LOC 기준가·자동 저장이 장중 가격에 흔들리지 않도록 이 봉을 뺀다. */
//@@include time:nyNowParts
function dropIncompleteBar(bars) {
  if (!bars || bars.length === 0) return bars;
  const ny = nyNowParts();
  const last = bars[bars.length - 1];
  if (last.d > ny.date || (last.d === ny.date && ny.minutes < 16 * 60 + 15)) return bars.slice(0, -1);
  return bars;
}

/* ---------- CCI(20, 종가 기준) ---------- */
//@@include qld:computeCciSeries

async function fetchQqqAthAndTrend() {
  const fullHist = await tdFetchTimeSeries("QQQ", QQQ_FETCH_CANDLES);
  if (fullHist.length === 0) throw new Error("QQQ 일별 시세 데이터를 가져오지 못했습니다.");
  const hist = fullHist.slice(-LOOKBACK_CANDLES);
  const info = computeAthInfo(hist);
  const cciHist = computeCciSeries(fullHist, CCI_PERIOD).slice(-LOOKBACK_CANDLES);
  return { ath: info.ath, athDate: info.athDate, hist, cciHist };
}
async function fetchQldHistory() {
  // 400봉을 한 번에 받아 LOC 가이드(400봉 시뮬레이션)와 나머지 카드(최근 200봉)에 나눠 쓴다.
  const hist = (await tdFetchTimeSeries("QLD", LOC_SIM_CANDLES + 1)).slice(-LOC_SIM_CANDLES);   // +1: 미확정 봉 제외 대비
  if (hist.length === 0) throw new Error("QLD 일별 시세 데이터를 가져오지 못했습니다.");
  return hist;
}

/* ---------- Alpha Vantage ---------- */
async function avFetch(params) {
  const url = new URL(ALPHA_VANTAGE_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("apikey", ALPHA_VANTAGE_API_KEY);
  const res = await fetchRetry(url.toString());
  if (!res.ok) throw new Error("네트워크 오류 (" + res.status + ")");
  const data = await res.json();
  if (data["Note"]) throw new Error("API 호출 한도 초과: " + data["Note"]);
  if (data["Information"]) throw new Error("Alpha Vantage 안내: " + data["Information"]);
  if (data["Error Message"]) throw new Error("잘못된 티커이거나 데이터 없음: " + data["Error Message"]);
  return data;
}

/* ---------- CNN Fear & Greed ---------- */
const FG_BANDS = [
  { max:25, key:"극도의 공포", en:"Extreme Fear", color:"#F0475A" },
  { max:45, key:"공포", en:"Fear", color:"#F5A524" },
  { max:55, key:"중립", en:"Neutral", color:"#8996AC" },
  { max:75, key:"탐욕", en:"Greed", color:"#38D98C" },
  { max:101, key:"극도의 탐욕", en:"Extreme Greed", color:"#1FA971" },
];
function fgRating(score) { return FG_BANDS.find(b => score < b.max) || FG_BANDS[FG_BANDS.length - 1]; }

async function fetchFearGreedIndex() {
  const bannerEl = document.getElementById("fgBanner");
  bannerEl.classList.add("hidden");
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 95);
    const dateStr = startDate.toISOString().split("T")[0];
    const res = await fetch(`https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${dateStr}`, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const current = data.fear_and_greed;
    const hist = (data.fear_and_greed_historical && data.fear_and_greed_historical.data) || [];
    if (!current || hist.length === 0) throw new Error("응답에 데이터가 없습니다.");
    renderFearGreed(current, hist);
    bannerEl.textContent = "Fear & Greed 지수를 정상적으로 불러왔습니다.";
    bannerEl.classList.remove("hidden");
    bannerEl.classList.add("ok");
  } catch (e) {
    bannerEl.classList.remove("ok");
    bannerEl.textContent = "조회 실패: " + e.message + " — CNN 엔드포인트가 브라우저 CORS 정책에 의해 차단될 수 있습니다.";
    bannerEl.classList.remove("hidden");
    throw e;
  }
}

function renderFearGreed(current, hist) {
  const score = Math.round(current.score);
  const rating = fgRating(score);
  const metaItems = [
    { label: "전일 종가", value: current.previous_close },
    { label: "1주 전", value: current.previous_1_week },
    { label: "1개월 전", value: current.previous_1_month },
    { label: "1년 전", value: current.previous_1_year },
  ].map(m => `
    <div class="fg-meta-item">
      <div class="fg-meta-label">${m.label}</div>
      <div class="fg-meta-value">${m.value !== undefined && m.value !== null ? Math.round(m.value) : "--"}</div>
    </div>`).join("");
  const legend = FG_BANDS.map(b => `<span><span class="dot" style="background:${b.color};"></span>${b.key}</span>`).join("");
  document.getElementById("fgContent").innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:${rating.color};">${score}</div>
      <div class="fg-badge" style="color:${rating.color};background:${rating.color}1F;border-color:${rating.color}59;">${rating.key} (${rating.en})</div>
    </div>
    <div class="fg-meta-row">${metaItems}</div>
    <div class="fg-chart-wrap">${renderFgChartSvg(hist)}</div>
    <div class="fg-legend">${legend}</div>`;
}

function renderFgChartSvg(hist) {
  const W = 480, H = 170, padL = 30, padR = 10, padT = 8, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xs = hist.map(d => d.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const xScale = (x) => padL + ((x - minX) / (maxX - minX || 1)) * plotW;
  const yScale = (y) => padT + (1 - y / 100) * plotH;
  const bandRects = FG_BANDS.map((b, i) => {
    const prevMax = i === 0 ? 0 : FG_BANDS[i - 1].max;
    const top = Math.min(b.max, 100);
    return `<rect x="${padL}" y="${yScale(top)}" width="${plotW}" height="${yScale(prevMax) - yScale(top)}" fill="${b.color}" opacity="0.09"></rect>`;
  }).join("");
  const gridLines = [0, 25, 50, 75, 100].map(v => `
    <line x1="${padL}" y1="${yScale(v)}" x2="${W - padR}" y2="${yScale(v)}" stroke="#1C2842" stroke-width="1"></line>
    <text x="${padL - 5}" y="${yScale(v) + 3}" text-anchor="end" font-size="9" fill="#5E6B84" font-family="JetBrains Mono, monospace">${v}</text>`).join("");
  const points = hist.map(d => `${xScale(d.x)},${yScale(d.y)}`).join(" ");
  const last = hist[hist.length - 1];
  const lastRating = fgRating(Math.round(last.y));
  const fmtDate = (t) => new Date(t).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
      ${bandRects}${gridLines}
      <polyline points="${points}" fill="none" stroke="#5EEAD4" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>
      <circle cx="${xScale(last.x)}" cy="${yScale(last.y)}" r="4.5" fill="${lastRating.color}" stroke="#080D18" stroke-width="2"></circle>
      <text x="${padL}" y="${H - 4}" font-size="10" fill="#5E6B84">${fmtDate(minX)}</text>
      <text x="${W - padR}" y="${H - 4}" font-size="10" fill="#5E6B84" text-anchor="end">${fmtDate(maxX)}</text>
    </svg>`;
}

/* ---------- USD/KRW ---------- */
async function fetchUsdKrw() {
  const bannerEl = document.getElementById("fxBanner");
  bannerEl.classList.add("hidden");
  try {   // 매일 10:10 저장된 환율(data/macro.json) 먼저 — Alpha Vantage 하루 25회 한도 아끼기
    const m = await fetch("data/macro.json?h=" + new Date().toISOString().slice(0, 13), { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (m && m.fx && m.fx.last > 0 && Date.now() - Date.parse(m.fx.date) < 5 * 864e5) { liveFx = { rate: m.fx.last, date: m.fx.date }; return; }
  } catch (e) {}
  try {
    const data = await avFetch({ function: "FX_DAILY", from_symbol: "USD", to_symbol: "KRW" });
    const series = data["Time Series FX (Daily)"];
    if (!series) throw new Error("환율 데이터를 가져오지 못했습니다.");
    const hist = Object.entries(series)
      .map(([date, vals]) => ({ x: new Date(date + "T00:00:00Z").getTime(), y: parseFloat(vals["4. close"]) }))
      .sort((a, b) => a.x - b.x);
    if (hist.length === 0) throw new Error("응답에 데이터가 없습니다.");
    renderUsdKrw(hist);
    const fxLast = hist[hist.length - 1];
    liveFx = { rate: fxLast.y, date: new Date(fxLast.x).toISOString().split('T')[0] };
    try { renderGuideResult(); } catch (e) { /* 가이드 갱신 실패는 환율 조회 결과에 영향 없음 */ }
    bannerEl.textContent = "원달러 환율을 정상적으로 불러왔습니다.";
    bannerEl.classList.remove("hidden");
    bannerEl.classList.add("ok");
  } catch (e) {
    bannerEl.classList.remove("ok");
    bannerEl.textContent = "조회 실패: " + e.message + " — 분당 5회 API 제한에 걸렸을 수 있습니다.";
    bannerEl.classList.remove("hidden");
    throw e;
  }
}

function renderUsdKrw(hist) {
  const last = hist[hist.length - 1];
  const dayMs = 24 * 60 * 60 * 1000;
  const prevDay = hist.length > 1 ? hist[hist.length - 2] : null;
  const weekAgo = findNearestBefore(hist, last.x - 7 * dayMs);
  const monthAgo = findNearestBefore(hist, last.x - 30 * dayMs);
  const deltaCell = (base) => {
    if (!base) return `<div class="fg-meta-value" style="color:var(--text-faint);">--</div>`;
    const d = last.y - base.y;
    const color = d > 0 ? "var(--down)" : (d < 0 ? "var(--up)" : "var(--text-dim)");
    const arrow = d > 0 ? "▲" : (d < 0 ? "▼" : "―");
    return `<div class="fg-meta-value" style="color:${color};">${arrow} ${Math.abs(d).toFixed(1)}</div>`;
  };
  document.getElementById("fxContent").innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:var(--glow);">${last.y.toFixed(2)}<span style="font-size:14px;color:var(--text-dim);font-weight:600;"> 원</span></div>
      <div class="fg-badge" style="color:var(--glow);background:rgba(94,234,212,0.10);border-color:rgba(94,234,212,0.35);">USD/KRW</div>
    </div>
    <div class="fg-meta-row">
      <div class="fg-meta-item"><div class="fg-meta-label">전일 대비</div>${deltaCell(prevDay)}</div>
      <div class="fg-meta-item"><div class="fg-meta-label">1주 전 대비</div>${deltaCell(weekAgo)}</div>
      <div class="fg-meta-item"><div class="fg-meta-label">1개월 전 대비</div>${deltaCell(monthAgo)}</div>
    </div>
    <div class="fg-chart-wrap">${renderLineChartSvg(hist, "#5EEAD4")}</div>`;
}

//@@include qld:computeAthInfo

async function fetchAll() {
  const btn = document.getElementById("fetchBtn");
  btn.disabled = true;
  hideBanner();
  const errors = [];
  btn.textContent = "시세 불러오는 중… (Finnhub + Twelve Data)";

  try {
    const [qqqPrice, qqqData, qldHistFull, qldPrice] = await Promise.all([
      fetchQuote("QQQ"), fetchQqqAthAndTrend(), fetchQldHistory(), fetchQuote("QLD")
    ]);
    const qqqCciLast = qqqData.cciHist.length > 0 ? qqqData.cciHist[qqqData.cciHist.length - 1].y : null;
    const qldHist = qldHistFull.slice(-LOOKBACK_CANDLES);   // 표시·통계용 최근 200봉
    const qldCciHist = computeCciSeries(qldHistFull, CCI_PERIOD).slice(-LOOKBACK_CANDLES);
    const qldCciLast = qldCciHist.length > 0 ? qldCciHist[qldCciHist.length - 1].y : null;
    const qldAthInfo = computeAthInfo(qldHist);

    updateHeader(
      { price: qqqPrice, ath: qqqData.ath, athDate: qqqData.athDate, cci: qqqCciLast },
      { price: qldPrice, ath: qldAthInfo.ath, athDate: qldAthInfo.athDate, cci: qldCciLast }
    );
    // 카드 배치 순서대로 렌더링
    renderGuideCard(qldHist, qldPrice, qldCciHist, qldHistFull);   // ① 매수기록 ② LOC(400봉) ③ 추이분석
    renderAccumulateCard(qldHistFull);   // 400봉 워크포워드
    renderQldStreakStats(qldHist);
    renderQldUpStreakStats(qldHist);
    renderQqqTrend(qqqData.hist);
    renderCciCard("qqqCciContent", qqqData.cciHist, "#2FD9C4", "QQQ CCI(20)");
    renderQldStreakBanner(qldHist);
  } catch (e) {
    errors.push("시세: " + e.message);
  }

  await sleep(300);
  btn.textContent = "CNN Fear & Greed 지수 불러오는 중…";

  await sleep(900);
  btn.textContent = "원달러 환율 불러오는 중…";
  try { await fetchUsdKrw(); } catch (e) { errors.push("환율: " + e.message); }

  if (errors.length === 0) showBanner("실시간 시세 · 과거 종가 · 시장심리 · 환율을 모두 정상적으로 불러왔습니다.", true);
  else showBanner("일부 데이터 조회 실패: " + errors.join(" · "), false);

  btn.disabled = false;
  btn.textContent = "↻ 시세 다시 불러오기";
}

function paintHeaderRow(ids, price, ath, cci) {
  const dd = ((price - ath) / ath) * 100;
  document.getElementById(ids.price).textContent = usd(price);
  document.getElementById(ids.ath).textContent = usd(ath);
  const pill = document.getElementById(ids.pill);
  pill.textContent = (dd >= 0 ? "+" : "") + pct(dd);
  pill.classList.toggle("flat", dd > -0.01 && dd < 0.01);
  const cciOk = (cci !== null && cci !== undefined && !isNaN(cci) && cci < 0);
  const cciEl = document.getElementById(ids.cci);
  cciEl.textContent = fmtNum(cci, 1);
  cciEl.classList.remove("pos", "neg");
  cciEl.classList.add(cciOk ? "neg" : "pos");
}

function updateHeader(qqq, qld) {
  paintHeaderRow({ price: "qqqPriceDisplay", ath: "athDisplay", pill: "ddPill", cci: "qqqCciBigDisplay" }, qqq.price, qqq.ath, qqq.cci);
  paintHeaderRow({ price: "qldPriceDisplay", ath: "qldAthDisplay", pill: "qldDdPill", cci: "qldCciBigDisplay" }, qld.price, qld.ath, qld.cci);
  const meta = [];
  if (qqq.athDate) meta.push("QQQ 전고점 " + qqq.athDate);
  if (qld.athDate) meta.push("QLD 전고점 " + qld.athDate);
  document.getElementById("athDateMeta").innerHTML = meta.join("<br>");
  document.getElementById("lastUpdated").textContent = "마지막 조회 " + new Date().toLocaleTimeString("ko-KR");
}

function findNearestBefore(hist, targetX) {
  let best = null;
  for (const d of hist) { if (d.x <= targetX && (best === null || d.x > best.x)) best = d; }
  return best;
}
//@@include format:fmtShortDate
function renderQqqTrend(hist) {
  const last = hist[hist.length - 1];
  let high = -Infinity, low = Infinity, highIdx = 0, lowIdx = 0;
  hist.forEach((d, idx) => {
    if (d.y > high) { high = d.y; highIdx = idx; }
    if (d.y < low) { low = d.y; lowIdx = idx; }
  });
  const avg = hist.reduce((a, d) => a + d.y, 0) / hist.length;
  document.getElementById("qqqTrendContent").innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:var(--teal);">${usd(last.y)}</div>
      <div class="fg-badge" style="color:var(--teal);background:rgba(47,217,196,0.10);border-color:rgba(47,217,196,0.35);">QQQ</div>
    </div>
    <div class="fg-meta-row">
      <div class="fg-meta-item"><div class="fg-meta-label">최고가 (200봉)</div><div class="fg-meta-value" style="color:var(--up);">${usd(high)}</div><div class="fg-meta-label" style="margin:4px 0 0;">${fmtShortDate(hist[highIdx].x)}</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">최저가 (200봉)</div><div class="fg-meta-value" style="color:var(--down);">${usd(low)}</div><div class="fg-meta-label" style="margin:4px 0 0;">${fmtShortDate(hist[lowIdx].x)}</div></div>
      <div class="fg-meta-item"><div class="fg-meta-label">평균가 (200봉)</div><div class="fg-meta-value">${usd(avg)}</div></div>
    </div>
    <div class="fg-chart-wrap">${renderLineChartSvg(hist, "#2FD9C4")}</div>`;
  const bannerEl = document.getElementById("qqqTrendBanner");
  bannerEl.textContent = "QQQ 추이를 정상적으로 불러왔습니다.";
  bannerEl.classList.remove("hidden");
  bannerEl.classList.add("ok");
}

/* ---------- 지지·저항 계산 (카드는 삭제, 추이 분석·LOC 가이드 내부 참고용으로 유지) ---------- */
//@@include qld:computePivotLevels
//@@include qld:computeSrAnalysis

