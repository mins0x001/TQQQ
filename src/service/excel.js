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
  const trades = loadTrades(), st = tradeStats(trades), cur = sortedBuyRecords();
  const H = s => ({ v: s, s: 1 });
  const hist = last⟦Lev⟧Hist;
  const refPx = (last⟦Lev⟧Price !== null && !isNaN(last⟦Lev⟧Price)) ? last⟦Lev⟧Price : (hist && hist.length ? hist[hist.length - 1].y : null);
  const hq = cur.reduce((x, r) => x + r.qty, 0), hc = cur.reduce((x, r) => x + r.qty * r.price, 0), havg = hq ? hc / hq : null;
  const now = new Date();
  const summary = { name: "요약", cols: [24, 22, 40], rows: [
    [H("항목"), H("값"), H("설명")],
    ["종목", LEV_TICKER, `${LEV_TICKER}무한매수 ${APP_VERSION}`],
    ["내보낸 시각", now.toLocaleString("ko-KR"), ""],
    ["종료 사이클 수", { v: st.n, s: 4 }, `익절 ${st.wins} · 손절 ${st.losses}`],
    ["평균 기간(일)", { v: st.avgDays !== null ? Math.round(st.avgDays * 10) / 10 : "" }, "첫 매수 → 매도 달력 일수 평균"],
    ["평균 매수 횟수", { v: st.avgRounds !== null ? Math.round(st.avgRounds * 10) / 10 : "" }, "사이클당"],
    ["누적 매수금액(매도 완료분)", { v: st.cost, s: 2 }, "매도한 사이클들의 매수금액 합"],
    ["실현 수익금", { v: st.profit, s: 6 }, "Σ(수량 × 매도가 − 매수금액)"],
    ["실현 수익률", { v: st.rate !== null ? st.rate / 100 : "", s: 8 }, "실현 수익금 ÷ 누적 매수금액"],
    ["거래 평균 수익률", { v: st.avgPct !== null ? st.avgPct / 100 : "", s: 3 }, "거래별 수익률의 단순 평균"],
    ["승률", { v: st.n ? st.wins / st.n : "", s: 3 }, `수익 거래 ${st.wins}회 / ${st.n}회`],
    ["현재 보유 수량", { v: hq, s: 4 }, cur.length ? `${cur.length}회 매수 · 첫 매수 ${cur[0].date}` : "보유 없음"],
    ["현재 평단가", { v: havg !== null ? havg : "", s: 2 }, ""],
    ["현재 매수금액", { v: hc, s: 2 }, ""],
    ["평가 기준가", { v: refPx !== null ? refPx : "", s: 2 }, "실시간 현재가(없으면 최근 확정 종가)"],
    ["평가손익", { v: hq && refPx !== null ? refPx * hq - hc : "", s: 5 }, ""],
    ["평가 수익률", { v: hq && refPx !== null ? refPx / havg - 1 : "", s: 3 }, ""],
    ["비고", "수수료·세금·환율 미반영", "자동 기록은 종가 기준 LOC 체결 가정"],
  ] };
  const cs = cyclesNamed();
  const tRows = [[H("사이클"), H("결과"), H("첫 매수일"), H("매도일"), H("일수"), H("거래일"), H("매수 횟수"), H("수량"), H("평단가"), H("투입금"), H("매도가"), H("매도금액"), H("손익"), H("수익률"), H("최대 낙폭"), H("종료 방식")]];
  cs.forEach(c => tRows.push([c.name, c.win ? "익절" : "손절", { d: c.firstBuy }, { d: c.sellDate }, { v: c.days, s: 4 }, c.tdays !== null ? { v: c.tdays, s: 4 } : "", { v: c.rounds, s: 4 }, { v: c.qty, s: 4 }, { v: c.avg, s: 2 }, { v: c.cost, s: 2 }, { v: c.sellPrice, s: 2 }, { v: c.proceeds, s: 2 }, { v: c.profit, s: 5 }, { v: c.pct / 100, s: 3 }, c.mdd !== null ? { v: c.mdd / 100, s: 3 } : "", c.auto ? "LOC 자동" : "직접 기록"]));
  if (cs.length) {
    const n = cs.length + 1;
    tRows.push([{ v: "합계", s: 7 }, "", "", "", "", "", { f: `SUM(G2:G${n})`, v: cs.reduce((x, t) => x + t.rounds, 0), s: 4 }, { f: `SUM(H2:H${n})`, v: cs.reduce((x, t) => x + t.qty, 0), s: 4 }, "", { f: `SUM(J2:J${n})`, v: st.cost, s: 10 }, "", { f: `SUM(L2:L${n})`, v: cs.reduce((x, t) => x + t.proceeds, 0), s: 10 }, { f: `SUM(M2:M${n})`, v: st.profit, s: 6 }, { f: `IF(J${n + 1}=0,"",M${n + 1}/J${n + 1})`, v: st.rate !== null ? st.rate / 100 : 0, s: 8 }, "", ""]);
  }
  const bRows = [[H("사이클"), H("상태"), H("회차"), H("매수일"), H("수량"), H("매수가"), H("매수금액"), H("누적 평단"), H("구분")]];
  const addCycle = (label, state, buys) => { let q = 0, c = 0; buys.forEach((b, k) => { q += b.qty; c += b.qty * b.price; bRows.push([label, state, { v: k + 1, s: 4 }, { d: b.date }, { v: b.qty, s: 4 }, { v: b.price, s: 2 }, { v: b.qty * b.price, s: 2 }, { v: c / q, s: 2 }, (b.auto || b.autoRecorded) ? "자동(LOC)" : "직접"]); }); };
  cs.forEach(c => addCycle(c.name, `${c.win ? "익절" : "손절"} ${c.sellDate}`, c.buys || []));
  if (cur.length) addCycle(`${new Date().getFullYear()}.${cs.filter(c => c.year === String(new Date().getFullYear())).length + 1}차`, "진행 중", cur);
  return XL.build([summary, { name: "사이클", cols: [10, 7, 12, 12, 6, 7, 9, 9, 11, 13, 11, 13, 13, 10, 10, 11], freeze: true, rows: tRows }, { name: "매수기록", cols: [10, 18, 6, 12, 9, 11, 13, 11, 11], freeze: true, rows: bRows }]);
}
document.getElementById("xlsxBtn").addEventListener("click", () => {
  const msg = document.getElementById("xlsxMsg");
  try {
    const blob = buildTradeWorkbook();
    const d = new Date(), ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const name = `${LEV_TICKER}_매매기록_${ymd}.xlsx`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    const t = loadTrades();
    msg.className = "bk-msg ok"; msg.textContent = `다운로드: ${name} · 사이클 ${t.length}건 · 보유 매수 ${loadBuyRecords().length}건`;
  } catch (e) { msg.className = "bk-msg err"; msg.textContent = "엑셀 생성 실패: " + e.message; }
});
initTabs();
initQuickNav();
restoreParamInputs();   // 저장된 규칙 모드·시드·분할 수·주기 복원 (상수 선언 이후에 호출)
updateBuyQtyHint();
updateRuleChips();   // 적용 규칙 칩 (엔진 변수 선언 이후)

document.getElementById("appVersionBadge").textContent = APP_VERSION;
document.getElementById("footerVersion").textContent = `${APP_VERSION} (${RELEASE_DATE})`;
document.title = `⟦LEV⟧ 무한매수 AI (${APP_VERSION} - ${RELEASE_DATE})`;

document.getElementById("fetchBtn").addEventListener("click", fetchAll);
