/*
  Dependencies expected on window:
  - drawer
  - drawerBody
  - drawerTitle
  - drawerSub
  - drawerChartArea
  - drawerExtra
  - amortBody
  - renderAmortChart
  - formatCurrency
  - offsetDateByMonths
*/
 
// -------------------------------
// LOCAL helpers (module-safe)
// -------------------------------
function monthsBetween(startDateStr, endDate = new Date()) {
  const start = new Date(startDateStr + "T00:00:00");
  let months =
    (endDate.getFullYear() - start.getFullYear()) * 12 +
    (endDate.getMonth() - start.getMonth()) +
    1;
  return Math.max(1, months);
}

function getCurrentMonthForLoanLocal(loan) {
  if (!loan?.amort?.schedule?.length) return 1;
  const months = monthsBetween(loan.loanStartDate);
  return Math.min(months, loan.amort.schedule.length);
}

function chartDateLabelLocal(startDateStr, monthIndex) {
  const d = new Date(startDateStr + "T00:00:00");
  d.setMonth(d.getMonth() + (monthIndex - 1));
  return d.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric"
  });
}

export function renderAmortLoanChart({
  loan,
  container,
  height = 240,
  compact = false
}) {
  container.innerHTML = '';

  const svgNS = 'http://www.w3.org/2000/svg';
  const h = height;
  const pad = compact ? 20 : 28;
  const w = container.getBoundingClientRect().width || 480;

  const schedule = loan.amort?.schedule || [];
  if (!schedule.length) {
    container.innerHTML = "<p>No schedule data available</p>";
    return;
  }

  const balances = schedule.map(s => ({ x: s.monthIndex, y: s.balance }));
  const cumP     = schedule.map(s => ({ x: s.monthIndex, y: s.cumPrincipal }));
  const cumI     = schedule.map(s => ({ x: s.monthIndex, y: s.cumInterest }));
  const cumT     = schedule.map(s => ({ x: s.monthIndex, y: s.cumTotal }));

  const allYs = [
    ...balances.map(p => p.y),
    ...cumP.map(p => p.y),
    ...cumI.map(p => p.y),
    ...cumT.map(p => p.y)
  ];

  const maxY = Math.max(...allYs);
  const minY = Math.min(...allYs);
  const range = Math.max(1, maxY - minY);

  const stepX = (w - pad * 2) / Math.max(1, schedule.length - 1);

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  function toXY(point, i) {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) -
      ((point.y - minY) / range) * (h - pad * 2);
    return [x, y];
  }

  function buildPath(arr) {
    return arr.map((p, i) => {
      const [x, y] = toXY(p, i);
      return (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    }).join(' ');
  }

  const series = [
    { data: balances, color: '#0f172a', width: 2 },
    { data: cumP,     color: '#06b6d4', width: 1.6 },
    { data: cumI,     color: '#a78bfa', width: 1.6 },
    { data: cumT,     color: '#fb7185', width: 1.4 }
  ];

  series.forEach(s => {
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', buildPath(s.data));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', s.color);
    path.setAttribute('stroke-width', s.width);
    svg.appendChild(path);
  });

  // ❌ no hover / tooltip in compact mode
  if (!compact) {
    // leave hover logic in renderAmortLoanDrawer
  }

  container.appendChild(svg);
}


export function renderAmortLoanDrawer(loan) {
  // ===============================
  // HARD RESET DRAWER STATE
  // ===============================
  currentMode = 'loan';
  currentLoan = loan;

  drawerChartArea.innerHTML = '';
  drawerExtra.innerHTML = '';
  drawerLegend.style.display = 'none';

  drawerAmortContainer.style.display = 'block';

  if (window.amortBody) {
    amortBody.innerHTML = '';
  }

  // ------------------------------------
  // Header
  // ------------------------------------
  drawerTitle.textContent = loan.name || loan.loanName || 'Loan';

  drawerSub.innerHTML = `
    <div>${loan.school || ''}</div>
    <div>
      Purchased ${loan.purchaseDate}
      • Orig Loan Amt ${formatCurrency(
        loan.purchasePrice || loan.origLoanAmt || 0
      )}
    </div>
  `;

  drawerPrimaryTitle.textContent = 'Purchase Price';
  drawerSecondaryTitle.textContent = 'Rate';
  drawerPrimary.textContent = formatCurrency(loan.purchasePrice || 0);
  drawerSecondary.textContent = `${(loan.nominalRate * 100).toFixed(2)}%`;

  // ------------------------------------
  // Build amort table
  // ------------------------------------
  const schedule = loan?.amort?.schedule || [];
  if (!schedule.length) {
    amortBody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No amort data</td></tr>';
    return;
  }

  const purchaseDate = new Date(loan.purchaseDate + 'T00:00:00');

  schedule.forEach(r => {
    const rowDate = new Date(loan.loanStartDate + 'T00:00:00');
    rowDate.setMonth(rowDate.getMonth() + (r.monthIndex - 1));

    const isBeforePurchase = rowDate < purchaseDate;
    const isPurchaseRow = rowDate.getTime() === purchaseDate.getTime();

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td style="text-align:left">
        ${offsetDateByMonths(loan.loanStartDate, r.monthIndex - 1)}
      </td>
      <td style="text-align:right">${formatCurrency(r.payment)}</td>
      <td style="text-align:right">${formatCurrency(r.principalPaid)}</td>
      <td style="text-align:right">${formatCurrency(r.interest)}</td>
      <td style="text-align:right">${formatCurrency(r.balance)}</td>
    `;

    if (isBeforePurchase) {
      tr.style.opacity = '0.45';
    }

    if (isPurchaseRow) {
      tr.querySelectorAll('td').forEach(td => {
        td.style.borderTop = '2px solid #22c55e';
      });
    }

    amortBody.appendChild(tr);
  });

  // ------------------------------------
  // Amort chart (shared renderer)
  // ------------------------------------
  drawerChartArea.innerHTML = '';

  drawerLegend.style.display = 'flex';
  drawerLegend.innerHTML = `
    <div class="item"><span class="sw" style="background:#0f172a"></span>Balance</div>
    <div class="item"><span class="sw" style="background:#06b6d4"></span>Cum Principal</div>
    <div class="item"><span class="sw" style="background:#a78bfa"></span>Cum Interest</div>
    <div class="item"><span class="sw" style="background:#fb7185"></span>Total</div>
  `;

  renderAmortLoanChart({
    loan,
    container: drawerChartArea,
    height: 240,
    compact: false
  });

  // ------------------------------------
  // Open drawer
  // ------------------------------------
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  drawerBody.scrollTop = 0;
}


