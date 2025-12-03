// js/loadLoans.js

const API_URL = "https://loan-dashboard-api.jeff-263.workers.dev/loans";

// -----------------------------
// GET loans
// -----------------------------
export async function loadLoans() {
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
    return data.loans || [];
  } catch (err) {
    console.error("Error loading loans:", err);
    return [];
  }
}

// -----------------------------
// SAVE loans (POST)
// -----------------------------
export async function saveLoans(loans) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ loans })
    });

    if (!res.ok) {
      console.error("Save API Error:", res.status, res.statusText);
      throw new Error(`Save error: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error("Error saving loans:", err);
    throw err;
  }
}
