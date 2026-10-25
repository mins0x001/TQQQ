// QLD평생(qld.html) 계산 골든 테스트: 같은 가짜 시세를 넣었을 때 결과가 저장된 값과 같은지 확인
// 사용: node tests/calc_golden.js [--update]   (Playwright 필요: NODE_PATH=$(npm root -g))
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'), UPDATE = process.argv.includes('--update'), APPS = ['qld'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) || 'index.html'); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); } }); });
const CASES = function () {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gen = (n, start, vol, drift) => { const out = []; let p = start, d = new Date(Date.UTC(2025, 0, 2));
    while (out.length < n) { d = new Date(d.getTime() + 864e5); if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      p = Math.max(1, p * (1 + drift + (rnd() - 0.5) * 2 * vol)); const ds = d.toISOString().slice(0, 10);
      out.push({ d: ds, x: Date.parse(ds + 'T05:00:00Z'), o: p, h: p * 1.01, l: p * 0.99, y: +p.toFixed(4) }); }
    return out; };
  const A = gen(260, 50, 0.03, 0.0004), B = gen(260, 30, 0.02, -0.0003);
  const T = (fn) => { try { return JSON.stringify(fn()); } catch (e) { return 'ERR: ' + e.message.slice(0, 120); } };
  const R = {};
  for (const [k, h] of [['A', A], ['B', B]]) {
    R['down' + k] = T(() => findDownStreaks(h)); R['up' + k] = T(() => findUpStreaks(h));
    R['stats' + k] = T(() => computeStreakStats(h)); R['upStats' + k] = T(() => computeUpStreakStats(h));
    R['dayCnt' + k] = T(() => computeDayChangeCounts(h)); R['upDayCnt' + k] = T(() => computeUpDayChangeCounts(h));
    R['summD' + k] = T(() => computeStreakSummary(h, true)); R['summU' + k] = T(() => computeStreakSummary(h, false));
    R['trim' + k] = T(() => trimmedMeanExcludingMinMax(h.map(d => d.y)));
    R['accBuys' + k] = T(() => findAccumulateBuys(h, 5)); R['accEval' + k] = T(() => evaluateAccumulateBuys(h, findAccumulateBuys(h, 5)));
    R['accSweep' + k] = T(() => sweepAccumulateStrategy(h, 2, 12, 1)); R['accAn' + k] = T(() => analyzeAccumulateStrategy(h));
    R['accStats' + k] = T(() => accumulateStats(h, 5)); R['ai' + k] = T(() => analyzeAiStrategy(h));
    R['cci' + k] = T(() => computeCciSeries(h, 20).slice(-30)); R['ath' + k] = T(() => computeAthInfo(h));
    R['pivot' + k] = T(() => computePivotLevels(h[h.length - 2])); R['sr' + k] = T(() => computeSrAnalysis(h, h[h.length - 1].y));
    R['trend' + k] = T(() => analyzeRecentTrend(h, h[h.length - 1].y, computeCciSeries(h, 20)));
    const ys = h.map(d => d.y), xs = h.map(d => d.x);
    R['seedSim' + k] = T(() => seedSim(ys, xs, 0.05, [30, 30, 40], [4, 2, 1]));
    R['seedOpt' + k] = T(() => seedOptimize(ys, xs, 0.05).slice(0, 5));
    R['engine' + k] = T(() => { guideCtx = { hist: h, histLong: h, ai: analyzeAiStrategy(h), acc: analyzeAccumulateStrategy(h) }; try { liveFx = { rate: 1400 }; } catch (e) {} const E = seedEngine(); return [E, parkPlan(E)]; });
  }
  R.week = T(() => [weekKey(A[50].x), nextWeekday(A[50].x).toISOString(), nextMonday(A[50].x).toISOString()]);
  R.fmt = T(() => [fmtUsd0(12345.678), fmtPctSigned(12.345), fmtPct1(3.14159), fmtMoneySigned(-5000), fmtCompactDate(A[10].x), fmtDateFull(A[10].x), fmtShortDate(A[10].x)]);
  return R;
};
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }); let bad = 0;
  for (const app of APPS) {
    const ctx = await browser.newContext({ timezoneId: 'Asia/Seoul' }), page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await page.goto(`http://127.0.0.1:${port}/${app}.html`, { waitUntil: 'load' }); await page.waitForTimeout(800);
    const res = await page.evaluate(`(${CASES.toString()})()`); await ctx.close();
    const gf = path.join(__dirname, 'golden', `qldcalc_${app}.json`);
    if (UPDATE || !fs.existsSync(gf)) { fs.writeFileSync(gf, JSON.stringify(res, null, 1)); const e = Object.values(res).filter(v => String(v).startsWith('ERR')).length; console.log(`golden 저장 ${app}: ${Object.keys(res).length}개 (오류 ${e})`); continue; }
    const gold = JSON.parse(fs.readFileSync(gf, 'utf8')), diff = Object.keys({ ...gold, ...res }).filter(k => gold[k] !== res[k]);
    bad += diff.length; console.log(diff.length ? `DIFF ${app}: ${diff.slice(0, 8).join(', ')}${diff.length > 8 ? ' …' : ''}` : `OK   ${app}: ${Object.keys(res).length}개 동일`);
  }
  await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
