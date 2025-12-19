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
