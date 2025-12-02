// js/loadLoans.js

export async function loadLoans() {
  const API_URL = "https://loan-dashboard-api.jeff-263.workers.dev/loans";

  try {
    const res = await fetch(API_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      console.error("API Error:", res.status, res.statusText);
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();

    // Worker returns: { loans: [...], sha: "..." }
    return data.loans || [];
  } catch (err) {
    console.error("Error loading loans:", err);
    return [];
  }
}
