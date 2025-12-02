const API_URL = "https://loan-dashboard-api.jeff-263.workers.dev/loans";

export async function loadLoans() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Network error");

    const data = await res.json();
    return data.loans || [];
  } catch (err) {
    console.error("Error loading loans:", err);
    return [];
  }
}
