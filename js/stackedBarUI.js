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

  // ---- Group per month ----
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

  container.appendChild(svg);

  return svg;
}

export function enableStackedBarInteractions({
  svg,
  table,
  tooltipFormatter
}) {
  if (!svg || !table) return;

  const rects = svg.querySelectorAll("rect");
  const rows = table.querySelectorAll("tbody tr");

  function clearHighlight() {
    rects.forEach(r => (r.style.opacity = "1"));
    rows.forEach(r => r.classList.remove("active"));
  }

  function highlightLoan(loanId) {
    rects.forEach(r => {
      r.style.opacity =
        r.dataset.loanId === loanId ? "1" : "0.25";
    });

    rows.forEach(r => {
      r.classList.toggle(
        "active",
        r.dataset.loanId === loanId
      );
    });
  }

  // ---- Chart → Table ----
  rects.forEach(rect => {
    rect.addEventListener("mouseenter", () =>
      highlightLoan(rect.dataset.loanId)
    );
    rect.addEventListener("mouseleave", clearHighlight);
  });

  // ---- Table → Chart ----
  rows.forEach(row => {
    row.addEventListener("mouseenter", () =>
      highlightLoan(row.dataset.loanId)
    );
    row.addEventListener("mouseleave", clearHighlight);
  });
}

export function renderTPVTable({
  container,
  data
}) {
  const rows = Object.values(data.seriesByLoan);

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Loan</th>
          <th style="text-align:right">Latest TPV</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(r => {
            const latest = r.values[r.values.length - 1] || 0;
            return `
              <tr data-loan-id="${r.loanId}">
                <td>
                  <span class="sw" style="background:${r.color}"></span>
                </td>
                <td>${r.loanName}</td>
                <td style="text-align:right">
                  $${latest.toLocaleString()}
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

