// =====================================================
// OWNERSHIP ENGINE — SINGLE SOURCE OF TRUTH
// =====================================================

export const OWNERSHIP_STEP = 5;
export const MARKET_USER = "Market";

// -------------------------------------
// Normalize ownership to always hit 100%
// -------------------------------------
export function normalizeOwnership(loan) {
  if (!loan.ownership) {
    loan.ownership = {
      unit: "percent",
      step: OWNERSHIP_STEP,
      allocations: [{ user: MARKET_USER, percent: 100 }]
    };
    return;
  }

  const assigned = loan.ownership.allocations
    .filter(a => a.user !== MARKET_USER)
    .reduce((s, a) => s + a.percent, 0);

  const marketPct = Math.max(0, 100 - assigned);

  loan.ownership.allocations = [
    ...loan.ownership.allocations.filter(a => a.user !== MARKET_USER),
    { user: MARKET_USER, percent: marketPct }
  ];

// 🔑 ROI FIX: ensure user ownership exists
if (!Array.isArray(loan.ownerships)) {
  loan.ownerships = [];
}

if (!loan.ownerships.some(o => o.user === PAGE_USER)) {
  loan.ownerships.push({
    user: PAGE_USER,
    pct: loan.ownershipPct ?? 1   // fallback: full ownership
  });
}

  
}

// -------------------------------------
// Ownership helpers
// -------------------------------------
export function getUserOwnershipPct(loan, user) {
  return (
    loan.ownership?.allocations.find(a => a.user === user)?.percent ?? 0
  ) / 100;
}

export function isOwnedByUser(loan, user) {
  return getUserOwnershipPct(loan, user) > 0;
}

export function getMarketPct(loan) {
  return (
    loan.ownership?.allocations.find(a => a.user === MARKET_USER)?.percent ?? 0
  );
}
