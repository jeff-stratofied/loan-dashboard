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
