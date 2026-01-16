// =====================================================
// OWNERSHIP ENGINE — SINGLE SOURCE OF TRUTH
// =====================================================

export const OWNERSHIP_STEP = 5;
export const MARKET_USER = "Market";

// -------------------------------------
// Normalize ownership to always hit 100%
// -------------------------------------
export function normalizeOwnership(loan) {
  // -------------------------------------
  // Case 1: Backend already sent ownership
  // -------------------------------------
  if (loan.ownership?.allocations?.length) return;

  const pct =
    Number.isFinite(loan.ownershipPct)
      ? loan.ownershipPct
      : 1; // fallback = full ownership

  // -------------------------------------
  // Normalize to allocation model
  // -------------------------------------
  loan.ownership = {
    unit: "percent",
    step: OWNERSHIP_STEP,
    allocations: [
      { user: PAGE_USER, percent: pct * 100 },
      { user: MARKET_USER, percent: Math.max(0, 100 - pct * 100) }
    ]
  };
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
