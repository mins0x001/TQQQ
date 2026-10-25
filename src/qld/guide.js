/* =====================================================================
   ① 나의 매수 기록  ② LOC 매수/매도 예약 가이드  ③ 최근 추이 정밀 분석
   (V0.08 'QLD 평생매수 가이드' 카드를 3개 카드로 분리)
   ===================================================================== */
const GUIDE_STORE_KEY = "qldLifeBuyState_v1";   // V0.08 저장 기록과 호환
let guideCtx = null;
const blankState = () => ({ records: [], draft: {}, locQty: "", locBudget: "", autoSkip: [] });
let guideState = blankState();

function guideLoadState() {
  try {
    const raw = localStorage.getItem(GUIDE_STORE_KEY);
    if (!raw) return blankState();
    const st = JSON.parse(raw);
    return { records: Array.isArray(st.records) ? st.records : [], draft: st.draft || {}, locQty: st.locQty || "", locBudget: st.locBudget || "", autoSkip: Array.isArray(st.autoSkip) ? st.autoSkip : [] };
  } catch (e) { return blankState(); }
}
function guideSaveState() {
  try { localStorage.setItem(GUIDE_STORE_KEY, JSON.stringify(guideState)); } catch (e) { /* 저장소 사용 불가 시 무시 */ }
}

function renderGuideCard(hist, livePrice, cciHist, histLong) {
  const long = (histLong && histLong.length > hist.length) ? histLong : hist;
  guideCtx = { hist, histLong: long, livePrice, cciHist,
    acc: analyzeAccumulateStrategy(hist),        // 200봉 (백테스트 카드 비교용)
    ai: analyzeAiStrategy(long),                 // 400봉 워크포워드 (LOC 가이드용)
    sr: computeSrAnalysis(hist, livePrice) };
  autoRecordWeeklyFills();                                  // 주 1회 LOC 체결분 자동 저장 (V0.22: 아무 요일)
  const dEl = document.getElementById("guideDate");
  if (dEl && dEl.dataset.autoDefault === "1") setDefaultGuideDate(true);
  renderGuideResult();
}
function renderGuideResult() {
  renderTodayCard();
  updateGuideQtyHint();
  renderRecordsCard();
  renderLocCard();
  renderTrendCard();
}

function guideResolveRecords(hist) {
  const lastBarX = hist && hist.length ? hist[hist.length - 1].x : null;
  return guideState.records.map(r => {
    const t = new Date(r.date).getTime();
    const manual = r.price !== null && r.price !== undefined && r.price !== "" && Number(r.price) > 0;
    // 최근 확정 종가일보다 뒤(오늘 장중 등)는 아직 종가가 없으므로 직전 종가를 쓰지 않고 '확정 대기'로 둔다
    const pending = !manual && lastBarX !== null && t > lastBarX;
    const near = hist && !pending ? findNearestBefore(hist, t) : null;
    const price = manual ? Number(r.price) : (near ? near.y : null);
    return { id: r.id, date: r.date, t, qty: Number(r.qty), price, manual, auto: !!r.auto, pending };
  }).sort((a, b) => (a.t - b.t) || String(a.id).localeCompare(String(b.id)));
}
function guideRefPrice(ctx) {
  if (!ctx) return null;
  const live = ctx.livePrice;
  return (live !== null && live !== undefined && !isNaN(live)) ? live : ctx.hist[ctx.hist.length - 1].y;
}
//@@include qld:holdingSummary
/* 특정 날짜(포함)까지의 순보유: 매수는 더하고 매도는 그때 평단으로 원가를 빼는 평균단가법. 같은 날은 매수 먼저 */
//@@include qld:positionAt

/* 기준가·전략 A 매수 트리거 계산 (LOC 카드·추이 카드 공용) */
function computeGuidePlan(ctx, valid) {
  if (!ctx || (!ctx.ai && !ctx.acc)) return null;
  const hist = ctx.hist;
  const lastRec = valid.length > 0 ? valid[valid.length - 1] : null;
  let refPeak, refPeakLabel;
  if (lastRec) {
    const after = hist.filter(d => d.x > lastRec.t).map(d => d.y);
    refPeak = Math.max(lastRec.price, ...(after.length ? after : [0]));
    refPeakLabel = refPeak === lastRec.price ? `직전 매수가 (${fmtShortDate(lastRec.t)})` : "직전 매수 이후 고점";
  } else {
    refPeak = Math.max(...hist.map(d => d.y));
    refPeakLabel = "200봉 종가 고점 (기록 없음)";
  }
  const A = ctx.ai ? ctx.ai.best : ctx.acc.bestByReturn;   // 400봉 워크포워드 채택값 (없으면 200봉 수익률 최적)
  const trig1 = refPeak * (1 - A.pct / 100);
  return { A, ai: ctx.ai, pct: A.pct, refPeak, refPeakLabel, trig1, locPx: Math.max(0.01, Math.floor(trig1 * 100) / 100), defaultQty: lastRec ? lastRec.qty : 1, lastRec };
}

