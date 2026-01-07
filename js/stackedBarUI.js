// =======================================
// stackedBarUI.js
// Shared stacked bar chart + interactions
// =======================================

export function renderStackedBarChart({
  container,
  data,
  height = 220,
  padding = { top: 12, right: 16, bottom: 24, left: 44 }
}) {
  container.innerHTML = "";

  const width = container.clientWidth;
  const svgNS = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  const months = data.months;
  const series = Object.values(data.seriesByLoan);
  const maxTotal = Math.max(...data.totalsByMonth, 1);

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const barW = chartW / months.length;

  // ---- Y scale ----
  const yScale = v =>
    padding.top + chartH - (v / maxTotal) * chartH;

  // ---- Y axis ticks ----
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const v = (maxTotal / yTicks) * i;
    const y = yScale(v);

    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", padding.left);
    line.setAttribute("x2", width - padding.right);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "#e5e7eb");

    svg.appendChild(line);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", padding.left - 6);
    label.setAttribute("y", y + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#475569");
    label.textContent = `$${Math.round(v / 1000)}k`;

    svg.appendChild(label);
  }

  // ---- Bars ----
  months.forEach((month, i) => {
    let yOffset = 0;

    series.forEach(s => {
      const v = s.values[i];
      if (!v) return;

      const barH = (v / maxTotal) * chartH;
      const x = padding.left + i * barW;
      const y = padding.top + chartH - barH - yOffset;

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", Math.max(barW - 2, 1));
      rect.setAttribute("height", barH);
      rect.setAttribute("fill", s.color);

      rect.dataset.loanId = s.loanId;
      rect.dataset.monthIndex = i;

      svg.appendChild(rect);
      yOffset += barH;
    });
  });

  // ---- X axis labels ----
  months.forEach((m, i) => {
    if (i % Math.ceil(months.length / 6) !== 0) return;

    const x = padding.left + i * barW + barW / 2;

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", x);
    label.setAttribute("y", height - 6);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#475569");
    label.textContent = m;

    svg.appendChild(label);
  });

  container.appendChild(svg);
  return svg;
}

// =======================================
// Interactions
// =======================================

export function enableStackedBarInteractions({
  svg,
  table,
  tooltipFormatter
}) {
  if (!svg || !table) return;

  const rects = Array.from(svg.querySelectorAll("rect"));
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const toggles = Array.from(table.querySelectorAll(".loan-toggle"));
  const tooltip = document.getElementById("tooltip");

  function clearHighlight() {
    rects.forEach(r => (r.style.opacity = "1"));
    rows.forEach(r => r.classList.remove("active"));
    if (tooltip) tooltip.style.display = "none";
  }

  function highlightLoan(loanId) {
    rects.forEach(r => {
      r.style.opacity =
        r.dataset.loanId === loanId ? "1" : "0.25";
    });

    rows.forEach(r => {
      r.classList.toggle("active", r.dataset.loanId === loanId);
    });
  }

  rects.forEach(rect => {
    rect.addEventListener("mouseenter", e => {
      highlightLoan(rect.dataset.loanId);

      if (tooltip && tooltipFormatter) {
        tooltip.innerHTML = tooltipFormatter(rect);
        tooltip.style.display = "block";
        tooltip.style.left = e.clientX + 12 + "px";
        tooltip.style.top = e.clientY - 12 + "px";
      }
    });

    rect.addEventListener("mouseleave", clearHighlight);
  });

  rows.forEach(row => {
    row.addEventListener("mouseenter", () =>
      highlightLoan(row.dataset.loanId)
    );
    row.addEventListener("mouseleave", clearHighlight);
  });

  toggles.forEach(toggle => {
    toggle.addEventListener("change", () => {
      const loanId = toggle.dataset.loanId;
      const enabled = toggle.checked;

      rects.forEach(r => {
        if (r.dataset.loanId === loanId) {
          r.style.display = enabled ? "" : "none";
        }
      });

      const row = toggle.closest("tr");
      if (row) row.style.opacity = enabled ? "1" : "0.35";
    });
  });
}

// =======================================
// Table
// =======================================

export function renderTPVTable({ container, data }) {
  const rows = Object.values(data.seriesByLoan);

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Loan On/Off</th>
          <th>Loan</th>
          <th style="text-align:right">Latest TPV</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(r => {
            const latest = r.values.at(-1) || 0;
            return `
              <tr data-loan-id="${r.loanId}">
                <td><span class="sw" style="background:${r.color}"></span></td>
                <td><input type="checkbox" class="loan-toggle" data-loan-id="${r.loanId}" checked></td>
                <td>${r.loanName}</td>
                <td style="text-align:right">$${latest.toLocaleString()}</td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}
