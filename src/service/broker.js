/* ======================== 💼 증권사 체결 → 나의 매수 기록 · 사이클 기록 자동 등록 (V0.72) ========================
   자동주문 봇이 동기화 Gist에 남기는 muhan-account.json(계좌 보유 + 체결내역 전 기간 → 사이클 복원)을 읽어
   · 이번 사이클 매수 기록 = 증권사 체결 그대로 (스냅숏이 반영한 날짜 이후에 직접 넣은 기록은 유지)
   · 끝난 사이클 = 사이클 기록에 자동 추가 (같은 날·±3일 같은 수량의 직접 기록이 있으면 그대로 둠)
   바꾸기 전 기록은 이 기기에 백업 → [되돌리기]. 끄면 예전처럼 직접 입력 + 종가 추정 자동 저장.
   복원이 불완전하면(입고·액면분할 등으로 '보유 0' 시점을 못 찾음) 아무것도 바꾸지 않는다. */
const ACCT_KEY = "muhan_account_v1";
const API_SYNC_KEY = LEV_TICKER.toLowerCase() + "_api_sync_v1";
const API_BACKUP_KEY = LEV_TICKER.toLowerCase() + "_api_backup_v1";
function acctData() { try { const a = JSON.parse(lsGet(ACCT_KEY) || "null"); return a && typeof a === "object" ? a : null; } catch (e) { return null; } }
function acctSym() { const a = acctData(); return a && a.symbols && a.symbols[LEV_TICKER] ? a.symbols[LEV_TICKER] : null; }
function apiSyncOn() { return lsGet(API_SYNC_KEY) !== "off"; }
function apiActive() { const s = acctSym(); return !!(apiSyncOn() && syncTok() && syncGist() && s && s.complete && s.current); }
function apiIdOf(key, kind) { const d = String(key).replace(/\D/g, "").slice(-14); return Number(d) * 10 + (kind || 1); }
const apiR4 = x => Math.round(Number(x) * 1e4) / 1e4;
const apiDayGap = (a, b) => Math.abs((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 864e5);
function apiWhen(iso) { const d = new Date(iso); return isNaN(d) ? "-" : d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function apiInfoLine() { const a = acctData(); return `💼 증권사 체결내역으로 자동 등록 중 (${a ? apiWhen(a.as_of) : "-"} 기준) — 종가 추정 자동 저장은 쉬고 있습니다`; }
⟦@s038⟧function apiReconcile(m, g) {
  try {
⟦@s039⟧    if (f && f.content) { const a = JSON.parse(f.content); if (a && typeof a === "object") lsSet(ACCT_KEY, f.content); }
  } catch (e) {}
  if (!apiActive()) return "";
  const a = acctData(), s = acctSym();
  const covered = a.covered || a.et_date || "";
  if (!covered) return "";
  const notes = [];
  /* ① 이번 사이클 매수 기록 */
  const want = (s.current.records || []).filter(x => x.date <= covered)
    .map(x => ({ id: apiIdOf(x.key, x.synthetic ? 9 : 1), date: x.date, qty: Number(x.qty), price: apiR4(x.price), api: true, synthetic: !!x.synthetic }));
  const keep = (m.records || []).filter(r => r.date > covered && !r.api);
  const next = sortRecs([...want, ...keep]);
  const canon = arr => JSON.stringify(sortRecs(arr).map(r => [r.date, +r.qty, apiR4(r.price)]));
  const wantKeys = new Set(want.map(recKeyOf));
  let changed = false;
  if (canon(next) !== canon(m.records || [])) {
    try { lsSet(API_BACKUP_KEY, JSON.stringify({ at: Date.now(), records: m.records || [], trades: m.trades || [] })); } catch (e) {}
    const nk = new Set(next.map(recKeyOf));
    const removed = (m.records || []).map(recKeyOf).filter(k => !nk.has(k));
    m.tombs = [...new Set([...(m.tombs || []), ...removed])].slice(-500);
    m.records = next;
    notes.push(`매수 기록 ${want.length}건을 증권사 체결로 맞춤`);
    changed = true;
  }
  m.tombs = (m.tombs || []).filter(k => !wantKeys.has(k));      // 체결 기록은 지움 표시보다 우선
  /* ② 끝난 사이클 */
  let added = 0, upd = 0;
  const trades = (m.trades || []).slice();
  for (const c of s.cycles || []) {
    if (!c.sell_date || c.sell_date > covered) continue;
    const tr = { id: apiIdOf(c.key, 3), sellDate: c.sell_date, sellPrice: apiR4(c.sell_price), qty: Number(c.qty), avg: Number(c.avg), cost: Number(c.cost),
                 proceeds: Number(c.proceeds), profit: Number(c.profit), pct: Number(c.pct), rounds: c.rounds, firstBuy: c.first_buy,
                 auto: true, api: true, limit: null, note: "증권사 체결", buys: (c.buys || []).map(b => ({ date: b.date, qty: Number(b.qty), price: apiR4(b.price), auto: true })) };
    const i = trades.findIndex(t => t.sellDate === c.sell_date || (apiDayGap(t.sellDate, c.sell_date) <= 3 && Math.abs(t.qty - c.qty) < 1e-6));
    if (i === -1) { trades.push(tr); added++; }
    else if (trades[i].auto && !trades[i].api && trades[i].sellDate === c.sell_date) {
      ["splits", "mult", "tdays", "mdd"].forEach(k => { if (trades[i][k] !== undefined) tr[k] = trades[i][k]; });
      trades[i] = tr; upd++;
    }
  }
  if (added || upd) {
    if (!changed) { try { lsSet(API_BACKUP_KEY, JSON.stringify({ at: Date.now(), records: m.records || [], trades: m.trades || [] })); } catch (e) {} }
    m.trades = trades.sort((x, y) => x.sellDate < y.sellDate ? -1 : x.sellDate > y.sellDate ? 1 : x.id - y.id);
    const live = new Set(m.trades.map(tradeTombOf));
    m.tombs = (m.tombs || []).filter(k => !live.has(k));
    if (added) notes.push(`끝난 사이클 ${added}건 추가`);
    if (upd) notes.push(`사이클 ${upd}건을 실제 체결가로 갱신`);
  }
  return notes.length ? "💼 증권사 체결 반영: " + notes.join(" · ") : "";
}
function apiStripHtml(where) {
  if (!syncTok() || !syncGist()) return "";
  const a = acctData(), s = acctSym(), on = apiSyncOn();
  const e = x => String(x == null ? "" : x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const go = `<a class="as-a" href="api.html">💼 계좌 다시 읽기 ›</a>`;
  if (!a || !a.symbols) return `<div class="api-strip off"><div class="as-h"><b>💼 증권사 체결 자동 등록</b><span>준비 전</span></div>
    자동주문(해외) 앱에서 <b>[💼 계좌 현황]</b>을 한 번 누르면(또는 봇이 다음에 돌면) 체결내역으로 매수 기록·사이클 기록이 자동으로 채워집니다.${a && a.error ? `<br>⚠ ${e(a.error)}` : ""}<div class="as-btns">${go}</div></div>`;
  const bk = (() => { try { return JSON.parse(lsGet(API_BACKUP_KEY) || "null"); } catch (x) { return null; } })();
  const undo = bk ? `<button type="button" data-api-act="undo">↩ 되돌리기 (${apiWhen(new Date(bk.at).toISOString())} 이전)</button>` : "";
  const tog = `<button type="button" data-api-act="toggle">${on ? "자동 등록 끄기" : "자동 등록 켜기"}</button>`;
  if (!s) return `<div class="api-strip off"><div class="as-h"><b>💼 증권사 체결</b><span>${apiWhen(a.as_of)}</span></div>${LEV_TICKER} 정보가 없습니다.<div class="as-btns">${go}</div></div>`;
  const recs = sortedBuyRecords(), q = recs.reduce((x, r) => x + r.qty, 0), avg = q ? recs.reduce((x, r) => x + r.qty * r.price, 0) / q : 0;
  const same = Math.abs(q - s.qty) < 1e-6 && (!q || Math.abs(avg / s.avg - 1) < 0.002);
  const acctTxt = `계좌 <b>${Number(s.qty).toLocaleString("en-US")}주</b>${s.qty ? ` @ ${usd(s.avg)}` : ""}` + (a.symbols[LEV_TICKER].price ? ` · 현재가 ${usd(a.symbols[LEV_TICKER].price)}` : "");
  const matchTxt = same ? `<span class="ok">= 앱 기록 일치 ✓</span>` : `<span class="bad">앱 기록 ${q.toLocaleString("en-US")}주${q ? " @ " + usd(avg) : ""}</span>`;
  if (!on) return `<div class="api-strip off"><div class="as-h"><b>💼 증권사 체결 자동 등록 꺼짐</b><span>${apiWhen(a.as_of)}</span></div>${acctTxt} · ${matchTxt}<br>직접 입력과 종가 추정 자동 저장을 씁니다.<div class="as-btns">${tog}${undo}${go}</div></div>`;
  if (!s.complete) return `<div class="api-strip warn"><div class="as-h"><b>💼 자동 맞춤 보류</b><span>${apiWhen(a.as_of)}</span></div>${acctTxt} · ${matchTxt}<br>⚠ ${e(s.why || "체결 복원 불완전")} — 기록은 그대로 두고 직접 입력·종가 추정 자동 저장을 씁니다.<div class="as-btns">${tog}${go}</div></div>`;
  const body = where === "cy"
    ? `체결내역으로 복원한 끝난 사이클 <b>${(s.cycles || []).length}건</b>${s.since ? ` (${e(s.since)}부터)` : ""} · 같은 날 직접 기록이 있으면 그대로 둡니다`
    : `${acctTxt} · ${matchTxt}<br>이번 사이클 체결 <b>${(s.current.records || []).length}건</b>${s.current.start ? ` (${e(s.current.start)}부터)` : ""} · ${e(a.covered || a.et_date)} 장까지 반영${s.note ? `<br>ℹ️ ${e(s.note)}` : ""}`;
  return `<div class="api-strip"><div class="as-h"><b>💼 증권사 체결 자동 등록 ON</b><span>${apiWhen(a.as_of)}</span></div>${body}<div class="as-btns">${tog}${undo}${go}</div></div>`;
}
function renderApiStrips() {
  const r = document.getElementById("apiRecStrip"), c = document.getElementById("apiCyStrip");
  if (r) r.innerHTML = apiStripHtml("rec");
  if (c) c.innerHTML = apiStripHtml("cy");
}
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-api-act]"); if (!b) return;
  if (b.dataset.apiAct === "toggle") {
    const on = apiSyncOn();
    if (on) { lsSet(API_SYNC_KEY, "off"); showCopyToast("💼 체결 자동 등록을 껐습니다 (이 기기)", true); }
    else { lsDel(API_SYNC_KEY); showCopyToast("💼 체결 자동 등록을 켰습니다 — 동기화 중…", true); syncNow("manual"); }
    renderApiStrips(); renderBuyRecords(); renderLocGuideCard();
  } else if (b.dataset.apiAct === "undo") {
    let bk = null; try { bk = JSON.parse(lsGet(API_BACKUP_KEY) || "null"); } catch (x) {}
    if (!bk || !confirm(`체결 자동 등록 전 기록(매수 ${(bk.records || []).length}건 · 사이클 ${(bk.trades || []).length}건)으로 되돌리고 자동 등록을 끌까요?`)) return;
    lsSet(API_SYNC_KEY, "off");
    saveBuyRecordsToStorage(bk.records || []); saveTrades(bk.trades || []); lsDel(API_BACKUP_KEY);
    showCopyToast("↩ 되돌렸습니다 · 자동 등록 꺼짐", true);
    renderApiStrips(); renderBuyRecords(); renderLocGuideCard();
  }
});

