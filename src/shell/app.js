/* ---------- 파라미터 적용 모드 (① 규칙 기본값 · 브라우저에 저장) ----------
   mode: "rule" = ① 규칙 기반(기본) · "bt" = ② 백테스트 최적 · "manual" = 분할 수·주기를 직접 입력
   rule/bt 모드는 시세를 불러올 때마다 그날 변동성으로 다시 계산된 값을 자동 적용한다. */
const PARAM_MODE_KEY = "⟦lev⟧_param_mode_v1";
var __paramsMute = false;
/* 기기 간 동기화되는 설정: 적용 모드·시드 (+ 직접 입력 모드일 때 분할 수·주기). 규칙/최적 모드의 분할·주기는 각 기기가 같은 시세로 다시 계산한다 */
//@@include strategy:paramsCore
function loadParamMode() {
  try { const v = JSON.parse(localStorage.getItem(PARAM_MODE_KEY) || "null"); if (v && v.mode) return v; } catch (e) {}
  return { mode: "rule" };
}

/* V1.19 매도%: ▲▼ 0.5%씩 · ☁️ 동기화로 모든 기기 영구 저장 · ↺ 규칙 기반으로 초기화 */
function sellPctGet(rule) { const v = parseFloat(loadParamMode().sellPct); return v > 0 ? v : rule; }
document.addEventListener("click", e => {
  const b = e.target.closest("[data-sellpct]"); if (!b) return;
  const d = +b.dataset.sellpct, cur = +b.closest(".sell-adj").dataset.cur;
  if (d === 0) { if (!confirm("매도 %를 ‘규칙 기반’ 값으로 되돌릴까요?")) return; saveParamMode({ sellPct: null }); }
  else saveParamMode({ sellPct: Math.min(100, Math.max(0.5, Math.round((cur + d * 0.5) * 100) / 100)) });
  renderLocGuideCard();
  try { if (parent !== window && lastLocOrder) parent.postMessage({ type: "muhan-sellpct", sym: lastLocOrder.symbol, bot: lastLocOrder.bot }, location.origin); } catch (e) {}   // 자동주문 앱 ⚡ 카드 즉시 반영
});
⟦@s034⟧function saveParamMode(extra) {
  const __before = JSON.stringify(paramsCore(loadParamMode()));
  const cur = Object.assign(loadParamMode(), extra || {}, {
    seed: document.getElementById("seedSimSeed1").value,
    splits: document.getElementById("seedSimSplits1").value,
    mult: document.getElementById("seedSimCycle1").value
  });
  delete cur.cycle;    // V0.71 이전 '2단계 주기(일)' 값은 더 이상 쓰지 않음
  try { localStorage.setItem(PARAM_MODE_KEY, JSON.stringify(cur)); } catch (e) {}
  if (!__paramsMute && !window.__MUHAN_BOT__ && JSON.stringify(paramsCore(cur)) !== __before) {
    try { const m = syncMeta(); if (m.last > 0) { m.paramsAt = Date.now(); m.dirty = true; saveSyncMeta(m); syncSchedule(1500); } } catch (e) {}
  }
  return cur;
}
function applyParamsCore(core) {
  const next = Object.assign({}, loadParamMode());
  Object.keys(core || {}).forEach(k => { if (core[k] !== "" && core[k] != null) next[k] = core[k]; });
⟦@s035⟧  __paramsMute = true;
  try {
    try { localStorage.setItem(PARAM_MODE_KEY, JSON.stringify(next)); } catch (e) {}
    restoreParamInputs();
    if ((next.mode === "rule" || next.mode === "bt") && engineRecs && engineRecs[next.mode]) {
      document.getElementById("seedSimSplits1").value = engineRecs[next.mode].splits;
      document.getElementById("seedSimCycle1").value = engineRecs[next.mode].cycle;
    }
  } finally { __paramsMute = false; }
  try { updateRuleChips(); renderSeedSimCards(); renderLocGuideCard(); if (typeof updateBuyQtyHint === "function") updateBuyQtyHint(); } catch (e) {}
}
function restoreParamInputs() {
  const pm = loadParamMode();
  if (pm.seed) document.getElementById("seedSimSeed1").value = pm.seed;
  if (pm.splits) document.getElementById("seedSimSplits1").value = pm.splits;
  if (pm.mult) document.getElementById("seedSimCycle1").value = pm.mult;
}
const MODE_LABEL = { rule: "① 규칙 기반", bt: "② 백테스트 최적", manual: "✎ 직접 입력" };
function updateRuleChips() {
  const pm = loadParamMode();
  const sp = document.getElementById("seedSimSplits1").value, cy = document.getElementById("seedSimCycle1").value;
  const pending = pm.mode !== "manual" && !engineRecs;
  const html = `<span class="rc-mode rc-${pm.mode}">${MODE_LABEL[pm.mode]} 적용 중</span>` +
    `<span class="rc-val">${sp}분할 · 2단계 ×${cy}${(() => { const B = typeof lastLocOrder !== "undefined" && lastLocOrder && lastLocOrder.bot; return B && B.max_rounds ? ` (총 ${B.max_rounds}회 = 1단계 ${B.stage1_n} + 2단계 ${B.max_rounds - B.stage1_n})` : ""; })()}</span>` +
    (pending ? `<span class="rc-note">시세를 불러오면 오늘 변동성으로 재계산</span>` : "");
  document.querySelectorAll("[data-rule-chip]").forEach(el => { el.innerHTML = html; el.className = "rule-chip rc-wrap-" + pm.mode; });
  document.querySelectorAll("[data-engine-apply]").forEach(b => {
    const on = b.dataset.engineApply === pm.mode;
    b.classList.toggle("is-active", on);
    b.textContent = (b.dataset.engineApply === "rule" ? "① 규칙" : "② 최적") + (on ? " ✓ 적용 중" : " 적용");
  });
}
// 엔진 계산 직후 호출: rule/bt 모드면 새로 계산된 값을 자동 적용
function syncParamsWithMode() {
  const pm = loadParamMode();
  if ((pm.mode === "rule" || pm.mode === "bt") && engineRecs && engineRecs[pm.mode]) {
    document.getElementById("seedSimSplits1").value = engineRecs[pm.mode].splits;
    document.getElementById("seedSimCycle1").value = engineRecs[pm.mode].cycle;
  }
  saveParamMode();
  updateRuleChips();
}

