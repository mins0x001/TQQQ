/* rebal V1.00 (261026) — 리밸런싱 계산 모듈 (순수 함수 · DOM/전역 의존성 0 · 브라우저·Node 둘 다 사용)
   입력: keys(종목 키 목록) · base(비중 계산 기준 총액) · cur/tgt(종목별 현재·목표 금액, 같은 단위) · px(종목별 종가 USD) · toUsd(금액 단위 → USD 환산 계수)
   출력: 종목별 현재%·목표%·차이금액 · 조치(sell/buy/hold) · 주수(내림 = 매도는 보유 초과 방지, 매수는 현금 초과 방지) */
(function (root) {
  function plan(o) {
    var keys = o.keys, base = o.base > 0 ? o.base : 1, minPct = o.minPct == null ? 0.5 : o.minPct;
    return keys.map(function (k) {
      var cur = +o.cur[k] || 0, tgt = +o.tgt[k] || 0, d = tgt - cur, px = o.px && +o.px[k] > 0 ? +o.px[k] : 0;
      var usd = Math.abs(d) * o.toUsd, hold = Math.abs(d) / base * 100 < minPct;
      var sh = px ? Math.floor(usd / px) : null;
      return { key: k, curPct: cur / base * 100, tgtPct: tgt / base * 100, diff: d, usd: usd, px: px,
               act: hold || sh === 0 ? "hold" : d < 0 ? "sell" : "buy", shares: hold ? 0 : sh, cost: sh ? sh * px : 0 };
    });
  }
  /* 목표 비중: 기본 비중(pct) + 가상 조정(adj, %p) · 마지막 항목(rest)은 100 − 나머지 (음수 방지) */
  function targets(pct, adj, rest) {
    var t = {}, sum = 0;
    Object.keys(pct).forEach(function (k) { t[k] = Math.max(0, (+pct[k] || 0) + ((adj && +adj[k]) || 0)); sum += t[k]; });
    t[rest] = Math.max(0, 100 - sum); return t;
  }
  var api = { plan: plan, targets: targets, version: "V1.00" };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Rebal = api;
})(typeof window !== "undefined" ? window : this);
