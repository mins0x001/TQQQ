// src/calc/stats.js — 기초 통계
// ⚠ 함수 하나하나는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include stats:이름 자리로 빌드 때 들어갑니다

//@@fn calcDailyReturns
function calcDailyReturns(hist) {
  const r = [];
  for (let i = 1; i < hist.length; i++) r.push((hist[i].y - hist[i - 1].y) / hist[i - 1].y * 100);
  return r;
}

//@@fn calcStdev
function calcStdev(arr) {
  if (!arr || arr.length < 2) return null;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1));
}

//@@fn trimmedMeanExcludingMinMax
function trimmedMeanExcludingMinMax(values) {
  if (!values || values.length === 0) return null;
  if (values.length <= 2) return values.reduce((a, b) => a + b, 0) / values.length;
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  let removedMax = false, removedMin = false;
  const filtered = [];
  for (const v of values) {
    if (!removedMax && v === maxV) { removedMax = true; continue; }
    if (!removedMin && v === minV) { removedMin = true; continue; }
    filtered.push(v);
  }
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

//@@fn probAtLeast
function probAtLeast(streaks, N) {
  if (streaks.length === 0) return 0;
  return (streaks.filter(s => s.length >= N).length / streaks.length) * 100;
}