function applyEngineRec(kind) {
  if (!engineRecs || !engineRecs[kind]) return;
  const r = engineRecs[kind];
  document.getElementById("seedSimSplits1").value = r.splits;
  document.getElementById("seedSimCycle1").value = r.cycle;
  saveParamMode({ mode: kind });
  updateRuleChips();
  updateBuyQtyHint();
  renderSeedSimCards();
  renderLocGuideCard();
  showBanner(`${kind === "rule" ? "규칙 기반" : "백테스트 최적"} 파라미터(${r.splits}분할 · 2단계 ×${r.cycle})를 시뮬레이션과 LOC 가이드에 적용했습니다.`, true);
}

/* ------------------------ 상단 이동 탭 (QLD V0.12 구조) ------------------------ */
function initQuickNav() {
  const nav = document.getElementById("quicknav");
  const inner = document.getElementById("quicknavInner");
  const bar = document.getElementById("qnProgress");
  if (!nav || !inner) return;
  const btns = Array.from(inner.querySelectorAll(".qn"));
  const cards = btns.map(b => b.dataset.target === "__top" ? null : document.getElementById(b.dataset.target));
  const navH = () => nav.getBoundingClientRect().height;
  btns.forEach((b, i) => b.addEventListener("click", () => {
    const card = cards[i];
    if (!card) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const y = card.getBoundingClientRect().top + window.scrollY - navH() - 10;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }));
  let activeIdx = -1, ticking = false;
  const setActive = (i) => { if (i === activeIdx) return; activeIdx = i; btns.forEach((b, k) => b.classList.toggle("active", k === i)); };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (bar) bar.style.width = Math.min(100, (window.scrollY / max) * 100).toFixed(1) + "%";
      const line = navH() + 24;
      let idx = -1;
      cards.forEach((c, i) => { if (c && c.getBoundingClientRect().top <= line) idx = i; });
      if (window.scrollY < 10) idx = -1;
      if (max - window.scrollY < 4) idx = cards.length - 1;
      setActive(idx);
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
}

