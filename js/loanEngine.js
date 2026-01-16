// ===============================
// loanEngine.js  (NEW SHARED MODULE)
// ===============================

// -------------------------------
//  Helpers
// -------------------------------

import { loadLoans as fetchLoans } from "./loadLoans.js";

// =======================================
// Canonical LOCAL date helpers (NO TZ BUG)
// =======================================
function parseISODateLocal(iso) {
  // ✅ Pass through real Date objects
  if (iso instanceof Date) {
    return iso;
  }

  // ✅ Null / undefined guard
  if (!iso) return null;

  // ✅ Parse ISO YYYY-MM-DD strings
  if (typeof iso === "string") {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // ❌ Anything else is a bug
  throw new Error(
    `[parseISODateLocal] Unsupported date input: ${String(iso)}`
  );
}


export function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}


function monthKeyFromISO(iso) {
  return iso.slice(0, 7); // "YYYY-MM"
}

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
    const loanStartDate = normalizeDate(
  l.loanStartDate || l.startDate || ""
);

const purchaseDate = normalizeDate(
  l.purchaseDate || ""
);

    
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
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("addMonths called with invalid Date");
  }

  return new Date(
    date.getFullYear(),
    date.getMonth() + n,
    1
  );
}




// ===============================
// Deferral helper (AUTHORITATIVE)
// ===============================
export function isDeferredMonth(row) {
  return row?.isDeferred === true;
}


