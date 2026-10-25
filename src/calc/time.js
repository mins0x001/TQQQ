// src/calc/time.js — 시간·거래일 (뉴욕 장 기준)
// ⚠ 함수 하나하나는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include time:이름 자리로 빌드 때 들어갑니다

//@@fn nyNowParts
function nyNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date());
  const get = t => (parts.find(p => p.type === t) || {}).value;
  const hour = parseInt(get("hour"), 10) % 24;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + parseInt(get("minute"), 10) };
}

//@@fn lastNyClose
function lastNyClose() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  for (let k = 0; k < 8; k++) {
    const p = Object.fromEntries(f.formatToParts(new Date(Date.now() - k * 864e5)).map(o => [o.type, o.value]));
    if (p.weekday === "Sat" || p.weekday === "Sun" || (k === 0 && `${p.hour}:${p.minute}` < "16:15")) continue;
    return `${p.year}-${p.month}-${p.day} 16:15`;
  }
  return "9999";
}

//@@fn dropIncompleteBar
function dropIncompleteBar(bars) {
  if (!bars || bars.length === 0) return bars;
  const ny = nyNowParts();
  const last = bars[bars.length - 1];
  const isToday = last.d === ny.date;
  const beforeFinalClose = ny.minutes < 16 * 60 + 15; // 16:00 마감 + 15분 확정 여유
  if (last.d > ny.date || (isToday && beforeFinalClose)) return bars.slice(0, -1);
  return bars;
}

//@@fn nextTradingDay
function nextTradingDay(fromTs, n) {
  const d = new Date(fromTs);
  let k = 0;
  while (k < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) k++; }
  return d;
}