/* ------------------------ 파일 자체 저장(다운로드) ------------------------ */
const FILE_NAME = `⟦LEV⟧무한매수_${APP_VERSION.replace(".", "_")}_${RELEASE_DATE}.HTML`;
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
document.getElementById("dlName").textContent = FILE_NAME;
document.getElementById("downloadSelfBtn").addEventListener("click", downloadSelf);
/* ------------------------ 기록 백업 · 복원 (온라인 이전용) ------------------------ */
const BACKUP_PREFIXES = ["⟦lev⟧_"];
const BACKUP_APP = "⟦LEV⟧";
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
function setBkMsg(t, ok) { const m = document.getElementById("bkMsg"); m.textContent = t; m.className = "bk-msg " + (ok ? "ok" : "err"); }
document.getElementById("bkCopyBtn").addEventListener("click", async () => {
  const b = collectBackup();
  const n = Object.keys(b.data).length;
  const txt = JSON.stringify(b);
  document.getElementById("bkText").value = txt;
  if (!n) { setBkMsg("저장된 기록이 없습니다 (백업할 항목 0개).", false); return; }
  const ok = await copyText(txt);
  setBkMsg(ok ? `복사 완료 · ${n}개 항목. 새 곳에서 붙여넣고 [복원]을 누르세요.` : "자동 복사가 막혔습니다. 아래 텍스트를 길게 눌러 전체 선택 후 복사하세요.", ok);
  showCopyToast(ok ? "백업 복사됨" : "직접 복사해 주세요", ok);
});
let __bkArmed = 0;
document.getElementById("bkRestoreBtn").addEventListener("click", () => {
  const btn = document.getElementById("bkRestoreBtn");
  let b;
  try { b = JSON.parse(document.getElementById("bkText").value.trim()); } catch (e) { setBkMsg("백업 텍스트 형식이 올바르지 않습니다. [백업 복사]로 만든 텍스트 전체를 붙여넣으세요.", false); return; }
  if (!b || b.schema !== "dash-backup/1" || !b.data) { setBkMsg("백업 텍스트가 아닙니다.", false); return; }
  if (b.app !== BACKUP_APP) { setBkMsg(`${b.app} 백업입니다. ${b.app} 화면에서 복원하세요.`, false); return; }
  const keys = Object.keys(b.data).filter(k => BACKUP_PREFIXES.some(p => k.startsWith(p)));
  if (!keys.length) { setBkMsg("복원할 항목이 없습니다.", false); return; }
  if (Date.now() - __bkArmed > 5000) {
    __bkArmed = Date.now();
    btn.textContent = "⚠ 한 번 더 누르면 덮어쓰기"; btn.classList.add("warn");
    setBkMsg(`현재 기록을 백업(${keys.length}개 항목, ${String(b.saved || "").slice(0, 10)})으로 덮어씁니다. 5초 안에 한 번 더 누르세요.`, false);
    setTimeout(() => { btn.textContent = "📥 복원"; btn.classList.remove("warn"); }, 5000);
    return;
  }
  try {
    keys.forEach(k => localStorage.setItem(k, b.data[k]));
    setBkMsg("복원 완료. 새로고침합니다…", true);
    setTimeout(() => location.reload(), 700);
  } catch (e) { setBkMsg("저장 실패: " + e.message, false); }
});
/* ------------------------ 하단 탭바: 화면 전환 ------------------------ */
const TAB_SS_KEY = "⟦lev⟧_tab_v1";
const __tabScroll = {};
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
/* V0.73 화면 모드 — 같은 파일 하나로 두 곳에서 쓴다 (기능을 두 번 만들지 않음)
⟦@s036⟧   · ?embed=api   : 증권사 앱이 보이지 않게 띄워 오늘의 LOC 계산 (화면 무관)
   · 단독 실행     : AI 분석 앱 → 주문·사이클·백업은 자동주문(해외)로 안내 */

/* 공통: 시세 재시도 */
async function fetchRetry(u, opt) {        // 무료 시세 API 는 여러 앱이 동시에 부르면 한도(429)·순간 끊김으로 'Failed to fetch' — 1.5·4·8초 뒤 다시
  let last;
  for (const w of [0, 1500, 4000, 8000]) {
    if (w) await new Promise(r => setTimeout(r, w));
    try { const r = await fetch(u, opt); if (r.status !== 429) return r; last = new Error("요청 한도 초과(429)"); }
    catch (e) { last = e; }
  }
  throw new Error((last && last.message) + " — 4번 시도 실패 (인터넷 연결 또는 시세 API 한도 · 1분 뒤 다시)");
}
const EMBED = (new URLSearchParams(location.search).get("embed") || "").toLowerCase();
function applyViewMode() {
  if (EMBED === "panel") {
    document.body.classList.add("panel");
    { const h = document.querySelector("#card-today h2"), k = document.querySelector("#card-today .card-kicker"); if (h) h.textContent = "현재 상태"; if (k) k.textContent = "NOW · STATUS"; }
    goTab("pg-order", { top: true });
    let tries = 0;
    const kick = () => { if (lastLocOrder || ++tries > 40) return; if (!__syncBusy) document.getElementById("fetchBtn").click(); else setTimeout(kick, 500); };
    setTimeout(kick, 1200);
    return;
  }
  if (EMBED) return;
  setTimeout(() => { const b = document.getElementById("fetchBtn"); if (b && !b.disabled && typeof lastLocOrder !== "undefined" && !lastLocOrder) b.click(); }, 700);   // 열면 시세 자동 1회
  ["pg-backup"].forEach(id => { const b = document.querySelector(`#tabbar .tb[data-p="${id}"]`); if (b) b.remove(); });
  const tb = document.getElementById("tabbar"); if (tb) tb.style.gridTemplateColumns = `repeat(${tb.querySelectorAll(".tb").length},minmax(0,1fr))`;
  const eng = document.getElementById("pg-engine");
⟦@s037⟧  const cur = document.querySelector(".page.on");
  if (!cur || cur.id === "pg-backup") goTab("pg-engine", { top: true });
}
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
/* 상단 시세 영역 접기/펼치기 (기기별 기억) */
(function initHeaderToggle() {
  const KEY = "⟦lev⟧_hdr_open_v1";
  const hdr = document.getElementById("topbar"), btn = document.getElementById("hdrToggle");
  if (!hdr || !btn) return;
  const apply = (open) => { hdr.classList.toggle("compact", !open); btn.textContent = open ? "접기 ▴" : "상세 ▾"; btn.setAttribute("aria-expanded", open ? "true" : "false"); };
  let open = false;
  try { open = localStorage.getItem(KEY) === "1"; } catch (e) {}
  apply(open);
  btn.addEventListener("click", () => { open = !open; apply(open); try { localStorage.setItem(KEY, open ? "1" : "0"); } catch (e) {} });
})();
/* 오프라인 대비 (온라인 주소에서만) */
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
