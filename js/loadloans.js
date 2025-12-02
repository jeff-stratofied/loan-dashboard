// /js/loadLoans.js

export async function loadLoans() {
  const API = "https://loan-dashboard-github-app.jeff-263.workers.dev/";

  try {
    const res = await fetch(API, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    const loans = await res.json();

    if (!Array.isArray(loans)) {
      throw new Error("API did not return an array");
    }

    return loans;
  }
  catch (err) {
    console.error("loadLoans() error:", err);
    return [];
  }
}