/* ============================ V0.15 추가 로직 ============================ */
//@@include format:fmtCompactDate
//@@include format:fmtUsd0
/* 날짜 기본값: 어제 (시세 조회 후에는 최근 확정 종가일 = 미국장 기준 어제 거래일) */
function setDefaultGuideDate(force) {
  const el = document.getElementById("guideDate");
  if (!el || (el.value && !force)) return;
  let v;
  if (guideCtx && guideCtx.hist && guideCtx.hist.length) v = fmtDateFull(guideCtx.hist[guideCtx.hist.length - 1].x);
  else { const y = new Date(Date.now() - 86400000); v = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`; }
  el.value = v; el.dataset.autoDefault = "1";
}
/* 수량 기본값: LOC 가이드 수량 (원화 예산 → 직접 입력 → 직전 매수 수량) */
function defaultGuideQty() {
  const ctx = guideCtx;
  const valid = guideResolveRecords(ctx ? ctx.hist : null).filter(r => r.price !== null && r.qty > 0);
  const plan = ctx ? computeGuidePlan(ctx, valid) : null;
  const lastQty = valid.length ? valid[valid.length - 1].qty : null;
  if (plan) {
    const r = resolveLocQty(plan.locPx, plan.defaultQty);
    return { qty: r.qty, label: r.source === "budget" ? "원화 예산 기준" : r.source === "custom" ? "LOC 수량 입력값" : "직전 매수 수량" };
  }
  if (lastQty) return { qty: lastQty, label: "직전 매수 수량" };
  return null;
}
function updateGuideQtyHint() {
  const q = document.getElementById("guideQty");
  if (!q) return;
  const dq = defaultGuideQty();
  q.placeholder = dq ? `비우면 ${dq.qty}주` : "비우면 자동";
}

/* 주 번호 (월요일 시작) — V0.22: 주 1회 매수 판정용 */
//@@include qld:weekKey
function isWeekFirstSession(hist, i) { return i === 0 || weekKey(hist[i].x) !== weekKey(hist[i - 1].x); }
//@@include qld:nextWeekday
//@@include qld:nextMonday
const WEEK_KR = ["일", "월", "화", "수", "목", "금", "토"];
const fmtMD = d => `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK_KR[d.getUTCDay()]})`;

/* ---------- 주 1회 LOC 체결 자동 저장 (V0.22: 주중 아무 날 · 그 주 첫 체결만) ----------
   마지막 매수 기록 다음 거래일부터 어제까지, '각 주의 첫 거래일'마다 그날 걸었을 LOC 매수가를 다시 계산해
   종가 ≤ 매수가였으면 체결로 보고 기록한다 (체결가 = 그날 종가).
   매수가 = floor(기준가 × (1 − 하락 목표))  ·  기준가 = max(직전 매수가, 그 이후 전날까지의 종가)  — LOC 가이드와 같은 식
   · 기록이 없는 신규 시작 전, 사용자가 지운 자동 기록 날짜, 이미 기록된 날짜는 건너뛴다 */
let autoRecordMsg = "", autoRecordInfo = "";
function autoRecordWeeklyFills() {
  autoRecordMsg = ""; autoRecordInfo = "";
  const ctx = guideCtx;
  if (!ctx || !ctx.hist || ctx.hist.length < 3) return;
  const hist = ctx.hist;
  let valid = guideResolveRecords(hist).filter(r => r.price !== null && r.qty > 0);
  if (!valid.length) { autoRecordInfo = "기록이 없어 자동 저장하지 않습니다 (첫 매수는 직접 저장하면 그다음부터 자동)"; return; }
  const plan0 = computeGuidePlan(ctx, valid);
  if (!plan0) return;
  const pct = plan0.pct;
  const D = hist.length - 1;
  const dates = hist.map(d => fmtDateFull(d.x));
  const lastRec = valid[valid.length - 1];
  let start = dates.findIndex(dd => dd > lastRec.date);
  if (start === -1) { autoRecordInfo = `어제(${fmtCompactDate(hist[D].x)})까지 기록되어 있습니다`; return; }
  start = Math.max(start, D - 25, 1);
  const skip = guideState.autoSkip || [];
  const added = [];
  let reason = "";
  let refPeak = lastRec.price;
  for (let k = dates.indexOf(lastRec.date) + 1; k > 0 && k < start; k++) refPeak = Math.max(refPeak, hist[k].y);
  let qtyBase = lastRec.qty;
  const boughtWk = new Set(valid.map(r => weekKey(r.t)));          // V0.22: 이미 산 주는 건너뜀 (주 1회)
  for (let i = start; i <= D; i++) {
    if (boughtWk.has(weekKey(hist[i].x))) { refPeak = Math.max(refPeak, hist[i].y); continue; }
    const trig = Math.max(0.01, Math.floor(refPeak * (1 - pct / 100) * 100) / 100);
    const tag = `${fmtCompactDate(hist[i].x)}(${WEEK_KR[new Date(hist[i].x).getUTCDay()]})`;
    if (skip.includes(dates[i])) { reason = `${tag} 자동 기록은 직접 지우셔서 다시 만들지 않습니다`; refPeak = Math.max(refPeak, hist[i].y); continue; }
    if (hist[i].y > trig) { reason = `${tag} 종가 ${usd(hist[i].y)} > LOC 매수가 ${usd(trig)} → 미체결 (이번 주 남은 날 계속)`; refPeak = Math.max(refPeak, hist[i].y); continue; }
    const qty = resolveLocQty(trig, qtyBase).qty;
    guideState.records.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: dates[i], qty, price: hist[i].y, auto: true });
    added.push(`${tag} ${qty}주 @ ${usd(hist[i].y)} (LOC ${usd(trig)} 이하)`);
    refPeak = hist[i].y; qtyBase = qty; reason = ""; boughtWk.add(weekKey(hist[i].x));
  }
  if (added.length) { guideSaveState(); autoRecordMsg = `주 1회 LOC 체결 → 자동 저장: ${added.join(", ")}. 실제로 체결되지 않았다면 ✕로 지워주세요.`; }
  if (reason) autoRecordInfo = "자동 저장 안 함 — " + reason;
  else if (!added.length) autoRecordInfo = `마지막 기록 이후 새로 체결될 날이 아직 없습니다`;
}


/* ---------- 🤖 02 · AI ENGINE — QLD 시드 배분 (V1.02 · TQQQ 엔진과 같은 구조) ----------
   차수 가격 = 구간 고점 H × (1 − AI 하락목표)^k (사다리와 같은 공식) · 매수 = 주 1회 LOC(종가 체결) · 체결가가 새 기준가
   ① 규칙 기반: k = QLD 일간 σ ÷ 기준 σ 2.5% → 분할 n = round([6,3,1] × √k) · 배분 ∝ √도달확률 × (1+누적낙폭)
   ② 백테스트 최적: 배분(10% 단위) × 분할 조합을 과거 시세로 평생매수 시뮬레이션 → 남은 현금은 수익 0%(시드 남기면 손해)
      → 인접 조합 평균(견고성) 1위를 채택. 1회 금액 = 시드 × 배분 ÷ 분할 · 남은 시드가 반 회분 미만이면 함께 소진 */
const SEED_KEY = "qldSeed_v1", SEED_DEF = 370000, SIG_BASE = 2.5;
function seedGet() { try { const d = JSON.parse(localStorage.getItem(SEED_KEY) || "null"); return d && d.v > 0 ? d : null; } catch (e) { return null; } }
const seedVal = () => (seedGet() || { v: SEED_DEF }).v;
const seedMode = () => (seedGet() || {}).mode === "rule" ? "rule" : "opt";
function seedSet(d, fromSync) { try { localStorage.setItem(SEED_KEY, JSON.stringify(d)); } catch (e) {} if (!fromSync && typeof syncSchedule === "function") syncSchedule(800); }
//@@include qld:seedSim
let __seedOpt = { key: "", res: null };
//@@include qld:seedOptimize
function seedEngine() {
  const ctx = guideCtx; if (!ctx || !ctx.hist || !ctx.hist.length) return null;
  const valid = guideResolveRecords(ctx.hist).filter(r => r.price !== null && r.qty > 0);
  const plan = computeGuidePlan(ctx, valid); if (!plan) return null;
  const L = (ctx.histLong && ctx.histLong.length > 30 ? ctx.histLong : ctx.hist), ys = L.map(d => d.y), xs = L.map(d => d.x);
  const q = plan.pct / 100, seed = seedVal(), H = Math.max(...ctx.hist.map(d => d.y));
  const cum = [1, 2, 3].map(k => 1 - Math.pow(1 - q, k));
  let pk = ys[0]; const dd = ys.map(y => { pk = Math.max(pk, y); return 1 - y / pk; });
  const prob = cum.map(c => Math.max(0.03, dd.filter(d => d >= c - 1e-9).length / dd.length));
  const rets = ys.slice(1).map((y, i) => Math.log(y / ys[i])), mu = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sig = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length) * 100, kk = sig / SIG_BASE;
  const raw = cum.map((c, i) => Math.sqrt(prob[i]) * (1 + c)), rs = raw.reduce((a, b) => a + b, 0);
  const rw = raw.map(r => Math.round(r / rs * 20) * 5); rw[2] = 100 - rw[0] - rw[1];
  const rn = [6, 3, 1].map(b => Math.max(1, Math.round(b * Math.sqrt(kk))));
  const rule = { w: rw, n: rn, ...seedSim(ys, xs, q, rw, rn) };
  const top = seedOptimize(ys, xs, q), best = top[0];
  const use = seedMode() === "rule" ? rule : best;
  const w = use.w, n = use.n, px = cum.map(c => Math.floor(H * (1 - c) * 100) / 100), per = w.map((x, i) => seed * x / 100 / n[i]);
  const spent = valid.reduce((a, r) => a + r.price * r.qty, 0), remain = Math.max(0, seed - spent);
  const depth = 1 - plan.locPx / H, tier = depth < cum[1] - 1e-9 ? 0 : depth < cum[2] - 1e-9 ? 1 : 2;
  /* V1.27 N회차 사다리 (N = AI 분할 합계, 예 10/1/1 → 12 · 6/3/1 → 10): 가격이 2차(고점 −27.8%)·3차(−38.6%) 구간에 오면 앞 회차가 남아도 바로 그 단계 첫 회차로 (예: 3회차 → 11회차)
     이번 단계 1회 금액 = (남은 시드 − 뒤 단계 몫(시드 × 뒤 단계 %)) ÷ 이번 단계 남은 회차 → 건너뛴 회차 돈은 이번 단계로 자동 합산 */
  const N = n.reduce((a, b) => a + b, 0), done = valid.length, startOf = T => n.slice(0, T).reduce((a, b) => a + b, 0);
  const after = (T, rem) => Math.min(rem, seed * w.slice(T + 1).reduce((a, b) => a + b, 0) / 100);
  const leftIn = T => Math.max(1, n[T] - Math.max(0, Math.min(n[T], done - startOf(T))));
  const tierAmt = (T, rem, left) => Math.max(0, rem - after(T, rem)) / left;
  let amt = Math.min(tierAmt(tier, remain, leftIn(tier)), remain); if (remain - amt < Math.min(per[0], per[tier]) * 0.5) amt = remain;   // 자투리만 합침 (뒤 단계 몫은 지킴)
  const round = Math.min(N, Math.max(done + 1, startOf(tier) + 1));
  // 앞으로 남은 회차 묶음 (이번 단계 · 다음 단계 · 그다음) — 다음 단계는 '이번 매수 직후 바로 건너뛴다'고 가정한 금액
  const rows = []; let rem2 = remain;
  for (let T = tier; T < 3; T++) {
    const from = T === tier ? round : startOf(T) + 1, to = startOf(T) + n[T]; if (from > to) continue;
    const each = T === tier ? amt : T === 2 ? rem2 / n[T] : tierAmt(T, rem2, n[T]);
    rows.push({ T, from, to, each: Math.max(0, each), px: T === tier ? plan.locPx : px[T], now: T === tier });
    rem2 = Math.max(0, rem2 - (T === tier ? amt : each * n[T]));
  }
  return { N, done, round, rows, nextAmt: rows[1] ? rows[1].each : 0, nextPx: rows[1] ? rows[1].px : 0, seed, H, cum, prob, sig, kk, rule, best, top: top.filter((o, i, A) => A.findIndex(x => x.w.join() === o.w.join() && Math.abs(x.ret - o.ret) < 1e-9) === i).slice(0, 5), mode: seedMode(), w, n, px, per, spent, remain, tier, amt,
           qty: Math.floor(amt / plan.locPx), locPx: plan.locPx, bars: ys.length };
}
/* 🅿 SPYM 파킹 AI 전략 (봇이 이 값 그대로 실행): 평생매수 대기 시드 중 'QLD매수 대기현금'만 현금 · 나머지는 SPYM(S&P 500)
   QLD 1년 고점 대비 낙폭으로 3단계 — SPYM 도 같이 빠지는 폭락 전에 큰 회차 돈을 미리 현금으로 돌려 놓는다
   🟢 평온 (1차 매수가 위)        : 현금 = 이번 단계 1회 × 2
   🟡 매수 구간 (1차 매수가 이하) : 현금 = 이번 단계 1회 × 2 + 다음 단계 1회의 절반 (미리 반)
   🔴 다음 단계 근접 (진입가 10% 이내): 현금 = 이번 단계 1회 + 다음 단계 1회 (큰 회차 전액 확보) */
function parkPlan(E) {
  const ctx = guideCtx; if (!E || !ctx || !ctx.hist || !ctx.hist.length) return null;
  const p = ctx.hist[ctx.hist.length - 1].y, t = E.tier, cur = E.amt || 0, nx = E.nextAmt || 0, nxPx = E.nextPx || 0;
  let st, R, why;
  const nr = E.rows[1] ? E.rows[1].from : 0;
  const r1 = E.round, r2 = Math.min(E.N, E.round + 1), two = r2 > r1 ? `${r1}회차, ${r2}회차` : `${r1}회차`;
  if (nx && p <= nxPx * 1.10) { st = 2; R = Math.max(2 * cur, cur + nx); why = `단계 근접 → QLD매수 ${r1}회차 + ${nr}회차(진입가 $${nxPx.toFixed(2)}) 전액 대기현금 필요`; }
  else if (p <= E.px[0]) { st = 1; R = 2 * cur + nx * 0.5; why = `매수 구간 → QLD매수 ${two} + ${nr ? nr + "회차 절반" : ""} 대기현금 필요`; }
  else { st = 0; R = 2 * cur; why = `평온 → QLD매수 ${two} 대기현금 필요`; }
  R = Math.min(R, E.remain); const target = Math.max(0, E.remain - R);
  const L = parseJ(lsGet("qld_park_v1"), {}) || {}, a = qldAcct(), h = a && (a.holdings || []).find(x => String(x.symbol).toUpperCase() === "SPYM");
  // 계좌 동기화가 없으면 = SPYM 보유 없음 · 남은 시드 전부 현금으로 보고 계산
  const sync = !!(a && a.cash_usd != null), lq = sync ? Math.min(+L.qty || 0, h ? +h.qty : 0) : 0, px = h && +h.qty ? (+h.value || 0) / +h.qty : 0, pv = lq * px, cash = sync ? +a.cash_usd : E.remain;
  return { p, st, R, why, target, lq, px, pv, cash, cur, nx, t, nr, sync };
}
let SPYM_PX = null;
fetch("data/SPYM.json?h=" + new Date().toISOString().slice(0, 10), { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(j => { const b = j && j.bars; if (b && b.length) { SPYM_PX = { px: +b[b.length - 1][4], d: b[b.length - 1][0] }; try { renderPark(seedEngine()); } catch (e) {} } }).catch(() => {});
const u0c = v => "$" + Number(v).toFixed(2);
function renderPark(E) {
  const el = document.getElementById("parkContent"); if (!el) return; const P = parkPlan(E); if (!P) return;
  const fx = (liveFx && liveFx.rate > 0) ? liveFx.rate : 0, k = v => fx ? ` <small style="color:var(--text-faint)">(${krw(v * fx)})</small>` : "";
  const ST = [["🟢 평온", "var(--up)"], ["🟡 매수 구간", "var(--amber)"], ["🔴 단계 근접", "var(--down)"]][P.st];
  const u0 = v => "$" + Math.round(v).toLocaleString("en-US"), row = (l, v) => `<div style="padding:9px 2px;border-top:1px solid var(--border-soft)"><div style="font-size:11.5px;color:var(--text-faint);margin-bottom:3px">${l}</div><div style="font-size:13.5px;font-weight:700;line-height:1.45;word-break:keep-all;overflow-wrap:anywhere">${v}</div></div>`;
  const kpi = (l, v, c) => `<div class="tb-kpi"><div class="l">${l}</div><div class="v" ${c ? `style="color:${c}"` : ""}>${v}</div></div>`;
  const sp0 = SPYM_PX ? SPYM_PX.px : P.px, bpx = sp0 > 0 ? Math.ceil(sp0 * 1.03 * 100) / 100 : 0, spx0 = sp0 > 0 ? Math.floor(sp0 * 0.95 * 100) / 100 : 0, pv0 = P.lq * sp0;
  const bq = bpx && P.cash > P.R + sp0 * 2 && pv0 < P.target - sp0 ? Math.floor(Math.min(P.cash - P.R, P.target - pv0) / bpx) : 0;
  const sNow = spx0 && P.cash < P.R - 1 && P.lq >= 1, sq = spx0 ? (sNow ? Math.min(P.lq, Math.ceil((P.R - P.cash) / spx0)) : Math.ceil(P.cur / spx0)) : 0;
  const ol = (side, px, q, sub) => `<div class="pk-ord ${side}${q ? "" : " off"}"><span class="sd">${side === "buy" ? "매수" : "매도"}</span><span class="cn">LOC<small>${sub}</small></span><b>${px ? u0c(px) : "-"}<em>× ${q.toLocaleString("en-US")}주</em></b></div>`;
  const lines = ol("buy", bpx, bq, bq ? "오늘 · 장 마감 지정가 +3%" : "오늘 없음 · 대기 시드 이미 SPYM") + ol("sell", spx0, sq, sNow ? "오늘 · 대기현금 채우기 −5%" : `QLD ${E.round}회차 체결 뒤 · −5%`);
  const todo = bq ? `🟢 SPYM ${bq.toLocaleString("en-US")}주 매수` : sNow ? `🔴 SPYM ${sq.toLocaleString("en-US")}주 매도` : "✅ 유지 (할 일 없음)";
  const crash = P.pv * 0.7 + (P.cash || 0), sp = SPYM_PX ? SPYM_PX.px : P.px, spx = sp > 0 ? Math.floor(sp * 0.95 * 100) / 100 : 0;
  const rr = r => r.from === r.to ? `${r.from}` : `${r.from}~${r.to}`, cnd = r => r.now ? `≤ ${u0c(r.px)}<small>이번 LOC</small>` : `≤ ${u0c(r.px)}<small>고점 −${(E.cum[r.T] * 100).toFixed(1)}%</small>`;
  const tbl = `<table class="pk-tb"><tr><th>회차</th><th>QLD 종가</th><th>QLD 매수</th><th>SPYM 매도</th></tr>${E.rows.map(r => `<tr class="${r.now ? "now" : ""}"><td><b>${rr(r)}</b>${r.from !== r.to ? "<small>각 회</small>" : ""}</td><td>${cnd(r)}</td><td>${u0(r.each)}</td><td>${spx ? `<b>${Math.ceil(r.each / spx).toLocaleString("en-US")}주</b><small>LOC ${u0c(spx)}</small>` : "-"}</td></tr>`).join("")}</table>
    <div style="margin-top:6px;font-size:11.5px;line-height:1.55;color:var(--text-dim)">📌 ${E.round} / ${E.N}회차 진행 중 · 고점 −${(E.cum[1] * 100).toFixed(1)}% 오면 앞 회차가 남아도 바로 ${E.n[0] + 1}회차, −${(E.cum[2] * 100).toFixed(1)}% 오면 ${E.n[0] + E.n[1] + 1}회차 (남은 시드 자동 배분) · SPYM 매도가 = SPYM ${sp > 0 ? u0c(sp) : "-"} × 0.95 (그날 종가로 봇이 다시 계산)</div>`;
  el.innerHTML = `${P.sync ? "" : `<div style="font-size:11.5px;color:var(--amber);margin-bottom:6px">💼 계좌 동기화 전 → SPYM 보유 없음 · 남은 시드 ${u0(E.remain)} 전부 현금으로 보고 계산</div>`}${lines}<div style="height:8px"></div><div class="sub-title"><span class="n">📉</span>${E.N}회차 대응 SPYM 매도 <small style="font-weight:500;color:var(--text-faint)">(AI 배분 ${E.w.join("/")}% · ${E.n.join("/")}분할 → 바뀌면 자동)</small></div>${tbl}<div style="height:10px"></div><div class="tb-kpis">${kpi("지금 상태", ST[0], ST[1])}${kpi("QLD매수 대기현금", u0(P.R))}${kpi("SPYM 목표", u0(P.target))}</div>
    ${row("AI 판단", `${P.why}`)}
    ${row("현재 · 계좌 현금", `${u0(P.cash)}${k(P.cash)}${P.sync ? "" : " <small>(동기화 전 · 남은 시드로 가정)</small>"}`)}
    ${row("현재 · 봇 SPYM", `${P.lq ? `${P.lq.toLocaleString("en-US")}주 · ${u0(P.pv)}${k(P.pv)}` : "없음 (다음 실행부터 자동)"}`)}
    ${row("오늘 봇이 할 일", `<b>${todo}</b>`)}
    ${row("폭락 대비 점검", `SPYM −30% 가정 시 쓸 돈 ${u0(crash)} · ${P.nr && P.nx ? `${P.nr}회차 ${u0(P.nx)} ${crash >= P.nx ? "✅ 충분" : "<b style='color:var(--down)'>⚠ 부족</b>"}` : "마지막 단계"}`)}
    <details style="margin-top:8px"><summary>📘 AI 파킹 규칙 · 세금</summary><div class="hint" style="line-height:1.6">
      🟢 <b>평온</b>(QLD가 1차 매수가 ${u0(E.px[0])} 위): 현금 = 이번 단계 1회 × 2 · 나머지 대기 시드는 전부 SPYM<br>
      🟡 <b>매수 구간</b>(1차 매수가 이하): 다음 단계 1회의 <b>절반</b>을 미리 현금으로 — SPYM 이 더 빠지기 전에 반 확보<br>
      🔴 <b>다음 단계 근접</b>(진입가 10% 이내): 다음 단계 1회 <b>전액</b>을 현금으로 — 큰 회차를 SPYM 폭락 값에 팔지 않게<br>
      매일 봇 실행 때 QLD 주문 후 자동: 현금 &lt; QLD매수 대기현금 → SPYM 매도(LOC −5%까지) · 넘치면 SPYM 매수(LOC +3%까지) · 판 돈은 다음 실행부터 QLD 매수에 사용<br>
      봇이 산 SPYM 만 관리 (직접 산 SPYM 은 건드리지 않음) · QLD평생 전용 계좌일 때만 동작<br>
      💸 세금: SPYM 을 이익 상태로 팔면 해외주식 양도차익 연 250만원 초과분 22% — 12월에 연간 실현 이익을 확인하세요</div></details>`;
}
function renderSeedCard() {
  const el = document.getElementById("seedContent"); if (!el) return;
  const E = seedEngine(); if (!E) return;
  const fx = (liveFx && liveFx.rate > 0) ? liveFx.rate : 0, k = v => fx ? ` <span style="color:var(--text-faint);font-size:11px;">(${krw(v * fx)})</span>` : "";
  const pc = v => (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%", wn = o => `${o.w.join("/")}% · ${o.n.join("/")}분할`;
  const kpi = (l, v, c) => `<div class="tb-kpi"><div class="l">${l}</div><div class="v" ${c ? `style="color:${c}"` : ""}>${v}</div></div>`;
  const rows = [0, 1, 2].map(i => `<div class="rung ${i === E.tier ? "current" : ""}"><div class="rung-id">${i + 1}차</div>
      <div class="rung-body"><div class="rung-range">${usd(E.px[i])} 이하 · <b style="color:var(--glow);">${E.w[i]}%</b> = ${fmtUsd0(E.seed * E.w[i] / 100)}</div>
      <div class="rung-note">${E.n[i]}분할 × ${fmtUsd0(E.per[i])} · 고점 -${(E.cum[i] * 100).toFixed(1)}% · 도달확률 ${(E.prob[i] * 100).toFixed(0)}%</div></div>
      ${i === E.tier ? `<span class="now-flag">이번</span>` : ""}</div>`).join("");
  const used = E.seed > 0 ? Math.min(1, E.spent / E.seed) : 0;
  const top = E.top.map((o, i) => `<tr><td>${i ? "" : "★ "}${o.w.join(" / ")}%</td><td>${o.n.join(" / ")}</td><td>${pc(o.ret)}</td><td>${pc(o.rob)}</td><td>${(o.used * 100).toFixed(0)}%</td></tr>`).join("");
  el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin:0 0 10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);"><span style="font-weight:700;">전체 시드 <b style="font-family:'JetBrains Mono',monospace;font-size:16px;">${fmtUsd0(E.seed)}</b>${k(E.seed)}</span>
      <a class="bk-btn" href="api-all.html#pg-setup" target="_top" style="text-decoration:none;white-space:nowrap;">✎ 자동주문(통합)에서 변경</a></div>
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">k = <b>${E.kk.toFixed(2)}</b> · QLD σ ${E.sig.toFixed(2)}% ÷ 기준σ ${SIG_BASE}% · 백테스트 ${E.bars}봉 · 주 1회 LOC</div>
    <div class="sub-title"><span class="n">①</span>규칙 기반 환산</div>
    <div class="tb-kpis">${kpi("배분 1/2/3차", E.rule.w.join("/") + "%")}${kpi("분할 ([6,3,1]×√k)", E.rule.n.join("/"))}${kpi("시드 대비 수익률", pc(E.rule.ret), "var(--glow)")}</div>
    <div class="sub-title"><span class="n">②</span>백테스트 최적 (견고성)</div>
    <div class="tb-kpis">${kpi("배분 1/2/3차", E.best.w.join("/") + "%")}${kpi("분할", E.best.n.join("/"))}${kpi("견고성 / 수익률", pc(E.best.rob) + " / " + pc(E.best.ret), "var(--glow)")}</div>
    <div style="display:flex;gap:8px;margin:10px 0;">
      <button type="button" class="bk-btn ${E.mode === "rule" ? "on" : ""}" data-seedmode="rule" style="flex:1">① 규칙${E.mode === "rule" ? " ✓ 적용 중" : " 적용"}</button>
      <button type="button" class="bk-btn ${E.mode === "opt" ? "on" : ""}" data-seedmode="opt" style="flex:1">② 최적${E.mode === "opt" ? " ✓ 적용 중" : " 적용"}</button></div>
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;">적용: ${wn(E)} · 투입 ${fmtUsd0(E.spent)} / ${fmtUsd0(E.seed)} (${(used * 100).toFixed(1)}%) · 남은 시드 <b>${fmtUsd0(E.remain)}</b>${k(E.remain)}</div>
    <div class="dist-track"><div class="dist-fill" style="width:${(used * 100).toFixed(1)}%;background:linear-gradient(90deg,#2BCDB8,var(--violet));"></div></div>
    <div class="ladder" style="margin-top:10px;">${rows}</div>
    <div class="hero-order" style="margin-top:10px;"><div class="ho-tag">이번 주 LOC (자동주문 수량)</div>
      <div class="ho-line"><span class="ho-price">${usd(E.locPx)}</span><span class="ho-x">×</span><span class="ho-qty">${E.qty}주</span></div>
      <div style="font-size:12px;color:var(--text-dim);">${E.tier + 1}차 구간 · 1회 ${fmtUsd0(E.amt)}${k(E.amt)}${E.amt >= E.remain - 0.01 && E.remain > 0 ? " · 남은 시드 전부" : ""}</div></div>
    <div style="font-size:12px;font-weight:700;margin:12px 0 4px;">견고성 상위 5개 조합 (시드 ${fmtUsd0(E.seed)} · 남은 현금 수익 0%)</div>
    <div style="overflow-x:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;text-align:center;">
      <tr style="color:var(--text-dim);"><th>배분 1/2/3차</th><th>분할</th><th>시드 대비 수익률</th><th>견고성(인접 평균)</th><th>투입률</th></tr>${top}</table></div>
    <div class="note">저장한 시드·적용 방식은 ☁️ 동기화로 모든 기기에 영구 보관되고, ⚡ 오늘의 LOC와 자동주문(QLD)이 이 수량으로 주문합니다. 백테스트는 과거 성과이며 미래를 보장하지 않습니다.</div>`;
}
document.addEventListener("click", e => {
  const t = e.target; if (!t) return;
  if (t.dataset && t.dataset.seedmode) {
    const d = seedGet() || { v: SEED_DEF };
    seedSet({ ...d, mode: t.dataset.seedmode, at: new Date().toISOString() });
    showCopyToast(t.dataset.seedmode === "rule" ? "① 규칙 기반 적용 · 모든 기기 동기화" : "② 백테스트 최적 적용 · 모든 기기 동기화", true);
    if (guideCtx) renderGuideResult(); return;
  }
  if (t.id !== "seedSave") return;
  const v = Math.round(parseFloat(String(document.getElementById("seedInput").value).replace(/[^\d.]/g, "")));
  if (!(v >= 1000)) { showCopyToast("시드는 $1,000 이상으로 입력하세요", false); return; }
  seedSet({ ...(seedGet() || {}), v, at: new Date().toISOString() });
  showCopyToast(`전체 시드 ${fmtUsd0(v)} 저장 · 모든 기기 동기화`, true);
  if (guideCtx) renderGuideResult();
});
/* ---------- ⚡ 오늘의 LOC 주문 ---------- */
let lastLocOrder = null;
function renderTodayCard() {
  const el = document.getElementById("todayContent");
  if (!el) return;
  const ctx = guideCtx;
  if (!ctx) return;
  const valid = guideResolveRecords(ctx.hist).filter(r => r.price !== null && r.qty > 0);
  const plan = computeGuidePlan(ctx, valid);
  if (!plan) { el.innerHTML = `<div class="fg-empty">유효한 시뮬레이션 데이터가 없어 매수가를 계산할 수 없습니다.</div>`; return; }
  const refPrice = guideRefPrice(ctx);
  const qty = resolveLocQty(plan.locPx, plan.defaultQty).qty;
  const lastX = ctx.hist[ctx.hist.length - 1].x;
  const nextSession = nextWeekday(lastX);
  const boughtThisWeek = valid.some(r => weekKey(r.t) === weekKey(nextSession.getTime()));
  const isReserveDay = !boughtThisWeek;          // V0.22: 이번 주(다음 거래일이 속한 주)에 아직 안 샀으면 매일 LOC — 체결되면 다음 주까지 쉼
  const reached = refPrice <= plan.locPx;
  const dist = (plan.locPx / refPrice - 1) * 100;
  const amount = plan.locPx * qty;
  const krwTxt = (liveFx && liveFx.rate > 0) ? ` (${krw(amount * liveFx.rate)})` : "";
  const alert = isReserveDay
    ? `<div class="cycle-alert first"><div class="ca-title">🔔 이번 주 LOC 대기 — ${fmtMD(nextSession)} 장</div>
        <div class="ca-body">지금 LOC 매수 예약을 걸어두세요 → <b>${usd(plan.locPx)} × ${qty}주</b></div>
        <div class="ca-sub">종가가 ${usd(plan.locPx)} 이하로 마감하면 체결 · 미체결이면 이번 주 남은 날에도 매일 다시 걸고, 체결되면 다음 주 월요일까지 쉽니다</div></div>`
    : `<div class="cycle-wait"><div class="cw-top"><span>✅ 이번 주 매수 완료 · 다음 주문</span><b>${fmtMD(nextMonday(lastX))}</b></div>
        <div class="cw-sub">평생매수는 <b>주 1회</b>만 삽니다(조건이 오는 날 LOC 체결). 다음 주 첫 거래일부터 다시 매일 LOC를 겁니다${reached ? " · 다만 현재가가 이미 매수가 이하라 오늘 걸어도 체결 가능성이 있습니다" : ""}</div></div>`;
  lastLocOrder = {
    schema: "loc-order/1", app: "QLD평생매수", version: APP_VERSION, release: RELEASE_DATE, symbol: "QLD",
    basis_close_date: fmtDateFull(lastX), generated_at: new Date().toISOString(),
    stage: `평생매수 · 하락 목표 -${plan.pct.toFixed(1)}%`, ...(hs => ({ avg_price: hs ? Number(hs.avg.toFixed(4)) : null, holding_qty: hs ? hs.qty : 0 }))(holdingSummary(valid)),
    orders: qty >= 1 ? [{ side: "buy", type: "LOC", price: Number(plan.locPx.toFixed(2)), qty: Math.floor(qty) }] : [],
    /* V0.21: 자동주문(QLD) 봇 검산용 — 매수가 = 기준가 × (1 − 하락목표%) 센트 내림 · 이번 주 아직 안 샀으면 매일 주문(주 1회) · 매도 없음 */
    bot: { kind: "lifetime", last_close: ctx.hist[ctx.hist.length - 1].y, ref_peak: plan.refPeak, pct: plan.pct, loc_px: Number(plan.locPx.toFixed(2)),
           qty_unit: LOC_LOT, order_today: !!isReserveDay, next_session: fmtDateFull(nextSession.getTime()), fx: (liveFx && liveFx.rate) || null,
           records_src: (typeof qldApiActive === "function" && qldApiActive()) ? "meritz" : "app", buy_count: valid.length,
           ...(() => { const E = seedEngine(); return E ? { engine_amt: Math.round(E.amt * 100) / 100, engine_mode: E.mode, engine_w: E.w, engine_n: E.n, engine_tier: E.tier + 1, engine_seed: E.seed, engine_remain: Math.round(E.remain), engine_per: E.per.map(x => Math.round(x * 100) / 100), engine_px: E.px, engine_round: E.round, engine_N: E.N,
             engine_rows: E.rows.map(r => ({ from: r.from, to: r.to, tier: r.T + 1, px: Math.round(r.px * 100) / 100, each: Math.round(r.each * 100) / 100, now: r.now })),
             ...(P => P ? { park: { reserve: Math.round(P.R * 100) / 100, state: P.st, why: P.why } } : {})(parkPlan(E)) } : { engine_amt: null }; })() }
  };
  document.title = (isReserveDay ? "🔔 " : "") + document.title.replace(/^🔔 /, "");
  try { renderSeedCard(); } catch (e) {}
  try { renderPark(seedEngine()); } catch (e) {}
  el.innerHTML = `
    ${alert}
    ${(hs => `<div class="loc-pos">📦 보유 <b>${hs ? hs.qty.toLocaleString("en-US") + "주" : "없음"}</b>${hs ? ` · 평단 <b>${usd(hs.avg)}</b> · (<b style="color:${refPrice >= hs.avg ? "var(--up)" : "var(--down)"};">${refPrice >= hs.avg ? "+" : ""}${((refPrice / hs.avg - 1) * 100).toFixed(2)}%</b>)` : ""}${(() => { const E = seedEngine(), N = E ? E.n.reduce((t, x) => t + x, 0) : 0, X = valid.length + 1; if (!N) return ""; if (E.remain <= 0) return ` · 📍 시드 소진 (${valid.length}회 매수)`; return X <= N ? ` · 📍 총 ${N}회차 중 <b>${X}</b>회차 진행 중` : ` · 📍 <b>${X}</b>회차 진행 중 (기본 ${N}회 이후 · 잔여 시드)`; })()}</div>`)(holdingSummary(valid))}
    <div class="hero-order">
      <div class="ho-tag">LOC 매수 예약 <span class="tb-chip ${reached ? "go" : "wait"}">${reached ? "✓ 현재가가 매수가 이하" : `대기 · ${fmtPctSigned(dist)} 필요`}</span></div>
      <div class="ho-line">
        <span class="ho-price copyable" role="button" tabindex="0" data-copy="${plan.locPx.toFixed(2)}" data-label="매수가">${usd(plan.locPx)}</span>
        <span class="ho-x">×</span>
        <span class="ho-qty copyable" role="button" tabindex="0" data-copy="${Math.floor(qty)}" data-label="매수수량">${qty}주</span>
      </div>
      <div class="ho-sub">최대 매수금액 ${usd(amount)}${krwTxt} · 기준가 ${usd(plan.refPeak)} × (1 − ${plan.pct.toFixed(1)}%) · ${plan.refPeakLabel}</div>
    </div>
    <p class="copy-hint">👆 매수가·수량 숫자를 누르면 각각 복사됩니다 ($·쉼표 없이 숫자만) · 수량은 아래 LOC 카드의 원화 예산으로 조정</p>`;
}
//@@include lib:exportLocOrder

