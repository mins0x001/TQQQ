// alloc.js (배분 종목 정의) 단위 테스트 — 사용: node tests/alloc_golden.js
const A = require("../alloc.js"), assert = require("assert");
assert.deepStrictEqual(A.keys(), ["q", "u", "s"]);
assert.deepStrictEqual(A.defaults(), { q: 40, u: 20, s: 20 });
assert.strictEqual(A.total(A.defaults()), 80);                                   // 레버리지 80 + SPYM 20
assert.strictEqual(A.sanitize({ q: 50, s: 20, t: 10 }), null);                   // 예전 형식(TQQQ 거치)은 버리고 자동 비중으로
assert.deepStrictEqual(A.sanitize({ q: "30", u: 20, s: 10 }), { q: 30, u: 20, s: 10 });
assert.strictEqual(A.sanitize({ q: 60, u: 30, s: 20 }), null);                   // 합 100 초과
assert.strictEqual(A.sanitize({ q: -1, u: 0, s: 0 }), null);
assert.strictEqual(A.sanitize({ q: null, u: 0, s: 0 }), null);
assert.strictEqual(A.sanitize(null), null);
assert.deepStrictEqual(["QLD", "usd", "SOXL", "TQQQ", "SPYM"].map(A.classify), ["q", "u", "s", null, null]);
assert.deepStrictEqual(A.syms(), { q: "QLD", u: "USD", s: "SOXL" });
assert.deepStrictEqual(A.pxOf({ QLD: 1, USD: 2, SOXL: 3 }), { q: 1, u: 2, s: 3 });
assert.strictEqual(A.share(A.defaults(), "nas"), 40); assert.strictEqual(A.share(A.defaults(), "semi"), 40);
console.log("OK   alloc: 11개 통과");
