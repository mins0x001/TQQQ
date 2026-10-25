// src/calc/format.js — 표시용 포맷 (날짜·달러·퍼센트)
// ⚠ 함수 하나하나는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include format:이름 자리로 빌드 때 들어갑니다

//@@fn fmtCompactDate
function fmtCompactDate(t) {
  // 모바일용 압축 날짜: 26.03.09
  const d = new Date(t);
  const p = n => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

//@@fn fmtShortDate
function fmtShortDate(t) {
  return new Date(t).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}

//@@fn fmtDateFull
function fmtDateFull(t) {
  return new Date(t).toISOString().split("T")[0];
}

//@@fn fmtPctSigned
function fmtPctSigned(n, digits = 2) {
  return (n === null || n === undefined || isNaN(n)) ? "--" : (n >= 0 ? "+" : "") + n.toFixed(digits) + "%";
}

//@@fn fmtPct1
function fmtPct1(n) {
  return (n === null || n === undefined || isNaN(n)) ? "--" : n.toFixed(1) + "%";
}

//@@fn fmtUsd0Signed
function fmtUsd0Signed(n) {
  if (n === null || n === undefined || isNaN(n)) return "--";
  return (n >= 0 ? "+" : "-") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

//@@fn fmtUsdCompact
function fmtUsdCompact(n) {
  // 좁은 표 칸용: $15,240,643 → $15.24M, $152,300 → $152.3K (10만 달러 미만은 그대로)
  if (n === null || n === undefined || isNaN(n)) return "--";
  const a = Math.abs(n);
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (a >= 1e5) return "$" + (n / 1e3).toFixed(1) + "K";
  return fmtUsd0(n);
}

//@@fn fmtUsd0
function fmtUsd0(n) {
  if (n === null || n === undefined || isNaN(n)) return "--";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

//@@fn fmtKrDate
function fmtKrDate(dateStr) {
  // 모바일에서 한 줄에 들어가도록 압축 표기: 26.09.10
  return fmtCompactDate(new Date(dateStr + "T00:00:00").getTime());
}

//@@fn fmtResume
function fmtResume(d) {
  const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${wk}) 전후`;
}