let __syncBusy = false, __syncAgain = false, __syncErr = "";
async function syncNow(why) {
  if (!syncTok() || !syncGist()) { syncRender(); return; }
  if (__syncBusy) { __syncAgain = true; return; }
  __syncBusy = true; syncRender("busy");
  let note = "";
  try {
    const g = await gh("/gists/" + syncGist());
    try { botLoadFromGist(g); } catch (e) {}
    const f = g.files && g.files[SYNC.file];
    let remote = {};
    try { remote = f && f.content ? JSON.parse(f.content) : {}; } catch (e) { remote = {}; }
    const meta = syncMeta();
    const local = { records: loadBuyRecords(), skip: loadAutoSkip(), tombs: meta.tombs, trades: loadTrades() };
    const m = mergeDocs(local, remote);
    const apiNote = apiReconcile(m, g);          // 💼 증권사 체결 → 매수 기록·사이클 (켜져 있고 복원이 완전할 때만)
    const recLocalChanged = canonTrades(m.trades) !== canonTrades(local.trades) || canonRecs(m.records) !== canonRecs(local.records) || JSON.stringify(m.skip) !== JSON.stringify([...(local.skip || [])].sort().slice(-60));
    /* 설정 동기화: 마지막으로 바꾼 기기가 이김(같으면 원격 우선 → 기기끼리 덮어쓰기 반복 없음) */
    const pLocal = paramsCore(loadParamMode()), pRemote = remote.params || null;
    const atL = meta.paramsAt || 0, atR = remote.paramsAt || 0;
    const useLocalP = !pRemote || atL > atR;
    const pFinal = useLocalP ? pLocal : pRemote, atFinal = useLocalP ? atL : atR;
    let paramsApplied = false;
    if (!useLocalP && JSON.stringify(pRemote) !== JSON.stringify(pLocal)) { applyParamsCore(pRemote); paramsApplied = true; }
    meta.paramsAt = atFinal;
    const paramsRemoteChanged = JSON.stringify(pFinal) !== JSON.stringify(pRemote) || atFinal !== atR;
    const remoteChanged = paramsRemoteChanged || canonTrades(m.trades) !== canonTrades(remote.trades) || canonRecs(m.records) !== canonRecs(remote.records) || JSON.stringify(m.skip) !== JSON.stringify(remote.skip || []) || JSON.stringify(m.tombs) !== JSON.stringify(remote.tombs || []);
    if (recLocalChanged) {
      const before = local.records.length;
      __syncMute = true;
      try { localStorage.setItem(BUY_RECORDS_KEY, JSON.stringify(m.records)); localStorage.setItem(AUTO_SKIP_KEY, JSON.stringify(m.skip)); localStorage.setItem(TRADES_KEY, JSON.stringify(m.trades)); }
      finally { __syncMute = false; }
      const d = m.records.length - before;
      const dT = m.trades.length - local.trades.length;
      note = dT > 0 ? `다른 기기에서 끝난 사이클 ${dT}건 반영` : d > 0 ? `다른 기기 기록 ${d}건 추가됨` : d < 0 ? `다른 기기에서 지운 ${-d}건 반영` : "다른 기기 변경 반영";
      try { renderBuyRecords(); renderLocGuideCard(); if (typeof updateBuyQtyHint === "function") updateBuyQtyHint(); } catch (e) {}
    }
    if (apiNote) { note = apiNote; try { renderBuyRecords(); renderLocGuideCard(); } catch (e) {} }
    /* 사이클 Markdown 일지: 내용이 달라졌을 때만 다시 씀 */
    const md = buildCycleMarkdown(), remoteMd = (g.files && g.files[CYCLE_MD_FILE] && g.files[CYCLE_MD_FILE].content) || "";
    const mdChanged = (m.trades.length > 0 || remoteMd !== "") && md !== remoteMd;
    if (remoteChanged || mdChanged) {
      const files = {};
      if (remoteChanged) files[SYNC.file] = { content: JSON.stringify({ schema: "muhan-sync/1", app: SYNC.app, version: APP_VERSION, updated: new Date().toISOString(), device: syncDevice(), records: m.records, skip: m.skip, tombs: m.tombs, trades: m.trades, params: pFinal, paramsAt: atFinal }) };
      if (mdChanged) files[CYCLE_MD_FILE] = { content: md };
      await gh("/gists/" + syncGist(), { method: "PATCH", body: JSON.stringify({ files }) });
      if (!note) note = mdChanged && !remoteChanged ? "사이클 기록 문서를 갱신했습니다" : "이 기기 변경을 올렸습니다";
    }
    if (paramsApplied && !note) note = "다른 기기 설정(시드·모드) 반영";
    meta.tombs = m.tombs; meta.last = Date.now(); meta.dirty = false; meta.remoteDevice = remote.device || ""; meta.note = note || meta.note || "";
    saveSyncMeta(meta);
    __syncErr = "";
    if (note && why !== "load") showCopyToast("☁ " + note, true);
    try { renderApiStrips(); } catch (e) {}
  } catch (e) {
    __syncErr = e.message;
  } finally {
    __syncBusy = false; syncRender();
    if (__syncAgain) { __syncAgain = false; syncSchedule(300); }
  }
}

