/* alloc V1.00 (261101) — 🗺 배분 종목 정의 모듈 (순수 데이터·함수 · DOM/전역 의존성 0 · 브라우저·Node 둘 다 사용)
   종목을 바꾸려면 ASSETS 한 곳만 고치면 됩니다 (key=내부 키 · sym=티커 · w=레버리지 안 기본 비중 % · grp=나스닥/반도체 · split=즉시 2/3+엔진 1/3 표시) */
(function (root) {
  var ASSETS = [
    { key: "q", sym: "QLD",  name: "QLD 평생매수",  short: "QLD평생",  w: 40, grp: "nas",  split: true,  how: "3분의 2 즉시 매수 + 3분의 1 평생매수 엔진" },
    { key: "u", sym: "USD",  name: "USD 평생매수",  short: "USD평생",  w: 20, grp: "semi", split: true,  how: "QLD평생과 같은 구조 · 반도체 2배" },
    { key: "s", sym: "SOXL", name: "SOXL 무한매수", short: "SOXL무한", w: 20, grp: "semi", split: false, how: "21분할 · 익절 +15%" }
  ];
  var keys = function () { return ASSETS.map(function (a) { return a.key; }); };
  var by = function (k) { return ASSETS.filter(function (a) { return a.key === k; })[0]; };
  var zero = function () { var o = {}; keys().forEach(function (k) { o[k] = 0; }); return o; };
  var defaults = function () { var o = {}; ASSETS.forEach(function (a) { o[a.key] = a.w; }); return o; };
  var total = function (o) { return keys().reduce(function (s, k) { return s + (+o[k] || 0); }, 0); };
  /* 저장된 목표 % 검증: 모든 종목 키가 0 이상 숫자 · 합 100 이하 — 아니면 null (예전 형식 q/s/t 도 null → 자동 비중) */
  var sanitize = function (t) {
    if (!t || !keys().every(function (k) { return isFinite(+t[k]) && t[k] !== null && t[k] !== "" && +t[k] >= 0; })) return null;
    var o = {}; keys().forEach(function (k) { o[k] = +t[k]; });
    return total(o) <= 100 + 1e-9 ? o : null;
  };
  var classify = function (sym) { sym = String(sym).toUpperCase(); var a = ASSETS.filter(function (x) { return x.sym === sym; })[0]; return a ? a.key : null; };
  var syms = function () { var o = {}; ASSETS.forEach(function (a) { o[a.key] = a.sym; }); return o; };
  var pxOf = function (PX) { var o = {}; ASSETS.forEach(function (a) { o[a.key] = PX[a.sym]; }); return o; };
  var share = function (o, grp) { return ASSETS.reduce(function (s, a) { return s + (a.grp === grp ? (+o[a.key] || 0) : 0); }, 0); };
  var api = { ASSETS: ASSETS, keys: keys, by: by, zero: zero, defaults: defaults, total: total, sanitize: sanitize, classify: classify, syms: syms, pxOf: pxOf, share: share, version: "V1.00" };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Alloc = api;
})(typeof window !== "undefined" ? window : this);
