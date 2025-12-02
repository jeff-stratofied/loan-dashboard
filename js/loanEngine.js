// ===============================
// loanEngine.js  (NEW SHARED MODULE)
// ===============================

// -------------------------------
//  Helpers
// -------------------------------

import { loadLoans as fetchLoans } from "./loadLoans.js";

export async function loadLoans() {
  const raw = await fetchLoans();

  // Cloudflare Worker returns { loans:[...], sha:"..." }
  const items = raw || [];

  // Normalize the backend fields into the shape the dashboards expect
  const normalized = items.map((l, idx) => ({
    id: l.loanId ?? idx + 1,
    name: l.loanName,
    school: l.school,
    loanStartDate: l.loanStartDate,
    purchaseDate: l.purchaseDate,
    purchasePrice: Number(l.principal),
    nominalRate: Number(l.rate),
    termYears: Number(l.termYears),
    graceYears: Number(l.graceYears),
  }));

  return normalized;
}

export function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function monthDiff(d1, d2) {
  const years = d2.getFullYear() - d1.getFullYear();
  const months = d2.getMonth() - d1.getMonth();
  return years * 12 + months;
}

export function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function formatMonthYear(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short"
  });
}

// -------------------------------
// Core: Build amortization schedule
// -------------------------------
//
// This ensures:
// - consistent loanDate for each row
// - payment calculation aligned with loanStartDate
// - correct ownership logic using purchaseDate
//

export function buildAmortSchedule(loan) {
  const {
    principal,
    nominalRate,
    termYears,
    graceYears,
    loanStartDate,
    purchaseDate
  } = loan;

  const monthlyRate = nominalRate / 12;
  const totalMonths = termYears * 12;
  const graceMonths = graceYears * 12;

  const start = new Date(loanStartDate);
  const purchase = new Date(purchaseDate);

  const schedule = [];

  // Payment formula (post-grace)
  const N = totalMonths;
  const P = principal;
  const r = monthlyRate;
  const payment =
    r === 0 ? P / N : (P * r) / (1 - Math.pow(1 + r, -N));

  let balance = P;

  for (let i = 0; i < totalMonths; i++) {
    const monthIndex = i + 1;
    const loanDate = addMonths(start, i);

    let interest = balance * r;
    let principalPaid = 0;
    let paymentAmt = 0;

    if (i < graceMonths) {
      // During grace: interest accrues, no payments
      principalPaid = 0;
      paymentAmt = 0;
      balance += interest;
    } else {
      // Normal amortization
      paymentAmt = payment;
      principalPaid = payment - interest;
      balance = Math.max(0, balance - principalPaid);
    }

    const isOwned = loanDate >= purchase;
    const ownershipDate = isOwned ? loanDate : null;

    schedule.push({
      monthIndex,
      loanDate,
      payment: +(paymentAmt.toFixed(2)),
      principalPaid: +(principalPaid.toFixed(2)),
      interest: +(interest.toFixed(2)),
      balance: +(balance.toFixed(2)),
      isOwned,
      ownershipDate
    });
  }

  return schedule;
}

// -------------------------------
// Attach schedules to all loans
// -------------------------------

export function attachSchedules(loans) {
  return loans.map(loan => ({
    ...loan,
    amort: {
      schedule: buildAmortSchedule(loan)
    }
  }));
}

// -------------------------------
// Portfolio-level view builder
// (Placeholder for now)
// -------------------------------
//
// ROI, earnings, amort KPIs, next-month expected income,
// and any shared timelines will be added during PHASE C.
//

