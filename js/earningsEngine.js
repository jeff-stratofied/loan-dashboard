/**
 * ============================================================
 * Earnings Engine
 * ------------------------------------------------------------
 * Pure domain logic for computing earnings from amort schedules.
 *
 * - No DOM access
 * - No global state
 * - No page knowledge
 * - Deterministic outputs
 *
 * Designed for:
 * - Earnings UI
 * - Paper portfolios
 * - Future reuse / testing
 * ============================================================
 */

import {
  addMonths,
  isDeferredMonth
} from "./loanEngine.js";

/* ============================================================
   Helpers (local, pure)
   ============================================================ */

function monthDiff(d1, d2) {
  if (!(d1 instanceof Date) || !(d2 instanceof Date)) return 0;
  return (
    (d2.getFullYear() - d1.getFullYear()) * 12 +
    (d2.getMonth() - d1.getMonth())
  );
}

/* ============================================================
   Core: Build Earnings Schedule
   ============================================================ */

/**
 * Build a full earnings schedule from an amort schedule.
 *
 * @param {Object} params
 * @param {Array}  params.amortSchedule   LoanEngine amort rows
 * @param {string} params.loanStartDate   YYYY-MM-DD
 * @param {string} params.purchaseDate    YYYY-MM-DD
 * @param {Array}  params.events          Loan events
 * @param {Date}   params.today           Canonical "today"
 *
 * @returns {Array<EarningsRow>}
 */

export function buildEarningsSchedule({
  amortSchedule,
  loanStartDate,
  purchaseDate,
  events = [],
  today
}) {
  
  if (!Array.isArray(amortSchedule) || amortSchedule.length === 0) {
    return [];
  }

  // 🔒 HARD GUARDS (match amort engine behavior)
  const loanStart = new Date(loanStartDate + "T00:00:00");
  if (!Number.isFinite(loanStart.getTime())) {
    throw new Error(
      `Invalid loanStartDate in earnings engine: ${loanStartDate}`
    );
  }

  const purchaseDt = new Date(purchaseDate + "T00:00:00");
  if (!Number.isFinite(purchaseDt.getTime())) {
    throw new Error(
      `Invalid purchaseDate in earnings engine: ${purchaseDate}`
    );
  }

  const monthsSinceStartRaw = monthDiff(loanStart, purchaseDt);
  const monthsSinceStart = Number.isFinite(monthsSinceStartRaw)
    ? monthsSinceStartRaw
    : 0;

  // ----------------------------------------------------------
  // Normalize amort rows with ownership + calendar dates
  // ----------------------------------------------------------
  const normalized = amortSchedule.map(row => {
    const ownershipMonthIndex = row.monthIndex - monthsSinceStart;

    const loanDateRaw = addMonths(loanStart, row.monthIndex - 1);
    const loanDate = new Date(
      loanDateRaw.getFullYear(),
      loanDateRaw.getMonth(),
      1
    );

    const ownershipDate =
      ownershipMonthIndex >= 1
        ? new Date(
            purchaseDt.getFullYear(),
            purchaseDt.getMonth() + (ownershipMonthIndex - 1),
            1
          )
        : null;

    return {
      ...row,
      ownershipMonthIndex,
      isOwned: ownershipMonthIndex >= 1,
      loanDate,
      ownershipDate
    };
  });

  // ----------------------------------------------------------
  // Earnings accumulation (authoritative logic)
  // ----------------------------------------------------------
  let cumPrincipal = 0;
  let cumInterest  = 0;
  let cumFees      = 0;

  let prevCumPrincipal = 0;
  let prevCumInterest  = 0;
  let prevCumFees      = 0;

  const earnings = normalized.map(row => {
    const deferred = isDeferredMonth(row);

    // ---- fees ----
    const upfrontFeeThisMonth =
      row.isOwned && row.ownershipMonthIndex === 1
        ? 150
        : 0;

    const balance = Number(row.balance ?? 0);

    const monthlyBalanceFee =
      row.isOwned && !deferred && balance > 0
        ? +(balance * 0.00125).toFixed(2)
        : 0;

    const feeThisMonth = upfrontFeeThisMonth + monthlyBalanceFee;

    // ---- principal / interest ----
    let principalThisMonth = 0;
    let interestThisMonth  = 0;
    let feesThisMonth      = 0;

    if (row.isOwned && !deferred) {
      principalThisMonth = Math.max(
        0,
        row.principalPaid - (row.prepayment || 0)
      );
      interestThisMonth = row.interest;
      feesThisMonth = feeThisMonth;
    }

    // ---- accumulate ONCE ----
    cumPrincipal = +(cumPrincipal + principalThisMonth).toFixed(2);
    cumInterest  = +(cumInterest  + interestThisMonth).toFixed(2);
    cumFees      = +(cumFees      + feesThisMonth).toFixed(2);

    const netEarnings =
      +(cumPrincipal + cumInterest - cumFees).toFixed(2);

    // ---- monthly deltas ----
    const monthlyPrincipal =
      +(cumPrincipal - prevCumPrincipal).toFixed(2);
    const monthlyInterest =
      +(cumInterest - prevCumInterest).toFixed(2);
    const monthlyFees =
      +(cumFees - prevCumFees).toFixed(2);
    const monthlyNet =
      +(monthlyPrincipal + monthlyInterest - monthlyFees).toFixed(2);

    prevCumPrincipal = cumPrincipal;
    prevCumInterest  = cumInterest;
    prevCumFees      = cumFees;

    return {
      ...row,

      // cumulative
      cumPrincipal,
      cumInterest,
      cumFees,
      netEarnings,

      // monthly
      monthlyPrincipal,
      monthlyInterest,
      monthlyFees,
      monthlyNet,

      // overrides
      feeThisMonth: deferred ? 0 : feeThisMonth,
      interestPaid: deferred ? 0 : row.interest,
      principalPaid: deferred ? 0 : row.principalPaid,
      isDeferralMonth: deferred
    };
  });

// KEEP ALL ROWS, SORT BY CALENDAR
// 🔑 Hard guarantee loanDate is a real Date object (prevents 1969/epoch regressions)
return earnings
.map(r => {
  if (!(r.loanDate instanceof Date) || !Number.isFinite(r.loanDate.getTime())) {
    throw new Error("Invalid loanDate generated in earnings engine");
  }
  return r;
})

  .sort((a, b) => a.loanDate - b.loanDate);

}

