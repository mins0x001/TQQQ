/* ======================== ☁️ PC · 모바일 기록 동기화 (GitHub 비공개 Gist) ========================
   저장소: 내 GitHub 계정의 secret gist "muhan-sync" 안의 ⟦lev⟧.json
   동기화 대상: 매수 기록 + 매도·수익 기록 + 자동 저장 건너뛰기 목록 (토큰·화면 설정은 기기별)
   합치기: 기록 키(수동=id, 자동저장=날짜) 기준 합집합 − 삭제 표시(tombstone) 합집합 */
const SYNC = {
  app: "⟦lev⟧", file: "⟦lev⟧.json", desc: "muhan-sync (무한매수 기록 동기화 · 지우지 마세요)",
  tokKey: "muhansync_token", gistKey: "muhansync_gist", metaKey: "muhansync_⟦lev⟧_meta",
};
const __lsSet = Storage.prototype.setItem;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { __lsSet.call(localStorage, k, v); } catch (e) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
const parseArr = v => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const recKeyOf = r => r && r.autoRecorded ? "auto:" + r.date : "id:" + (r && r.id);
function syncMeta() { try { return Object.assign({ tombs: [], last: 0, dirty: false }, JSON.parse(lsGet(SYNC.metaKey) || "{}")); } catch (e) { return { tombs: [], last: 0, dirty: false }; } }
function saveSyncMeta(m) { lsSet(SYNC.metaKey, JSON.stringify(m)); }
const syncTok = () => lsGet(SYNC.tokKey) || "";
const syncGist = () => lsGet(SYNC.gistKey) || "";
const syncDevice = () => window.__MUHAN_BOT__ ? "봇" : /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "모바일" : "PC";

/* 기록이 바뀌는 모든 저장을 감지 → 삭제분은 tombstone으로 남기고, 잠시 뒤 자동 동기화 */
let __syncMute = false, __syncTimer = null;
Storage.prototype.setItem = function (k, v) {
  if (this === window.localStorage && !__syncMute && (k === BUY_RECORDS_KEY || k === AUTO_SKIP_KEY || k === TRADES_KEY)) {
    if (k === BUY_RECORDS_KEY || k === TRADES_KEY) {
      const kf = k === TRADES_KEY ? tradeTombOf : recKeyOf;
      const after = new Set(parseArr(v).map(kf));
      const removed = parseArr(this.getItem(k)).map(kf).filter(x => !after.has(x));
      const m = syncMeta();
      if (removed.length) m.tombs = [...new Set([...m.tombs, ...removed])].slice(-500);
      m.dirty = true; saveSyncMeta(m);
    }
    __lsSet.call(this, k, v);
    syncSchedule(1500);
    return;
  }
  return __lsSet.call(this, k, v);
};
function syncSchedule(ms) { if (!syncTok() || !syncGist()) return; clearTimeout(__syncTimer); __syncTimer = setTimeout(() => syncNow("auto"), ms); }

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
const sortRecs = a => a.slice().sort((x, y) => x.date !== y.date ? (x.date < y.date ? -1 : 1) : (x.id || 0) - (y.id || 0));
const canonTrades = a => JSON.stringify((a || []).map(t => [tradeTombOf(t), t.qty, t.sellPrice]).sort());
const canonRecs = a => JSON.stringify(sortRecs(a || []).map(r => [recKeyOf(r), r.date, r.qty, r.price]));
function mergeDocs(local, remote) {
  const tombs = [...new Set([...(local.tombs || []), ...(remote.tombs || [])])].slice(-500);
  const dead = new Set(tombs), map = new Map();
  for (const r of [...(local.records || []), ...(remote.records || [])]) {
    const k = recKeyOf(r);
    if (!dead.has(k) && !map.has(k)) map.set(k, r);
  }
  const skip = [...new Set([...(local.skip || []), ...(remote.skip || [])])].sort().slice(-60);
  const tmap = new Map();
  for (const t of [...(local.trades || []), ...(remote.trades || [])]) { const k = tradeTombOf(t); if (!dead.has(k) && !tmap.has(k)) tmap.set(k, t); }
  const trades = [...tmap.values()].sort((x, y) => x.sellDate < y.sellDate ? -1 : x.sellDate > y.sellDate ? 1 : x.id - y.id);
  return { records: sortRecs([...map.values()]), skip, tombs, trades };
}


