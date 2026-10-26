/* 입력칸 저장 점검: 값을 바꾸고 → 새로고침 → 값이 남아 있는지. 남지 않는 칸 = 목록으로 출력 (Playwright · 로컬 서버 http://localhost:8765 필요) */
const { chromium } = require("playwright");
/* 서버(Gist)에만 저장되거나 일부러 저장하지 않는 칸 = 오프라인 테스트에서 유지 안 되는 게 정상 */
const EXPECT = { "api-all": ["code", "aRm", "aRn", "tgChat", "aTime"], index: ["agId", "agAuto", "agPw"], macro: ["fedMd", "fedHk", "fedHd", "fedCt"] };
const PAGES = ["soxl", "tqqq", "qldm", "qld", "api-all", "paradise", "macro", "backtest", "index"];
const base = process.env.BASE || "http://localhost:8765/";
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const pg of PAGES) {
    const ctx = await b.newContext(), p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!localhost)/, r => r.abort());          // 외부망 차단 (동기화·시세 호출 없음)
    const url = base + pg + ".html" + (/^(soxl|tqqq|qldm|qld)$/.test(pg) ? "?embed=api" : "");
    await p.goto(url); await p.waitForTimeout(1200);
    const list = await p.evaluate(() => [...document.querySelectorAll("input,select,textarea")].map((e, i) => { if (!e.id) e.id = "__pt" + i; return e; }).filter(e => !e.disabled && !e.readOnly && !e.closest("[hidden],[aria-hidden=true]")
      && !["password", "file", "button", "submit", "hidden"].includes(e.type)).map(e => ({ id: e.id, type: e.type || e.tagName.toLowerCase(), tag: e.tagName })));
    const set = {};
    for (const it of list) {
      const v = await p.evaluate(({ id }) => {
        const e = document.getElementById(id); let nv;
        if (e.type === "checkbox" || e.type === "radio") { e.checked = !e.checked; nv = e.checked; }
        else if (e.tagName === "SELECT") { const o = [...e.options].find(o => o.value !== e.value); if (!o) return null; e.value = o.value; nv = e.value; }
        else if (e.type === "date") { e.value = "2026-03-17"; nv = e.value; }
        else if (e.type === "number" || e.inputMode === "numeric" || e.inputMode === "decimal") { const cur = parseFloat(String(e.value).replace(/,/g, "")), st = e.step && e.step !== "any" ? +e.step : 1; e.value = String(isFinite(cur) ? cur + st : 7); nv = e.value; }
        else if (e.type === "range") { e.value = String(Math.round(+e.min + (+e.max - +e.min) * 0.4)); nv = e.value; }
        else { e.value = "7"; nv = e.value; }
        e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return nv;
      }, it);
      if (v !== null) set[it.id] = v;
    }
    await p.waitForTimeout(800); await p.reload(); await p.waitForTimeout(1200);
    const after = await p.evaluate(ids => Object.fromEntries(ids.map(id => { const e = document.getElementById(id); return [id, !e ? undefined : (e.type === "checkbox" || e.type === "radio") ? e.checked : e.value]; })), Object.keys(set));
    const lost = Object.keys(set).filter(id => String(after[id]).replace(/,/g, "") !== String(set[id]).replace(/,/g, "") && !(EXPECT[pg] || []).includes(id));
    console.log(`${lost.length ? "WARN" : "OK  "} ${pg}: 입력칸 ${Object.keys(set).length}개 중 유지 ${Object.keys(set).length - lost.length}` + (lost.length ? ` · 사라짐: ${lost.join(", ")}` : ""));
    bad += lost.length; await ctx.close();
  }
  await b.close(); if (bad) process.exit(1);
})();
