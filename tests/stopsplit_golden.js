// 분할 손절 매도 계산(src/calc/stoploss.js) 단위 테스트 — 사용: node tests/stopsplit_golden.js
const fs = require("fs"), assert = require("assert");
const src = fs.readFileSync(require("path").join(__dirname, "../src/calc/stoploss.js"), "utf8");
const fn = new Function("perOfRound", src.replace(/^\/\/@@fn .*$/m, "") + "; return stopSplitPlan;");
const sp = { maxRounds: 12, n1: 3, per1: 1000, per2: 333 };
const perOfRound = (s, r) => r <= s.n1 ? s.per1 : s.per2, S = fn(perOfRound);
const rows = n => Array.from({ length: n }, (_, i) => ({ qty: 10, price: 100 - i }));   // 100,99,…
let r = S(rows(5), sp, 90, 0.88, 2); assert.strictEqual(r.state, "wait");               // 분할 남음 → 평소 매수
r = S(rows(12), sp, 95, 0.88, 2); assert.strictEqual(r.state, "hold");                  // 소진 · 손절선 위
const avg = rows(12).reduce((a, x) => a + x.price, 0) / 12;                              // 94.5
r = S(rows(12), sp, Math.floor(avg * 0.88) - 1, 0.88, 2);
assert.strictEqual(r.state, "sell"); assert.strictEqual(r.sellQty, 20); assert.strictEqual(r.afterRounds, 10); assert.strictEqual(r.nextRound, 11);
assert.strictEqual(r.rebuyAmt, 333); assert.ok(r.rebuyOk);                                // 20주 × 82 = 1,640 ≥ 333
assert.ok(Math.abs(r.keepAvg - rows(10).reduce((a, x) => a + x.price, 0) / 10) < 1e-9);
assert.ok(r.realized < 0);                                                               // 손절 = 손실 확정
r = S(rows(12), sp, 80, 0.88, 5); assert.strictEqual(r.sellQty, 50); assert.strictEqual(r.afterRounds, 7);   // nSell 가변
r = S(rows(1), { maxRounds: 1, n1: 1, per1: 1000, per2: 333 }, 50, 0.88, 2); assert.strictEqual(r.afterRounds, 0); assert.strictEqual(r.keepAvg, null);   // 1회분만 있을 때
assert.strictEqual(S([], sp, 80, 0.88, 2).state, "none");
console.log("OK   stoploss: 9개 통과");
