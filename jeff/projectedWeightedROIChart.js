/* ============================================================
   Projected Weighted ROI Chart (shared module)
   Exports:
     - buildProjectedRoiTimeline(loans)
     - createMultiSeriesChart(containerEl, perLoanSeries, weightedSeries, opts)
   ============================================================ */

const DEFAULT_LOAN_COLORS = [
  "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#64748b"
];

function formatMonthYear(date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function smoothPathFromPointsCubic(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    d += ` Q ${x0} ${y0}, ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  d += ` T ${points.at(-1)[0]} ${points.at(-1)[1]}`;
  return d;
}

/**
 * Expected per loan:
 *   loan.purchaseDate (string or date)
 *   loan.purchasePrice (number)
 *   loan.roiSeries = [{ date: Date, roi: number }, ...]  // ROI in decimal, e.g. 1.1828 for 118.28%
 *
 * This matches the ROI page’s existing timeline approach:
 * - Build global calendar-month dates from earliest purchase to latest ROI month
 * - Each loan provides ROI forward-filled across months after purchase
 * - Weighted line is purchasePrice-weighted average
 */
export function buildProjectedRoiTimeline(loans) {
  const cleanLoans = (loans || []).filter(l => Number(l.purchasePrice) > 0);

  if (!cleanLoans.length) {
    return { dates: [], perLoanSeries: [], weightedSeries: [] };
  }

  // earliest purchase month
  const purchases = cleanLoans.map(l => new Date(l.purchaseDate));
  const minPurchase = new Date(
    Math.min(...purchases.map(d => new Date(d.getFullYear(), d.getMonth(), 1).getTime()))
  );

  // latest ROI month across all loans (fallback to +1 month)
  let maxMonth = new Date(minPurchase);
  cleanLoans.forEach(l => {
    const series = Array.isArray(l.roiSeries) ? l.roiSeries : [];
    series.forEach(r => {
      if (!r?.date) return;
      const d = new Date(r.date);
      const m = new Date(d.getFullYear(), d.getMonth(), 1);
      if (m > maxMonth) maxMonth = m;
    });
  });

  // build global month list
  const dates = [];
  {
    const d = new Date(minPurchase);
    d.setHours(0, 0, 0, 0);
    const end = new Date(maxMonth);
    end.setHours(0, 0, 0, 0);

    // include end month
    while (d <= end) {
      dates.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
  }

  // per-loan forward-filled series
  const perLoanSeries = cleanLoans.map((loan, idx) => {
    const purchase = new Date(loan.purchaseDate);
    const purchaseMonth = new Date(purchase.getFullYear(), purchase.getMonth(), 1);

    const roiMap = {};
    let lastKnownROI = 0;

    (loan.roiSeries || []).forEach(r => {
      const d = new Date(r.date);
      const key = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 7);
      roiMap[key] = Number(r.roi ?? 0);
    });

    const data = dates.map(date => {
      if (date < purchaseMonth) return { date, y: null };

      const key = date.toISOString().slice(0, 7);
      if (roiMap[key] != null) lastKnownROI = roiMap[key];

      return { date, y: lastKnownROI };
    });

    const loanId = loan.id ?? loan.loanId ?? idx;

    return {
      id: loanId,
      name: loan.name || `Loan ${loanId}`,
      color: window.KPI_COLOR_MAP?.[loanId] || DEFAULT_LOAN_COLORS[idx % DEFAULT_LOAN_COLORS.length],
      data
    };
  });

  // weighted series
  const totalInvested = cleanLoans.reduce((s, l) => s + Number(l.purchasePrice || 0), 0) || 1;

  const weightedSeries = dates.map((date, i) => {
    let weightedSum = 0;
    cleanLoans.forEach((loan, loanIdx) => {
      const roi = perLoanSeries[loanIdx]?.data?.[i]?.y;
      if (roi != null) weightedSum += roi * Number(loan.purchasePrice || 0);
    });
    return { date, y: weightedSum / totalInvested };
  });

  return { dates, perLoanSeries, weightedSeries };
}

/**
 * Renders the multi-series ROI chart into containerEl (empties container).
 * Expects CSS variables:
 *   --border, --muted, --card
 */
export function createMultiSeriesChart(containerEl, perLoanSeries, weightedSeries, opts = {}) {
  if (!containerEl) return;

  containerEl.innerHTML = "";

  const w = opts.width || containerEl.clientWidth || 860;
  const h = opts.height || 320;
  const pad = 40;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(h));
  svg.style.overflow = "visible";

  const globalDates = opts.dates || [];
  if (!globalDates.length) {
    containerEl.appendChild(svg);
    return;
  }

  const minX = globalDates[0].getTime();
  const maxX = globalDates.at(-1).getTime();
  const rangeX = maxX - minX || 1;

  const dateToX = d =>
    pad + ((d.getTime() - minX) / rangeX) * (w - pad * 2);

  // y-range from all visible points (loan + weighted)
  const ys = [];
  perLoanSeries.forEach(ls => {
    (ls.data || []).forEach(p => {
      if (p?.y != null && Number.isFinite(p.y)) ys.push(p.y);
    });
  });
  (weightedSeries || []).forEach(p => {
    if (p?.y != null && Number.isFinite(p.y)) ys.push(p.y);
  });

  // fallback if empty
  if (!ys.length) {
    containerEl.appendChild(svg);
    return;
  }

  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;

  const yScale = y =>
    pad + (h - pad * 2) - ((y - minY) / rangeY) * (h - pad * 2);

  // GRID + Y LABELS
  for (let i = 0; i <= 4; i++) {
    const y = pad + (i / 4) * (h - pad * 2);

    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", pad);
    line.setAttribute("x2", w - pad);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "var(--border)");
    line.setAttribute("stroke-opacity", "0.16");
    svg.appendChild(line);

    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", pad - 4);
    lbl.setAttribute("y", y);
    lbl.setAttribute("text-anchor", "end");
    lbl.setAttribute("dominant-baseline", "middle");
    lbl.setAttribute("font-size", "10");
    lbl.setAttribute("fill", "var(--muted)");
    lbl.textContent = ((maxY - (i / 4) * rangeY) * 100).toFixed(1) + "%";
    svg.appendChild(lbl);
  }

  // LOAN LINES
  (perLoanSeries || []).forEach(ls => {
    const pts = (ls.data || [])
      .filter(p => p?.y != null)
      .map(p => [dateToX(p.date), yScale(p.y)]);

    if (!pts.length) return;

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", smoothPathFromPointsCubic(pts));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", ls.color || "#888");
    path.setAttribute("stroke-width", "1.2");
    path.setAttribute("stroke-opacity", "0.9");

    path.dataset.type = "loan";
    path.dataset.loanId = String(ls.id);

    svg.appendChild(path);
  });

  // WEIGHTED LINE
  if ((weightedSeries || []).length) {
    const pts = weightedSeries.map(p => [dateToX(p.date), yScale(p.y)]);
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", smoothPathFromPointsCubic(pts));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", opts.weightedColor || "#000");
    path.setAttribute("stroke-width", String(opts.weightedWidth || 2.6));
    path.dataset.type = "weighted";
    svg.appendChild(path);
  }

  // X-AXIS LABELS
  const tickSpacing = opts.tickSpacingX || 24;
  globalDates.forEach((d, i) => {
    if (i % tickSpacing !== 0) return;
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", dateToX(d));
    t.setAttribute("y", h - 4);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-size", "10");
    t.setAttribute("fill", "var(--muted)");
    t.textContent = formatMonthYear(d);
    svg.appendChild(t);
  });

  // TOOLTIP (reuse existing #tooltip if present, else create local)
  let tooltip = document.getElementById("tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.style.position = "fixed";
    tooltip.style.pointerEvents = "none";
    tooltip.style.zIndex = 9999;
    tooltip.style.padding = "6px 10px";
    tooltip.style.borderRadius = "8px";
    tooltip.style.border = "1px solid var(--border)";
    tooltip.style.background = "var(--card)";
    tooltip.style.color = "var(--text, #111827)";
    tooltip.style.fontSize = "12px";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
  }

  // HOVER vertical line
  const vLine = document.createElementNS(svgNS, "line");
  vLine.setAttribute("stroke", "#111827");
  vLine.setAttribute("stroke-dasharray", "3 4");
  vLine.setAttribute("stroke-opacity", "0.6");
  vLine.setAttribute("x1", "-9999");
  vLine.setAttribute("x2", "-9999");
  svg.appendChild(vLine);

  svg.addEventListener("mousemove", ev => {
    const rectSvg = svg.getBoundingClientRect();
    const mouseX = ev.clientX - rectSvg.left;

    const t = Math.max(0, Math.min(1, (mouseX - pad) / (w - pad * 2)));
    const idx = Math.round(t * (globalDates.length - 1));
    const p = weightedSeries?.[idx];
    if (!p) return;

    const x = dateToX(p.date);

    vLine.setAttribute("x1", x);
    vLine.setAttribute("x2", x);
    vLine.setAttribute("y1", pad);
    vLine.setAttribute("y2", h - pad);

    tooltip.style.display = "block";
    tooltip.style.left = ev.clientX + 10 + "px";
    tooltip.style.top = ev.clientY - 16 + "px";
    tooltip.innerHTML = `${formatMonthYear(p.date)} • ${(Number(p.y || 0) * 100).toFixed(2)}%`;
  });

  svg.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
    vLine.setAttribute("x1", "-9999");
    vLine.setAttribute("x2", "-9999");
  });

  containerEl.appendChild(svg);
}
