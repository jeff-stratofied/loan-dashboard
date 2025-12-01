// js/loadLoans.js
async function loadLoans() {
  const url = "https://raw.githubusercontent.com/jeff-stratofied/loan-dashboard/main/data/loans.json";
  const res = await fetch(url);

  if (!res.ok) {
    console.error("Failed to fetch loans.json", res.status, res.statusText);
    return [];
  }

  const json = await res.json();
  const loans = json.loans || [];

  return loans.map(loan => ({
    ...loan,
    loanStartDate: loan.loanStartDate || "",
  }));
}

window.loadLoans = loadLoans;