/* ---------- 숫자 탭 복사 ---------- */
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
  } catch (e) { return false; }
}
//@@include lib:showCopyToast
//@@include lib:handleCopyTap
document.addEventListener("click", e => {
  const c = e.target.closest(".copyable[data-copy]"); if (c) handleCopyTap(c);
  if (e.target.closest("[data-export-loc]")) exportLocOrder();
});

/* ---------------------------- ① 나의 매수 기록 ---------------------------- */
function renderRecordsCard() {
  try { renderTrades(); } catch (e) {}
  const el = document.getElementById("recordsContent");
  if (!el) return;
  const ctx = guideCtx;
  const recs = guideResolveRecords(ctx ? ctx.hist : null);
  const valid = recs.filter(r => r.price !== null && r.qty > 0);
  const refPrice = guideRefPrice(ctx);
  let html = "";

  if (recs.length === 0) {
    el.innerHTML = `<div class="empty" style="margin-top:14px;"><span class="ico">📝</span>아직 저장된 매수 기록이 없습니다.<br>위에 날짜·수량을 입력하고 저장해 보세요.</div>`;
    return;
  }

  const h = holdingSummary(valid);
  if (h) {
    const hasPx = refPrice !== null;
    const evalV = hasPx ? refPrice * h.qty : null;
    const pl = hasPx ? evalV - h.cost : null;
    const plPct = hasPx ? (refPrice / h.avg - 1) * 100 : null;
    html += `
      <div class="hold-hero">
        <div class="hold-main">
          <div class="l">내 평단가</div>
          <div class="v">${usd(h.avg)}</div>
          <div class="s">총 ${h.qty}주${h.sold ? ` (매도 ${h.sold}주 차감)` : ""} · 매수금액 ${usd(h.cost)}${liveFx ? ` (${krw(h.cost * liveFx.rate)})` : ""}</div>
        </div>
        <div class="hold-side">
          <div class="hold-mini"><div class="l">평가손익</div><div class="v" style="color:${signColor(pl)};">${hasPx ? fmtMoneySigned(pl) : "--"}</div></div>
          <div class="hold-mini"><div class="l">수익률${hasPx ? ` · 현재 ${usd(refPrice)}` : ""}</div><div class="v" style="color:${signColor(plPct)};">${hasPx ? fmtPctSigned(plPct) : "시세 조회 필요"}</div></div>
        </div>
      </div>`;
  }

  const rows = recs.map((r, i) => {
    const cum = recs.slice(0, i + 1).filter(x => x.price !== null);
    const q = cum.reduce((a, x) => a + x.qty, 0);
    const c = cum.reduce((a, x) => a + x.qty * x.price, 0);
    const priceTxt = r.price !== null ? usd(r.price) + (r.auto ? '<span class="sub-price auto-tag">자동 저장</span>' : "") : (r.pending ? '<span style="color:var(--amber);">종가 확정 대기</span>' : '<span style="color:var(--amber);">가격 필요</span>');
    const chg = (refPrice !== null && r.price !== null) ? (refPrice / r.price - 1) * 100 : null;
    return `<tr>
      <td class="num">${i + 1}</td>
      <td>${fmtCompactDate(r.t)}</td>
      <td class="num">${r.qty}주${r.price !== null ? `<span class="sub-price">${fmtUsd0(r.qty * r.price)}</span>` : ""}</td>
      <td class="num">${priceTxt}${chg !== null ? `<span class="sub-price" style="color:${signColor(chg)};">${fmtPctSigned(chg, 1)}</span>` : ""}</td>
      <td class="num" style="color:var(--amber);">${q > 0 ? usd(c / q) : "--"}</td>
      <td><button class="guide-del" data-del="${r.id}" type="button" aria-label="기록 삭제" title="삭제">✕</button></td>
    </tr>`;
  }).join("");

  if (autoRecordMsg) html += `<div class="banner ok" style="margin-top:12px;">🤖 ${autoRecordMsg}</div>`;
  if (autoRecordInfo) html += `<div class="auto-info">ℹ️ ${autoRecordInfo}</div>`;
  html += `<div class="sub-title"><span class="n">≡</span>저장된 매수 기록<span class="tag">${recs.length}건 · 오래된 순</span></div>
    ${tableWrap(`<table class="stat-table detail-table rec-table"><thead><tr><th>회</th><th>매수일</th><th>수량</th><th>매수가</th><th>누적 평단</th><th></th></tr></thead><tbody>${rows}</tbody></table>`)}`;
  if (h) html += `<div class="note">검산: ${h.sold ? `매도 ${h.sold}주를 평균단가로 뺀 ` : ""}보유 매수금액 ${usd(h.cost)} ÷ 보유 수량 ${h.qty}주 = 평단가 <b>${usd(h.avg)}</b> · 수량 아래 금액은 행별 매수금액(수량×매수가)${h.sold ? " · 표의 누적 평단은 매수만 누적한 값" : ""}</div>`;
  if (recs.some(r => r.price === null)) {
    html += `<div class="note" style="color:var(--amber);">${ctx ? "조회된 200봉 범위 밖이거나 종가를 찾지 못한 기록은 매수가를 직접 입력해야 평단 계산에 포함됩니다." : "매수가를 비운 기록은 '시세 불러오기' 후 종가가 자동 반영됩니다."}</div>`;
  }
  el.innerHTML = html;
}

