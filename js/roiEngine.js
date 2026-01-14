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

// =====================================================
// INTERNAL HELPERS (PURE)
// =====================================================

function monthKeyFromDate(d) {
  if (!(d instanceof Date) || isNaN(+d)) return null;
  return d.toISOString().slice(0, 7); // YYYY-MM
}

function clampToMonthEnd(monthDate) {
  // Normalize to "end of that month" so comparisons are inclusive.
  if (!(monthDate instanceof Date) || isNaN(+monthDate)) return null;
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// =====================================================
// PUBLIC API
// =====================================================

/**
 * Get ROI entry for a single loan as of a given month.
 *
 * Expects loan.roiSeries entries like:
 *   { date: Date, roi: number, loanValue?: number, ... }
 *
 * @param {Object} loan
 * @param {Date} monthDate   (any date in the target month)
 * @returns {{roi:number, loanValue?:number}|null}
 */
export function getRoiEntryAsOfMonth(loan, monthDate) {
  if (!loan || !Array.isArray(loan.roiSeries) || !(monthDate instanceof Date)) {
    return null;
  }

  const asOf = clampToMonthEnd(monthDate);
  if (!asOf) return null;

  // Ensure sorted ascending by date (defensive; ROI page usually already is)
  const series = loan.roiSeries
    .filter(r => r?.date instanceof Date && !isNaN(+r.date))
    .slice()
    .sort((a, b) => a.date - b.date);

  // Walk backwards for last <= asOf
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].date <= asOf) return series[i];
  }

  // If nothing is <= asOf (e.g., month before purchase), return null
  return null;
}

/**
 * Compute weighted ROI for a portfolio as of a given month.
 *
 * @param {Array<Object>} loans
 * @param {Date} monthDate
 * @returns {number}
 */
export function computeWeightedRoiAsOfMonth(loans, monthDate) {
  if (!Array.isArray(loans) || !(monthDate instanceof Date)) return 0;

  const totalInvested = loans.reduce((s, l) => s + safeNum(l?.purchasePrice), 0);
  if (!totalInvested) return 0;

  let weightedSum = 0;

  loans.forEach(loan => {
    const entry = getRoiEntryAsOfMonth(loan, monthDate);
    if (entry && typeof entry.roi === "number") {
      weightedSum += entry.roi * safeNum(loan.purchasePrice);
    }
  });

  return weightedSum / totalInvested;
}

/**
 * Compute portfolio KPIs (single source of truth).
 *
 * @param {Array<Object>} loans
 * @param {Date} asOfMonth  (typically KPI_CURRENT_MONTH in the UI)
 * @returns {{
 *   totalInvested:number,
 *   weightedROI:number,
 *   projectedWeightedROI:number,
 *   capitalRecoveredAmount:number,
 *   capitalRecoveryPct:number
 * }}
 */
export function computeKPIs(loans, asOfMonth) {
  if (!Array.isArray(loans) || !(asOfMonth instanceof Date)) {
    return {
      totalInvested: 0,
      weightedROI: 0,
      projectedWeightedROI: 0,
      capitalRecoveredAmount: 0,
      capitalRecoveryPct: 0
    };
  }

  const totalInvested = loans.reduce((s, l) => s + safeNum(l?.purchasePrice), 0);

  if (!totalInvested) {
    return {
      totalInvested: 0,
      weightedROI: 0,
      projectedWeightedROI: 0,
      capitalRecoveredAmount: 0,
      capitalRecoveryPct: 0
    };
  }

  // Weighted ROI to date
  const weightedROI = computeWeightedRoiAsOfMonth(loans, asOfMonth);

  // Projected weighted ROI (use last ROI point per loan)
  const projectedWeightedROI =
    loans.reduce((sum, l) => {
      const s = Array.isArray(l?.roiSeries) ? l.roiSeries : [];
      const last = s.length ? s[s.length - 1] : null;
      return sum + safeNum(last?.roi) * safeNum(l?.purchasePrice);
    }, 0) / totalInvested;

  // Capital recovered (principal paid through asOfMonth, owned rows only)
  const asOf = clampToMonthEnd(asOfMonth) || new Date(asOfMonth);

  let recoveredPrincipalTotal = 0;

  loans.forEach(l => {
    const sched = l?.amort?.schedule;
    if (!Array.isArray(sched)) return;

    sched.forEach(r => {
      if (r?.isOwned && r?.loanDate instanceof Date && r.loanDate <= asOf) {
        recoveredPrincipalTotal += safeNum(r.principalPaid);
      }
    });
  });

  const capitalRecoveryPct =
    totalInvested > 0 ? recoveredPrincipalTotal / totalInvested : 0;

  return {
    totalInvested,
    weightedROI,
    projectedWeightedROI,
    capitalRecoveredAmount: recoveredPrincipalTotal,
    capitalRecoveryPct
  };
}