// ===============================
// Standard portfolio start date
// ===============================
export function getPortfolioStartDate(loans = []) {
  const dates = loans
    .map(l => {
      const d = l.loanStartDate || l.purchaseDate;
      if (!d) return null;
      const dt = parseISODateLocal(d);  // FIXED: Use local parsing

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

// ✅ Grace is ADDITIVE to repayment term
const graceMonths = graceYears * 12;
const repaymentMonths = termYears * 12;
const totalMonths = graceMonths + repaymentMonths;

function normalizeDeferralFlags(row) {
  row.isDeferred =
    row.isDeferred === true ||
    row.deferral === true ||
    row.deferred === true;

  // Kill legacy flags so nothing downstream can read them
  delete row.deferral;
  delete row.deferred;

  return row;
}



  // -------------------------------
  // Canonical dates (MONTH-ANCHORED)
  // -------------------------------
 const start = parseISODateLocal(loanStartDate);

  if (!Number.isFinite(start.getTime())) {
  throw new Error(
    `Invalid loanStartDate for loan "${loan.loanName}": ${loan.loanStartDate}`
  );
}

    const purchase = parseISODateLocal(purchaseDate);

  if (!purchase || !Number.isFinite(purchase.getTime())) {
  throw new Error(
    `Invalid purchaseDate for loan "${loan.loanName}": ${purchaseDate}`
  );
}


  // Ownership always begins at the first of purchase month
  const purchaseMonth = new Date(
    purchase.getFullYear(),
    purchase.getMonth(),
    1
  );

  // -------------------------------
  // Helpers
  // -------------------------------


  // -------------------------------
  // Index PREPAYMENT events by month
  // -------------------------------
  const prepayMap = {};
events
  .filter(e => e.type === "prepayment" && e.date)
  .forEach(e => {
    const key = monthKeyFromISO(e.date); // 🔑 NO Date()
    if (!prepayMap[key]) prepayMap[key] = [];
    prepayMap[key].push(e);
  });


  // -------------------------------
// Index DEFERRAL events by start month
// Accept startDate OR date (older data uses date)
// -------------------------------
const deferralStartMap = {};
events
  .filter(e => e.type === "deferral" && (e.startDate || e.date) && Number(e.months) > 0)
  .forEach(e => {
    const startISO = e.startDate || e.date;          // ✅ fallback
    const key = monthKeyFromISO(startISO);           // 🔑 NO Date()
    const m = Math.max(0, Math.floor(Number(e.months) || 0));
    deferralStartMap[key] = (deferralStartMap[key] || 0) + m;
  });



  // -------------------------------
  // Index DEFAULT event (calendar-anchored)
  // -------------------------------
  const defaultEvent = events.find(e => e.type === "default" && e.date);

// Canonical default month key (NO Date math)
const defaultMonthKey = defaultEvent
  ? monthKeyFromISO(defaultEvent.date)
  : null;


  const defaultRecovery = defaultEvent
    ? Number(defaultEvent.recoveryAmount || 0)
    : 0;

  
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
let deferralTotal = 0;


  // Contractual month loop
  for (let i = 0; i < totalMonths; ) {

    // ----------------------------------------------
// DEFAULT — terminal event (must run first)
// ----------------------------------------------
if (
  defaultMonthKey &&
  monthKeyFromDate(calendarDate) === defaultMonthKey
) {

  const loanDate = new Date(calendarDate);
  const applied = Math.min(balance, defaultRecovery);
  const isOwned = loanDate >= purchaseMonth;

  schedule.push(
  normalizeDeferralFlags({
    monthIndex: schedule.length + 1,
    loanDate,
    displayDate: new Date(loanDate.getFullYear(), loanDate.getMonth(), 1),


    payment: +(applied.toFixed(2)),
    principalPaid: +(applied.toFixed(2)),
    interest: 0,
    balance: +((balance - applied).toFixed(2)),

    prepayment: 0,
    accruedInterest: 0,

    isOwned,
    ownershipDate: isOwned ? loanDate : null,

    defaulted: true,
    isTerminal: true,
    recovery: +(applied.toFixed(2)),
    contractualMonth: i + 1
  })
  );

  break; // 🔒 STOP schedule immediately
}


// Check if a deferral starts in THIS amort row month
const startKey = monthKeyFromDate(calendarDate); // "YYYY-MM"


if (deferralRemaining === 0 && deferralStartMap[startKey]) {
  deferralRemaining = deferralStartMap[startKey];
  deferralTotal = deferralStartMap[startKey];
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
      const key = monthKeyFromDate(loanDate); // "YYYY-MM"
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

const deferralIndex = deferralTotal - deferralRemaining;

schedule.push(
  normalizeDeferralFlags({
  monthIndex: schedule.length + 1,
  loanDate,

  displayDate: new Date(loanDate.getFullYear(), loanDate.getMonth(), 1),


  // Deferral month: no scheduled payment, no scheduled principal/interest
payment: 0,
principalPaid: +(prepaymentThisMonth.toFixed(2)), // only prepayment counts as principal
interest: 0,
balance: +(balance.toFixed(2)),

prepayment: +(prepaymentThisMonth.toFixed(2)),
accruedInterest: +(accruedInterest.toFixed(2)),

// 🔑 DEFERRAL FLAGS (single source of truth)
isDeferred: true,
deferralIndex,
deferralRemaining,

isOwned,
ownershipDate: isOwned ? loanDate : null,

contractualMonth: i + 1
})
);


      deferralRemaining -= 1;
      calendarDate = addMonths(calendarDate, 1);
      continue; // still same contractual i
    }

    // ----------------------------------------------
    // NORMAL CONTRACTUAL MONTH (advance i at end)
    // ----------------------------------------------
    const loanDate = new Date(calendarDate);

    let interest = balance * monthlyRate;
    let principalPaid = 0;
    let paymentAmt = 0;

    // ----------------------------------------------
// Grace logic MUST be based on loanStartDate
// ----------------------------------------------
const monthsSinceLoanStart =
  (calendarDate.getFullYear() - start.getFullYear()) * 12 +
  (calendarDate.getMonth() - start.getMonth());

if (monthsSinceLoanStart < graceMonths) {
  // Grace: interest accrues, no payment
  paymentAmt = 0;
  principalPaid = 0;
  balance += interest;
} else {
  // Payment month
  const paymentMonthsTotal = repaymentMonths;
  const paymentMonthNumber = monthsSinceLoanStart - graceMonths;
  const remainingPaymentMonths =
    Math.max(1, paymentMonthsTotal - paymentMonthNumber);

  const r = monthlyRate;
  const P = balance;

  const dynPayment =
    r === 0
      ? (P / remainingPaymentMonths)
      : (P * r) / (1 - Math.pow(1 + r, -remainingPaymentMonths));

  paymentAmt = dynPayment;
  principalPaid = paymentAmt - interest;
  if (principalPaid < 0) principalPaid = 0;

  balance = Math.max(0, balance - principalPaid);
}


    // Apply prepayments for this calendar month
    const eventKey = monthKeyFromDate(loanDate); // "YYYY-MM"
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

schedule.push(
  normalizeDeferralFlags({
  monthIndex: schedule.length + 1,
  loanDate,

  displayDate: new Date(loanDate.getFullYear(), loanDate.getMonth(), 1),


  payment: +(paymentAmt.toFixed(2)),
  principalPaid: +(principalPaid.toFixed(2)),
  interest: +(interest.toFixed(2)),
  balance: +(balance.toFixed(2)),

  prepayment: +(prepaymentThisMonth.toFixed(2)),
  accruedInterest: 0,

  // 🔑 DEFERRAL FLAGS (explicitly NOT deferred)
  isDeferred: false,
  deferralIndex: null,
  deferralRemaining: null,

  isOwned,
  ownershipDate: isOwned ? loanDate : null,

  contractualMonth: i + 1
})
);

    
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

// --------------------------------------------------
// Canonical cumulative fields (engine-owned truth)
// --------------------------------------------------
let cumP = 0, cumI = 0, cumPay = 0;

schedule.forEach(r => {
  if (r.isOwned !== false) {
    cumP += r.principalPaid;
    cumI += r.interest;
    cumPay += r.payment;
  }

  r.cumPrincipal = +cumP.toFixed(2);
  r.cumInterest  = +cumI.toFixed(2);
  r.cumPayment   = +cumPay.toFixed(2);
});

  
  return schedule;
}



// ===============================
// Standard "today" (midnight)
// ===============================
export function getStandardToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ===============================
// Current schedule index (per-loan)
// ===============================
//
// Returns a 1-based index into amort.schedule
// Clamped to schedule length
//
export function getCurrentScheduleIndex(loan, asOf = new Date()) {
  if (!loan?.amort?.schedule?.length) return 1;

  const purchase = parseISODateLocal(loan.purchaseDate);  // FIXED: Use local parsing

  // Normalize to month boundary
  const purchaseMonth = new Date(
    purchase.getFullYear(),
    purchase.getMonth(),
    1
  );

  // ... (rest of function unchanged, truncated for brevity)

}

// ... (rest of file unchanged up to earnings timeline)

loansWithAmort.forEach(loan => {
  const start = parseISODateLocal(loan.loanStartDate);  // FIXED: Use local parsing
  const purchase = parseISODateLocal(loan.purchaseDate);  // FIXED: Use local parsing

  let cumPrincipal = 0;
  let cumInterest  = 0;
  let cumFees      = 0;

  const timeline = loan.amort.schedule.map(r => {
    const owned = r.loanDate >= purchase;

    // suppress earnings pre-ownership
    const principal = owned ? r.principalPaid : 0;
    const interest  = owned ? r.interest       : 0;
    const fees      = owned ? Number(r.feeThisMonth ?? 0) : 0;

    cumPrincipal += principal;
    cumInterest  += interest;
    cumFees      += fees;

    return {
      loanDate: r.loanDate,
      monthIndex: r.monthIndex,

      // ownership flags (engine-owned truth)
      isOwned: owned,
      ownershipDate: owned ? r.loanDate : null,
      isDeferred: r.isDeferred === true,
      defaulted: r.defaulted === true,

      // incremental
      monthlyPrincipal: principal,
      monthlyInterest: interest,
      monthlyFees: fees,
      monthlyNet: principal + interest - fees,

      // cumulative
      cumPrincipal,
      cumInterest,
      cumFees,
      netEarnings: cumPrincipal + cumInterest - cumFees,

      balance: r.balance
    };
  });


  // Defensive validation: Ensure all dates are valid Date objects
  timeline.forEach((row, idx) => {
    if (!(row.loanDate instanceof Date) || isNaN(row.loanDate.getTime())) {
      console.error(`Invalid loanDate in timeline row ${idx} for loan ${loan.id}`, row);
      throw new Error(`Loan engine generated invalid loanDate in earnings timeline`);
    }
    if (row.isOwned && (!row.ownershipDate || isNaN(row.ownershipDate.getTime()))) {
      console.error(`Missing/invalid ownershipDate on owned timeline row ${idx} for loan ${loan.id}`, row);
      throw new Error(`Loan engine: owned row missing valid ownershipDate in earnings timeline`);
    }
  });

// -------------------------------------------------
// DISPLAY timeline (INVESTOR VIEW — starts at first owned month)
// -------------------------------------------------

const firstOwnedIdx = timeline.findIndex(r => r.isOwned === true);

const displayTimeline =
  firstOwnedIdx >= 0
    ? timeline.slice(firstOwnedIdx)
    : [];

  
  earningsTimeline[loan.id] = timeline;
loan.displayEarningsTimeline = displayTimeline;


  earningsKpis[loan.id] =
    timeline.length > 0
      ? timeline[timeline.length - 1].netEarnings
      : 0;
});

// ... (rest of file unchanged up to ROI series)

loansWithAmort.forEach(loan => {
  const purchase = parseISODateLocal(loan.purchaseDate);  // FIXED: Use local parsing
  const purchasePrice = Number(
    loan.purchasePrice ?? loan.principal ?? 0
  );

  let cumInterest  = 0;
  let cumPrincipal = 0;
  let cumFees      = 0;

  const series = loan.amort.schedule
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

  // Defensive validation for ROI series
  series.forEach((row, idx) => {
    if (!(row.date instanceof Date) || isNaN(row.date.getTime())) {
      console.error(`Invalid date in ROI series row ${idx} for loan ${loan.id}`, row);
      throw new Error(`Loan engine generated invalid date in ROI series`);
    }
  });

  roiSeries[loan.id] = series;

  // Latest ROI KPI for this loan (last point in its series)
  roiKpis[loan.id] =
    series.length > 0
      ? series[series.length - 1].roi
      : 0;
});

// ... (rest of file unchanged, including amort KPIs and return)
