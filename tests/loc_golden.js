// LOC 주문 카드 골든 테스트: 여러 보유 상태(없음·1단계·2단계·소진·손절모드)에서 카드 HTML 과 봇용 주문 데이터가 저장된 값과 같은지 확인
// 사용: node tests/loc_golden.js [--update]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'), UPDATE = process.argv.includes('--update'), APPS = { soxl: 'lastSoxlHist', tqqq: 'lastTqqqHist', qldm: 'lastTqqqHist' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) || 'index.html'); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); } }); });
const RUN = async function (histName) {
  let s = 777; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gen = (n, start, vol, drift) => { const out = []; let p = start, d = new Date(Date.UTC(2025, 0, 2));
    while (out.length < n) { d = new Date(d.getTime() + 864e5); if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; p = Math.max(1, p * (1 + drift + (rnd() - 0.5) * 2 * vol)); const ds = d.toISOString().slice(0, 10);
      out.push({ d: ds, x: Date.parse(ds + 'T05:00:00Z'), o: p, h: p * 1.01, l: p * 0.99, y: +p.toFixed(4) }); } return out; };
  const hists = { A: gen(220, 50, 0.045, 0.0004), B: gen(220, 30, 0.03, -0.0003) };
  const mk = (n, price, qty) => Array.from({ length: n }, (_, i) => ({ id: 1000 + i, date: `2025-1${i % 3}-${String(1 + i).padStart(2, '0')}`, qty: qty + i, price: +(price * (1 - i * 0.004)).toFixed(2) }));
  const out = {};
  for (const [hk, h] of Object.entries(hists)) {
    const last = h[h.length - 1].y;
    const states = { none: [], one: mk(1, last * 1.1, 40), three: mk(3, last * 1.05, 30), five: mk(5, last * 0.95, 25), eight: mk(8, last * 1.2, 20), twelve: mk(12, last * 1.3, 15), many: mk(40, last * 1.1, 10), full: mk(70, last * 1.0, 5), stop: mk(4, last * 2.2, 20) };
    for (const [sk, recs] of Object.entries(states)) for (const [ik, inp] of Object.entries({ a: [36000, 8, 3], b: [70000, 10, 4] })) {
      eval(histName + ' = ' + JSON.stringify(h)); localStorage.setItem(BUY_RECORDS_KEY, JSON.stringify(recs)); lastLocOrder = null;
      document.getElementById('seedSimSeed1').value = inp[0]; document.getElementById('seedSimSplits1').value = inp[1]; document.getElementById('seedSimCycle1').value = inp[2];
      let err = null; try { renderLocGuideCard(); } catch (e) { err = String(e.message).slice(0, 100); }
      const lo = lastLocOrder ? JSON.parse(JSON.stringify(lastLocOrder)) : null; if (lo) { delete lo.generated_at; delete lo.version; delete lo.release; }   // 버전·날짜는 올릴 때마다 바뀌므로 제외
      out[`${hk}.${sk}.${ik}`] = { err, hero: document.getElementById('locHeroContent').innerHTML.replace(/\s+/g, ' '), order: lo, title: document.title.replace(/\(V[\d.]+ - \d+\)/, '(버전)') };
    }
  }
  return out;
};
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }); let bad = 0;
  for (const [app, hn] of Object.entries(APPS)) {
    const ctx = await browser.newContext({ timezoneId: 'Asia/Seoul' }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await page.goto(`http://127.0.0.1:${port}/${app}.html`, { waitUntil: 'load' }); await page.waitForTimeout(800);
    const res = await page.evaluate(`(${RUN.toString()})(${JSON.stringify(hn)})`); await ctx.close();
    const n = Object.keys(res).length, withErr = Object.values(res).filter(v => v.err).length, withOrder = Object.values(res).filter(v => v.order && v.order.orders.length).length;
    const gf = path.join(__dirname, 'golden', `loc_${app}.json`);
    if (UPDATE || !fs.existsSync(gf)) { fs.writeFileSync(gf, JSON.stringify(res, null, 1)); console.log(`golden 저장 ${app}: ${n}개 상태 (오류 ${withErr} · 주문 생성 ${withOrder})`); continue; }
    const gold = JSON.parse(fs.readFileSync(gf, 'utf8')), diff = Object.keys(res).filter(k => JSON.stringify(gold[k]) !== JSON.stringify(res[k])); bad += diff.length + errs.length;
    console.log(diff.length ? `DIFF ${app}: ${diff.slice(0, 6).join(', ')}${diff.length > 6 ? ' …' : ''}` : `OK   ${app}: ${n}개 상태 동일 (주문 생성 ${withOrder})`);
  }
  await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
