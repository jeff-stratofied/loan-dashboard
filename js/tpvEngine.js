// =======================================
// tpvEngine.js
// Shared TPV (Total Portfolio Value) logic
// =======================================

import {
  monthKeyFromDate,
  getStandardToday
} from "./loanEngine.js";

import {
  getCanonicalCurrentEarningsRow
} from "./earningsEngine.js";

/**
 * Build a TPV timeline for a single loan.
 *
 * @param {Object} params
 * @param {Object} params.loan
 * @param {Array}  params.amortSchedule
 * @param {Array}  params.earningsSchedule
 * @param {Date}   params.today
 *
 * @returns {Array<{monthKey, value, breakdown}>}
 */
export function buildLoanTPVTimeline({
  loan,
  amortSchedule,
  earningsSchedule,
  today = getStandardToday()
}) {
  if (!loan || !Array.isArray(amortSchedule)) return [];

  const purchasePrice = Number(loan.purchasePrice || 0);

  // ---- Track running aggregates ----
  let cumPrincipal = 0;
  let accruedInterestGrace = 0;

  const rows = [];

  amortSchedule.forEach(row => {
    if (!row.isOwned) return;

    const monthKey = monthKeyFromDate(row.loanDate);

    // Grace interest accrual
    if (row.isDeferred && row.interest) {
      accruedInterestGrace += Number(row.interest || 0);
    }

    // Principal accumulation
    if (!row.isDeferred && row.principalPaid) {
      cumPrincipal += Number(row.principalPaid || 0);
    }

    const value =
      purchasePrice +
      accruedInterestGrace +
      cumPrincipal;

    rows.push({
      monthKey,
      loanId: loan.id,
      loanName: loan.loanName,
      value: +value.toFixed(2),
      breakdown: {
        purchasePrice,
        accruedInterestGrace: +accruedInterestGrace.toFixed(2),
        cumulativePrincipal: +cumPrincipal.toFixed(2)
      }
    });
  });

  return rows;
}

/**
 * Build portfolio TPV series aligned by calendar month.
 *
 * Output shape optimized for stacked bar charts + tables.
 */
export function buildPortfolioTPVSeries(
  loansWithSchedules,
  today = getStandardToday()
) {
  const monthSet = new Set();
  const seriesByLoan = {};

  loansWithSchedules.forEach(l => {
    const rows = buildLoanTPVTimeline({
      loan: l,
      amortSchedule: l.amortSchedule,
      earningsSchedule: l.earningsSchedule,
      today
    });

    if (!rows.length) return;

    seriesByLoan[l.id] = {
      loanId: l.id,
      loanName: l.loanName,
      valuesByMonth: {}
    };

    rows.forEach(r => {
      monthSet.add(r.monthKey);
      seriesByLoan[l.id].valuesByMonth[r.monthKey] = r.value;
    });
  });

  const months = Array.from(monthSet).sort();

  // Normalize series to aligned arrays
  Object.values(seriesByLoan).forEach(s => {
    s.values = months.map(m => s.valuesByMonth[m] || 0);
    delete s.valuesByMonth;
  });

  // Portfolio totals (for y-axis scaling / labels)
  const totalsByMonth = months.map((_, i) =>
    Object.values(seriesByLoan).reduce(
      (sum, s) => sum + s.values[i],
      0
    )
  );

  return {
    months,
    seriesByLoan,
    totalsByMonth
  };
}

