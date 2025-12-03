// js/loadLoans.js

const API_URL = "https://loan-dashboard-api.jeff-263.workers.dev/loans";

// -----------------------------
// GET loans
// -----------------------------
export async function saveLoans(loans, sha) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loans, sha })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return await res.json();
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
