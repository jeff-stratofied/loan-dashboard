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

  const items = Array.isArray(raw && raw.loans) ? raw.loans : [];

  return items.map((l, idx) => {
    const id = String(
      l.loanId !== undefined && l.loanId !== null
        ? l.loanId
        : (idx + 1)
    );

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
      l.principal != null
        ? l.principal
        : l.origLoanAmt != null
        ? l.origLoanAmt
        : l.originalBalance != null
        ? l.originalBalance
        : l.purchasePrice != null
        ? l.purchasePrice
        : 0
    );

    const purchasePrice = Number(
      l.purchasePrice != null
        ? l.purchasePrice
        : l.buyPrice != null
        ? l.buyPrice
        : principal
    );

    const nominalRate = Number(
      l.rate != null
        ? l.rate
        : l.nominalRate != null
        ? l.nominalRate
        : 0
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
      l.termYears != null
        ? l.termYears
        : l.term != null
        ? l.term
        : 10
    );

    const graceYears = Number(
      l.graceYears != null
        ? l.graceYears
        : l.grace != null
        ? l.grace
        : 0
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

      // ✅ REQUIRED FOR PREPAYMENTS
      events: Array.isArray(l.events) ? l.events : []
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

// ===============================
// Standard portfolio start date
// ===============================
export function getPortfolioStartDate(loans = []) {
  const dates = loans
    .map(l => {
      const d = l.loanStartDate || l.purchaseDate;
      if (!d) return null;
      const dt = new Date(d);
      return Number.isFinite(dt.getTime()) ? dt : null;
    })
    .filter(Boolean);

  if (!dates.length) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  min.setHours(0, 0, 0, 0);
  return min;
}

// ===============================
// Standard "today" (midnight)
// ===============================
export function getStandardToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}


// -------------------------------
// Canonical amort display date
// Always first of month to avoid rollover bugs
// -------------------------------
function getCanonicalMonthDate(purchaseDateStr, monthIndex) {
  const p = new Date(purchaseDateStr + "T00:00:00");

  // Anchor = first day of purchase month
  const anchor = new Date(
    p.getFullYear(),
    p.getMonth(),
    1
  );

  const d = new Date(anchor);
  d.setMonth(d.getMonth() + (monthIndex - 1));
  return d;
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
    events = []
  } = loan;

  const monthlyRate = nominalRate / 12;

  // Contractual months (do NOT include deferrals)
  const totalMonths = (graceYears + termYears) * 12;
  const graceMonths = graceYears * 12;

  // -------------------------------
  // Canonical dates (MONTH-ANCHORED)
  // -------------------------------
  const start = new Date(loanStartDate + "T00:00:00");
  const purchase = new Date(purchaseDate + "T00:00:00");

  // Ownership always begins at the first of purchase month
  const purchaseMonth = new Date(
    purchase.getFullYear(),
    purchase.getMonth(),
    1
  );

  // -------------------------------
  // Helpers
  // -------------------------------
  const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;

  // -------------------------------
  // Index PREPAYMENT events by month
  // -------------------------------
  const prepayMap = {};
  events
    .filter(e => e.type === "prepayment" && e.date)
    .forEach(e => {
      const d = new Date(e.date + "T00:00:00");
      const key = monthKey(d);
      if (!prepayMap[key]) prepayMap[key] = [];
      prepayMap[key].push(e);
    });

  // -------------------------------
  // Index DEFERRAL events by start month
  // (calendar-based, summed if same month)
  // -------------------------------
  const deferralStartMap = {};
  events
    .filter(e => e.type === "deferral" && e.startDate && Number(e.months) > 0)
    .forEach(e => {
      const d = new Date(e.startDate + "T00:00:00");
      const key = monthKey(d);
      const m = Math.max(0, Math.floor(Number(e.months) || 0));
      deferralStartMap[key] = (deferralStartMap[key] || 0) + m;
    });

  // -------------------------------
  // Index DEFAULT event (calendar-anchored)
  // -------------------------------
  const defaultEvent = events.find(e => e.type === "default" && e.date);

  // Raw date (day precision)
  const defaultDate = defaultEvent
    ? new Date(defaultEvent.date + "T00:00:00")
    : null;

  // Canonical default month (FIRST of month — critical)
  const defaultMonth = defaultDate
    ? new Date(defaultDate.getFullYear(), defaultDate.getMonth(), 1)
    : null;

  const defaultRecovery = defaultEvent
    ? Number(defaultEvent.recoveryAmount || 0)
    : 0;

  // ----------------------------------------------
// Contractual month index for DEFAULT (0-based)
// This prevents deferrals from delaying default
// ----------------------------------------------
const defaultContractualMonth = defaultDate
  ? monthDiff(
      new Date(loanStartDate + "T00:00:00"),
      new Date(defaultDate.getFullYear(), defaultDate.getMonth(), 1)
    )
  : null;


  const schedule = [];

  // -------------------------------
  // State
  // -------------------------------
  let balance = Number(principal || 0);


// We walk "contractual months" with i, but "calendar months" can expand
// due to inserted deferral rows.
// Canonicalize calendarDate to first of month to avoid rollover bugs
let calendarDate = new Date(
  start.getFullYear(),
  start.getMonth(),
  1
);


// Track deferral inserts (so we can insert N months without advancing i)
let deferralRemaining = 0;


  // Contractual month loop
  for (let i = 0; i < totalMonths; ) {

    // --- ADD THIS BLOCK AT THE VERY TOP OF THE LOOP ---
  console.log(`\n--- Processing calendar month: ${formatMonthYear(calendarDate)} (contractual month ${i + 1})`);
  if (defaultDate) {
    console.log(`Default event date: ${formatMonthYear(defaultDate)} (raw: ${defaultEvent.date})`);
    console.log(`Trigger condition: calendarDate >= first of default month → ${calendarDate >= new Date(defaultDate.getFullYear(), defaultDate.getMonth(), 1)}`);
  }
  // --- END OF DEBUG BLOCK ---


// Check if a deferral starts in THIS amort row month
const startKey = monthKey(calendarDate);

if (deferralRemaining === 0 && deferralStartMap[startKey]) {
  deferralRemaining = deferralStartMap[startKey];
}



    // ----------------------------------------------
    // DEFERRAL INSERTION MONTHS (do NOT advance i)
    // ----------------------------------------------
    
    if (deferralRemaining > 0) {

      const loanDate = new Date(calendarDate);

      

      // interest accrues and is capitalized
      const accruedInterest = balance * monthlyRate;
      balance += accruedInterest;

      // Apply any prepayments in this deferred month (allowed)
      const key = monthKey(loanDate);
      const monthEvents = prepayMap[key] || [];
      let prepaymentThisMonth = 0;

      monthEvents.forEach(e => {
        const amt = Number(e.amount || 0);
        if (amt <= 0) return;
        const applied = Math.min(balance, amt);
        prepaymentThisMonth += applied;
        balance -= applied;
      });

      const isOwned = loanDate >= purchaseMonth;

      schedule.push({
        monthIndex: schedule.length + 1,
        loanDate,

        displayDate: getCanonicalMonthDate(purchaseDate, schedule.length + 1),

        // Deferral month: no scheduled payment, no scheduled principal/interest
        payment: 0,
        principalPaid: +(prepaymentThisMonth.toFixed(2)), // only prepayment counts as principal
        interest: 0,
        balance: +(balance.toFixed(2)),

        prepayment: +(prepaymentThisMonth.toFixed(2)),
        deferral: true,
        accruedInterest: +(accruedInterest.toFixed(2)),

        isOwned,
        ownershipDate: isOwned ? loanDate : null,

        // Optional: keep contractual month context (helpful for debugging)
        contractualMonth: i + 1
      });

      deferralRemaining -= 1;
      calendarDate = addMonths(calendarDate, 1);
      continue; // still same contractual i
    }

    // ----------------------------------------------
    // NORMAL CONTRACTUAL MONTH (advance i at end)
    // ----------------------------------------------
    const loanDate = new Date(calendarDate);

// ----------------------------------------------
// DEFAULT — apply recovery and stop schedule
// (contractual-timeline based, deferral-safe)
// ----------------------------------------------
if (
  defaultContractualMonth !== null &&
  i >= defaultContractualMonth
) {


  const applied = Math.min(balance, defaultRecovery);
  const isOwned = loanDate >= purchaseMonth;

  schedule.push({
    monthIndex: schedule.length + 1,
    loanDate,
    displayDate: getCanonicalMonthDate(purchaseDate, schedule.length + 1),

    payment: +(applied.toFixed(2)),
    principalPaid: +(applied.toFixed(2)),
    interest: 0,
    balance: +((balance - applied).toFixed(2)),

    prepayment: 0,
    deferral: false,
    accruedInterest: 0,

    isOwned,
    ownershipDate: isOwned ? loanDate : null,

    defaulted: true,
    recovery: +(applied.toFixed(2)),
    contractualMonth: i + 1
  });
  
  break; // 🔒 hard stop — no future months
}

    let interest = balance * monthlyRate;
    let principalPaid = 0;
    let paymentAmt = 0;

    if (i < graceMonths) {
      // Grace: interest accrues, no payment
      paymentAmt = 0;
      principalPaid = 0;
      balance += interest;
    } else {
      // Payment month: compute payment dynamically so deferral-capitalized interest
      // still amortizes by the end of the remaining payment months.
      const paymentMonthsTotal = totalMonths - graceMonths;
      const paymentMonthNumber = (i - graceMonths); // 0-based within payment months
      const remainingPaymentMonths = Math.max(1, paymentMonthsTotal - paymentMonthNumber);

      const r = monthlyRate;
      const P = balance;

      const dynPayment =
        r === 0 ? (P / remainingPaymentMonths) : (P * r) / (1 - Math.pow(1 + r, -remainingPaymentMonths));

      paymentAmt = dynPayment;

      principalPaid = paymentAmt - interest;
      if (principalPaid < 0) principalPaid = 0; // safety (very high rates edge)

      balance = Math.max(0, balance - principalPaid);
    }

    // Apply prepayments for this calendar month
    const eventKey = monthKey(loanDate);
    const monthEvents = prepayMap[eventKey] || [];

    let prepaymentThisMonth = 0;

    monthEvents.forEach(e => {
      const amt = Number(e.amount || 0);
      if (amt <= 0) return;

      const applied = Math.min(balance, amt);
      prepaymentThisMonth += applied;
      balance -= applied;
    });

    principalPaid += prepaymentThisMonth;

    const isOwned = loanDate >= purchaseMonth;

    schedule.push({
      monthIndex: schedule.length + 1,
      loanDate,

      displayDate: getCanonicalMonthDate(purchaseDate, schedule.length + 1),

      payment: +(paymentAmt.toFixed(2)),
      principalPaid: +(principalPaid.toFixed(2)),
      interest: +(interest.toFixed(2)),
      balance: +(balance.toFixed(2)),

      prepayment: +(prepaymentThisMonth.toFixed(2)),
      deferral: false,
      accruedInterest: 0,

      isOwned,
      ownershipDate: isOwned ? loanDate : null,

      contractualMonth: i + 1
    });

// --- ADD THIS AT THE END OF THE LOOP (before i += 1) ---
  console.log(`Normal row added for ${formatMonthYear(calendarDate)}: payment $${paymentAmt.toFixed(2)}, balance $${balance.toFixed(2)}`);
  // ---
    
    // advance both calendars: 1 month forward, and 1 contractual month forward
    calendarDate = addMonths(calendarDate, 1);
    i += 1;

    // Optional early stop if paid off AND no future deferrals scheduled
    // (keeps your schedule shorter when loans prepay to zero).
    if (balance <= 0) {
      // If there’s a deferral later, we'd still need to show it, but that case
      // is weird (deferral on a paid-off loan). We'll stop here.
      break;
    }
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
