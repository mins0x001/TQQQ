/* ======================== 🤖 자동주문(해외) — 상태 한 줄 ========================
   설정·실행·주문은 허브의 ‘🔌 자동주문(해외)’ 앱(api.html). 이 앱은 오늘의 LOC 계획(lastLocOrder · bot 필드)을 계산해 주고,
   동기화 Gist의 봇 설정·결과를 읽어 ⚡ 주문 탭 맨 위에 한 줄로 보여 준다. */
const BOT = { cfg: null, status: null };
function botLoadFromGist(g) {
⟦@s041⟧  botRender();
}
function botRender() {
  const line = document.getElementById("botLine");
  if (!line) return;
  const c = BOT.cfg, st = BOT.status;
  line.hidden = !(syncTok() && syncGist() && c && c.installed_at);
  if (line.hidden) return;
  const r = st && st.results && st.results[LEV_TICKER];
  const fresh = st && Date.now() - Date.parse(st.run_at) < 20 * 3600000;
  const esc = x => String(x == null ? "" : x).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const when = new Date(st ? st.run_at : 0).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  line.className = "bot-line m-" + (c.mode || "off") + (fresh && st && ["blocked", "error"].includes(st.overall) ? " bad" : "");
  line.innerHTML = `<b>🔌 자동주문 ${c.mode === "live" ? "실전" : c.mode === "dry" ? "리허설" : "수동"}</b> · ` +
    (fresh ? `${when} ${esc(r && r.summary ? r.summary : st.note || st.overall)}` : "최근 실행 없음") +
    ` <a class="bot-go" href="api.html">자동주문 ›</a>`;
}

