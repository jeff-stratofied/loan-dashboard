// ===============================
// loanEngine.js  (NEW SHARED MODULE)
// ===============================

// -------------------------------
//  Helpers
// -------------------------------

import { loadLoans as fetchLoans } from "./loadLoans.js";

// ===============================
// UNIVERSAL LOAD + NORMALIZE
// ===============================
export async function loadLoans() {
  const raw = await fetchLoans();

  const items = Array.isArray(raw?.loans) ? raw.loans : [];

  return items.map((l, idx) => {
    const id = String(l.loanId ?? (idx + 1));   // ALWAYS KEEP loanId as a string


    // Normalize names
    const loanName =
      l.loanName ||
      l.name ||
      `Loan ${id}`;

    const school =
      l.school ||
      l.institution ||
      (loanName.includes(" ") ? loanName.split(" ")[0] : "School");

    // Normalize amounts
    const principal = Number(
      l.principal ??
      l.origLoanAmt ??
      l.originalBalance ??
      l.purchasePrice ??
      0
    );

    const purchasePrice = Number(
      l.purchasePrice ??
      l.buyPrice ??
      principal
    );

    const nominalRate = Number(
      l.rate ??
      l.nominalRate ??
      0
    );

    // Normalize dates
    const loanStartDate =
    l.loanStartDate ||
    l.startDate ||
    "";


    const purchaseDate =
      l.purchaseDate ||
      l.loanStartDate ||
      "";

    // Normalize terms
    const termYears = Number(
      l.termYears ??
      l.term ??
      10
    );

    const graceYears = Number(
      l.graceYears ??
      l.grace ??
      0
    );

    return {
      id,
      loanName,
      name: loanName,
      school,
    
      loanStartDate,
      purchaseDate,
    
      principal,
      purchasePrice,
      nominalRate,
      termYears,
      graceYears,
    
      // ✅ ADD THIS LINE
      events: Array.isArray(l.events) ? l.events : []
    };

    };
  });
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
    purchaseDate,
    events = []          // ✅ NEW (safe default)
  } = loan;

  const monthlyRate = nominalRate / 12;
  const totalMonths = (graceYears + termYears) * 12;
  const graceMonths = graceYears * 12;

  const start = new Date(loanStartDate);
  const purchase = new Date(purchaseDate);

  // Normalize + index events by month (prepayment only for now)
  const eventMap = {};
  events
    .filter(e => e.type === "prepayment" && e.date)
    .forEach(e => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!eventMap[key]) eventMap[key] = [];
      eventMap[key].push(e);
    });

  const schedule = [];

  // ----------------------------------------------
  // Compute balance after grace period
  // ----------------------------------------------
  let adjustedBalance = principal;
  for (let g = 0; g < graceMonths; g++) {
    adjustedBalance += adjustedBalance * monthlyRate;
  }

  // ----------------------------------------------
  // Monthly payment based on adjusted balance
  // ----------------------------------------------
  const r = monthlyRate;
  const N = totalMonths;
  const P = adjustedBalance;

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
      // Grace period: interest accrues, no scheduled payment
      paymentAmt = 0;
      principalPaid = 0;
      balance += interest;
    } else {
      // Normal amortization
      paymentAmt = payment;
      principalPaid = payment - interest;
      balance = Math.max(0, balance - principalPaid);
    }

    // ----------------------------------------------
    // ✅ APPLY PREPAYMENT EVENTS (Phase 2)
    // ----------------------------------------------
    const eventKey = `${loanDate.getFullYear()}-${loanDate.getMonth()}`;
    const monthEvents = eventMap[eventKey] || [];

    let prepaymentThisMonth = 0;

    monthEvents.forEach(e => {
      const amt = Number(e.amount || 0);
      if (amt <= 0) return;

      const applied = Math.min(balance, amt);
      prepaymentThisMonth += applied;
      balance -= applied;
    });

    // Treat prepayment as extra principal paid
    principalPaid += prepaymentThisMonth;

    const isOwned = loanDate >= purchase;
    const ownershipDate = isOwned ? loanDate : null;

    schedule.push({
      monthIndex,
      loanDate,

      payment: +(paymentAmt.toFixed(2)),
      principalPaid: +(principalPaid.toFixed(2)),
      interest: +(interest.toFixed(2)),
      balance: +(balance.toFixed(2)),

      // NEW (harmless if unused)
      prepayment: +(prepaymentThisMonth.toFixed(2)),

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
    const purchasePrice = Number(
      loan.purchasePrice ?? loan.principal ?? 0
    );

    let cumInterest  = 0;
    let cumPrincipal = 0;
    let cumFees      = 0;

    roiSeries[loan.id] = loan.amort.schedule
      .filter(r => r.loanDate >= purchase)
.map(r => {
  // accumulate realized components
  cumInterest  += r.interest;
  cumPrincipal += r.principalPaid;

  const feeThisMonth = Number(r.feeThisMonth ?? 0);
  cumFees += feeThisMonth;

  const realized   = cumPrincipal + cumInterest - cumFees;
  const unrealized = r.balance * 0.95;
  const loanValue  = realized + unrealized;

  const roi = purchasePrice
    ? (loanValue - purchasePrice) / purchasePrice
    : 0;

  return {
    date: r.loanDate,
    month: r.monthIndex,
    roi,
    loanValue,
    realized,
    unrealized,
    balance: r.balance,
    cumInterest,
    cumPrincipal,
    cumFees,
    ownershipDate: r.ownershipDate
  };
});



    // Latest ROI KPI for this loan (last point in its series)
    roiKpis[loan.id] =
      roiSeries[loan.id].length > 0
        ? roiSeries[loan.id][roiSeries[loan.id].length - 1].roi
        : 0;
  });

  

