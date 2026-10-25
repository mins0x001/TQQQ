// src/calc/streak.js — 연속 상승·하락 통계
// ⚠ 함수 하나하나는 '//@@fn 이름' 으로 시작 · template.html 의 //@@include streak:이름 자리로 빌드 때 들어갑니다

//@@fn findDownStreaks
function findDownStreaks(hist) {
  const streaks = [];
  let i = 1;
  while (i < hist.length) {
    if (hist[i].y < hist[i - 1].y) {
      const startIdx = i;
      let j = i;
      while (j + 1 < hist.length && hist[j + 1].y < hist[j].y) j++;
      const endIdx = j;
      const preIdx = startIdx - 1;
      streaks.push({ startIdx, endIdx, length: endIdx - startIdx + 1, preIdx });
      i = j + 1;
    } else {
      i++;
    }
  }
  return streaks;
}

//@@fn computeStreakStatsForLength
function computeStreakStatsForLength(streaks, totalStreaks, hist, k) {
  const atLeastCount = streaks.filter(s => s.length >= k).length;
  const probability = totalStreaks > 0 ? (atLeastCount / totalStreaks) * 100 : 0;

  const exactStreaks = streaks.filter(s => s.length === k);
  const returns = [];
  const recoveryDays = [];
  let unresolved = 0;

  exactStreaks.forEach(s => {
    const buyPrices = hist.slice(s.startIdx, s.endIdx + 1).map(d => d.y);
    const totalCost = buyPrices.reduce((a, b) => a + b, 0);
    const peakPrice = hist[s.preIdx].y;
    let recoveryIdx = -1;
    for (let m = s.endIdx + 1; m < hist.length; m++) {
      if (hist[m].y >= peakPrice) { recoveryIdx = m; break; }
    }
    if (recoveryIdx !== -1) {
      const proceeds = peakPrice * s.length;
      returns.push((proceeds - totalCost) / totalCost * 100);
      recoveryDays.push(recoveryIdx - s.endIdx);
    } else {
      unresolved++;
    }
  });

  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
  const minReturn = returns.length > 0 ? Math.min(...returns) : null;

  return { k, probability, sampleCount: exactStreaks.length, resolvedCount: returns.length, unresolved, avgReturn, minReturn };
}

//@@fn computeStreakStats
function computeStreakStats(hist) {
  const streaks = findDownStreaks(hist);
  if (streaks.length === 0) return null;
  const maxLen = Math.max(...streaks.map(s => s.length));
  const totalStreaks = streaks.length;
  const rows = [];
  for (let k = 2; k <= maxLen; k++) {
    rows.push(computeStreakStatsForLength(streaks, totalStreaks, hist, k));
  }
  return { maxLen, totalStreaks, streaks, rows };
}

//@@fn computeDayChangeCounts
function computeDayChangeCounts(hist) {
  let downDays = 0, upFlatDays = 0;
  for (let i = 1; i < hist.length; i++) {
    if (hist[i].y < hist[i - 1].y) downDays++;
    else upFlatDays++;
  }
  return { downDays, upFlatDays };
}

//@@fn findUpStreaks
function findUpStreaks(hist) {
  const streaks = [];
  let i = 1;
  while (i < hist.length) {
    if (hist[i].y > hist[i - 1].y) {
      const startIdx = i;
      let j = i;
      while (j + 1 < hist.length && hist[j + 1].y > hist[j].y) j++;
      const endIdx = j;
      const preIdx = startIdx - 1;
      streaks.push({ startIdx, endIdx, length: endIdx - startIdx + 1, preIdx });
      i = j + 1;
    } else {
      i++;
    }
  }
  return streaks;
}

//@@fn computeUpStreakStatsForLength
function computeUpStreakStatsForLength(streaks, totalStreaks, hist, k) {
  const atLeastCount = streaks.filter(s => s.length >= k).length;
  const probability = totalStreaks > 0 ? (atLeastCount / totalStreaks) * 100 : 0;
  const exactStreaks = streaks.filter(s => s.length === k);
  const riseRates = exactStreaks.map(s => (hist[s.endIdx].y - hist[s.preIdx].y) / hist[s.preIdx].y * 100);
  const avgRiseRate = riseRates.length > 0 ? riseRates.reduce((a, b) => a + b, 0) / riseRates.length : null;
  return { k, probability, sampleCount: exactStreaks.length, avgRiseRate };
}

//@@fn computeUpStreakStats
function computeUpStreakStats(hist) {
  const streaks = findUpStreaks(hist);
  if (streaks.length === 0) return null;
  const maxLen = Math.max(...streaks.map(s => s.length));
  const totalStreaks = streaks.length;
  const rows = [];
  for (let k = 2; k <= maxLen; k++) {
    rows.push(computeUpStreakStatsForLength(streaks, totalStreaks, hist, k));
  }
  return { maxLen, totalStreaks, streaks, rows };
}

