/**
 * roiEngine.js
 *
 * Portfolio-level Return on Investment (ROI) calculations.
 * 
 * Responsibilities:
 * - ROI timelines (projected + realized)
 * - Weighted portfolio ROI
 * - ROI normalization across heterogeneous loans
 *
 * This module MUST:
 * - accept arrays of loans
 * - never touch the DOM
 * - never depend on UI state (currentLoan, embed mode, etc.)
 */

(function () {
  "use strict";

  // =====================================================
  // PUBLIC API
  // =====================================================

  /**
   * Build projected ROI timeline for a portfolio of loans.
   *
   * @param {Array<Object>} loans
   * @returns {{
   *   dates: Date[],
   *   perLoanSeries: Array<{id,name,color,data}>,
   *   weightedSeries: Array<{date,y}>
   * }}
   */

      /* ============================================================
   PROJECTED ROI TIMELINE ENGINE
   Extends to each loan's maturity (NOT to today's date)
   ============================================================ */
export function buildProjectedRoiTimeline(loans) {
  // ---- 1. Determine global start (earliest purchase) ----
  const earliestPurchase = loans.reduce((earliest, l) => {
    const d = new Date(l.purchaseDate);
    return d < earliest ? d : earliest;
  }, new Date(loans[0].purchaseDate));

  // ---- 2. Determine global end (latest maturity date) ----
  const latestMaturity = loans.reduce((latest, l) => {
    const mat = new Date(l.purchaseDate);
    mat.setMonth(mat.getMonth() + Math.round((l.termYears + l.graceYears) * 12));
    return mat > latest ? mat : latest;
  }, new Date(earliestPurchase));

  // ---- 3. Build monthly date list earliest → latest maturity ----
  const dates = [];
  const cursor = new Date(earliestPurchase);
  while (cursor <= latestMaturity) {
    dates.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // ---- 4. Align per-loan ROI series ----
  const perLoanSeries = loans.map((loan, idx) => {
    const purchase = new Date(loan.purchaseDate);
const roiMap = {};

loan.cumSchedule.forEach(row => {
  if (!row.isOwned) return;

  const realized = (row.cumPrincipal + row.cumInterest) - row.cumFees;
  const unrealized = row.balance * 0.95;
  const loanValue = realized + unrealized;

  const roi = (loanValue - loan.purchasePrice) / loan.purchasePrice;

  const key = row.loanDate.toISOString().slice(0, 7);
  roiMap[key] = roi;
});



    // Determine the very first ROI value for this loan
const roiKeys = Object.keys(roiMap).sort();
const firstRoiValue = roiKeys.length ? roiMap[roiKeys[0]] : 0;

let lastKnownROI = firstRoiValue;   // <-- FIX: start correctly

const data = dates.map(date => {
  if (date < purchase) return { date, y: null };

  const key = date.toISOString().slice(0,7);
  if (roiMap[key] != null) {
    lastKnownROI = roiMap[key];
  }

  return { date, y: lastKnownROI };
});


    const loanId = loan.id ?? loan.loanId ?? idx;

    return {
      id: loanId,
      name: loan.name || `Loan ${loanId}`,
      color: window.KPI_COLOR_MAP?.[loanId] || loanColors[idx % loanColors.length],
      data
    };

  });

  // ---- 5. Weighted ROI series ----
  const totalInvested = loans.reduce((s,l)=> s + l.purchasePrice, 0);

  const weightedSeries = dates.map((date, i) => {
    let weightedSum = 0;
    loans.forEach((loan, idx) => {
      const roi = perLoanSeries[idx].data[i].y;
      if (roi != null) {
        weightedSum += roi * loan.purchasePrice;
      }
    });
    return { date, y: weightedSum / totalInvested };
  });

  return {
    dates,
    perLoanSeries,
    weightedSeries
  };
}

  /**
   * Compute weighted ROI for a portfolio as of a given month.
   *
   * @param {Array<Object>} loans
   * @param {Date} monthDate
   * @returns {number}
   */
  function computeWeightedRoiAsOfMonth(loans, monthDate) {
    if (!Array.isArray(loans) || !monthDate) return 0;

    const totalInvested = loans.reduce(
      (s, l) => s + (l.purchasePrice || 0),
      0
    );

    if (!totalInvested) return 0;

    let weightedSum = 0;

    loans.forEach(loan => {
      const entry = getRoiEntryAsOfMonth(loan, monthDate);
      if (entry && typeof entry.roi === "number") {
        weightedSum += entry.roi * loan.purchasePrice;
      }
    });

    return weightedSum / totalInvested;
  }

  /**
   * Get ROI entry for a single loan as of a given month.
   *
   * @param {Object} loan
   * @param {Date} monthDate
   * @returns {{roi:number}|null}
   */
  function getRoiEntryAsOfMonth(loan, monthDate) {
    if (
      !loan ||
      !Array.isArray(loan.roiSeries) ||
      !monthDate
    ) return null;

    const key = monthDate.toISOString().slice(0, 7);

    for (let i = loan.roiSeries.length - 1; i >= 0; i--) {
      const row = loan.roiSeries[i];
      if (row?.month <= key) {
        return row;
      }
    }

    return null;
  }

  // =====================================================
  // EXPORTS (window namespace — no bundler required)
  // =====================================================

  window.roiEngine = {
    buildProjectedRoiTimeline,
    computeWeightedRoiAsOfMonth,
    getRoiEntryAsOfMonth
  };

})();
