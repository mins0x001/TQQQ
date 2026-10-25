/* ======================== ☁️ PC · 모바일 기록 동기화 (GitHub 비공개 Gist) ========================
   SOXL·TQQQ와 같은 Gist(muhan-sync)의 qld.json. 대상: 매수 기록·자동저장 건너뛰기·매도 기록·Fed 확률 기록 */
const SYNC = { app: "qld", file: "qld.json", desc: "muhan-sync (무한매수 기록 동기화 · 지우지 마세요)", tokKey: "muhansync_token", gistKey: "muhansync_gist", metaKey: "muhansync_qld_meta" };
const SYNC_FED_KEY = "qld_fed_log_v1";
const __lsSet = Storage.prototype.setItem, __lsDel = Storage.prototype.removeItem;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { __lsSet.call(localStorage, k, v); } catch (e) {} };
const lsDel = k => { try { __lsDel.call(localStorage, k); } catch (e) {} };
const parseJ = (v, d) => { try { const x = JSON.parse(v); return x === null || x === undefined ? d : x; } catch (e) { return d; } };
const recKeyOf = r => r && r.auto ? "auto:" + r.date : "id:" + (r && r.id);
const tradeKeyOf = t => "T|" + (t && t.id);
const fedKeyOf = f => "F|" + (f && f.recordedAt);
const recsOf = raw => { const st = parseJ(raw, {}); return Array.isArray(st.records) ? st.records : []; };
function syncMeta() { return Object.assign({ tombs: [], last: 0, dirty: false }, parseJ(lsGet(SYNC.metaKey), {})); }
//@@include lib:saveSyncMeta
const syncTok = () => lsGet(SYNC.tokKey) || "", syncGist = () => lsGet(SYNC.gistKey) || "";
const syncDevice = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "모바일" : "PC";
let __syncMute = false, __syncTimer = null;
function __syncTrack(store, k, v) {
  const spec = k === GUIDE_STORE_KEY ? [recsOf, recKeyOf] : k === TRADES_KEY ? [x => parseJ(x, []), tradeKeyOf] : k === SYNC_FED_KEY ? [x => parseJ(x, []), fedKeyOf] : null;
  if (!spec) return false;
  const [get, kf] = spec;
  const after = new Set((get(v) || []).map(kf));
  const removed = (get(store.getItem(k)) || []).map(kf).filter(x => !after.has(x));
  const m = syncMeta();
  if (removed.length) m.tombs = [...new Set([...m.tombs, ...removed])].slice(-500);
  m.dirty = true; saveSyncMeta(m);
  return true;
}
Storage.prototype.setItem = function (k, v) {
  if (this === window.localStorage && !__syncMute && __syncTrack(this, k, v)) { __lsSet.call(this, k, v); syncSchedule(1500); return; }
  return __lsSet.call(this, k, v);
};
Storage.prototype.removeItem = function (k) {
  if (this === window.localStorage && !__syncMute && __syncTrack(this, k, k === GUIDE_STORE_KEY ? "{}" : "[]")) { __lsDel.call(this, k); syncSchedule(1500); return; }
  return __lsDel.call(this, k);
};
//@@include lib:syncSchedule
//@@include lib:gh
function mergeList(a, b, kf, dead, sortFn) {
  const map = new Map();
  for (const x of [...(a || []), ...(b || [])]) { const k = kf(x); if (!dead.has(k) && !map.has(k)) map.set(k, x); }
  return [...map.values()].sort(sortFn);
}
const byDateId = (x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : String(x.id).localeCompare(String(y.id));
const canon = (list, kf) => JSON.stringify((list || []).map(x => [kf(x), x.date || x.recordedAt, x.qty, x.price ?? x.hike]).sort());
function mergeDocs(L, R) {
  const tombs = [...new Set([...(L.tombs || []), ...(R.tombs || [])])].slice(-500), dead = new Set(tombs);
  return {
    tombs,
    records: mergeList(L.records, R.records, recKeyOf, dead, byDateId),
    trades: mergeList(L.trades, R.trades, tradeKeyOf, dead, byDateId),
    fed: mergeList(L.fed, R.fed, fedKeyOf, dead, (x, y) => x.recordedAt - y.recordedAt),
    skip: [...new Set([...(L.skip || []), ...(R.skip || [])])].sort().slice(-60),
  };
}
/* V0.21 💼 증권사 체결 자동 등록 — 평생매수는 매도가 없으므로 체결된 매수 전부가 매수 기록 */
const QLD_ACCT_KEY = "muhan_account_qld_v1";
function qldAcct() { const a = parseJ(lsGet(QLD_ACCT_KEY), null); return a && a.symbols && a.symbols.QLD ? a : null; }
function qldApiActive() { const a = qldAcct(); return !!(a && a.symbols.QLD.complete && a.symbols.QLD.current); }
function qldApiReconcile(M, g) {
  try { const f = g && g.files && g.files["muhan-account-qld.json"]; if (f && f.content) lsSet(QLD_ACCT_KEY, f.content); } catch (e) {}
  try { const f = g && g.files && g.files["muhan-bot-qld-park.json"]; if (f && f.content) lsSet("qld_park_v1", f.content); } catch (e) {}
  if (!qldApiActive()) return "";
  const a = qldAcct(), s = a.symbols.QLD, covered = a.covered || a.et_date || "";
  if (!covered) return "";
  const idOf = k => Number(String(k).replace(/\D/g, "").slice(-14)) * 10 + 1;
  const want = (s.current.records || []).filter(x => x.date <= covered).map(x => ({ id: idOf(x.key), date: x.date, qty: Number(x.qty), price: Math.round(Number(x.price) * 1e4) / 1e4, api: true }));
  const keep = (M.records || []).filter(r => r.date > covered && !r.api);
  const next = [...want, ...keep].sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  const canonR = arr => JSON.stringify(arr.map(r => [r.date, +r.qty, Math.round(+r.price * 1e4) / 1e4]).sort());
  if (canonR(next) === canonR(M.records || [])) return "";
  M.tombs = [...new Set([...(M.tombs || []), ...(M.records || []).map(recKeyOf).filter(k => !next.some(r => recKeyOf(r) === k))])].slice(-500);
  M.records = next;
  return `💼 증권사 체결로 매수 기록 ${want.length}건을 맞춤 (${covered} 장까지)`;
}
let __syncBusy = false, __syncAgain = false, __syncErr = "";
async function syncNow(why) {
  if (!syncTok() || !syncGist()) { syncRender(); return; }
  if (__syncBusy) { __syncAgain = true; return; }
  __syncBusy = true; syncRender("busy");
  let note = "";
  try {
    const g = await gh("/gists/" + syncGist());
    const f = g.files && g.files[SYNC.file];
    const R = f && f.content ? parseJ(f.content, {}) : {};
    const meta = syncMeta(), st = guideLoadState();
    const L = { records: st.records, skip: st.autoSkip || [], trades: loadTrades(), fed: parseJ(lsGet(SYNC_FED_KEY), []), tombs: meta.tombs, seed: seedGet() };
    const M = mergeDocs(L, R);
    M.seed = [L.seed, R.seed].filter(x => x && x.v > 0).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
    if (M.seed && (!L.seed || M.seed.at !== L.seed.at || M.seed.v !== L.seed.v || M.seed.mode !== L.seed.mode)) { seedSet(M.seed, true); note = `다른 기기 시드 ${fmtUsd0(M.seed.v)} 반영`; try { if (guideCtx) renderGuideResult(); } catch (e) {} }
    const apiNote = qldApiReconcile(M, g);        // V0.21 💼 증권사 체결 → 매수 기록 (복원이 완전할 때만)
    const same = (a, b) => canon(a.records, recKeyOf) === canon(b.records, recKeyOf) && canon(a.trades, tradeKeyOf) === canon(b.trades, tradeKeyOf) && canon(a.fed, fedKeyOf) === canon(b.fed, fedKeyOf) && JSON.stringify([...(a.skip || [])].sort()) === JSON.stringify([...(b.skip || [])].sort());
    if (!same(M, L)) {
      const dR = M.records.length - L.records.length, dT = M.trades.length - L.trades.length;
      guideState.records = M.records; guideState.autoSkip = M.skip;
      __syncMute = true;
      try { __lsSet.call(localStorage, GUIDE_STORE_KEY, JSON.stringify(guideState)); __lsSet.call(localStorage, TRADES_KEY, JSON.stringify(M.trades)); __lsSet.call(localStorage, SYNC_FED_KEY, JSON.stringify(M.fed)); }
      finally { __syncMute = false; }
      note = dT ? `다른 기기 매도 기록 ${dT > 0 ? dT + "건 반영" : -dT + "건 삭제 반영"}` : dR > 0 ? `다른 기기 매수 기록 ${dR}건 추가됨` : dR < 0 ? `다른 기기에서 지운 ${-dR}건 반영` : "다른 기기 변경 반영";
      try { if (guideCtx) renderGuideResult(); else renderRecordsCard(); renderFedLog(); } catch (e) {}
    }
    if (!same(M, R) || JSON.stringify(M.tombs) !== JSON.stringify(R.tombs || []) || JSON.stringify(M.seed || null) !== JSON.stringify(R.seed || null)) {
      const doc = { schema: "muhan-sync/1", app: "qld", version: APP_VERSION, updated: new Date().toISOString(), device: syncDevice(), records: M.records, skip: M.skip, trades: M.trades, fed: M.fed, tombs: M.tombs, seed: M.seed || null };
      await gh("/gists/" + syncGist(), { method: "PATCH", body: JSON.stringify({ files: { [SYNC.file]: { content: JSON.stringify(doc) } } }) });
      if (!note) note = "이 기기 변경을 올렸습니다";
    }
    if (apiNote) note = apiNote;
    meta.tombs = M.tombs; meta.last = Date.now(); meta.dirty = false; meta.note = note || meta.note || "";
    saveSyncMeta(meta); __syncErr = "";
    if (note && why !== "load") showCopyToast("☁ " + note, true);
  } catch (e) { __syncErr = e.message; }
  finally { __syncBusy = false; syncRender(); if (__syncAgain) { __syncAgain = false; syncSchedule(300); } }
}
function syncRender(state) {
  const stEl = document.getElementById("syncState"), chip = document.getElementById("syncChip");
  if (!stEl) return;
  const connected = !!(syncTok() && syncGist()), meta = syncMeta();
  document.getElementById("syncSetup").hidden = connected; document.getElementById("syncOn").hidden = !connected; chip.hidden = !connected;
  stEl.className = "sync-state"; chip.className = "sync-chip";
  if (!connected) { stEl.textContent = "동기화 꺼짐 · 이 기기에만 저장 중. 토큰을 붙여넣고 연결하면 PC와 폰이 같은 기록을 씁니다."; return; }
  if (state === "busy") { stEl.textContent = "☁ 동기화 중…"; chip.classList.add("busy"); chip.textContent = "☁ 동기화 중"; return; }
  if (__syncErr) { stEl.classList.add("err"); chip.classList.add("err"); chip.textContent = "☁ 확인 필요"; stEl.textContent = `⚠ ${__syncErr}` + (meta.dirty ? " · 이 기기 변경은 저장돼 있고 연결되면 올라갑니다." : ""); return; }
  const t = meta.last ? new Date(meta.last).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
  stEl.classList.add("ok"); chip.classList.add("ok"); chip.textContent = "☁ 동기화됨";
  stEl.textContent = `✅ 동기화 켜짐 (${syncDevice()}) · 매수 ${guideState.records.length}건 · 매도 ${loadTrades().length}건 · 마지막 ${t}` + (meta.note ? ` · ${meta.note}` : "");
}
function syncSetupErr(msg) { syncRender(); const e = document.getElementById("syncState"); e.className = "sync-state err"; e.textContent = "⚠ " + msg; }
document.getElementById("syncConnectBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncConnectBtn"), inp = document.getElementById("syncToken"), tok = inp.value.trim();
  if (!/^(ghp_|github_pat_)[A-Za-z0-9_]{20,}$/.test(tok)) { syncSetupErr("토큰 형식이 아닙니다. ghp_로 시작하는 토큰 전체를 붙여넣으세요"); return; }
  btn.disabled = true; btn.textContent = "연결 중…"; lsSet(SYNC.tokKey, tok);
  try {
    let id = "";
    for (let page = 1; page <= 3 && !id; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const hit = list.find(x => x.description === SYNC.desc); if (hit) id = hit.id;
      if (list.length < 100) break;
    }
    if (!id) {
      const init = JSON.stringify({ schema: "muhan-sync/1", records: [], skip: [], tombs: [] });
      const g = await gh("/gists", { method: "POST", body: JSON.stringify({ description: SYNC.desc, public: false, files: { "soxl.json": { content: init }, "tqqq.json": { content: init }, "qld.json": { content: init } } }) });
      id = g.id;
    }
    lsSet(SYNC.gistKey, id); inp.value = ""; __syncErr = "";
    await syncNow("connect");
  } catch (e) { lsDel(SYNC.tokKey); lsDel(SYNC.gistKey); syncSetupErr(e.message); }
  finally { btn.disabled = false; btn.textContent = "☁️ 연결하고 동기화 시작"; }
});
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
syncSchedule(400);
