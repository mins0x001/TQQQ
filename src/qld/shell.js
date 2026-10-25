/* ------------------------ 입력 폼 · 이벤트 ------------------------ */
function initGuideForm() {
  guideState = guideLoadState();
  const d = document.getElementById("guideDate");
  const q = document.getElementById("guideQty");
  const p = document.getElementById("guidePrice");
  const saveBtn = document.getElementById("guideSaveBtn");
  const resetBtn = document.getElementById("guideResetBtn");
  const msg = document.getElementById("guideMsg");
  const recEl = document.getElementById("recordsContent");
  const locEl = document.getElementById("locGuideContent");
  if (!d || !q || !p || !saveBtn || !resetBtn || !recEl || !locEl) return;

  d.value = guideState.draft.date || "";
  if (!d.value) setDefaultGuideDate(true);
  q.value = guideState.draft.qty || "";
  p.value = guideState.draft.price || "";
  const saveDraft = () => { guideState.draft = { date: d.value, qty: q.value, price: p.value }; guideSaveState(); };
  [d, q, p].forEach(el => el.addEventListener("input", saveDraft));

  saveBtn.addEventListener("click", () => {
    let qty = parseFloat(q.value);
    let autoQtyNote = "";
    if (q.value.trim() === "") {                       // 수량 비움 → LOC 가이드 수량
      const dq = defaultGuideQty();
      if (dq) { qty = dq.qty; autoQtyNote = ` · 수량 ${dq.qty}주 자동 (${dq.label})`; }
    }
    const price = p.value === "" ? null : parseFloat(p.value);
    if (!d.value) { msg.textContent = "매수 날짜를 선택해주세요."; return; }
    if (isNaN(qty) || qty <= 0) { msg.textContent = "매수 수량을 0보다 크게 입력해주세요."; return; }
    if (price !== null && (isNaN(price) || price <= 0)) { msg.textContent = "매수가는 비우거나 0보다 큰 값을 입력해주세요."; return; }
    guideState.records.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: d.value, qty, price });
    guideState.draft = {};
    q.value = ""; p.value = "";
    setDefaultGuideDate(true);
    msg.textContent = "✓ 매수 기록이 저장되었습니다. (이 브라우저에 자동 보관)" + autoQtyNote;
    guideSaveState();
    renderGuideResult();
  });

  resetBtn.addEventListener("click", () => {
    if (!confirm("저장된 모든 매수 기록과 입력값을 초기화할까요?")) return;
    guideState = blankState();
    q.value = ""; p.value = "";
    setDefaultGuideDate(true);
    try { localStorage.removeItem(GUIDE_STORE_KEY); } catch (e) {}
    msg.textContent = "초기화되었습니다.";
    renderGuideResult();
  });

  d.addEventListener("input", () => { d.dataset.autoDefault = "0"; });
  recEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-del]");
    if (!btn) return;
    const gone = guideState.records.find(r => r.id === btn.getAttribute("data-del"));
    if (gone && gone.auto) { guideState.autoSkip = (guideState.autoSkip || []).concat(gone.date).slice(-60); autoRecordMsg = ""; }
    guideState.records = guideState.records.filter(r => r.id !== btn.getAttribute("data-del"));
    guideSaveState();
    renderGuideResult();
  });

  locEl.addEventListener("input", (ev) => {
    const inp = ev.target;
    if (!inp) return;
    /* 매수 금액 / 수량 */
    const isBudget = inp.id === "locBudgetInput", isQty = inp.id === "locQtyInput";
    if (!isBudget && !isQty) return;
    const box = inp.closest(".loc-box");
    if (!box) return;
    const px = parseFloat(box.getAttribute("data-px"));
    const def = parseFloat(box.getAttribute("data-default"));
    const qtyEl = box.querySelector("#locQtyInput");
    const budEl = box.querySelector("#locBudgetInput");
    const calcEl = box.querySelector(".loc-calc");
    const totEl = box.querySelector(".loc-total");
    const setCalc = (c) => { if (calcEl) { calcEl.className = "loc-calc" + (c.cls ? " " + c.cls : ""); calcEl.innerHTML = c.html; } };

    if (isBudget) {
      const pos = typeof inp.selectionStart === "number" ? inp.selectionStart : null;
      const digitsBefore = pos === null ? null : inp.value.slice(0, pos).replace(/[^0-9]/g, "").length;
      const digits = (inp.value || "").replace(/[^0-9]/g, "").replace(/^0+/, "").slice(0, 8);
      inp.value = digits ? Number(digits).toLocaleString("ko-KR") : "";
      if (digitsBefore !== null && typeof inp.setSelectionRange === "function") {
        let k = 0, seen = 0;
        while (k < inp.value.length && seen < digitsBefore) { if (/[0-9]/.test(inp.value[k])) seen++; k++; }
        try { inp.setSelectionRange(k, k); } catch (e) {}
      }
      guideState.locBudget = digits ? String(Number(digits) * 10000) : "";
      const r = resolveLocQty(px, def);
      if (r.source === "budget") { guideState.locQty = String(r.qty); if (qtyEl) qtyEl.value = String(r.qty); }
      setCalc(locCalcInfo(guideState.locBudget, px));
    } else {
      guideState.locQty = inp.value;
      if (guideState.locBudget) { guideState.locBudget = ""; if (budEl) budEl.value = ""; setCalc(locCalcInfo("", px)); }
    }
    guideSaveState();
    const v = isQty ? parseFloat(inp.value) : (qtyEl ? parseFloat(qtyEl.value) : NaN);
    if (totEl) totEl.innerHTML = locTotalHtml(px, v > 0 ? v : def);
  });

  renderGuideResult();
}


