// js/loadLoans.js

const API_URL = "https://loan-dashboard-api.jeff-263.workers.dev/loans";

// ----------------------------------------------------
// GET loans  (returns { loans, sha })
// ----------------------------------------------------
export async function loadLoans() {
  const raw = await fetchLoans();

  // Worker returns { loans:[...], sha:"..." }
  const items = Array.isArray(raw?.loans) ? raw.loans : [];

  return items.map((l, idx) => {
    return {
      id: l.loanId ?? idx + 1,
      loanName: l.loanName ?? `Loan ${idx + 1}`,
      name: l.loanName ?? `Loan ${idx + 1}`,
      school: l.school ?? "",

      loanStartDate: l.loanStartDate,
      purchaseDate:  l.purchaseDate,

      principal: Number(l.principal ?? l.purchasePrice ?? 0),
      purchasePrice: Number(l.purchasePrice ?? 0),

      nominalRate: Number(l.rate ?? 0),
      termYears: Number(l.termYears ?? 0),
      graceYears: Number(l.graceYears ?? 0),
    };
  });
}



// ----------------------------------------------------
// SAVE loans  (POST { loans, sha })
// ----------------------------------------------------
export async function saveLoans(loans, sha) {
  const payload = { loans };
  if (sha) payload.sha = sha;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Save API Error:", res.status, text);
    throw new Error(`Save error: ${res.status}`);
  }

  return await res.json();  // includes content.sha
}