// ----------------------------------------------
// 3) Earnings Timeline (PROJECTED AS-OF)
// ----------------------------------------------
//
// netEarnings = earned so far
// projectedNet = earned + remaining lifetime
// ----------------------------------------------

const earningsSeries = {};
const earningsKpis = {};

loansWithAmort.forEach(loan => {
  const purchase = new Date(loan.purchaseDate);

  let cumPrincipal = 0;
  let cumInterest  = 0;
  let cumFees      = 0;

  // --- build earned-to-date series first
  const earnedSeries = loan.amort.schedule
    .filter(r => r.loanDate >= purchase)
    .map(r => {
      cumPrincipal += r.principalPaid;
      cumInterest  += r.interest;

      const feeThisMonth = Number(r.feeThisMonth ?? 0);
      cumFees += feeThisMonth;

      return {
        loanDate: r.loanDate,
        ownershipDate: r.loanDate,
        monthIndex: r.monthIndex,
        payment: r.payment,
        principalPaid: r.principalPaid,
        interest: r.interest,
        balance: r.balance,

        cumPrincipal,
        cumInterest,
        cumFees,
        netEarnings: cumPrincipal + cumInterest - cumFees
      };
    });

  if (!earnedSeries.length) {
    earningsSeries[loan.id] = [];
    earningsKpis[loan.id] = 0;
    return;
  }

  // --- lifetime net (final earned point)
  const lifetimeNet =
    earnedSeries[earnedSeries.length - 1].netEarnings;

  // --- PROJECTED-AS-OF timeline
  earningsSeries[loan.id] = earnedSeries.map(r => {
    const earned = r.netEarnings;
    const projected = earned + (lifetimeNet - earned);

    return {
      ...r,
      netEarnings: projected
    };
  });

  // KPI2 value = lifetime net (unchanged)
  earningsKpis[loan.id] = lifetimeNet;
});

// ----------------------------------------------
// 3b) Projected Earnings Timeline (AS-OF)
// ----------------------------------------------

const projectedEarningsSeries = {};

Object.keys(earningsSeries).forEach(loanId => {
  const series = earningsSeries[loanId];
  if (!series.length) {
    projectedEarningsSeries[loanId] = [];
    return;
  }

  const lifetimeNet =
    series[series.length - 1].netEarnings;

  projectedEarningsSeries[loanId] = series.map(r => {
    const earned = r.netEarnings;
    const projected = earned + (lifetimeNet - earned);

    return {
      ...r,
      netEarnings: projected
    };
  });
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
  earningsSeries,              // earned-to-date (KPI1)
  projectedEarningsSeries,     // projected-as-of (KPI2)
  earningsKpis
};



  
}