/**
 * Build projected ROI timeline for a portfolio of loans.
 * Extends to each loan's maturity (NOT to today's date).
 *
 * Notes:
 * - Does NOT touch window or UI globals.
 * - Optional colorMap may be provided by UI.
 *
 * @param {Array<Object>} loans
 * @param {{ colorMap?: Record<string|number,string> }} [opts]
 * @returns {{
 *   dates: Date[],
 *   perLoanSeries: Array<{id,name,color,data}>,
 *   weightedSeries: Array<{date:Date,y:number}>,
 * }}
 */
export function buildProjectedRoiTimeline(loans, opts = {}) {
  if (!Array.isArray(loans) || loans.length === 0) {
    return { dates: [], perLoanSeries: [], weightedSeries: [] };
  }

  const colorMap = opts.colorMap || {};

  // ---- 1. Determine global start (earliest purchase) ----
  const earliestPurchase = loans.reduce((earliest, l) => {
    const d = new Date(l.purchaseDate);
    return d < earliest ? d : earliest;
  }, new Date(loans[0].purchaseDate));

  // ---- 2. Determine global end (latest maturity date) ----
  const latestMaturity = loans.reduce((latest, l) => {
    const mat = new Date(l.purchaseDate);
    mat.setMonth(
      mat.getMonth() + Math.round((safeNum(l.termYears) + safeNum(l.graceYears)) * 12)
    );
    return mat > latest ? mat : latest;
  }, new Date(earliestPurchase));

  // ---- 3. Build monthly date list earliest → latest maturity ----
  const dates = [];
  const cursor = new Date(earliestPurchase);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= latestMaturity) {
    dates.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // ---- 4. Align per-loan ROI series ----
  const perLoanSeries = loans.map((loan, idx) => {
    const purchase = new Date(loan.purchaseDate);
    purchase.setHours(0, 0, 0, 0);

    const roiMap = {};

    // Expect loan.cumSchedule rows (owned-only typically) with:
    // loanDate, cumPrincipal, cumInterest, cumFees, balance, purchasePrice
    const cs = Array.isArray(loan.cumSchedule) ? loan.cumSchedule : [];
    cs.forEach(row => {
      if (!row?.isOwned) return;
      if (!(row.loanDate instanceof Date) || isNaN(+row.loanDate)) return;

      const realized = (safeNum(row.cumPrincipal) + safeNum(row.cumInterest)) - safeNum(row.cumFees);
      const unrealized = safeNum(row.balance) * 0.95;
      const loanValue = realized + unrealized;

      const purchasePrice = safeNum(loan.purchasePrice);
      const roi = purchasePrice ? (loanValue - purchasePrice) / purchasePrice : 0;

      const key = monthKeyFromDate(row.loanDate);
      if (key) roiMap[key] = roi;
    });

    // Determine the very first ROI value for this loan
    const roiKeys = Object.keys(roiMap).sort();
    const firstRoiValue = roiKeys.length ? roiMap[roiKeys[0]] : 0;

    let lastKnownROI = firstRoiValue;

    const data = dates.map(date => {
      if (date < purchase) return { date, y: null };

      const key = monthKeyFromDate(date);
      if (key != null && roiMap[key] != null) {
        lastKnownROI = roiMap[key];
      }

      return { date, y: lastKnownROI };
    });

    const loanId = loan.id ?? loan.loanId ?? idx;

    return {
      id: loanId,
      name: loan.name || `Loan ${loanId}`,
      color: colorMap[loanId] || null,
      data
    };
  });

  // ---- 5. Weighted ROI series ----
  const totalInvested = loans.reduce((s, l) => s + safeNum(l?.purchasePrice), 0);

  const weightedSeries = dates.map((date, i) => {
    if (!totalInvested) return { date, y: 0 };

    let weightedSum = 0;
    loans.forEach((loan, idx) => {
      const roi = perLoanSeries[idx]?.data?.[i]?.y;
      if (roi != null) {
        weightedSum += roi * safeNum(loan.purchasePrice);
      }
    });

    return { date, y: weightedSum / totalInvested };
  });

  return { dates, perLoanSeries, weightedSeries };
}

export function normalizeLoansForRoi(loans) {
  return loans.map(l => ({
    ...l,
    purchasePrice: Number(l.purchasePrice) || 0,
    roiSeries: Array.isArray(l.roiSeries) ? l.roiSeries : [],
    cumSchedule: Array.isArray(l.cumSchedule) ? l.cumSchedule : [],
    amort: l.amort || { schedule: [] }
  }));
}






