// js/charts/roi.js

export function renderProjectedWeightedROIChart({
  loans,
  container,
  tooltipEl,
  options = {}
}) {

  // PROJECTED ROI
export function buildProjectedRoiTimeline(loansWithAmort) {
  const dateSet = new Set();

  loansWithAmort.forEach(l => {
    l.roiSeries.forEach(p => {
      if (p.ownershipDate) {
        dateSet.add(p.ownershipDate.getTime());
      }
    });
  });

  const dates = Array.from(dateSet)
    .sort((a, b) => a - b)
    .map(t => new Date(t));

  const perLoanSeries = loansWithAmort.map(l => {
    const id = l.id ?? l.loanId;
    const color = window.KPI_COLOR_MAP?.[id] || "#64748b";

    const data = dates.map(d => {
      const p = l.roiSeries.find(r =>
        r.ownershipDate &&
        r.ownershipDate.getFullYear() === d.getFullYear() &&
        r.ownershipDate.getMonth() === d.getMonth()
      );
      return {
        date: d,
        y: p ? p.roi : null
      };
    });

    return { id, color, data };
  });

  const weightedSeries = dates.map((d, i) => {
    let totalInv = 0;
    let weighted = 0;

    loansWithAmort.forEach(l => {
      const p = l.roiSeries.find(r =>
        r.ownershipDate &&
        r.ownershipDate.getFullYear() === d.getFullYear() &&
        r.ownershipDate.getMonth() === d.getMonth()
      );
      if (p) {
        weighted += l.purchasePrice * p.roi;
        totalInv += l.purchasePrice;
      }
    });

    return {
      date: d,
      y: totalInv > 0 ? weighted / totalInv : 0
    };
  });

  return { dates, perLoanSeries, weightedSeries };
}

//  MULTI-SERIES ROI CHART WITH HOVER
export function createMultiSeriesChart(
  containerEl,
  loanSeriesList,
  weightedSeries,
  opts = {}
) {
  containerEl.innerHTML = "";
  const svgNS = "http://www.w3.org/2000/svg";

  const rect = containerEl.getBoundingClientRect();
  const w = Math.max(360, rect.width || 700);
  const h = opts.h || 260;
  const pad = opts.pad || 48;

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.display = "block";

  const globalDates = opts.dates || [];
  if (!globalDates.length) {
    containerEl.appendChild(svg);
    return;
  }

  const ms0 = globalDates[0].getTime();
  const ms1 = globalDates.at(-1).getTime();
  const msRange = ms1 - ms0 || 1;

  const dateToX = d =>
    pad + ((d.getTime() - ms0) / msRange) * (w - pad * 2);

  let ys = [];
  weightedSeries.forEach(p => ys.push(p.y));
  loanSeriesList.forEach(ls => ls.data.forEach(p => {
    if (p.y != null) ys.push(p.y);
  }));

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
  loanSeriesList.forEach(ls => {
    const pts = ls.data
      .filter(p => p.y != null)
      .map(p => [dateToX(p.date), yScale(p.y)]);

    if (!pts.length) return;

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", smoothPathFromPointsCubic(pts));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", ls.color);
    path.setAttribute("stroke-width", "1.2");
    path.setAttribute("stroke-opacity", "0.9");
    svg.appendChild(path);
  });

  // WEIGHTED LINE
  const wPts = weightedSeries.map(p => [dateToX(p.date), yScale(p.y)]);
  const wPath = document.createElementNS(svgNS, "path");
  wPath.setAttribute("d", smoothPathFromPointsCubic(wPts));
  wPath.setAttribute("fill", "none");
  wPath.setAttribute("stroke", opts.weightedColor || "#000");
  wPath.setAttribute("stroke-width", opts.weightedWidth || "2.6");
  svg.appendChild(wPath);

  // HOVER
  const vLine = document.createElementNS(svgNS, "line");
  vLine.setAttribute("stroke", "#111827");
  vLine.setAttribute("stroke-dasharray", "3 4");
  svg.appendChild(vLine);

  svg.addEventListener("mousemove", ev => {
    const r = svg.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (ev.clientX - r.left - pad) / (w - pad * 2)));
    const idx = Math.round(t * (globalDates.length - 1));
    const p = weightedSeries[idx];
    if (!p) return;

    const x = dateToX(p.date);
    const y = yScale(p.y);

    vLine.setAttribute("x1", x);
    vLine.setAttribute("x2", x);
    vLine.setAttribute("y1", pad);
    vLine.setAttribute("y2", h - pad);

    tooltip.style.display = "block";
    tooltip.style.left = ev.clientX + "px";
    tooltip.style.top = (ev.clientY - 14) + "px";
    tooltip.innerHTML = `${formatMonthYear(p.date)} • ${(p.y * 100).toFixed(2)}%`;
  });

  svg.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
    vLine.setAttribute("x1", -9999);
    vLine.setAttribute("x2", -9999);
  });

  containerEl.appendChild(svg);
}

  //SMOOTHING HELPER
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

  
  
}
