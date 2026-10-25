// src/calc/loc.js — 오늘의 LOC 주문 계산
// ⚠ 함수는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include loc:이름 자리로 빌드 때 들어갑니다

//@@fn locPlanCore
/* 오늘의 LOC 주문 핵심 계산 (화면·저장소 접근 없음): 보유 기록 + 시드 계획 → 회차·기준가·수량·매도가·단계 문구
   입력: lastHist(확정 종가 포함 봉 배열) · sp(stagePlan 결과) · summary(computeBuyRecordsSummary 결과) · sellPct(적용 익절 %) */
function locPlanCore(lastHist, sp, summary, sellPct) {
  const rounds = summary.rows.length;
  const hasPosition = rounds > 0;
  const avgPrice = summary.avgPrice;
  const lastRecord = hasPosition ? summary.rows[summary.rows.length - 1] : null;
  const lastClose = lastHist[lastHist.length - 1].y;   // 확정 종가(장중 봉 제외)
  const lastCloseDate = fmtDateFull(lastHist[lastHist.length - 1].x);

  const nextRound = rounds + 1;
  const inStage1 = nextRound <= sp.n1;
  const canBuyMore = rounds < sp.maxRounds;
  const perSplit = perOfRound(sp, nextRound);   // 이번 회차 1회 매수금: 1단계 시드÷분할 · 2단계 시드÷(분할×배수)

  /* LOC 매수 기준가 = "평단 & 전일종가 이하" (시드 분할매수 시뮬레이션 매수 조건과 동일)
     - 보유 중: 평단가와 최근 확정 종가 중 더 낮은 값. 이 가격 이하로 마감해야 두 조건이 동시에 충족된다.
     - 신규 진입: 보유 수량이 없어 평단가가 없으므로 전일 확정 종가만 적용(종가가 전일보다 낮은 날 1회차 진입). */
  let buyBasisPrice, buyBasisLabel, bindingLabel;
  if (hasPosition) {
    buyBasisPrice = Math.min(avgPrice, lastClose);
    bindingLabel = avgPrice <= lastClose ? "평단가" : `전일 확정 종가(${lastCloseDate})`;
    buyBasisLabel = `평단 & 전일종가 이하 · 더 낮은 ${bindingLabel} 적용`;
  } else {
    buyBasisPrice = lastClose;
    bindingLabel = `전일 확정 종가(${lastCloseDate})`;
    buyBasisLabel = `전일종가 이하 · ${bindingLabel} 적용 (신규 진입, 평단 없음)`;
  }
  // 주문 입력용 가격: 매수가는 센트 단위 내림(기준가 이하 보장)
  buyBasisPrice = Math.floor(buyBasisPrice * 100 + 1e-6) / 100;
  // 매수 수량은 1주 단위로 내림 (1분할 금액 초과 방지)
  const rawBuyQty = canBuyMore ? Math.floor(perSplit / buyBasisPrice) : 0;
  const buyQty = Math.floor(rawBuyQty / LOC_QTY_UNIT) * LOC_QTY_UNIT;

  let cycleStatusText = "";
  const buyReady = true;      // V0.72: 2단계 주기 대기 없음
  const cycleInfo = null;
  if (hasPosition && !inStage1 && canBuyMore)
    cycleStatusText = `2단계 ${nextRound - sp.n1}/${sp.maxRounds - sp.n1}회차 · 대기 없이 조건 충족 시 매수 · 1회 ${fmtUsd0(sp.per2)} (시드÷${sp.splits * sp.mult} = ${sp.splits}분할×${sp.mult})`;

  const canSell = hasPosition;
  // 주문 입력용 매도가: 센트 단위 올림(목표 수익률 이상 보장)
  const sellPrice = hasPosition ? Math.ceil(avgPrice * (1 + sellPct / 100) * 100 - 1e-6) / 100 : null;
  const sellQty = hasPosition ? summary.totalQty : null;

  // ⟦LEV⟧ 손절모드 판정: 평단가 × STRAT2_MODE_RATIO(0.80) 이하이면 손절모드 경고
  const inStopMode = hasPosition && lastClose <= avgPrice * STRAT2_MODE_RATIO;

  const stageLabel = !canBuyMore ? `분할 소진 (${rounds}/${sp.maxRounds}회 · 시드 전액)`
    : !hasPosition ? "신규 진입 전"
    : (inStage1 ? `1단계 (AI 추천 ${sp.n1}회 이내, 현재 ${rounds}회)` : `2단계 ×${sp.mult} (현재 ${rounds}회 · ${nextRound - sp.n1}/${sp.maxRounds - sp.n1}회차 · 대기 없음)`);
  return { rounds, hasPosition, avgPrice, lastRecord, lastClose, lastCloseDate, nextRound, inStage1, canBuyMore, perSplit, buyBasisPrice, buyBasisLabel, bindingLabel, rawBuyQty, buyQty, cycleStatusText, buyReady, cycleInfo, canSell, sellPrice, sellQty, inStopMode, stageLabel };
}
