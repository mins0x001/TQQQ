const R = require("../rebal.js"), assert = require("assert");
// 예시: 총 755,860 USD, 기본 50/20/10/20 → QLD 40 · SOXL 25 · TQQQ 15 (SPYM 20)
const A = 755860, pct = { q: 50, s: 20, t: 10 }, adj = { q: -10, s: 5, t: 5 };
const tp = R.targets(pct, adj, "p"); assert.deepStrictEqual(tp, { q: 40, s: 25, t: 15, p: 20 });
const dp = R.targets(pct, null, "p"); assert.deepStrictEqual(dp, { q: 50, s: 20, t: 10, p: 20 });
const mk = o => { const r = {}; for (const k in o) r[k] = A * o[k] / 100; return r; };
const rows = R.plan({ keys: ["q", "s", "t", "p"], base: A, cur: mk(dp), tgt: mk(tp), px: { q: 95, s: 130, t: 78, p: 89.45 }, toUsd: 1 });
const g = k => rows.find(r => r.key === k);
assert.strictEqual(g("q").act, "sell"); assert.strictEqual(g("q").shares, 795);
assert.strictEqual(g("s").act, "buy"); assert.strictEqual(g("s").shares, 290);
assert.strictEqual(g("t").act, "buy"); assert.strictEqual(g("t").shares, 484);
assert.strictEqual(g("p").act, "hold");
assert.ok(Math.abs(g("q").curPct - 50) < 1e-9 && Math.abs(g("q").tgtPct - 40) < 1e-9);
// 음수 방지 · 가격 없으면 주수 null
assert.strictEqual(R.targets({ q: 5 }, { q: -9 }, "p").q, 0);
assert.strictEqual(R.plan({ keys: ["q"], base: 100, cur: { q: 50 }, tgt: { q: 10 }, px: {}, toUsd: 1 })[0].shares, null);
console.log("OK   rebal: 8개 통과");
