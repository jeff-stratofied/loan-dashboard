export default {
  async fetch(request) {
    try {
      const url = "https://raw.githubusercontent.com/jeff-stratofied/loan-dashboard-github-app/main/data/loans.json";

      const res = await fetch(url);

      if (!res.ok) {
        return new Response(
          `GitHub fetch failed: ${res.status} ${res.statusText}\nURL: ${url}`,
          { status: 500 }
        );
      }

      const raw = await res.json();

      return Response.json({ loans: raw.loans });
    }
    catch (err) {
      return new Response(
        `Worker error: ${err.message}`,
        { status: 500 }
      );
    }
  }
};
