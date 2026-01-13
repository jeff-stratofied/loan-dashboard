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
  function buildProjectedRoiTimeline(loans) {
    // NOTE: full implementation lives here
    // (paste the hardened version we just finalized)
    console.warn("buildProjectedRoiTimeline not yet implemented");
    return {
      dates: [],
      perLoanSeries: [],
      weightedSeries: []
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
