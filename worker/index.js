export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/loans") {
      return new Response("Not Found", { status: 404, headers: corsHeaders() });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      if (request.method === "GET") {
        return await handleGet(env);
      }

      if (request.method === "PUT") {
        return await handlePut(request, env);
      }

      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
    } catch (err) {
      return jsonResponse({ error: err.message || "Unhandled error" }, 500);
    }
  }
};

const DEFAULT_REPO = "jeff-stratofied/loan-dashboard";
const DEFAULT_BRANCH = "main";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

async function handleGet(env) {
  const { loans, sha } = await fetchLoansFile(env);
  const normalized = normalizeLoans(loans);
  return jsonResponse({ loans: normalized, sha });
}

async function handlePut(request, env) {
  const body = await request.json();
  const incoming = Array.isArray(body) ? body : body.loans || [];
  const normalized = normalizeLoans(incoming);

  const payload = {
    loans: normalized
  };

  const { sha } = await fetchLoansFile(env);
  await writeLoansFile(env, payload, sha);

  return jsonResponse({ status: "ok", count: normalized.length });
}

function normalizeLoans(loans = []) {
  return loans.map((loan, idx) => {
    const purchasePrice = Number(loan.purchasePrice ?? loan.principal ?? 0);
    const nominalRate = Number(loan.nominalRate ?? loan.rate ?? 0);
    const termYears = Number(loan.termYears ?? 0);
    const graceYears = Number(loan.graceYears ?? 0);

    const purchaseDate = loan.purchaseDate || loan.loanStartDate || "";
    const loanStartDate = loan.loanStartDate || loan.purchaseDate || "";

    return {
      id: loan.id ?? loan.loanId ?? idx + 1,
      name: loan.name ?? loan.loanName ?? `Loan ${loan.loanId ?? idx + 1}`,
      school: loan.school ?? "Unknown",
      purchaseDate,
      loanStartDate,
      purchasePrice,
      nominalRate,
      termYears,
      graceYears
    };
  });
}

async function fetchLoansFile(env) {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const token = env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("Missing GITHUB_TOKEN secret");
  }

  const apiUrl = `https://api.github.com/repos/${repo}/contents/data/loans.json?ref=${branch}`;
  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (!res.ok) {
    throw new Error(`GitHub fetch failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const content = JSON.parse(atob(json.content || ""));
  const loans = Array.isArray(content) ? content : content.loans || [];

  return { loans, sha: json.sha };
}

async function writeLoansFile(env, data, sha) {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const token = env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("Missing GITHUB_TOKEN secret");
  }

  const body = {
    message: "Update loans dataset (via Worker)",
    content: btoa(JSON.stringify(data, null, 2)),
    sha,
    branch
  };

  const apiUrl = `https://api.github.com/repos/${repo}/contents/data/loans.json`;
  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub write failed: ${res.status} ${text}`);
  }
}
