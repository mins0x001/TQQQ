// src/calc/stoploss.js — 분할 소진 후 '분할 손절 매도' 계산 (순수 함수 · 화면·저장소·전역 의존성 0)
// ⚠ 함수는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include stoploss:이름 자리로 빌드 때 들어갑니다

//@@fn stopSplitPlan
/* 분할 손절 매도 규칙 (규칙 기반 총 회차 = sp.maxRounds, 예: SOXL 24회 · TQQQ 12회)
   ① 분할 소진 (rounds ≥ 총 회차) 이고 ② 종가가 손절선(평단 × ratio) 이하 → 마지막 nSell 회차(기본 2회)분 수량을 매도
   ③ 판 돈으로 '1회분 매수 금액'이 다시 생기면 → 회차가 nSell 만큼 줄어, 평소 매수 조건(평단 & 전일 종가 이하)대로 1회분 재매수
   입력: rows(매수 기록 배열 {qty, price}, 오래된 순) · sp(stagePlan 결과) · lastClose · ratio(손절선 비율) · nSell(한 번에 손절할 회차 수)
   출력: 발동 여부(active)·상태 문구와 함께 매도 수량·예상 금액·매도 후 평단/회차·재매수 가능 여부 (실제 주문은 만들지 않음 — 안내용) */
function stopSplitPlan(rows, sp, lastClose, ratio, nSell) {
  const n = rows.length, N = Math.max(1, Math.floor(nSell) || 2);
  const out = { total: sp.maxRounds, rounds: n, nSell: N, ratio, exhausted: n >= sp.maxRounds, line: 0, active: false, state: "none" };
  if (n === 0 || !(lastClose > 0)) return out;
  const qty = rows.reduce((a, r) => a + r.qty, 0), cost = rows.reduce((a, r) => a + r.qty * r.price, 0), avg = cost / qty;
  out.line = Math.floor(avg * ratio * 100 + 1e-6) / 100;                     // 손절선 (센트 단위 내림)
  out.avg = avg; out.qty = qty;
  if (!out.exhausted) { out.state = "wait"; return out; }                    // 아직 분할이 남음 → 평소 매수
  if (lastClose > avg * ratio) { out.state = "hold"; return out; }           // 소진됐지만 손절선 위 → 익절 대기
  const k = Math.min(N, n), sold = rows.slice(n - k), keep = rows.slice(0, n - k);
  const sQty = sold.reduce((a, r) => a + r.qty, 0), sCost = sold.reduce((a, r) => a + r.qty * r.price, 0);
  const proceeds = sQty * lastClose, kQty = qty - sQty, kCost = cost - sCost, nextRound = n - k + 1;
  const rebuyAmt = typeof perOfRound === "function" ? perOfRound(sp, nextRound) : 0;  // 재매수 1회분 금액 (그 회차 기준)
  Object.assign(out, { active: true, state: "sell", sellRows: sold.map(r => ({ qty: r.qty, price: r.price })), sellQty: sQty, refPrice: lastClose,
    proceeds, realized: proceeds - sCost, keepQty: kQty, keepAvg: kQty > 0 ? kCost / kQty : null, afterRounds: n - k, nextRound, rebuyAmt, rebuyOk: proceeds >= rebuyAmt });
  return out;
}