/* ------------------------ 상단 이동 탭 (Quick nav) ------------------------ */
function initQuickNav() {
  const nav = document.getElementById("quicknav");
  const inner = document.getElementById("quicknavInner");
  const bar = document.getElementById("qnProgress");
  if (!nav || !inner) return;
  const btns = Array.from(inner.querySelectorAll(".qn"));
  const cards = btns.map(b => b.dataset.target === "__top" ? null : document.getElementById(b.dataset.target));
  const navH = () => nav.getBoundingClientRect().height;

  /* 탭을 누르면 링크 이동 없이 해당 카드 위치로만 스크롤 (아이프레임/미리보기에서도 안전) */
  btns.forEach((b, i) => b.addEventListener("click", () => {
    const card = cards[i];
    if (!card) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const y = card.getBoundingClientRect().top + window.scrollY - navH() - 10;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }));

  let activeIdx = -1;
  const setActive = (i) => {
    if (i === activeIdx) return;
    activeIdx = i;
    btns.forEach((b, k) => b.classList.toggle("active", k === i));
  };

  let ticking = false;
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
      if (window.scrollY < 10) idx = -1;                       // 최상단에서는 선택 없음
      if (max - window.scrollY < 4) idx = cards.length - 1;    // 맨 아래는 마지막 카드
      setActive(idx);
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
}

/* ------------------------ 파일 자체 저장(다운로드) ------------------------ */
const __PRISTINE_HTML = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
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

document.getElementById("appVersionBadge").textContent = APP_VERSION;
document.getElementById("footerVersion").textContent = `${APP_VERSION} (${RELEASE_DATE})`;
document.getElementById("dlName").textContent = FILE_NAME;
document.title = `QLD 평생매수AI분석 (${APP_VERSION} - ${RELEASE_DATE})`;
document.getElementById("downloadSelfBtn").addEventListener("click", downloadSelf);
document.getElementById("fetchBtn").addEventListener("click", fetchAll);
initGuideForm();
/* ------------------------ 기록 백업 · 복원 (온라인 이전용) ------------------------ */
const BACKUP_PREFIXES = ["qldLifeBuyState", "qld_fed_", "qld_trades"];
const BACKUP_APP = "QLD";
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
const TAB_SS_KEY = "qld_tab_v1";
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
    { const h = document.querySelector("#card-today h2"), k = document.querySelector("#card-today .card-kicker"); if (h) h.textContent = "현재 상태"; if (k) k.textContent = "NOW · STATUS"; } goTab("pg-order", { top: true });
    let tries = 0;
    const kick = () => { if (lastLocOrder || ++tries > 40) return; if (!__syncBusy) document.getElementById("fetchBtn").click(); else setTimeout(kick, 500); };
    setTimeout(kick, 1200);
    return;
  }
  if (EMBED) return;
  { const bb = document.querySelector('#tabbar .tb[data-p="pg-backup"]'), tb = document.getElementById("tabbar");   // 💾 백업 탭 숨김 — ☁️ Gist 자동 동기화로 충분
    if (bb && tb) { bb.remove(); tb.style.gridTemplateColumns = `repeat(${tb.querySelectorAll(".tb").length},minmax(0,1fr))`; if (document.getElementById("pg-backup").classList.contains("on")) goTab("pg-order"); } }
  setTimeout(() => { const b = document.getElementById("fetchBtn"); if (b && !b.disabled && typeof lastLocOrder !== "undefined" && !lastLocOrder) b.click(); }, 700);   // 열면 시세 자동 1회
  const o = document.getElementById("pg-order");
  if (o) o.insertAdjacentHTML("afterbegin", `<a class="solo-note" href="api-qld.html#pg-qld">🔌 자동주문(QLD) ›<small>주 1회 LOC 매수(체결될 때까지 매일)를 증권사 Open API로 자동 접수 · 계좌 현황 · 결과</small></a>`);
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
  const KEY = "qld_hdr_open_v1";
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
initTabs();
