export async function loadLoans() {
  const API_URL = "https://loan-dashboard-api.jeff-263.workers.dev/loans";

  try {
    const res = await fetch(API_URL, { method: "GET" });
    if (!res.ok) throw new Error("API error: " + res.status);
    const data = await res.json();
    return data.loans || [];
  } catch (err) {
    console.error("Error loading loans:", err);
    return [];
  }
}