export function buildPortfolioViews(loansWithAmort) {
  
  const TODAY = new Date();
  const nextMonthDate = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1);

  // ----------------------------------------------
  // 1) Next-Month Expected Income (Option A)
  // ----------------------------------------------
  function sameMonthYear(d1, d2) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth()
    );
  }

  function calcMonthlyExpectedIncome(targetMonthDate) {
    return loansWithAmort.reduce((sum, loan) => {
      const purchaseDate = new Date(loan.purchaseDate);

      return sum + loan.amort.schedule
        .filter(r => {
          const payDate = r.loanDate;
          const sameMonth = sameMonthYear(payDate, targetMonthDate);
          const owned = payDate >= purchaseDate;
          return sameMonth && owned;
        })
        .reduce((s, r) => s + r.payment, 0);
    }, 0);
  }

  // Default: 24-month forward projection
  const forwardMonths = 24;
  const incomeLabels = [];
  const incomePayments = [];

  for (let i = 0; i < forwardMonths; i++) {
    const d = new Date(nextMonthDate);
    d.setMonth(d.getMonth() + i);

    incomeLabels.push(
      d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    );
    incomePayments.push(calcMonthlyExpectedIncome(d));
  }

  const monthlyIncomeKpi = calcMonthlyExpectedIncome(nextMonthDate);


  // ----------------------------------------------
  // 2) ROI Series (per-loan & portfolio)
  // ----------------------------------------------
  //
  // ROI definition:
  //
  //   ROI = (CurrentValue - PurchasePrice) / PurchasePrice
  //
  // CurrentValue = principal remaining + cumulative interest earned
  //
  // Everything aligned to loanDate.


  const roiSeries = {};
  const roiKpis = {};

  loansWithAmort.forEach(loan => {
    const purchase = new Date(loan.purchaseDate);
    let cumInterest = 0;
    let currentValue = 0;

    roiSeries[loan.id] = loan.amort.schedule
      .filter(r => r.loanDate >= purchase)
      .map(r => {
        cumInterest += r.interest;
        currentValue = r.balance + cumInterest;

        const roi = loan.principal
          ? (currentValue - loan.principal) / loan.principal
          : 0;

        return {
          date: r.loanDate,
          roi: roi,
          balance: r.balance,
          cumInterest: cumInterest
        };
      });

    // Latest ROI KPI
    roiKpis[loan.id] =
      roiSeries[loan.id].length > 0
        ? roiSeries[loan.id][roiSeries[loan.id].length - 1].roi
        : 0;
  });


  // ----------------------------------------------
  // 3) Earnings Timeline (per-loan & portfolio)
  // ----------------------------------------------
  //
  // Earnings = cumulative interest (owned months only).
  //

  const earningsSeries = {};
  const earningsKpis = {};

  loansWithAmort.forEach(loan => {
    const purchase = new Date(loan.purchaseDate);
    let cum = 0;

    earningsSeries[loan.id] = loan.amort.schedule
      .filter(r => r.loanDate >= purchase)
      .map(r => {
        cum += r.interest;
        return {
          date: r.loanDate,
          interest: r.interest,
          cumulative: cum
        };
      });

    earningsKpis[loan.id] =
      earningsSeries[loan.id].length > 0
        ? earningsSeries[loan.id][earningsSeries[loan.id].length - 1].cumulative
        : 0;
  });


  // ----------------------------------------------
  // 4) Amort KPIs (Total Invested, Portfolio Value, etc.)
  // ----------------------------------------------

  const totalInvested = loansWithAmort.reduce((sum, loan) => {
    return sum + loan.principal;
  }, 0);

  const portfolioValue = loansWithAmort.reduce((sum, loan) => {
    const last = loan.amort.schedule[loan.amort.schedule.length - 1];
    return sum + last.balance;
  }, 0);

  const amortKpis = {
    totalInvested,
    portfolioValue,
    monthlyIncomeKpi,
    nextMonthLabel: nextMonthDate.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric"
    })
  };


  // ----------------------------------------------
  // Return unified views
  // ----------------------------------------------

  return {
    loans: loansWithAmort,

    // amort page data
    incomeLabels,
    incomePayments,
    amortKpis,

    // ROI page data
    roiSeries,
    roiKpis,

    // earnings page data
    earningsSeries,
    earningsKpis
  };
}
