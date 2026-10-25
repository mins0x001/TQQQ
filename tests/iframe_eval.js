// 통합 앱(자동주문)이 각 앱을 숨은 iframe 으로 열어 contentWindow.eval 로 계산 결과를 읽는 경로가 CSP 에 막히지 않는지 확인
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) || 'index.html'); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.json') ? 'application/json' : 'text/javascript' }); r.end(d); } }); });
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), p = await br.newPage(); let bad = 0;
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); await p.goto(`http://127.0.0.1:${port}/api-all.html`);
  for (const a of ['soxl', 'tqqq', 'qldm', 'qld']) {
    const r = await p.evaluate(async a => { const f = document.createElement('iframe'); f.src = a + '.html?embed=api'; document.body.appendChild(f);
      await new Promise(r => f.addEventListener('load', r)); await new Promise(r => setTimeout(r, 800));
      try { return f.contentWindow.eval("typeof syncMeta+'/'+typeof lastLocOrder"); } catch (e) { return 'ERR ' + e.message.slice(0, 60); } }, a);
    const ok = r === 'function/object'; bad += !ok; console.log(ok ? `OK   ${a}: iframe eval 통과` : `DIFF ${a}: ${r}`);
  }
  await br.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
