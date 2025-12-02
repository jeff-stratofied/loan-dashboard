export default {
  async fetch(request) {
    try {
      // Load JSON from GitHub
      const url = "https://raw.githubusercontent.com/jeff-stratofied/loan-dashboard-github-app/main/data/loans.json";
      const res = await fetch(url);

      if (!res.ok) {
        return new Response("Failed to load loans.json", { status: 500 });
      }

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

      // IMPORTANT: wrap in object — array alone causes Worker exception
      return Response.json({ loans: parsed_data_array });
    }
    catch (err) {
      return new Response(`Worker error: ${err.message}`, { status: 500 });
    }
  }
};
