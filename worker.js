const workerRequest = (...args) => globalThis["fetch"](...args);

async function loadLoans(request, init) {
  return workerRequest(request, init);
}

async function handleFetch(request) {
  try {
    const url = "https://raw.githubusercontent.com/jeff-stratofied/loan-dashboard/main/data/loans.json";

    const res = await loadLoans(url);
      if (!res.ok) {
        return new Response(
          `GitHub fetch failed: ${res.status} ${res.statusText}\nURL: ${url}`,
          { status: 500 }
        );
      }

      const raw = await res.json();

      const parsed = (raw.loans || raw).map(l => ({
        id: l.loanId ?? l.id,
        name: l.loanName ?? l.name,
        school: l.school,
        purchaseDate: l.purchaseDate,
        loanStartDate: l.loanStartDate,
        purchasePrice: Number(l.principal ?? l.purchasePrice),
        nominalRate: Number(l.rate ?? l.nominalRate),
        termYears: Number(l.termYears),
        graceYears: Number(l.graceYears)
      }));

    return Response.json(parsed);
  }
  catch (err) {
    return new Response("Worker error: " + err.message, { status: 500 });
  }
}

export default { fetch: handleFetch };
