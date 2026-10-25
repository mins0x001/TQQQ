/* ======================== 📊 엑셀(.xlsx) 내보내기 ======================== */
const XL = (() => {
  const esc = v => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const col = n => { let c = ""; n++; while (n) { const m = (n - 1) % 26; c = String.fromCharCode(65 + m) + c; n = Math.floor((n - 1) / 26); } return c; };
  const serial = ds => { const [y, m, d] = ds.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {               // 무압축(store) ZIP
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true);
      h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cen.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cenSize = cen.reduce((x, p) => x + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cenSize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  // 셀 스타일: 0 기본 1 헤더 2 $ 3 % 4 정수 5 ±$ 6 합계±$ 7 굵게 8 합계% 9 날짜 10 합계$
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="166" formatCode="&quot;+$&quot;#,##0.00;&quot;-$&quot;#,##0.00;&quot;$&quot;0.00"/><numFmt numFmtId="167" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="10" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  function sheetXml(sh) {
    const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((c, ci) => {
      if (c === null || c === undefined || c === "") return "";
      const o = typeof c === "object" ? c : { v: c };
      if (o.v === "" && !o.f && !o.d) return "";
      const ref = col(ci) + (ri + 1), st = o.s ? ` s="${o.s}"` : "";
      if (o.f) return `<c r="${ref}"${st}><f>${esc(o.f)}</f>${typeof o.v === "number" && isFinite(o.v) ? `<v>${o.v}</v>` : ""}</c>`;
      if (o.d) return `<c r="${ref}" s="${o.s || 9}"><v>${serial(o.d)}</v></c>`;
      if (typeof o.v === "number") return isFinite(o.v) ? `<c r="${ref}"${st}><v>${o.v}</v></c>` : "";
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`;
    }).join("") + `</row>`).join("");
    const cols = sh.cols ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const pane = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`;
  }
  function build(sheets) {
    const files = [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", data: styles },
      ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh) })),
    ];
    return zip(files);
  }
  return { build };
})();

function buildTradeWorkbook() {
  const trades = loadTrades(), st = tradeStats(trades), valid = validBuys(), h = holdingSummary(valid);
  const Hd = s => ({ v: s, s: 1 });
  const refPx = guideCtx ? guideRefPrice(guideCtx) : null;
  const buyCost = valid.reduce((x, r) => x + r.qty * r.price, 0), buyQty = valid.reduce((x, r) => x + r.qty, 0);
  const summary = { name: "요약", cols: [24, 22, 42], rows: [
    [Hd("항목"), Hd("값"), Hd("설명")],
    ["종목", "QLD", `QLD평생매수 ${APP_VERSION}`],
    ["내보낸 시각", new Date().toLocaleString("ko-KR"), ""],
    ["총 매수 횟수", { v: valid.length, s: 4 }, valid.length ? `첫 매수 ${valid[0].date} · 최근 ${valid[valid.length - 1].date}` : ""],
    ["총 매수 수량", { v: buyQty, s: 4 }, ""],
    ["총 매수금액", { v: buyCost, s: 2 }, ""],
    ["순보유 수량", { v: h ? h.qty : 0, s: 4 }, h && h.sold ? `매도 ${h.sold}주 차감` : ""],
    ["현재 평단가", { v: h ? h.avg : "", s: 2 }, "평균단가법"],
    ["보유 매수금액", { v: h ? h.cost : 0, s: 2 }, ""],
    ["평가 기준가", { v: refPx !== null ? refPx : "", s: 2 }, "실시간 현재가(없으면 최근 확정 종가)"],
    ["평가손익", { v: h && refPx !== null ? refPx * h.qty - h.cost : "", s: 5 }, ""],
    ["평가 수익률", { v: h && refPx !== null ? refPx / h.avg - 1 : "", s: 3 }, ""],
    ["매도 횟수", { v: st.n, s: 4 }, `${st.qty}주 매도`],
    ["실현 수익금", { v: st.profit, s: 6 }, "Σ 매도 수량 × (매도가 − 그때 평단)"],
    ["실현 수익률", { v: st.rate !== null ? st.rate / 100 : "", s: 8 }, "실현 수익금 ÷ 매도 원가"],
    ["비고", "수수료·세금·환율 미반영", ""],
  ] };
  const bRows = [[Hd("회차"), Hd("매수일"), Hd("수량"), Hd("매수가"), Hd("매수금액"), Hd("누적 평단(매수만)"), Hd("구분")]];
  let q = 0, c = 0;
  valid.forEach((r, k) => { q += r.qty; c += r.qty * r.price; bRows.push([{ v: k + 1, s: 4 }, { d: r.date }, { v: r.qty, s: 4 }, { v: r.price, s: 2 }, { v: r.qty * r.price, s: 2 }, { v: c / q, s: 2 }, r.auto ? "자동(LOC)" : "직접"]); });
  if (valid.length) { const n = valid.length + 1; bRows.push([{ v: "합계", s: 7 }, "", { f: `SUM(C2:C${n})`, v: buyQty, s: 4 }, "", { f: `SUM(E2:E${n})`, v: buyCost, s: 10 }, "", ""]); }
  const tRows = [[Hd("번호"), Hd("매도일"), Hd("매도 전 보유"), Hd("매도 수량"), Hd("그때 평단"), Hd("매도 원가"), Hd("매도가"), Hd("매도금액"), Hd("수익금"), Hd("수익률")]];
  trades.forEach((t, k) => tRows.push([{ v: k + 1, s: 4 }, { d: t.date }, { v: t.holdBefore, s: 4 }, { v: t.qty, s: 4 }, { v: t.avg, s: 2 }, { v: t.cost, s: 2 }, { v: t.price, s: 2 }, { v: t.proceeds, s: 2 }, { v: t.profit, s: 5 }, { v: t.pct / 100, s: 3 }]));
  if (trades.length) { const n = trades.length + 1; tRows.push([{ v: "합계", s: 7 }, "", "", { f: `SUM(D2:D${n})`, v: st.qty, s: 4 }, "", { f: `SUM(F2:F${n})`, v: st.cost, s: 10 }, "", { f: `SUM(H2:H${n})`, v: trades.reduce((x, t) => x + t.proceeds, 0), s: 10 }, { f: `SUM(I2:I${n})`, v: st.profit, s: 6 }, { f: `IF(F${n + 1}=0,"",I${n + 1}/F${n + 1})`, v: st.rate !== null ? st.rate / 100 : 0, s: 8 }]); }
  return XL.build([summary, { name: "매수기록", cols: [6, 12, 9, 11, 13, 16, 11], freeze: true, rows: bRows }, { name: "매도·수익", cols: [6, 12, 12, 10, 11, 13, 11, 13, 13, 10], freeze: true, rows: tRows }]);
}
document.getElementById("xlsxBtn").addEventListener("click", () => {
  const msg = document.getElementById("xlsxMsg");
  try {
    const blob = buildTradeWorkbook();
    const d = new Date(), ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const name = `QLD_매매기록_${ymd}.xlsx`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    msg.className = "bk-msg ok"; msg.textContent = `다운로드: ${name} · 매수 ${validBuys().length}건 · 매도 ${loadTrades().length}건`;
  } catch (e) { msg.className = "bk-msg err"; msg.textContent = "엑셀 생성 실패: " + e.message; }
});