/* ------------------------ ② LOC 매수/매도 예약 가이드 ------------------------ */
const LOC_LOT = 5;
function fmtFxRate(rate) { return rate.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function locTotalHtml(px, qty) {
  const usdAmt = px * qty;
  const krwTxt = (liveFx && liveFx.rate > 0) ? ` <b style="color:var(--glow);">(${krw(usdAmt * liveFx.rate)})</b>` : "";
  return `종가가 <b style="color:var(--glow);">${usd(px)} 이하</b>일 때 체결 · 최대 매수금액 <b style="color:var(--glow);">${usd(usdAmt)}</b>${krwTxt}`;
}
//@@include qld:locQtyFromBudget
function resolveLocQty(px, defaultQty) {
  const E = seedEngine();
  if (E && E.qty >= 1 && Math.abs(px - E.locPx) < 0.005) return { qty: E.qty, source: "engine" };
  const calc = locQtyFromBudget(parseFloat(guideState.locBudget), px);
  if (calc && calc.qty >= LOC_LOT) return { qty: calc.qty, source: "budget" };
  const custom = parseFloat(guideState.locQty);
  if (custom > 0) return { qty: custom, source: "custom" };
  return { qty: defaultQty, source: "default" };
}
function locCalcInfo(budgetStr, px) {
  if (!(liveFx && liveFx.rate > 0)) return { cls: "", html: "환율을 조회하면 사용할 수 있습니다 (상단 '시세 불러오기')" };
  const budget = parseFloat(budgetStr);
  if (!(budget > 0)) return { cls: "", html: `<b>만원 단위</b>로 입력하세요 (예: 1000 → 1,000만원). 환율·매수가 기준 <b>${LOC_LOT}주 단위</b> 수량이 자동 입력됩니다` };
  const c = locQtyFromBudget(budget, px);
  if (c.qty < LOC_LOT) return { cls: "warn", html: `${LOC_LOT}주 매수에 <b>${krw(LOC_LOT * px * liveFx.rate)}</b> 필요 — 입력 금액이 부족해 수량은 그대로입니다` };
  return { cls: "", html: `${(budget / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}만원 ÷ ${fmtFxRate(liveFx.rate)}원 = ${usd(budget / liveFx.rate)} ÷ ${usd(px)} = ${c.raw.toFixed(1)}주 → <b>${c.qty}주</b> (${LOC_LOT}주 단위 내림)` };
}

function locBuyBoxHtml(locPx, qty, defaultQty) {
  const fxOk = liveFx && liveFx.rate > 0;
  const budgetDigits = guideState.locBudget || "";
  const budgetShown = budgetDigits ? (Number(budgetDigits) / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : "";
  const calc = locCalcInfo(budgetDigits, locPx);
  return `
    <div class="loc-box buy" data-px="${locPx}" data-default="${defaultQty}">
      <div class="loc-head"><span>📌 주 1회 · 체결될 때까지 매일 LOC</span></div>
      <div class="loc-budget">
        <div class="loc-budget-label"><span>최대 매수금액 (원화)</span><span class="loc-lot-badge">만원 · ${LOC_LOT}주 단위</span></div>
        <div class="loc-budget-wrap">
          <span class="loc-won">만원</span>
          <input type="text" class="loc-budget-input" id="locBudgetInput" inputmode="numeric" autocomplete="off" placeholder="예: 1,000" value="${budgetShown}"${fxOk ? "" : " disabled"} aria-label="최대 매수금액(만원)">
        </div>
        <div class="loc-calc${calc.cls ? " " + calc.cls : ""}">${calc.html}</div>
      </div>
      <div class="loc-order">
        <span class="loc-price">${usd(locPx)}</span><span class="loc-x">×</span>
        <input type="number" class="loc-qty-input" id="locQtyInput" min="0" step="any" inputmode="decimal" value="${qty}" placeholder="${defaultQty}" aria-label="매수 수량">
        <span class="loc-unit">주</span>
      </div>
      <div class="loc-total">${locTotalHtml(locPx, qty)}</div>
      <div class="loc-hint">기본 ${defaultQty}주 (직전 매수수량, 기록 없으면 1주) · 수량을 직접 고치면 금액 입력은 비워집니다 · 미체결 시 다음 월요일에 재확인<br>${fxOk ? `환율 ${fmtFxRate(liveFx.rate)}원 (${liveFx.date} 종가)` : "원화 환산: 환율 조회 후 표시"}</div>
    </div>`;
}

/* AI 전략 요약 블록 (400봉 워크포워드 최적화 결과) */
function aiStrategyBlockHtml(plan, ctx) {
  const ai = plan.ai;
  if (!ai) {
    return `<div class="note">400봉 데이터가 부족해 최근 200봉 수익률 최적값(-${plan.pct.toFixed(1)}%)을 사용했습니다.</div>`;
  }
  const b = ai.best;
  const stable = (b.r1 !== null && b.r2 !== null && b.r1 > 0 && b.r2 > 0);
  const range = (r) => fmtShortDate(r[0]) + " ~ " + fmtShortDate(r[1]);
  const cmp200 = ctx.acc ? ctx.acc.bestByReturn : null;
  const ruleNote = ai.rule === "full" ? "매수 기회 4회 이상 + 전·후반 모두 매수 발생"
    : ai.rule === "loose" ? "매수 기회 3회 이상(조건 완화)"
    : "표본 부족으로 조건을 더 완화";
  const halfRow = (label, r, n, rng) => `
    <div class="kv-row"><span class="k">${label} <span style="color:var(--text-faint);font-size:11px;">${rng}</span></span>
      <span class="v" style="color:${signColor(r)};">${fmtPctSigned(r)} <span style="color:var(--text-dim);font-size:11px;">· ${n}주</span></span></div>`;

  return `
    <div class="trade-block" style="border-color:rgba(155,140,255,0.45);background:linear-gradient(180deg, rgba(155,140,255,0.10), rgba(155,140,255,0.02));">
      <div class="tb-head">
        <div class="tb-title" style="color:var(--violet);">🧠 AI 최적 전략 · 400봉</div>
        <span class="tb-chip ${stable ? "go" : "wait"}">${stable ? "✓ 두 구간 모두 수익" : "△ 한 구간 손실"}</span>
      </div>
      <div class="tb-kpis">
        <div class="tb-kpi"><div class="l">채택 하락 목표</div><div class="v" style="color:var(--violet);">-${b.pct.toFixed(1)}%</div></div>
        <div class="tb-kpi"><div class="l">400봉 수익률</div><div class="v" style="color:${signColor(b.returnPct)};">${fmtPctSigned(b.returnPct)}</div></div>
        <div class="tb-kpi"><div class="l">최악 구간</div><div class="v" style="color:${signColor(b.worst)};">${fmtPctSigned(b.worst)}</div></div>
      </div>
      <div class="kv-list">
        ${halfRow("전반 " + ai.halfBars + "봉", b.r1, b.n1, range(ai.h1Range))}
        ${halfRow("후반 " + (ai.bars - ai.halfBars) + "봉", b.r2, b.n2, range(ai.h2Range))}
        <div class="kv-row"><span class="k">400봉 매수 횟수 · 평단</span><span class="v">${b.shares}주 · ${usd(b.avgPrice)}</span></div>
        <div class="kv-row"><span class="k">평균 매수 간격</span><span class="v">${b.avgGap === null ? "--" : b.avgGap.toFixed(0) + "거래일"}</span></div>
        <div class="kv-row"><span class="k">최장 무매수 기간</span><span class="v">${b.maxGap === null ? "--" : b.maxGap + "거래일"}</span></div>
        <div class="kv-row"><span class="k">마지막 매수 이후 경과</span><span class="v">${b.sinceLast}거래일</span></div>
        <div class="kv-row"><span class="k">수익률만 볼 때 최적값</span><span class="v" style="color:${ai.bestReturnOnly.pct === b.pct ? "var(--up)" : "var(--text-dim)"};">-${ai.bestReturnOnly.pct.toFixed(1)}% · ${fmtPctSigned(ai.bestReturnOnly.returnPct)}</span></div>
        ${cmp200 ? `<div class="kv-row"><span class="k">200봉만 볼 때 최적값</span><span class="v" style="color:var(--text-dim);">-${cmp200.pct.toFixed(1)}% · ${fmtPctSigned(cmp200.returnPct)}</span></div>` : ""}
      </div>
      <div class="note"><b>고르는 방법:</b> 하락 목표 1~30%를 0.5%p 단위(${ai.candidates}개 후보)로 400봉 전체에 시뮬레이션한 뒤, 같은 값을 <b>전반 ${ai.halfBars}봉</b>과 <b>후반 ${ai.bars - ai.halfBars}봉</b>에서 따로 돌립니다. 점수 = <b>나쁜 쪽 구간 수익률 × 0.6 + 400봉 전체 수익률 × 0.4</b>. 한 시기에만 맞는 값을 거르고 두 시기 모두에서 버티는 값을 뽑기 위한 계산이며, 선정 조건은 ${ruleNote}였습니다.${ai.bestReturnOnly.pct !== b.pct ? ` 수익률만 보면 -${ai.bestReturnOnly.pct.toFixed(1)}%가 더 높지만, 한쪽 구간 성적이 나빠 채택하지 않았습니다.` : ""}</div>
    </div>`;
}

function renderLocCard() {
  const el = document.getElementById("locGuideContent");
  if (!el) return;
  const ctx = guideCtx;
  if (!ctx) { el.innerHTML = `<div class="empty"><span class="ico">🎯</span>상단 '시세 불러오기'를 누르면 이번 주 LOC 예약 가격이 계산됩니다.</div>`; return; }
  const recs = guideResolveRecords(ctx.hist);
  const valid = recs.filter(r => r.price !== null && r.qty > 0);
  const h = holdingSummary(valid);
  const refPrice = guideRefPrice(ctx);
  const plan = computeGuidePlan(ctx, valid);
  let html = "";

  /* --- 매수 --- */
  if (!plan) {
    html += `<div class="fg-empty">유효한 시뮬레이션 데이터가 없어 매수가를 계산할 수 없습니다.</div>`;
  } else {
    html += aiStrategyBlockHtml(plan, ctx);
    const reached = refPrice <= plan.trig1;
    const dist = (plan.trig1 / refPrice - 1) * 100;
    const dropNow = (refPrice / plan.refPeak - 1) * 100;
    const prog = Math.max(0, Math.min(1, -dropNow / plan.pct));
    const qtyShown = resolveLocQty(plan.locPx, plan.defaultQty).qty;
    const rungs = [1, 2, 3].map(k => {
      const px = Math.floor(plan.refPeak * Math.pow(1 - plan.pct / 100, k) * 100) / 100;
      const cumDrop = 100 * (1 - Math.pow(1 - plan.pct / 100, k));
      const hit = refPrice <= px;
      return { k, px, cumDrop, hit, d: (px / refPrice - 1) * 100 };
    });
    const curIdx = rungs.findIndex(r => !r.hit);
    const ladder = rungs.map((r, i) => `
      <div class="rung ${r.hit ? "hit" : (i === curIdx ? "current" : "")}">
        <div class="rung-id">${r.k}차</div>
        <div class="rung-body"><div class="rung-range">${usd(r.px)}</div><div class="rung-note">기준가 대비 -${r.cumDrop.toFixed(1)}%</div></div>
        ${r.hit ? `<span class="now-flag" style="background:var(--up);">도달</span>` : (i === curIdx ? `<span class="now-flag">다음</span>` : `<span class="rung-dist">${fmtPctSigned(r.d, 1)}</span>`)}
      </div>`).join("");
    let srNote = "";
    if (ctx.sr) {
      const near = ctx.sr.levels.find(lv => Math.abs(lv.price / plan.trig1 - 1) <= 0.02);
      if (near) srNote = `<div class="note">💡 1차 트리거가 <b>${near.tag}(${usd(near.price)})</b>와 ±2% 이내로 겹칩니다 — 지지·저항 구간 참고.</div>`;
    }
    html += `
      <div class="trade-block buy" id="locBuy">
        <div class="tb-head">
          <div class="tb-title" style="color:var(--glow);">▼ 이번 주 LOC 매수 예약</div>
          <span class="tb-chip ${reached ? "go" : "wait"}">${reached ? "✓ 매수 조건 충족" : `대기 · ${fmtPctSigned(dist)} 필요`}</span>
        </div>
        <div class="tb-kpis">
          <div class="tb-kpi"><div class="l">하락 목표</div><div class="v" style="color:var(--glow);">-${plan.pct.toFixed(1)}%</div></div>
          <div class="tb-kpi"><div class="l">기준가</div><div class="v">${usd(plan.refPeak)}</div></div>
          <div class="tb-kpi"><div class="l">현재가</div><div class="v" style="color:var(--amber);">${usd(refPrice)}</div></div>
        </div>
        <div style="font-size:11px;color:var(--text-dim);">기준: ${plan.refPeakLabel} · 목표까지 진행률 ${(prog * 100).toFixed(0)}%</div>
        <div class="dist-track"><div class="dist-fill" style="width:${(prog * 100).toFixed(1)}%;background:linear-gradient(90deg,#2BCDB8,var(--glow));"></div></div>
        <div class="dist-cap"><span>현재 ${fmtPctSigned(dropNow, 1)}</span><span>목표 -${plan.pct.toFixed(1)}% · ${usd(plan.locPx)}</span></div>
        ${locBuyBoxHtml(plan.locPx, qtyShown, plan.defaultQty)}
        <div class="sub-title"><span class="n">⇣</span>분할 매수 사다리<span class="tag">도달 시 그 가격이 새 기준가</span></div>
        <div class="ladder">${ladder}</div>
        ${srNote}
        <div class="note"><b>예시로 따라가 보기:</b> 기준가 ${usd(plan.refPeak)}에서 -${plan.pct.toFixed(1)}% 내려온 <b style="color:var(--glow);">${usd(plan.locPx)}</b>에 LOC 매수를 걸어둡니다. 종가가 이 가격 이하로 마감하면 체결되고, <b>체결가가 곧바로 새 기준가</b>가 되어 다음 주문은 거기서 다시 -${plan.pct.toFixed(1)}% 내려간 ${usd(Math.floor(plan.refPeak * Math.pow(1 - plan.pct / 100, 2) * 100) / 100)} 부근이 됩니다. 미체결이면 다음 월요일에 기준가를 다시 확인해 같은 가격에 재예약합니다.</div>
      </div>`;
  }

  html += `<div class="note">400봉 워크포워드 최적값도 과거 데이터에서 계산한 값이라 미래 성과를 보장하지 않으며, 투자 조언이 아닙니다. 시장 국면이 바뀌면 채택 하락폭도 달라질 수 있으니 시세를 다시 불러올 때마다 값을 확인하세요.</div>`;
  el.innerHTML = html;
  { const lad = el.querySelector(".ladder"), t = document.getElementById("seedLadder");   // 사다리는 AI엔진 카드에 표시
    if (t) t.innerHTML = lad ? `<div class="sub-title"><span class="n">⇣</span>분할 매수 사다리<span class="tag">도달 시 그 가격이 새 기준가</span></div>${lad.outerHTML}` : ""; }
}

/* ------------------------ ③ 최근 추이 정밀 분석 ------------------------ */
//@@include qld:analyzeRecentTrend

function renderTrendChartSvg(hist60, maSeries, marks) {
  const W = 480, H = 180, padL = 42, padR = 10, padT = 10, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const all = hist60.map(d => d.y).concat(maSeries.map(d => d.y)).concat(marks.filter(m => m.show).map(m => m.y));
  let minY = Math.min(...all), maxY = Math.max(...all);
  const pad = (maxY - minY) * 0.08 || 1; minY -= pad; maxY += pad;
  const minX = hist60[0].x, maxX = hist60[hist60.length - 1].x;
  const xs = (x) => padL + ((x - minX) / (maxX - minX || 1)) * plotW;
  const ysc = (y) => padT + (1 - (y - minY) / (maxY - minY || 1)) * plotH;
  const grid = [0, 0.5, 1].map(f => minY + (maxY - minY) * f).map(v =>
    `<line x1="${padL}" y1="${ysc(v)}" x2="${W - padR}" y2="${ysc(v)}" stroke="#1C2842"/><text x="${padL - 6}" y="${ysc(v) + 3}" text-anchor="end" font-size="9" fill="#5E6B84" font-family="JetBrains Mono, monospace">${v.toFixed(0)}</text>`).join("");
  const line = (arr) => arr.map(d => `${xs(d.x).toFixed(1)},${ysc(d.y).toFixed(1)}`).join(" ");
  const shown = marks.filter(m => m.show);
  const markLines = shown.map((m, i) => `
    <line x1="${padL}" y1="${ysc(m.y)}" x2="${W - padR}" y2="${ysc(m.y)}" stroke="${m.color}" stroke-dasharray="4 4" stroke-width="1.2" opacity="0.85"/>
    <text x="${i === 0 ? W - padR - 2 : padL + 4}" y="${ysc(m.y) + (i === 0 ? -4 : 12)}" text-anchor="${i === 0 ? "end" : "start"}" font-size="9.5" font-weight="700" fill="${m.color}" font-family="JetBrains Mono, monospace">${m.label} ${usd(m.y)}</text>`).join("");
  const last = hist60[hist60.length - 1];
  const fmtDate = (t) => new Date(t).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  const area = `M${xs(hist60[0].x).toFixed(1)},${padT + plotH} L${line(hist60).split(" ").join(" L")} L${xs(last.x).toFixed(1)},${padT + plotH} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
    <defs><linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F5A524" stop-opacity="0.25"/><stop offset="100%" stop-color="#F5A524" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#trendGrad)"/>${markLines}
    <polyline points="${line(maSeries)}" fill="none" stroke="#9B8CFF" stroke-width="1.6" stroke-dasharray="5 3"/>
    <polyline points="${line(hist60)}" fill="none" stroke="#F5A524" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${xs(last.x)}" cy="${ysc(last.y)}" r="4.5" fill="#F5A524" stroke="#080D18" stroke-width="2"/>
    <text x="${padL}" y="${H - 4}" font-size="10" fill="#5E6B84">${fmtDate(minX)}</text>
    <text x="${W - padR}" y="${H - 4}" font-size="10" fill="#5E6B84" text-anchor="end">${fmtDate(maxX)}</text>
  </svg>`;
}

function renderTrendCard() {
  const el = document.getElementById("trendContent");
  if (!el) return;
  const ctx = guideCtx;
  if (!ctx) { el.innerHTML = `<div class="empty"><span class="ico">🔬</span>시세를 불러오면 최근 추이를 정밀 분석합니다.</div>`; return; }
  const hist = ctx.hist;
  const refPrice = guideRefPrice(ctx);
  const usingLive = refPrice === ctx.livePrice;
  const tr = analyzeRecentTrend(hist, refPrice, ctx.cciHist);
  const valid = guideResolveRecords(hist).filter(r => r.price !== null && r.qty > 0);
  const plan = computeGuidePlan(ctx, valid);
  const h = holdingSummary(valid);

  const cciTxt = tr.cci === null ? "--" : fmtNum(tr.cci, 1);
  const cciNote = tr.cci === null ? "" : (tr.cci >= 100 ? "과열" : tr.cci <= -100 ? "과매도" : tr.cci < 0 ? "약세권" : "강세권");
  const cciCol = tr.cci === null ? "var(--text)" : (tr.cci >= 100 ? "var(--down)" : tr.cci <= -100 ? "var(--up)" : "var(--text)");
  const stDir = tr.streak && tr.streak.direction;
  const streakTxt = (!tr.streak || stDir === "flat") ? "보합/전환" : `${tr.streak.length}일 ${stDir === "down" ? "하락" : "상승"}`;
  const streakCol = stDir === "down" ? "var(--down)" : stDir === "up" ? "var(--up)" : "var(--text)";
  const maDist = (ma) => (refPrice / ma - 1) * 100;

  const hist60 = hist.slice(-60);
  const chart = renderTrendChartSvg(hist60, tr.ma20Series, [
    { y: plan ? plan.locPx : 0, show: !!plan, color: "#5EEAD4", label: "LOC 매수" },
    { y: h ? h.avg : 0, show: !!h, color: "#FF8C9A", label: "내 평단" },
  ]);

  let stance;
  if (tr.score >= 3) stance = "가격이 주요 이동평균 위에서 오르는 흐름이라 그리드 매수 트리거(하락)까지 거리가 멀 수 있습니다. 추격 매수보다 <b>아래 LOC 지정가를 걸어두고 기다리는 쪽</b>이 이 전략과 맞습니다.";
  else if (tr.score <= 1) stance = "이동평균 아래에서 약세가 이어지는 구간입니다. 트리거에 닿더라도 추가 하락 가능성이 있으므로 <b>2차·3차 사다리 가격까지 염두에 두고 수량을 나눠</b> 접근하는 방식이 안전합니다.";
  else stance = "방향성이 뚜렷하지 않은 구간입니다. 기준가 대비 <b>하락 목표에 도달했을 때만 기계적으로</b> 대응하는 것이 무난합니다.";
  const cciAdd = tr.cci !== null && tr.cci <= -100 ? " CCI가 과매도권(-100 이하)이라 단기 반등 가능성도 열려 있습니다." : (tr.cci !== null && tr.cci >= 100 ? " CCI가 과열권(+100 이상)이라 단기 조정 가능성에 유의하세요." : "");
  const planAdd = plan ? ` 다음 LOC 매수가 <b>${usd(plan.locPx)}</b>는 현재가 대비 <b>${fmtPctSigned((plan.locPx / refPrice - 1) * 100)}</b>, 최근 20일 일간 변동성(±${tr.sigma.toFixed(2)}%) 기준 약 <b>${Math.max(0, Math.abs((plan.locPx / refPrice - 1) * 100) / (tr.sigma || 1)).toFixed(1)}σ</b> 거리입니다.` : "";

  el.innerHTML = `
    <div class="verdict" style="color:${tr.color};border-color:${tr.color}55;background:linear-gradient(135deg, ${tr.color}22, ${tr.color}06);">
      <div>
        <div class="l">추세 판정 · 신호 ${tr.score}/4</div>
        <div class="v">${tr.label}</div>
      </div>
      <div class="score-dots">${[0, 1, 2, 3].map(i => `<i class="${i < tr.score ? "on" : ""}"></i>`).join("")}</div>
    </div>
    <div class="signals">${tr.signals.map(s => `<div class="sig ${s.on ? "on" : "off"}"><span class="m">${s.on ? "✓" : "✕"}</span>${s.t}</div>`).join("")}</div>

    <div class="fg-meta-row" style="margin:0 0 12px;">
      ${metaTile(usingLive ? "QLD 현재가" : "QLD 최근 종가", usd(refPrice), "var(--amber)")}
      ${metaTile("5일 수익률", fmtPctSigned(tr.ret5), signColor(tr.ret5))}
      ${metaTile("20일 수익률", fmtPctSigned(tr.ret20), signColor(tr.ret20))}
      ${metaTile("200봉 고점 대비", fmtPctSigned(tr.dd200), "var(--down)")}
      <div class="fg-meta-item"><div class="fg-meta-label">CCI(20)</div><div class="fg-meta-value" style="color:${cciCol};">${cciTxt}</div><div class="fg-meta-label" style="margin:4px 0 0;">${cciNote}</div></div>
      ${metaTile("연속 등락", streakTxt, streakCol)}
    </div>

    <div class="fg-chart-wrap">${chart}</div>
    <div class="chart-legend"><span><i style="background:#F5A524;"></i>종가 (60봉)</span><span><i style="background:#9B8CFF;"></i>20일선</span>${plan ? `<span><i style="background:#5EEAD4;"></i>LOC 매수가</span>` : ""}${h ? `<span><i style="background:#FF8C9A;"></i>내 평단</span>` : ""}</div>

    <div class="range-box">
      <div class="range-top"><span>60일 범위 내 위치</span><b class="mono" style="color:var(--text);">${tr.pos60.toFixed(0)} / 100</b></div>
      <div class="range-bar"><div class="range-mk" style="left:${Math.max(0, Math.min(100, tr.pos60)).toFixed(1)}%;"></div></div>
      <div class="range-cap"><span>저점 ${usd(tr.lo60)}</span><span>고점 ${usd(tr.hi60)}</span></div>
    </div>

    <div class="sub-title"><span class="n">≈</span>이동평균 · 변동성</div>
    <div class="kv-list">
      <div class="kv-row"><span class="k">5일선</span><span class="v">${usd(tr.ma5)} <span style="color:${signColor(maDist(tr.ma5))};font-size:11px;">${fmtPctSigned(maDist(tr.ma5), 1)}</span></span></div>
      <div class="kv-row"><span class="k">20일선</span><span class="v">${usd(tr.ma20)} <span style="color:${signColor(maDist(tr.ma20))};font-size:11px;">${fmtPctSigned(maDist(tr.ma20), 1)}</span></span></div>
      <div class="kv-row"><span class="k">60일선</span><span class="v">${usd(tr.ma60)} <span style="color:${signColor(maDist(tr.ma60))};font-size:11px;">${fmtPctSigned(maDist(tr.ma60), 1)}</span></span></div>
      <div class="kv-row"><span class="k">20일선 기울기 (5일간)</span><span class="v" style="color:${signColor(tr.slope)};">${fmtPctSigned(tr.slope)}</span></div>
      <div class="kv-row"><span class="k">20일 고점 / 저점</span><span class="v">${usd(tr.hi20)} / ${usd(tr.lo20)}</span></div>
      <div class="kv-row"><span class="k">20일 일간 변동성</span><span class="v">±${tr.sigma.toFixed(2)}%</span></div>
    </div>

    <div class="stance"><div class="h">AI 종합 의견</div>${stance}${cciAdd}${planAdd}</div>`;
}

