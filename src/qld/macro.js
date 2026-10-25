/* ======================== 매크로 3대 지표 (CPI · 10Y · Fed) ======================== */
const MC_CACHE = { cpi: ["qldcache_cpi_v1", 12 * 3600e3], ust: ["qldcache_ust_v1", 6 * 3600e3] };
const FED_LOG_KEY = "qld_fed_log_v1";
const mcFmt = (t) => { const d = new Date(t); return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`; };
function mcNearestBefore(hist, x) { let b = null; for (const d of hist) if (d.x <= x && (!b || d.x > b.x)) b = d; return b; }
function mcCacheGet(k) { try { const c = JSON.parse(localStorage.getItem(MC_CACHE[k][0]) || "null"); return c && Array.isArray(c.hist) ? c : null; } catch (e) { return null; } }
function mcCacheSet(k, hist) { try { localStorage.setItem(MC_CACHE[k][0], JSON.stringify({ t: Date.now(), hist })); } catch (e) {} }
function mcStamp(id, t, fromCache) { const el = document.getElementById(id); if (el) el.textContent = `${fromCache ? "캐시" : "조회"} ${new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`; }
function mcBanner(id, msg, ok) { const el = document.getElementById(id); if (!el) return; if (!msg) { el.classList.add("hidden"); return; } el.textContent = msg; el.classList.remove("hidden"); el.classList.toggle("ok", !!ok); }

function mcLineSvg(hist, opts) {
  opts = opts || {};
  const W = 480, H = 170, padL = 40, padR = 10, padT = 8, padB = 20, pw = W - padL - padR, ph = H - padT - padB;
  const xs = hist.map(d => d.x), ys = hist.map(d => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = (maxY - minY) * 0.12 || Math.abs(maxY) * 0.05 || 1; minY -= pad; maxY += pad;
  if (opts.refLine !== undefined) { minY = Math.min(minY, opts.refLine - pad); maxY = Math.max(maxY, opts.refLine + pad); }
  const X = x => padL + ((x - minX) / (maxX - minX || 1)) * pw, Y = y => padT + (1 - (y - minY) / (maxY - minY || 1)) * ph;
  const grid = [0, .25, .5, .75, 1].map(f => minY + (maxY - minY) * f).map(v => `<line x1="${padL}" y1="${Y(v)}" x2="${W - padR}" y2="${Y(v)}" stroke="#1E293F"/><text x="${padL - 6}" y="${Y(v) + 3}" text-anchor="end" font-size="9" fill="#5C6A82" font-family="JetBrains Mono, monospace">${v.toFixed(opts.decimals ?? 1)}</text>`).join("");
  const ref = opts.refLine !== undefined ? `<line x1="${padL}" y1="${Y(opts.refLine)}" x2="${W - padR}" y2="${Y(opts.refLine)}" stroke="${opts.refColor || "#F5A524"}" stroke-width="1.2" stroke-dasharray="4,3"/>` : "";
  const c = opts.color || "#5EEAD4", last = hist[hist.length - 1];
  const pts = hist.map(d => `${X(d.x)},${Y(d.y)}`).join(" ");
  const area = `${X(hist[0].x)},${padT + ph} ${pts} ${X(last.x)},${padT + ph}`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">${grid}${ref}
    <polygon points="${area}" fill="${c}" opacity="0.08"/>
    <polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(last.x)}" cy="${Y(last.y)}" r="4" fill="${c}" stroke="#04211C" stroke-width="1.5"/>
    <text x="${padL}" y="${H - 4}" font-size="10" fill="#5C6A82">${mcFmt(minX)}</text>
    <text x="${W - padR}" y="${H - 4}" font-size="10" fill="#5C6A82" text-anchor="end">${mcFmt(maxX)}</text></svg>`;
}
function mcDelta(base, last, unit, dec) {
  if (!base) return `<div class="fg-meta-value" style="color:var(--text-faint);">--</div>`;
  const d = last.y - base.y, col = d > 0 ? "var(--down)" : d < 0 ? "var(--up)" : "var(--text-dim)";
  return `<div class="fg-meta-value" style="color:${col};">${d > 0 ? "▲" : d < 0 ? "▼" : "―"} ${Math.abs(d).toFixed(dec ?? 2)}${unit || ""}</div>`;
}
const mcMeta = (label, cell) => `<div class="fg-meta-item"><div class="fg-meta-label">${label}</div>${cell}</div>`;
const mcRows = (rows) => rows.map(r => ({ x: new Date(r.date + "T00:00:00Z").getTime(), y: parseFloat(r.value) })).filter(d => !isNaN(d.y)).sort((a, b) => a.x - b.x);

/* --- CPI --- */
function inflationRating(y) {
  if (y >= 5) return { key: "고물가 경계", color: "#F0475A" };
  if (y >= 3) return { key: "목표 상회", color: "#F5A524" };
  if (y >= 1.5) return { key: "목표(2%) 근접", color: "#38D98C" };
  return { key: "저물가", color: "#2FD9C4" };
}
function renderCpi(idx) {
  const yoy = [];
  for (let i = 12; i < idx.length; i++) if (idx[i - 12].y > 0) yoy.push({ x: idx[i].x, y: (idx[i].y - idx[i - 12].y) / idx[i - 12].y * 100 });
  if (!yoy.length) throw new Error("YoY를 계산할 데이터가 부족합니다.");
  const last = yoy[yoy.length - 1], r = inflationRating(last.y), li = idx[idx.length - 1], day = 864e5;
  document.getElementById("cpiContent").innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:${r.color};">${last.y.toFixed(2)}<span style="font-size:14px;color:var(--text-dim);font-weight:600;"> % YoY</span></div>
      <div class="fg-badge" style="color:${r.color};background:${r.color}1F;border-color:${r.color}59;">${r.key}</div>
    </div>
    <div class="fg-meta-row mc3">${mcMeta("전월 대비", mcDelta(yoy[yoy.length - 2], last, "%p"))}${mcMeta("3개월 전 대비", mcDelta(mcNearestBefore(yoy, last.x - 90 * day), last, "%p"))}${mcMeta("1년 전 대비", mcDelta(mcNearestBefore(yoy, last.x - 365 * day), last, "%p"))}</div>
    <div class="fg-chart-wrap">${mcLineSvg(yoy.slice(-36), { color: "#2FD9C4", refLine: 2, refColor: "#F5A524", decimals: 1 })}</div>
    <div class="fg-legend"><span><span class="dot" style="background:#F5A524;"></span>Fed 목표 2%</span><span class="mono">CPI 지수 ${li.y.toFixed(1)} (${mcFmt(li.x)} 기준월)</span></div>`;
}
/* --- 10Y --- */
function renderUst(h) {
  const last = h[h.length - 1], day = 864e5;
  document.getElementById("ustContent").innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:var(--glow);">${last.y.toFixed(2)}<span style="font-size:14px;color:var(--text-dim);font-weight:600;"> %</span></div>
      <div class="fg-badge" style="color:var(--glow);background:rgba(94,234,212,0.10);border-color:rgba(94,234,212,0.35);">${mcFmt(last.x)}</div>
    </div>
    <div class="fg-meta-row mc3">${mcMeta("전일 대비", mcDelta(h[h.length - 2], last, "%p"))}${mcMeta("1주 전 대비", mcDelta(mcNearestBefore(h, last.x - 7 * day), last, "%p"))}${mcMeta("1개월 전 대비", mcDelta(mcNearestBefore(h, last.x - 30 * day), last, "%p"))}</div>
    <div class="fg-chart-wrap">${mcLineSvg(h.slice(-180), { color: "#5EEAD4", decimals: 2 })}</div>`;
}
const MC_SPEC = {
  cpi: { btn: "cpiFetchBtn", banner: "cpiBanner", stamp: "cpiStamp", params: { function: "CPI", interval: "monthly" }, render: renderCpi, trim: 60 },
  ust: { btn: "ustFetchBtn", banner: "ustBanner", stamp: "ustStamp", params: { function: "TREASURY_YIELD", interval: "daily", maturity: "10year" }, render: renderUst, trim: 260 },
};
async function mcLoad(k, force) {
  const sp = MC_SPEC[k], c = mcCacheGet(k);
  if (c) { try { sp.render(c.hist); mcStamp(sp.stamp, c.t, true); } catch (e) {} }
  if (!force && c && Date.now() - c.t < MC_CACHE[k][1]) return false;
  const btn = document.getElementById(sp.btn); btn.disabled = true; btn.textContent = "불러오는 중…";
  try {
    const data = await avFetch(sp.params);
    const hist = mcRows(data.data || []).slice(-sp.trim);
    if (!hist.length) throw new Error("데이터가 없습니다.");
    sp.render(hist); mcCacheSet(k, hist); mcStamp(sp.stamp, Date.now(), false); mcBanner(sp.banner, "");
  } catch (e) {
    mcBanner(sp.banner, "조회 실패: " + e.message + (c ? " · 마지막 캐시 값을 표시합니다." : " · Alpha Vantage 무료 키는 분당 5회 · 일 25회 제한이 있습니다."), false);
  } finally { btn.disabled = false; btn.textContent = "↻ 새로고침"; }
  return true;
}
let __mcAuto = false;
async function mcAutoLoad() {
  if (__mcAuto) return; __mcAuto = true;
  const called = await mcLoad("cpi", false);
  if (called) await sleep(1500);            // 분당 호출 제한 여유
  await mcLoad("ust", false);
}
document.getElementById("cpiFetchBtn").addEventListener("click", () => mcLoad("cpi", true));
document.getElementById("ustFetchBtn").addEventListener("click", () => mcLoad("ust", true));

/* --- Fed 확률 수동 기록 --- */
function getFedLog() { try { const a = JSON.parse(localStorage.getItem(FED_LOG_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function fedColor(h) { return h >= 60 ? "#F0475A" : h >= 30 ? "#F5A524" : "#38D98C"; }
const fedPct = v => (v !== null && v !== undefined && !isNaN(v)) ? v.toFixed(1) + "%" : "--";
function renderFedLog() {
  const arr = getFedLog(), el = document.getElementById("fedContent");
  if (!arr.length) { el.innerHTML = `<div class="fg-empty">기록을 저장하면 인상 확률 추이 차트가 표시됩니다.</div>`; return; }
  const last = arr[arr.length - 1], col = fedColor(last.hike);
  const rows = arr.slice(-8).reverse().map(e => `<tr><td>${(() => { const d = new Date(e.recordedAt); return `${d.getMonth() + 1}/${d.getDate()}`; })()}</td><td>${e.meetingDate.slice(2).replace(/-/g, ".")}</td><td style="color:${fedColor(e.hike)};">${fedPct(e.hike)}</td><td>${fedPct(e.hold)}</td><td>${fedPct(e.cut)}</td></tr>`).join("");
  el.innerHTML = `
    <div class="fg-header-row">
      <div class="fg-score mono" style="color:${col};">${last.hike.toFixed(1)}<span style="font-size:14px;color:var(--text-dim);font-weight:600;"> % 인상</span></div>
      <div class="fg-badge" style="color:${col};background:${col}1F;border-color:${col}59;">회의 ${last.meetingDate.slice(5).replace("-", "/")}</div>
    </div>
    <div class="fg-meta-row mc3">${mcMeta("동결 확률", `<div class="fg-meta-value">${fedPct(last.hold)}</div>`)}${mcMeta("인하 확률", `<div class="fg-meta-value">${fedPct(last.cut)}</div>`)}${mcMeta("누적 기록", `<div class="fg-meta-value">${arr.length}건</div>`)}</div>
    ${arr.length >= 2 ? `<div class="fg-chart-wrap">${mcLineSvg(arr.map(e => ({ x: e.recordedAt, y: e.hike })), { color: col, decimals: 0 })}</div>` : `<div class="fg-empty">추이 차트는 2건 이상 기록하면 표시됩니다.</div>`}
    <table class="mc-log"><thead><tr><th>기록일</th><th>회의일</th><th>인상</th><th>동결</th><th>인하</th></tr></thead><tbody>${rows}</tbody></table>`;
}
document.getElementById("fedSaveBtn").addEventListener("click", () => {
  const msg = document.getElementById("fedMsg");
  const md = document.getElementById("fedMeetingDate").value;
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : v; };
  const hike = num("fedHikeInput");
  if (!md) { msg.textContent = "FOMC 회의일을 선택하세요."; return; }
  if (hike === null) { msg.textContent = "인상 확률을 입력하세요."; return; }
  const arr = getFedLog();
  arr.push({ recordedAt: Date.now(), meetingDate: md, hike, hold: num("fedHoldInput"), cut: num("fedCutInput") });
  arr.sort((a, b) => a.recordedAt - b.recordedAt);
  try { localStorage.setItem(FED_LOG_KEY, JSON.stringify(arr)); msg.textContent = `저장했습니다 · 인상 ${hike}% (회의 ${md})`; } catch (e) { msg.textContent = "저장 실패: " + e.message; }
  ["fedHikeInput", "fedHoldInput", "fedCutInput"].forEach(id => document.getElementById(id).value = "");
  renderFedLog();
});
let __fedArm = 0;
document.getElementById("fedResetBtn").addEventListener("click", () => {
  const btn = document.getElementById("fedResetBtn"), msg = document.getElementById("fedMsg");
  if (!getFedLog().length) { msg.textContent = "삭제할 기록이 없습니다."; return; }
  if (Date.now() - __fedArm > 4000) { __fedArm = Date.now(); btn.textContent = "한 번 더 = 삭제"; msg.textContent = "Fed 확률 기록을 모두 지웁니다. 4초 안에 한 번 더 누르세요."; setTimeout(() => btn.textContent = "전체 삭제", 4000); return; }
  try { localStorage.removeItem(FED_LOG_KEY); } catch (e) {}
  btn.textContent = "전체 삭제"; msg.textContent = "Fed 확률 기록을 삭제했습니다."; renderFedLog();
});
renderFedLog();
/* 지표 탭을 처음 열 때 자동 조회 (캐시가 신선하면 API 호출 없음) */

initQuickNav();