function syncRender(state) {
  try { const lk = document.getElementById("cyLink"); if (lk) { const g = syncGist(); lk.hidden = !(syncTok() && g); lk.href = "https://gist.github.com/" + g; } } catch (e) {}
  const st = document.getElementById("syncState"), chip = document.getElementById("syncChip");
  const setup = document.getElementById("syncSetup"), on = document.getElementById("syncOn");
  if (!st) return;
  const connected = !!(syncTok() && syncGist()), meta = syncMeta();
  setup.hidden = connected; on.hidden = !connected; chip.hidden = !connected;
  st.className = "sync-state"; chip.className = "sync-chip";
  if (!connected) { st.textContent = "동기화 꺼짐 · 이 기기에만 저장 중. 토큰을 붙여넣고 연결하면 PC와 폰이 같은 기록을 씁니다."; return; }
  const t = meta.last ? new Date(meta.last).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
  const n = loadBuyRecords().length;
  if (state === "busy") { st.textContent = "☁ 동기화 중…"; chip.classList.add("busy"); chip.textContent = "☁ 동기화 중"; return; }
  if (__syncErr) {
    st.classList.add("err"); chip.classList.add("err"); chip.textContent = "☁ 확인 필요";
    st.textContent = `⚠ ${__syncErr}` + (meta.dirty ? " · 이 기기 변경은 저장돼 있고 연결되면 올라갑니다." : "");
    return;
  }
  st.classList.add("ok"); chip.classList.add("ok"); chip.textContent = "☁ 동기화됨";
  st.textContent = `✅ 동기화 켜짐 (${syncDevice()}) · 기록 ${n}건 · 마지막 ${t}` + (meta.note ? ` · ${meta.note}` : "");
}

