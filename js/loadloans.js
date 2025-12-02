const LOANS_ENDPOINT = "https://loan-dashboard-api.jeff-263.workers.dev/loans";
const requestLoans = (...args) => globalThis["fetch"](...args);

export async function loadLoans(init) {
  const requestOptions = { method: "GET", ...(init || {}) };

  try {
    const res = await requestLoans(LOANS_ENDPOINT, requestOptions);

    if (requestOptions.method && requestOptions.method !== "GET") {
      return res;
    }

    if (!res.ok) throw new Error("API error: " + res.status);
    const data = await res.json();
    return data.loans || [];
  } catch (err) {
    console.error("Error loading loans:", err);
    return requestOptions.method && requestOptions.method !== "GET" ? null : [];
  }
}