//@@fn computeUpDayChangeCounts
function computeUpDayChangeCounts(hist) {
  let upDays = 0, downFlatDays = 0;
  for (let i = 1; i < hist.length; i++) {
    if (hist[i].y > hist[i - 1].y) upDays++;
    else downFlatDays++;
  }
  return { upDays, downFlatDays };
}

//@@fn computeStreakDetailStats
function computeStreakDetailStats(hist) {
  const streaks = findDownStreaks(hist);
  if (streaks.length === 0) return null;
  const rows = streaks.map(s => {
    const preClose = hist[s.preIdx].y;
    const endClose = hist[s.endIdx].y;
    return { preDate: hist[s.preIdx].x, preClose, startDate: hist[s.startIdx].x, endDate: hist[s.endIdx].x, length: s.length, endClose, declineRate: (endClose - preClose) / preClose * 100 };
  });
  const totalCount = rows.length;
  const avgLength = rows.reduce((a, r) => a + r.length, 0) / totalCount;
  const avgDeclineRate = trimmedMeanExcludingMinMax(rows.map(r => r.declineRate));
  const maxDeclineRate = Math.min(...rows.map(r => r.declineRate));
  return { rows, totalCount, avgLength, avgDeclineRate, maxDeclineRate };
}

//@@fn computeUpStreakDetailStats
function computeUpStreakDetailStats(hist) {
  const streaks = findUpStreaks(hist);
  if (streaks.length === 0) return null;
  const rows = streaks.map(s => {
    const preClose = hist[s.preIdx].y;
    const endClose = hist[s.endIdx].y;
    return { preDate: hist[s.preIdx].x, preClose, startDate: hist[s.startIdx].x, endDate: hist[s.endIdx].x, length: s.length, endClose, riseRate: (endClose - preClose) / preClose * 100 };
  });
  const totalCount = rows.length;
  const avgLength = rows.reduce((a, r) => a + r.length, 0) / totalCount;
  const avgRiseRate = trimmedMeanExcludingMinMax(rows.map(r => r.riseRate));
  const maxRiseRate = Math.max(...rows.map(r => r.riseRate));
  return { rows, totalCount, avgLength, avgRiseRate, maxRiseRate };
}

//@@fn computeStreakContinuationProb
function computeStreakContinuationProb(hist, direction, currentLength) {
  const streaksArr = direction === "down" ? findDownStreaks(hist) : findUpStreaks(hist);
  const atLeast = streaksArr.filter(s => s.length >= currentLength);
  const totalAtLeast = atLeast.length;
  if (totalAtLeast === 0) return null;
  const continued = atLeast.filter(s => s.length >= currentLength + 1).length;
  const continueProb = (continued / totalAtLeast) * 100;
  return { continueProb, reverseProb: 100 - continueProb, sampleCount: totalAtLeast };
}

//@@fn calculateStreakDetails
function calculateStreakDetails(hist) {
  const streaks = [];
  let i = 1;
  while (i < hist.length) {
    if (hist[i].y < hist[i - 1].y) {
      const startIdx = i;
      let j = i;
      while (j + 1 < hist.length && hist[j + 1].y < hist[j].y) j++;
      const endIdx = j;
      const peakIdx = startIdx - 1;
      const peak = hist[peakIdx].y;
      const length = endIdx - startIdx + 1;
      const buyPrices = hist.slice(startIdx, endIdx + 1).map(d => d.y);
      const totalCost = buyPrices.reduce((a, b) => a + b, 0);
      const shares = buyPrices.length;
      const avgBuyPrice = totalCost / shares;

      let recoveryIdx = -1;
      for (let m = endIdx + 1; m < hist.length; m++) {
        if (hist[m].y >= peak) { recoveryIdx = m; break; }
      }
      let recovered = false, returnPct = null;
      if (recoveryIdx !== -1) {
        returnPct = (hist[recoveryIdx].y * shares - totalCost) / totalCost * 100;
        recovered = true;
      }
      streaks.push({ startIdx, endIdx, length, peak, peakIdx, avgBuyPrice, recovered, returnPct });
      i = j + 1;
    } else {
      i++;
    }
  }
  return streaks;
}

//@@fn summarizeByLength
function summarizeByLength(streaks) {
  const map = new Map();
  streaks.forEach(s => {
    if (!map.has(s.length)) map.set(s.length, { count: 0, recovered: 0, unrecovered: 0, returns: [] });
    const g = map.get(s.length);
    g.count++;
    if (s.recovered) { g.recovered++; g.returns.push(s.returnPct); }
    else g.unrecovered++;
  });
  return map;
}
