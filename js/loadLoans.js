// js/loadLoans.js

const API_URL = "https://loan-dashboard-api.jeff-263.workers.dev/loans";

// ----------------------------------------------------
// GET loans  (returns { loans, sha })
// ----------------------------------------------------
export async function loadLoans() {
  try {
    const res = await fetch(API_URL, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`GET error ${res.status}: ${txt}`);
    }

    const data = await res.json();

    // SAFETY: always ensure array exists
    if (!Array.isArray(data.loans)) {
      data.loans = [];
    }

    return data;

  } catch (err) {
    console.error("Error loading loans:", err);
    return { loans: [], sha: null };
  }
}


// ----------------------------------------------------
// SAVE loans  (POST { loans, sha })
// ----------------------------------------------------
export async function saveLoans(loans, sha) {
  const payload = { loans };
  if (sha) payload.sha = sha;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Save API Error:", res.status, text);
    throw new Error(`Save error: ${res.status}`);
  }

  return await res.json();  // includes content.sha
}
