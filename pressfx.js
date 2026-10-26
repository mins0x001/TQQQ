/* pressfx V1.00 (261026) — 버튼 눌림 피드백 공용 모듈 (의존성 0 · 어느 화면이든 <script src="pressfx.js" defer> 한 줄이면 적용)
   누르는 동안: 살짝 작아지고 밝아짐(:active) · 누른 순간: 테두리 파동 0.5초 + 진동(지원 기기) · 비활성(disabled) 버튼은 제외
   앱 코드를 전혀 건드리지 않음: 문서 전체에서 click 을 위임(delegation)으로 듣기만 함 → 화면이 다시 그려져도 계속 동작 */
(function () {
  if (window.__pressfx) return; window.__pressfx = "V1.00";
  var SEL = 'button, [role="button"], input[type="button"], input[type="submit"], summary, label.chk, .btn, .tb, .qn, a.rl-a';
  var st = document.createElement("style");
  st.textContent =
    SEL.split(",").map(function (s) { return s.trim() + ":not(:disabled):active"; }).join(",") + "{transform:scale(.95);filter:brightness(1.3);transition:transform .06s,filter .06s;}" +
    "@keyframes fxhit{0%{outline:0 solid rgba(94,234,212,.95);outline-offset:0}100%{outline:9px solid rgba(94,234,212,0);outline-offset:3px}}" +
    ".fx-hit{animation:fxhit .5s ease-out;}" +
    "@media (prefers-reduced-motion:reduce){.fx-hit{animation:none;outline:3px solid rgba(94,234,212,.9);}}";
  (document.head || document.documentElement).appendChild(st);
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (!t || t.disabled || t.getAttribute("aria-disabled") === "true") return;
    t.classList.remove("fx-hit"); void t.offsetWidth; t.classList.add("fx-hit");   // 연속으로 눌러도 매번 다시 재생
    setTimeout(function () { t.classList.remove("fx-hit"); }, 600);
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) {}
  }, true);
})();
