// ===============================
// loanEngine.js  (NEW SHARED MODULE)
// ===============================

// -------------------------------
//  Helpers
// -------------------------------

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
  return {
    // placeholder — filled in PHASE C
    loans: loansWithAmort
  };
}
