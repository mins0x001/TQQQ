// src/calc/stoploss.js — 분할 손절 매도 순서 계산 (순수 함수 · 화면·저장소·전역 의존성 0)
// ⚠ 함수는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include stoploss:이름 자리로 빌드 때 들어갑니다

//@@fn stopSplitPlan
/* 분할 손절 매도 = 3일 순서 (규칙 기반 총 회차 = sp.maxRounds, 예: SOXL 24회 · TQQQ 12회)
   발동: 분할 소진(rounds ≥ 총 회차) + 직전 확정 종가 ≤ 손절선(평단 × ratio)
   1일차 = 마지막 1회분 손절 매도 → 2일차 = 그다음 1회분 손절 매도(손절선과 상관없이 이어서) → 3일차 = 평소 무한매수 규칙으로 매수 (회차가 2 줄어 1회분 매수금이 다시 생김)
   1·2일차에는 매수를 멈춘다(buyHold). 순서 진행 상태 seq = {n: 완료한 손절 일수(0~2), date: 마지막 손절일, since: 그 사이클 첫 매수일} (다른 사이클의 낡은 상태는 since 로 무시)
   입력: rows(매수 기록 {qty, price, date}, 오래된 순) · sp(stagePlan) · prevClose · ratio · seq · today(YYYY-MM-DD)
   출력: state = none | wait(분할 남음) | hold(소진·손절선 위) | day1 | day2 | wait2(2일차 대기) | wait3(3일차 대기) · buyHold · 1회분 매도 수량·예상 금액·매도 후 평단/회차·재매수 금액 (안내용) */
function stopSplitPlan(rows, sp, prevClose, ratio, seq, today) {
  const n = rows.length, out = { total: sp.maxRounds, rounds: n, ratio, exhausted: n >= sp.maxRounds, line: 0, state: "none", buyHold: false, day: 0 };
  if (n === 0 || !(prevClose > 0)) return out;
  const qty = rows.reduce((a, r) => a + r.qty, 0), cost = rows.reduce((a, r) => a + r.qty * r.price, 0), avg = cost / qty;
  out.avg = avg; out.qty = qty; out.line = Math.floor(avg * ratio * 100 + 1e-6) / 100;
  const sq = seq && seq.since === rows[0].date && seq.n > 0 ? { n: Math.min(2, seq.n), date: String(seq.date || "") } : { n: 0, date: "" };
  let day = 0;
  if (sq.n === 1) { if (today > sq.date) day = 2; else { out.state = "wait2"; out.buyHold = true; return out; } }
  else if (sq.n === 2 && today <= sq.date) { out.state = "wait3"; out.buyHold = true; return out; }
  else if (out.exhausted && prevClose <= avg * ratio) day = 1;                       // (n=2 이고 날짜가 지났으면 순서 끝 → 새로 발동 여부만 확인)
  if (!day) { out.state = out.exhausted ? "hold" : "wait"; return out; }
  const last = rows[n - 1], proceeds = last.qty * prevClose, kQty = qty - last.qty, kCost = cost - last.qty * last.price;
  const buyRound = day === 1 ? n - 1 : n;                                              // 3일차에 사게 될 회차 (2번 판 뒤 회차 + 1)
  Object.assign(out, { state: day === 1 ? "day1" : "day2", day, buyHold: true, sellQty: last.qty, refPrice: prevClose, proceeds, realized: proceeds - last.qty * last.price,
    keepQty: kQty, keepAvg: kQty > 0 ? kCost / kQty : null, afterRounds: n - 1, buyRound, rebuyAmt: perOfRound(sp, buyRound) });
  return out;
}
