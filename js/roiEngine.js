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

import { buildAmortSchedule } from "./loanEngine.js";

// =====================================================
// INTERNAL HELPERS (PURE)
// =====================================================

function monthKeyFromDate(d) {
  if (!(d instanceof Date) || isNaN(+d)) return null;
  // LOCAL YYYY-MM (avoid UTC rollover from toISOString)
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0")
  );
}

function clampToMonthEnd(monthDate) {
  if (!(monthDate instanceof Date) || isNaN(+monthDate)) return null;
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function monthDiff(d1, d2) {
  if (!(d1 instanceof Date) || !(d2 instanceof Date)) return 0;
  return (
    (d2.getFullYear() - d1.getFullYear()) * 12 +
    (d2.getMonth() - d1.getMonth())
  );
}

function getOwnershipBasis(loan) {
  const lots = Array.isArray(loan?.ownershipLots) ? loan.ownershipLots : [];

  const ownershipPct = lots.reduce(
    (s, lot) => s + safeNum(lot?.pct),
    0
  );

  const invested = lots.reduce(
    (s, lot) => s + safeNum(lot?.pricePaid),
    0
  );

  return { ownershipPct, invested, lots };
}

// =====================================================
// PUBLIC API
// =====================================================

export function getRoiEntryAsOfMonth(loan, monthDate) {
  if (!loan || !Array.isArray(loan.roiSeries) || !(monthDate instanceof Date)) {
    return null;
  }

  const asOf = clampToMonthEnd(monthDate);
  if (!asOf) return null;

  const series = loan.roiSeries
    .filter(r => r?.date instanceof Date && !isNaN(+r.date))
    .slice()
    .sort((a, b) => a.date - b.date);

  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].date <= asOf) return series[i];
  }

  return null;
}