document.getElementById("syncConnectBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncConnectBtn"), inp = document.getElementById("syncToken");
  const tok = inp.value.trim();
  if (!/^(ghp_|github_pat_)[A-Za-z0-9_]{20,}$/.test(tok)) { __syncErr = "토큰 형식이 아닙니다. ghp_로 시작하는 토큰 전체를 붙여넣으세요"; syncRenderSetupErr(); return; }
  btn.disabled = true; btn.textContent = "연결 중…";
  lsSet(SYNC.tokKey, tok);
  try {
    let id = "";
    for (let page = 1; page <= 3 && !id; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const hit = list.find(x => x.description === SYNC.desc);
      if (hit) id = hit.id;
      if (list.length < 100) break;
    }
    if (!id) {
      const init = JSON.stringify({ schema: "muhan-sync/1", records: [], skip: [], tombs: [] });
⟦@s040⟧      id = g.id;
    }
    lsSet(SYNC.gistKey, id); inp.value = ""; __syncErr = "";
    await syncNow("connect");
  } catch (e) {
    lsDel(SYNC.tokKey); lsDel(SYNC.gistKey); __syncErr = e.message; syncRenderSetupErr();
  } finally { btn.disabled = false; btn.textContent = "☁️ 연결하고 동기화 시작"; }
});
function syncRenderSetupErr() { syncRender(); const st = document.getElementById("syncState"); st.className = "sync-state err"; st.textContent = "⚠ " + __syncErr; __syncErr = ""; }
document.getElementById("syncNowBtn").addEventListener("click", () => syncNow("manual"));
let __syncOffArm = 0;
document.getElementById("syncOffBtn").addEventListener("click", () => {
  const b = document.getElementById("syncOffBtn");
  if (Date.now() - __syncOffArm > 4000) { __syncOffArm = Date.now(); b.textContent = "한 번 더 = 해제"; setTimeout(() => b.textContent = "연결 해제", 4000); return; }
  lsDel(SYNC.tokKey); lsDel(SYNC.gistKey); __syncErr = ""; b.textContent = "연결 해제";
  syncRender(); showCopyToast("이 기기의 동기화를 껐습니다 (기록은 그대로)", true);
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - syncMeta().last > 15000) syncSchedule(200); });
window.addEventListener("online", () => syncSchedule(500));
setInterval(() => { if (!document.hidden) syncSchedule(100); }, 90000);
syncRender();
try { renderApiStrips(); } catch (e) {}
syncSchedule(400);
