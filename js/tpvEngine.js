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
