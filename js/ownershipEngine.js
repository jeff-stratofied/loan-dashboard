// =====================================================
// OWNERSHIP ENGINE — SINGLE SOURCE OF TRUTH
// =====================================================

export const OWNERSHIP_STEP = 5;
export const MARKET_USER = "Market";

// -------------------------------------
// Normalize ownership to always hit 100%
// -------------------------------------
export function normalizeOwnership(loan, user = null) {
  if (!loan.ownership) {
    loan.ownership = {
      unit: "percent",
      step: OWNERSHIP_STEP,
      allocations: []
    };
  }

  // -------------------------------------
  // Ensure user allocation exists
  // -------------------------------------
  if (user) {
    const hasUser = loan.ownership.allocations.some(
      a => a.user === user
    );

    if (!hasUser) {
      loan.ownership.allocations.push({
        user,
        percent: Number(loan.ownershipPct ?? 100)
      });
    }
  }

  // -------------------------------------
  // Recompute Market remainder
  // -------------------------------------
  const assigned = loan.ownership.allocations
    .filter(a => a.user !== MARKET_USER)
    .reduce((s, a) => s + a.percent, 0);

  const marketPct = Math.max(0, 100 - assigned);

  loan.ownership.allocations = [
    ...loan.ownership.allocations.filter(a => a.user !== MARKET_USER),
    { user: MARKET_USER, percent: marketPct }
  ];
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