/* ============================================================
   Canonical "Current" Row
   ============================================================ */

/**
 * Returns the authoritative "current" earnings row.
 *
 * Rules:
 * 1. Prefer calendar month match with today
 * 2. Fallback to last owned row
 * 3. Final fallback to last row
 */
export function getCanonicalCurrentEarningsRow(
  earningsSchedule,
  today
) {
  if (!Array.isArray(earningsSchedule) || !earningsSchedule.length) {
    return null;
  }

  const y = today.getFullYear();
  const m = today.getMonth();

  const match = earningsSchedule.find(r =>
    r.loanDate &&
    r.loanDate.getFullYear() === y &&
    r.loanDate.getMonth() === m
  );

  if (match) return match;

  return (
    earningsSchedule.filter(r => r.isOwned).at(-1) ||
    earningsSchedule.at(-1)
  );
}

/* ============================================================
   Portfolio KPIs
   ============================================================ */

/**
 * Compute portfolio-level earnings KPIs.
 *
 * @param {Array} loansWithEarnings
 * @param {Date}  today
 * @param {Date}  portfolioStartDate
 */
export function computePortfolioEarningsKPIs(
  loansWithEarnings,
  today,
  portfolioStartDate
) {
  let totalNetToDate = 0;
  let totalNetProjected = 0;
  let totalFeesToDate = 0;
  let totalFeesProjected = 0;
  let totalPrincipal = 0;

  let projectedNetTotal = 0;
  let projectedMonthsTotal = 0;

  const kpi2Rows = [];

  loansWithEarnings.forEach(l => {
    totalPrincipal += Number(l.purchasePrice || 0);

    const sched = l.earningsSchedule || [];
    if (!sched.length) return;

    const atEnd = sched[sched.length - 1];

    kpi2Rows.push({
      loanId: l.loanId,
      loanName: l.loanName,
      school: l.school,
      netEarnings: Number(atEnd.netEarnings || 0),
      principal: Number(atEnd.cumPrincipal || 0),
      interest: Number(atEnd.cumInterest || 0),
      fees: -Number(atEnd.cumFees || 0)
    });

    projectedNetTotal += Number(atEnd.netEarnings || 0);
    projectedMonthsTotal += sched.length;

    const currentRow =
      getCanonicalCurrentEarningsRow(sched, today);

    totalNetToDate += Number(currentRow?.netEarnings ?? 0);
    totalFeesToDate += Number(currentRow?.cumFees ?? 0);

    totalNetProjected += Number(atEnd.netEarnings || 0);
    totalFeesProjected += Number(atEnd.cumFees || 0);
  });

  const projectedAvgMonthlyNet =
    projectedMonthsTotal > 0
      ? projectedNetTotal / projectedMonthsTotal
      : 0;

  const portfolioMonths =
    Math.max(1, monthDiff(portfolioStartDate, today) + 1);

  const avgMonthlyNet =
    portfolioMonths > 0
      ? totalNetToDate / portfolioMonths
      : 0;

  return {
    totalNetToDate,
    totalNetProjected,
    totalFeesToDate,
    totalFeesProjected,
    totalPrincipal,
    avgMonthlyNet,
    projectedAvgMonthlyNet,
    monthsCounted: portfolioMonths,
    kpi2Rows
  };
}
