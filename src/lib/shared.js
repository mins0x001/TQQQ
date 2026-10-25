//@@fn collectBackup
function collectBackup() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (BACKUP_PREFIXES.some(p => k.startsWith(p))) data[k] = localStorage.getItem(k);
    }
  } catch (e) {}
  return { schema: "dash-backup/1", app: BACKUP_APP, version: APP_VERSION, saved: new Date().toISOString(), data };
}
//@@fn downloadSelf
function downloadSelf() {
  try {
    const blob = new Blob([__PRISTINE_HTML], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = FILE_NAME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  } catch (e) { alert("저장에 실패했습니다: " + e.message); }
}
//@@fn exportLocOrder
function exportLocOrder() {
  if (!lastLocOrder || !lastLocOrder.orders.length) { showCopyToast("내보낼 주문이 없습니다", false); return; }
  const name = `loc_orders_${lastLocOrder.symbol}_${lastLocOrder.basis_close_date}.json`;
  try {
    const blob = new Blob([JSON.stringify(lastLocOrder, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    showCopyToast(`✓ ${name} 저장됨 (다운로드 폴더)`, true);
  } catch (e) { showCopyToast("저장 실패: " + e.message, false); }
}
//@@fn fetchRetry
async function fetchRetry(u, opt) {        // 무료 시세 API 는 여러 앱이 동시에 부르면 한도(429)·순간 끊김으로 'Failed to fetch' — 1.5·4·8초 뒤 다시
  let last;
  for (const w of [0, 1500, 4000, 8000]) {
    if (w) await new Promise(r => setTimeout(r, w));
    try { const r = await fetch(u, opt); if (r.status !== 429) return r; last = new Error("요청 한도 초과(429)"); }
    catch (e) { last = e; }
  }
  throw new Error((last && last.message) + " — 4번 시도 실패 (인터넷 연결 또는 시세 API 한도 · 1분 뒤 다시)");
}
//@@fn fhFetch
async function fhFetch(endpoint, params = {}) {
  const url = new URL(`${FINNHUB_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("token", FINNHUB_API_KEY);
  const res = await fetchRetry(url.toString());
  if (!res.ok) throw new Error(`HTTP 오류 (${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
//@@fn gh
async function gh(path, opt) {
  opt = opt || {};
  const headers = { Authorization: "Bearer " + syncTok(), Accept: "application/vnd.github+json" };
  if (opt.body) headers["Content-Type"] = "application/json";
  let r;
  try { r = await fetch("https://api.github.com" + path, { method: opt.method || "GET", headers, body: opt.body, cache: "no-store" }); }
  catch (e) { throw new Error("인터넷 연결 없음 · 연결되면 자동으로 다시 맞춥니다"); }
  if (r.status === 401) throw new Error("토큰이 틀렸거나 만료됐습니다. 새 토큰으로 다시 연결하세요");
  if (r.status === 403 || r.status === 404) throw new Error("토큰에 gist 권한이 없거나 동기화 Gist를 찾을 수 없습니다 (" + r.status + ")");
  if (!r.ok) throw new Error("GitHub 응답 오류 " + r.status);
  return r.json();
}
//@@fn goTab
function goTab(id, opts) {
  const pg = document.getElementById(id);
  if (!pg) return;
  const cur = document.querySelector(".page.on");
  if (cur && cur !== pg) __tabScroll[cur.id] = window.scrollY;
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("on", p === pg));
  document.querySelectorAll("#tabbar .tb").forEach(b => { const on = b.dataset.p === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
  try { sessionStorage.setItem(TAB_SS_KEY, id); } catch (e) {}
  const y = (opts && opts.top) ? 0 : (__tabScroll[id] || 0);
  window.scrollTo({ top: y, behavior: "instant" });
}
//@@fn handleCopyTap
async function handleCopyTap(el) {
  const text = el.dataset.copy, label = el.dataset.label || "값";
  const ok = await copyText(text);
  el.classList.add(ok ? "copied" : "copy-fail");
  setTimeout(() => el.classList.remove("copied", "copy-fail"), 1200);
  showCopyToast(ok ? `✓ ${label} ${text} 복사됨` : `복사 실패 — 길게 눌러 직접 복사하세요 (${text})`, ok);
  if (ok && navigator.vibrate) navigator.vibrate(15);
}
//@@fn hideBanner
function hideBanner() {
  document.getElementById("errorBanner").classList.add("hidden");
}
//@@fn initTabs
function initTabs() {
  document.querySelectorAll("#tabbar .tb").forEach(b => b.addEventListener("click", () => {
    const already = b.classList.contains("on");
    goTab(b.dataset.p, { top: already });   // 같은 탭을 다시 누르면 맨 위로
  }));
  document.addEventListener("click", e => { const g = e.target.closest("[data-goto]"); if (g) goTab(g.dataset.goto, { top: true }); });
  let saved = null;
  try { saved = sessionStorage.getItem(TAB_SS_KEY); } catch (e) {}
  if (saved && document.getElementById(saved)) goTab(saved);
  applyViewMode();
  /* 카드가 다시 그려질 때 생기는 설명 문구(각주)를 📖설명 탭으로 옮김 + 주문 탭 알림 점 */
  const dynBox = {};
  document.querySelectorAll(".help-dyn").forEach(d => dynBox[d.dataset.for] = d);
  let pend = false;
  const sync = () => {
    pend = false;
    Object.keys(dynBox).forEach(cid => {
      const card = document.getElementById(cid);
      if (!card) return;
      const notes = card.querySelectorAll("p.desc");
      if (!notes.length) return;
      dynBox[cid].innerHTML = "";
      notes.forEach(n => { n.removeAttribute("style"); dynBox[cid].appendChild(n); });
    });
    const t0 = document.querySelector('#tabbar .tb[data-p="pg-order"]');
    if (t0) t0.classList.toggle("alert", !!document.querySelector(".cycle-alert"));
  };
  new MutationObserver(() => { if (!pend) { pend = true; requestAnimationFrame(sync); } })
    .observe(document.body, { childList: true, subtree: true });
  sync();
}
//@@fn loadTrades
function loadTrades() { try { const a = JSON.parse(localStorage.getItem(TRADES_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
//@@fn saveSyncMeta
function saveSyncMeta(m) { lsSet(SYNC.metaKey, JSON.stringify(m)); }
//@@fn setBkMsg
function setBkMsg(t, ok) { const m = document.getElementById("bkMsg"); m.textContent = t; m.className = "bk-msg " + (ok ? "ok" : "err"); }
//@@fn showBanner
function showBanner(msg, ok) {
  const el = document.getElementById("errorBanner");
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.toggle("ok", !!ok);
}
//@@fn showCopyToast
function showCopyToast(msg, ok) {
  let t = document.getElementById("copyToast");
  if (!t) { t = document.createElement("div"); t.id = "copyToast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "copy-toast show" + (ok ? "" : " fail");
  clearTimeout(showCopyToast._tm);
  showCopyToast._tm = setTimeout(() => { t.className = "copy-toast"; }, 1600);
}
//@@fn syncSchedule
function syncSchedule(ms) { if (!syncTok() || !syncGist()) return; clearTimeout(__syncTimer); __syncTimer = setTimeout(() => syncNow("auto"), ms); }
//@@fn computeCciSeries
function computeCciSeries(hist, period) {
  const out = [];
  for (let i = period - 1; i < hist.length; i++) {
    const window = hist.slice(i - period + 1, i + 1).map(d => d.y);
    const sma = window.reduce((a, b) => a + b, 0) / period;
    const meanDev = window.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
    const cci = meanDev === 0 ? 0 : (hist[i].y - sma) / (0.015 * meanDev);
    out.push({ x: hist[i].x, y: cci });
  }
  return out;
}
