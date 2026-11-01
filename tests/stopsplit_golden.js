// 분할 손절 매도 순서(src/calc/stoploss.js) 단위 테스트 — 사용: node tests/stopsplit_golden.js
const fs = require("fs"), assert = require("assert");
const src = fs.readFileSync(require("path").join(__dirname, "../src/calc/stoploss.js"), "utf8");
const perOfRound = (s, r) => r <= s.n1 ? s.per1 : s.per2, S = new Function("perOfRound", src.replace(/^\/\/@@fn .*$/m, "") + "; return stopSplitPlan;")(perOfRound);
const sp = { maxRounds: 12, n1: 3, per1: 1000, per2: 333 };
const rows = n => Array.from({ length: n }, (_, i) => ({ qty: 10, price: 100 - i, date: "2026-01-" + String(i + 2).padStart(2, "0") }));   // 100,99,… 첫 매수일 01-02
const avg12 = rows(12).reduce((a, x) => a + x.price, 0) / 12, low = Math.floor(avg12 * 0.88) - 1, T1 = "2026-03-02", T2 = "2026-03-03", T3 = "2026-03-04";
let r = S(rows(5), sp, 60, 0.88, null, T1); assert.strictEqual(r.state, "wait"); assert.strictEqual(r.buyHold, false);     // 분할 남음
r = S(rows(12), sp, 95, 0.88, null, T1); assert.strictEqual(r.state, "hold");                                              // 소진 · 손절선 위
r = S(rows(12), sp, low, 0.88, null, T1);                                                                                  // 1일차
assert.strictEqual(r.state, "day1"); assert.strictEqual(r.sellQty, 10); assert.strictEqual(r.afterRounds, 11); assert.ok(r.buyHold); assert.ok(r.realized < 0);
assert.strictEqual(r.buyRound, 11); assert.strictEqual(r.rebuyAmt, 333);
const seq1 = { n: 1, date: T1, since: "2026-01-02" };
r = S(rows(11), sp, 60, 0.88, seq1, T1); assert.strictEqual(r.state, "wait2"); assert.ok(r.buyHold);                      // 같은 날 = 2일차 대기
r = S(rows(11), sp, 95, 0.88, seq1, T2);                                                                                   // 2일차 (손절선과 상관없이)
assert.strictEqual(r.state, "day2"); assert.strictEqual(r.sellQty, 10); assert.strictEqual(r.afterRounds, 10); assert.strictEqual(r.buyRound, 11);
const seq2 = { n: 2, date: T2, since: "2026-01-02" };
r = S(rows(10), sp, 60, 0.88, seq2, T2); assert.strictEqual(r.state, "wait3"); assert.ok(r.buyHold);                      // 같은 날 = 3일차 대기
r = S(rows(10), sp, 60, 0.88, seq2, T3); assert.strictEqual(r.state, "wait"); assert.strictEqual(r.buyHold, false);        // 3일차 = 평소 규칙 매수 (10회 < 12)
r = S(rows(12), sp, low, 0.88, seq2, T3); assert.strictEqual(r.state, "day1");                                             // 다시 소진 · 손절선 → 새 순서
r = S(rows(11), sp, low, 0.88, { n: 1, date: T1, since: "2025-12-01" }, T2); assert.strictEqual(r.state, "wait");          // 다른 사이클의 낡은 상태 무시
r = S(rows(1), { maxRounds: 1, n1: 1, per1: 1000, per2: 333 }, 50, 0.88, null, T1); assert.strictEqual(r.afterRounds, 0); assert.strictEqual(r.keepAvg, null);
assert.strictEqual(S([], sp, 80, 0.88, null, T1).state, "none");
console.log("OK   stoploss: 18개 통과");
