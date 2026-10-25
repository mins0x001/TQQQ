// 계산 모듈 골든 테스트: 같은 가짜 시세를 넣었을 때 결과가 저장된 값과 같은지 확인
// 사용: node tests/calc_golden.js [--update]   (Playwright 필요: NODE_PATH=$(npm root -g))
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'), UPDATE = process.argv.includes('--update'), APPS = ['soxl', 'tqqq', 'qldm'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) || 'index.html'); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); } }); });
const CASES = function () {   // 브라우저 안에서 실행 — 결정적 가짜 시세로 계산 함수 호출
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gen = (n, start, vol, drift) => { const out = []; let p = start, d = new Date(Date.UTC(2025, 0, 2));
    while (out.length < n) { d = new Date(d.getTime() + 864e5); if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      p = Math.max(1, p * (1 + drift + (rnd() - 0.5) * 2 * vol)); const ds = d.toISOString().slice(0, 10);
      out.push({ d: ds, x: Date.parse(ds + 'T05:00:00Z'), o: p, h: p * 1.01, l: p * 0.99, y: +p.toFixed(4) }); }
    return out; };
  const A = gen(220, 50, 0.045, 0.0004), B = gen(220, 30, 0.03, -0.0003);
  const T = (name, fn) => { try { return JSON.stringify(fn()); } catch (e) { return 'ERR: ' + e.message.slice(0, 120); } };
  const R = {};
  for (const [k, h] of [['A', A], ['B', B]]) {
    R['returns' + k] = T(0, () => calcDailyReturns(h).slice(0, 30)); R['stdev' + k] = T(0, () => calcStdev(calcDailyReturns(h)));
    R['trim' + k] = T(0, () => trimmedMeanExcludingMinMax(calcDailyReturns(h)));
    R['down' + k] = T(0, () => findDownStreaks(h)); R['up' + k] = T(0, () => findUpStreaks(h));
    R['stats' + k] = T(0, () => computeStreakStats(h)); R['upStats' + k] = T(0, () => computeUpStreakStats(h));
    R['dayCnt' + k] = T(0, () => computeDayChangeCounts(h)); R['upDayCnt' + k] = T(0, () => computeUpDayChangeCounts(h));
    R['detail' + k] = T(0, () => computeStreakDetailStats(h)); R['upDetail' + k] = T(0, () => computeUpStreakDetailStats(h));
    R['cont' + k] = T(0, () => [computeStreakContinuationProb(h, 'down', 2), computeStreakContinuationProb(h, 'up', 2)]);
    R['calcDetails' + k] = T(0, () => calculateStreakDetails(h)); R['summ' + k] = T(0, () => summarizeByLength(findDownStreaks(h)));
    R['ai' + k] = T(0, () => buildAiStrategy(h)); R['sellTargets' + k] = T(0, () => simulateSellTargets(h, findDownStreaks(h), 1, 15, 0.5));
    R['sellAn' + k] = T(0, () => analyzeSellStrategy(h)); R['seedBt' + k] = T(0, () => simulateSeedBacktest(h, 36000, 8, true, 3, null, 14));
    R['seedBt2' + k] = T(0, () => simulateSeedBacktest(h, 36000, 8, false, 3, 12, 14)); R['sim' + k] = T(0, () => simTrades(h, 36000, 8, true, 14, 13));
    R['sim2' + k] = T(0, () => simTrades(h, 70000, 10, false, 6, 8)); R['next' + k] = T(0, () => nextTradingDay(h[100].x, 3));
  }
  R.stage = T(0, () => [stagePlan(36000, 10, 3, 3), stagePlan(70000, 8, 2, 4)]);
  R.fmt = T(0, () => [fmtUsd0(12345.678), fmtUsd0Signed(-987.6), fmtUsdCompact(1234567), fmtUsdCompact(-4321), fmtPctSigned(12.345), fmtPctSigned(-0.5, 1), fmtPct1(3.456), fmtCompactDate(Date.UTC(2026, 0, 13)), fmtShortDate(Date.UTC(2026, 1, 3)), fmtDateFull(Date.UTC(2026, 1, 3)), fmtKrDate('2026-02-03')]);
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
    const gf = path.join(__dirname, 'golden', `calc_${app}.json`);
    if (UPDATE || !fs.existsSync(gf)) { fs.writeFileSync(gf, JSON.stringify(res, null, 1)); const e = Object.values(res).filter(v => String(v).startsWith('ERR')).length; console.log(`golden 저장 ${app}: ${Object.keys(res).length}개 (오류 ${e})`); continue; }
    const gold = JSON.parse(fs.readFileSync(gf, 'utf8')), diff = Object.keys({ ...gold, ...res }).filter(k => gold[k] !== res[k]);
    bad += diff.length; console.log(diff.length ? `DIFF ${app}: ${diff.slice(0, 8).join(', ')}${diff.length > 8 ? ' …' : ''}` : `OK   ${app}: ${Object.keys(res).length}개 동일`);
  }
  await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
