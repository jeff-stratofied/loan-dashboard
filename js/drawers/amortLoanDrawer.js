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


    export function renderAmortLoanDrawer(loan) {
// ===============================
// RESET DRAWER STATE (CRITICAL)
// ===============================
currentMode = 'loan';
currentLoan = loan;

// SHOW amort section again (KPI drawers hide it)
drawerAmortContainer.style.display = 'block';

// CLEAR KPI leftovers
drawerExtra.innerHTML = '';
drawerLegend.style.display = 'none';

// CLEAR chart area before re-render
drawerChartArea.innerHTML = '';

      
        if (typeof window.formatCurrency !== 'function') {
          throw new Error('formatCurrency is not available on window');
        }
      
      window.currentMode = 'loan';
      window.currentLoan = loan;

      drawerExtra.style.display = 'block';


     // ------------------------------------
    // ROI / Earnings–style amort header
    // ------------------------------------
    drawerTitle.textContent = loan.name || loan.loanName;
    
    drawerSub.innerHTML = `
      <div>${loan.school || ""}</div>
      <div>
        Purchased ${loan.purchaseDate}
        • Orig Loan Amt ${window.formatCurrency(
  loan.purchasePrice || loan.origLoanAmt || 0
)}

      </div>
    `;

      drawerPrimaryTitle.textContent = 'Purchase Price';
      drawerSecondaryTitle.textContent = 'Rate';
      drawerPrimary.textContent = `$${loan.purchasePrice.toLocaleString()}`;
      drawerSecondary.textContent = `${(loan.nominalRate * 100).toFixed(2)}%`;

  /* render amort rows */
drawerAmortContainer.style.display = 'block';
amortBody.innerHTML = '';

// *** THIS WAS MISSING — MUST EXIST BEFORE ANY DATE CHECKS ***
const purchaseDate = new Date(loan.purchaseDate + "T00:00:00");

// walk full amort schedule (from loan start),
// but mark purchase row and dim pre-purchase rows
loan.amort.schedule.forEach((r) => {

  // calendar date for this amortization row
  const rowDate = new Date(loan.loanStartDate + "T00:00:00");
  rowDate.setMonth(rowDate.getMonth() + (r.monthIndex - 1));

  const isBeforePurchase = rowDate < purchaseDate;
  const isPurchaseRow    = rowDate.getTime() === purchaseDate.getTime();

  const tr = document.createElement('tr');

  tr.innerHTML = `
    <td style="text-align:left">
  ${window.offsetDateByMonths(
    loan.loanStartDate,
    r.monthIndex - 1
  )}
</td>

    <td style="text-align:right">$${Number(r.payment).toFixed(2)}</td>
    <td style="text-align:right">$${Number(r.principalPaid).toFixed(2)}</td>
    <td style="text-align:right">$${Number(r.interest).toFixed(2)}</td>
    <td style="text-align:right">$${Number(r.balance).toFixed(2)}</td>
  `;

  // lighter rows before purchase date
  if (isBeforePurchase) {
    tr.style.opacity = "0.45";
  }

  // thin green horizontal line at the purchase row
  if (isPurchaseRow) {
    tr.querySelectorAll('td').forEach(td => {
      td.style.borderTop = "2px solid #22c55e";
    });
  }

  amortBody.appendChild(tr);
});




      /* build drawer chart (multi-line with legend & current date marker) */
      drawerChartArea.innerHTML = '';
      drawerLegend.style.display = 'flex';
      drawerLegend.innerHTML = `
        <div class="item"><span class="sw" style="background:#0f172a"></span>Balance</div>
        <div class="item"><span class="sw" style="background:#06b6d4"></span>Cum Principal</div>
        <div class="item"><span class="sw" style="background:#a78bfa"></span>Cum Interest</div>
        <div class="item"><span class="sw" style="background:#fb7185"></span>Total</div>
      `;

      const svgNS = 'http://www.w3.org/2000/svg';
       const h = 240;
        const pad = 28;

      
        // dynamic width from container
        const w = drawerChartArea.getBoundingClientRect().width || 480;

      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');

      // The dynamic engine stores everything inside loan.amort.schedule
    const schedule = loan.amort?.schedule || [];

    if (!schedule.length) {
    drawerChartArea.innerHTML = "<p>No schedule data available</p>";
    return;
    }

      // Build series
      const balances = schedule.map(s => ({ x: s.monthIndex, y: s.balance }));
      const cumP     = schedule.map(s => ({ x: s.monthIndex, y: s.cumPrincipal }));
      const cumI     = schedule.map(s => ({ x: s.monthIndex, y: s.cumInterest }));
      const cumT     = schedule.map(s => ({ x: s.monthIndex, y: s.cumTotal }));


      // global Y range for consistent scaling
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

// -------------------------
// Y AXIS (GRID + LABELS)
// -------------------------
const ySteps = 4;

for (let i = 0; i <= ySteps; i++) {
  const t = i / ySteps;
  const yVal = maxY - t * (maxY - minY);
  const y = pad + t * (h - pad * 2);

  const grid = document.createElementNS(svgNS, 'line');
  grid.setAttribute('x1', pad);
  grid.setAttribute('x2', w - pad);
  grid.setAttribute('y1', y);
  grid.setAttribute('y2', y);
  grid.setAttribute('stroke', 'var(--border)');
  grid.setAttribute('stroke-opacity', '0.25');
  svg.appendChild(grid);

  const label = document.createElementNS(svgNS, 'text');
  label.setAttribute('x', pad - 6);
  label.setAttribute('y', y);
  label.setAttribute('text-anchor', 'end');
  label.setAttribute('dominant-baseline', 'middle');
  label.setAttribute('font-size', '10');
  label.setAttribute('fill', 'var(--muted)');
  label.textContent = window.formatCurrency(yVal);
  svg.appendChild(label);
}

      // -------------------------
// X AXIS (DATE LABELS)
// -------------------------
const xTickEvery = Math.ceil(schedule.length / 6);

schedule.forEach((row, i) => {
  if (i % xTickEvery !== 0 && i !== schedule.length - 1) return;

  const x = pad + i * stepX;
  const label = document.createElementNS(svgNS, 'text');
  label.setAttribute('x', x);
  label.setAttribute('y', h - 6);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('font-size', '10');
  label.setAttribute('fill', 'var(--muted)');
  label.textContent = chartDateLabelLocal(
    loan.loanStartDate,
    row.monthIndex
  );
  svg.appendChild(label);
});


      
      function toXY(point, i) {
        const x = pad + i * stepX;
        const y = pad + (h - pad * 2) - ((point.y - minY) / range) * (h - pad * 2);
        return [x, y];
      }
      function buildPath(arr) {
        return arr.map((p, i) => {
          const [x, y] = toXY(p, i);
          return (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
        }).join(' ');
      }

      // subtle grid lines
      for (let gy = 0; gy < 5; gy++) {
        const y = pad + gy * ((h - pad * 2) / 4);
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', pad);
        line.setAttribute('x2', w - pad);
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#eef2f7');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
      }

      const pathBal = buildPath(balances);
      const pathP = buildPath(cumP);
      const pathI = buildPath(cumI);
      const pathT = buildPath(cumT);

      const elBal = document.createElementNS(svgNS, 'path');
      elBal.setAttribute('d', pathBal);
      elBal.setAttribute('fill', 'none');
      elBal.setAttribute('stroke', '#0f172a');
      elBal.setAttribute('stroke-width', '2');
      svg.appendChild(elBal);

      const elP = document.createElementNS(svgNS, 'path');
      elP.setAttribute('d', pathP);
      elP.setAttribute('fill', 'none');
      elP.setAttribute('stroke', '#06b6d4');
      elP.setAttribute('stroke-width', '1.6');
      svg.appendChild(elP);

      const elI = document.createElementNS(svgNS, 'path');
      elI.setAttribute('d', pathI);
      elI.setAttribute('fill', 'none');
      elI.setAttribute('stroke', '#a78bfa');
      elI.setAttribute('stroke-width', '1.6');
      svg.appendChild(elI);

      const elT = document.createElementNS(svgNS, 'path');
      elT.setAttribute('d', pathT);
      elT.setAttribute('fill', 'none');
      elT.setAttribute('stroke', '#fb7185');
      elT.setAttribute('stroke-width', '1.4');
      svg.appendChild(elT);

            // current date marker based on today's date vs. this loan's purchase date
      const curMonthForLoan = getCurrentMonthForLoanLocal(loan);
      const maxMonth = schedule.length;
      const curX = pad + (Math.max(1, Math.min(curMonthForLoan, maxMonth)) - 1) * stepX;

      const curLine = document.createElementNS(svgNS, 'line');
      curLine.setAttribute('x1', curX);
      curLine.setAttribute('x2', curX);
      curLine.setAttribute('y1', pad);
      curLine.setAttribute('y2', h - pad);
      curLine.setAttribute('stroke', '#111827');
      curLine.setAttribute('stroke-dasharray', '3 4');
      curLine.setAttribute('stroke-opacity', '0.6');
      svg.appendChild(curLine);

      // hover overlay (vertical line and circles)
      const vLine = document.createElementNS(svgNS, 'line');
      vLine.setAttribute('stroke', '#0f172a');
      vLine.setAttribute('stroke-width', '1');
      vLine.setAttribute('stroke-dasharray', '3 4');
      vLine.setAttribute('opacity', '0.6');
      svg.appendChild(vLine);

      const circles = document.createElementNS(svgNS, 'g');
      svg.appendChild(circles);

// Drawer hover interactions
svg.addEventListener('mousemove', (ev) => {
  const rect = svg.getBoundingClientRect();

// convert mouse X (pixels) → SVG units
const scaleX = w / rect.width;
const mouseX = (ev.clientX - rect.left) * scaleX;

let idx = Math.round((mouseX - pad) / stepX);
idx = Math.max(0, Math.min(schedule.length - 1, idx));

  idx = Math.max(0, Math.min(schedule.length - 1, idx));

  const px = pad + idx * stepX;
  const row = schedule[idx];

  // vertical hover line
  vLine.setAttribute('x1', px);
  vLine.setAttribute('x2', px);
  vLine.setAttribute('y1', pad);
  vLine.setAttribute('y2', h - pad);

  circles.innerHTML = '';

  // 4 series: Balance, Cum P, Cum I, Total
  const series = [
    { val: balances[idx].y, color: '#0f172a' },
    { val: cumP[idx].y,     color: '#06b6d4' },
    { val: cumI[idx].y,     color: '#a78bfa' },
    { val: cumT[idx].y,     color: '#fb7185' }
  ];

  // draw hover dots
  series.forEach(s => {
    const [cx, cy] = toXY({ y: s.val }, idx);
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', s.color);
    dot.setAttribute('stroke', '#fff');
    dot.setAttribute('stroke-width', '1.2');
    circles.appendChild(dot);
  });

  // Calendar date label
  const dateLabel = chartDateLabelLocal(
  loan.loanStartDate,
  row.monthIndex
);


  // Tooltip
  tooltip.style.display = 'block';
  tooltip.style.left = ev.clientX + 'px';
  tooltip.style.top = (ev.clientY - 10) + 'px';
  tooltip.innerHTML =
    `${dateLabel}<br>
     Balance $${row.balance.toLocaleString()}<br>
     Principal $${row.cumPrincipal.toLocaleString()}<br>
     Interest $${row.cumInterest.toLocaleString()}`;
}); // <-- closes mousemove listener

// Hide hover state on leave
svg.addEventListener('mouseleave', () => {
  vLine.setAttribute('y1', 0);
  vLine.setAttribute('y2', 0);
  circles.innerHTML = '';
  tooltip.style.display = 'none';
}); // <-- closes mouseleave listener


// OPEN FIRST
drawer.classList.add('open');
drawer.setAttribute('aria-hidden', 'false');
drawerBody.scrollTop = 0;

  drawerChartArea.appendChild(svg);
}

