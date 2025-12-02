export default {
  async fetch(request) {
    // Load from GitHub repo
    const url = "https://raw.githubusercontent.com/jeff-stratofied/loan-dashboard-github-app/main/data/loans.json";
    const res = await fetch(url);
    const raw = await res.json();

    // Normalize schema
    const parsed_data_array = (raw.loans || []).map(l => ({
      id: l.loanId,
      name: l.loanName,
      school: l.school,
      purchaseDate: l.purchaseDate,
      loanStartDate: l.loanStartDate,
      purchasePrice: Number(l.principal),
      nominalRate: Number(l.rate),
      termYears: Number(l.termYears),
      graceYears: Number(l.graceYears)
    }));

    const loans = parsed_data_array;

    return Response.json(loans);
  }
};
