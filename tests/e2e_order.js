// 종단 테스트: 각 앱을 ?embed=api 로 열어(자동주문(통합)과 같은 방식) 오늘의 LOC(lastLocOrder)가 나오는지·값이 같은지 확인
// 사용: node tests/e2e_order.js [--update]   (Playwright 필요) — 시세는 data/*.json 과 가짜 응답으로 대체, 외부망 차단
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), UPDATE = process.argv.includes('--update'), APPS = ['soxl', 'tqqq', 'qldm', 'qld'];
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    if (/\/data\/[A-Z_a-z]+\.json$/.test(u)) { try { const j = JSON.parse(d); j.asof_ny = '9999-12-31'; d = JSON.stringify(j); } catch (x) {} }
    r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.json') ? 'application/json' : 'text/javascript' }); r.end(d); }); });
const KEYS = { soxl: ['soxl_buy_records_v1', 'SOXL'], tqqq: ['tqqq_buy_records_v2', 'TQQQ'], qldm: ['qldm_buy_records_v2', 'QLD'], qld: ['qldLifeBuyState_v1', 'QLD'] };
const seedFor = app => { const [key, sym] = KEYS[app]; const bars = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', sym + '.json'))).bars, b = bars[bars.length - 5], c = bars[bars.length - 3];
  const recs = [{ id: 'e2e1', date: b[0], qty: 10, price: b[4] }, { id: 'e2e2', date: c[0], qty: 5, price: c[4] }];
  return [key, JSON.stringify(app === 'qld' ? { records: recs, draft: {}, locQty: '', locBudget: '', autoSkip: [] } : recs)]; };
const mask = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'generated_at' || k === 'version' || k === 'release') ? '*' : v));
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }); let bad = 0;
  for (const [app, sc] of APPS.flatMap(a => [[a, 'none'], [a, 'held']])) {
    const ctx = await br.newContext({ timezoneId: 'Asia/Seoul' }), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message.slice(0, 100)));
    if (sc === 'held') { const [k, v] = seedFor(app); await pg.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, [k, v]); }
    await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { const u = r.request().url();
      if (/finnhub\.io\/api\/v1\/quote/.test(u)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ c: 100, pc: 99, d: 1, dp: 1, h: 101, l: 98, o: 99, t: 1 }) });
      return r.abort(); });
    await pg.goto(`http://127.0.0.1:${port}/${app}.html?embed=api`); await pg.waitForTimeout(1200);
    let lo = null; const mark = await pg.evaluate('Date.now()');
    await pg.evaluate("document.getElementById('fetchBtn').click()");
    for (let i = 0; i < 40 && !lo; i++) { await pg.waitForTimeout(500);
      lo = await pg.evaluate(`(typeof lastLocOrder!=='undefined' && lastLocOrder && Date.parse(lastLocOrder.generated_at)>=${mark}) ? JSON.stringify(lastLocOrder) : null`); }
    await ctx.close();
    const res = lo ? mask(JSON.parse(lo)) : { error: 'lastLocOrder 없음', pageerrors: errs.slice(0, 3) };
    const gf = path.join(__dirname, 'golden', `e2e_${app}_${sc}.json`);
    if (UPDATE || !fs.existsSync(gf)) { fs.writeFileSync(gf, JSON.stringify(res, null, 1)); console.log(`golden 저장 ${app}/${sc}: ${lo ? 'LOC 주문 ' + (res.orders || []).length + '건' : '실패 ' + JSON.stringify(res)}`); continue; }
    const same = JSON.stringify(res) === JSON.stringify(JSON.parse(fs.readFileSync(gf, 'utf8'))); bad += !same;
    console.log(same ? `OK   ${app}/${sc}: LOC 주문 동일` : `DIFF ${app}/${sc}: ${lo ? '값 다름' : '생성 실패'} ${errs.slice(0, 2).join(' | ')}`);
  }
  await br.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