export function computeWeightedRoiAsOfMonth(loans, monthDate) {
  if (!Array.isArray(loans) || !(monthDate instanceof Date)) return 0;

  let totalInvested = 0;
  let weightedSum = 0;

  loans.forEach(loan => {
    const entry = getRoiEntryAsOfMonth(loan, monthDate);
    if (!entry) return;

    const invested = safeNum(entry.invested);
    const roi = safeNum(entry.roi);

    if (invested > 0) {
      weightedSum += roi * invested;
      totalInvested += invested;
    }
  });

  return totalInvested > 0 ? weightedSum / totalInvested : 0;
}

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

  const totalInvested = loans.reduce((s, l) => {
    const last = Array.isArray(l.roiSeries) && l.roiSeries.length
      ? l.roiSeries[l.roiSeries.length - 1]
      : null;
    return s + safeNum(last?.invested);
  }, 0);

  if (!totalInvested) {
    return {
      totalInvested: 0,
      weightedROI: 0,
      projectedWeightedROI: 0,
      capitalRecoveredAmount: 0,
      capitalRecoveryPct: 0
    };
  }

  const weightedROI = computeWeightedRoiAsOfMonth(loans, asOfMonth);

  const projectedWeightedROI =
    loans.reduce((sum, l) => {
      const last = Array.isArray(l.roiSeries) && l.roiSeries.length
        ? l.roiSeries[l.roiSeries.length - 1]
        : null;

      if (!last) return sum;
      return sum + safeNum(last.roi) * safeNum(last.invested);
    }, 0) / (totalInvested || 1);

  const asOf = clampToMonthEnd(asOfMonth) || new Date(asOfMonth);

  let recoveredPrincipalTotal = 0;

  loans.forEach(l => {
    const sched = l?.amort?.schedule;
    if (!Array.isArray(sched)) return;

    const { ownershipPct } = getOwnershipBasis(l);

    sched.forEach(r => {
      if (r?.isOwned && r?.loanDate instanceof Date && r.loanDate <= asOf) {
        // principalPaid is whole-loan; scale to owned pct
        recoveredPrincipalTotal += safeNum(r.principalPaid) * ownershipPct;
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

export function buildProjectedRoiTimeline(loans, opts = {}) {
  if (!Array.isArray(loans) || loans.length === 0) {
    return { dates: [], perLoanSeries: [], weightedSeries: [] };
  }

  const colorMap = opts.colorMap || {};

  const earliestPurchase = loans.reduce((earliest, l) => {
    const d = new Date(l.purchaseDate);
    return d < earliest ? d : earliest;
  }, new Date(loans[0].purchaseDate));

  const latestMaturity = loans.reduce((latest, l) => {
    const mat = new Date(l.purchaseDate);
    mat.setMonth(
      mat.getMonth() + Math.round((safeNum(l.termYears) + safeNum(l.graceYears)) * 12)
    );
    return mat > latest ? mat : latest;
  }, new Date(earliestPurchase));

  const dates = [];
  const cursor = new Date(earliestPurchase);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= latestMaturity) {
    dates.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const perLoanSeries = loans.map((loan, idx) => {
    const purchase = new Date(loan.purchaseDate);
    purchase.setHours(0, 0, 0, 0);

    const roiMap = {};

    const cs = Array.isArray(loan.cumSchedule) ? loan.cumSchedule : [];
    cs.forEach(row => {
      if (!row?.isOwned) return;
      if (!(row.loanDate instanceof Date) || isNaN(+row.loanDate)) return;

      const entry = getRoiEntryAsOfMonth(loan, row.loanDate);
      if (!entry) return;

      const roi = safeNum(entry.roi);

      const key = monthKeyFromDate(row.loanDate);
      if (key) roiMap[key] = roi;
    });

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

  // Weighted series must weight by invested (not purchasePrice)
  const totalInvested = loans.reduce((s, l) => {
    const last = Array.isArray(l.roiSeries) && l.roiSeries.length
      ? l.roiSeries[l.roiSeries.length - 1]
      : null;
    return s + safeNum(last?.invested);
  }, 0);

  const weightedSeries = dates.map((date, i) => {
    if (!totalInvested) return { date, y: 0 };

    let weightedSum = 0;

    loans.forEach((loan, idx) => {
      const roi = perLoanSeries[idx]?.data?.[i]?.y;
      if (roi == null) return;

      const entry = getRoiEntryAsOfMonth(loan, date);
      const invested = safeNum(entry?.invested);

      if (invested > 0) {
        weightedSum += roi * invested;
      }
    });

    return { date, y: weightedSum / totalInvested };
  });

  return { dates, perLoanSeries, weightedSeries };
}

//  ----- Helpers ------

export function normalizeLoansForRoi(loans) {
  return loans.map(l => ({
    ...l,
    purchasePrice: Number(l.purchasePrice) || 0,
    roiSeries: Array.isArray(l.roiSeries) ? l.roiSeries : [],
    cumSchedule: Array.isArray(l.cumSchedule) ? l.cumSchedule : [],
    amort: l.amort || { schedule: [] }
  }));
}

export function getLastRoiEntry(loan) {
  if (!loan || !Array.isArray(loan.roiSeries) || !loan.roiSeries.length) {
    return null;
  }
  return loan.roiSeries[loan.roiSeries.length - 1];
}

export function getRoiSeriesAsOfMonth(loans, monthDate) {
  if (!Array.isArray(loans) || !(monthDate instanceof Date)) return [];

  return loans.map(loan => {
    const entry = getRoiEntryAsOfMonth(loan, monthDate);
    return {
      loanId: loan.id ?? loan.loanId,
      loan,
      entry
    };
  });
}

export function getLoanMaturityDate(loan) {
  if (!loan?.purchaseDate) return null;

  const d = new Date(loan.purchaseDate);
  if (isNaN(+d)) return null;

  const months =
    Math.round((safeNum(loan.termYears) + safeNum(loan.graceYears)) * 12);

  d.setMonth(d.getMonth() + months);
  return d;
}

export function deriveLoansWithRoi(formattedLoans) {
  return formattedLoans.map(l => {
    const rawAmort = buildAmortSchedule(l);

    const amortSchedule = (() => {
      const out = [];
      for (const r of rawAmort) {
        out.push(r);
        if (r.isTerminal === true) break;
      }
      return out;
    })();

    const purchase = new Date(l.purchaseDate);

    const scheduleWithOwnership = amortSchedule.map(r => ({
      ...r,
      isOwned: r.loanDate >= purchase,
      ownershipMonthIndex: r.loanDate >= purchase
        ? monthDiff(purchase, r.loanDate) + 1
        : 0,
      ownershipDate: r.loanDate >= purchase ? r.loanDate : null
    }));

    let cumP = 0;
    let cumI = 0;
    let cumFees = 0;

    const cumSchedule = scheduleWithOwnership
      .filter(r => r.isOwned)
      .reduce((rows, r) => {
        cumP += r.principalPaid;
        cumI += r.interest;
        const feeThisMonth = Number(r.feeThisMonth ?? 0);
        cumFees += feeThisMonth;

        rows.push({
          ...r,
          cumPrincipal: +cumP.toFixed(2),
          cumInterest: +cumI.toFixed(2),
          cumFees: +cumFees.toFixed(2)
        });

        if (r.isTerminal === true) return rows;
        return rows;
      }, []);

    const roiSeries = cumSchedule
      .filter(r => r.isOwned)
      .map(r => {
        const { ownershipPct, invested, lots } = getOwnershipBasis(l);

        const realized =
          ((safeNum(r.cumPrincipal) + safeNum(r.cumInterest)) - safeNum(r.cumFees)) *
          ownershipPct;

        const unrealized =
          (safeNum(r.balance) * 0.95) * ownershipPct;

        const loanValue = realized + unrealized;

        const roi =
          invested > 0
            ? (loanValue - invested) / invested
            : 0;

        return {
          month: r.ownershipMonthIndex,
          date: r.loanDate,
          displayDate: r.displayDate,

          roi,
          loanValue,
          invested,
          ownershipPct,
          ownershipLots: lots,

          cumFees: safeNum(r.cumFees),
          realized,
          remainingBalance: safeNum(r.balance),
          unrealized,
          isTerminal: r.isTerminal === true
        };
      });

    return {
      ...l,
      amort: { schedule: amortSchedule },
      scheduleWithOwnership,
      cumSchedule,
      balanceAtPurchase:
        amortSchedule.find(r => r.loanDate >= purchase)?.balance ?? 0,
      roiSeries
    };
  });
}
