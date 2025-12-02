// =====================================
// chartEngine.js (all pages use this)
// Unified SVG chart renderer
// =====================================

export function createLineChart({
  container,
  width = 600,
  height = 240,
  pad = 32,
  labels,
  values,
  todayLineDate = null,        // Date for "Today" vertical line
  nextMonthLineDate = null,    // Optional "Next Month" line
  dateToMonthIndex = null,     // function(date) => monthIndex
}) {
  container.innerHTML = "";
  const svgNS = "http://www.w3.org/2000/svg";

  // Base SVG
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", height);
  container.appendChild(svg);

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  // Y-scaling
  const maxY = Math.max(...values, 0);
  const rangeY = Math.max(1, maxY);

  // X scaling
  const stepX = values.length > 1 ? innerW / (values.length - 1) : innerW;

  // -----------------------
  // Draw grid lines
  // -----------------------
  for (let i = 0; i < 5; i++) {
    const y = pad + (innerH / 4) * i;
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", pad);
    line.setAttribute("x2", width - pad);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "#e2e8f0");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
  }

  // -----------------------
  // Line Path
  // -----------------------
  let d = "";
  values.forEach((v, i) => {
    const x = pad + i * stepX;
    const y = pad + innerH - (v / rangeY) * innerH;
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#ef4444");
  path.setAttribute("stroke-width", "2.5");
  svg.appendChild(path);

  // -----------------------
  // Vertical lines (Today / Next Month)
  // -----------------------
  function drawVertical(date, color, dash = "4 4") {
    if (!date || !dateToMonthIndex) return;
    const idx = dateToMonthIndex(date);
    if (idx < 0 || idx >= values.length) return;

    const x = pad + idx * stepX;
    const vl = document.createElementNS(svgNS, "line");
    vl.setAttribute("x1", x);
    vl.setAttribute("x2", x);
    vl.setAttribute("y1", pad);
    vl.setAttribute("y2", height - pad);
    vl.setAttribute("stroke", color);
    vl.setAttribute("stroke-width", "2");
    vl.setAttribute("stroke-dasharray", dash);
    svg.appendChild(vl);
  }

  drawVertical(todayLineDate, "#94a3b8", "4 4");        // dotted grey
  drawVertical(nextMonthLineDate, "#0ea5e9", "4 4");    // dotted blue

  // -----------------------
  // Hover zones
  // -----------------------
  values.forEach((v, i) => {
    const x = pad + i * stepX;
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x - stepX / 2);
    rect.setAttribute("y", pad);
    rect.setAttribute("width", stepX);
    rect.setAttribute("height", innerH);
    rect.setAttribute("fill", "transparent");

    rect.addEventListener("mousemove", e => {
      window.chartTooltip.style.display = "block";
      window.chartTooltip.style.left = e.clientX + "px";
      window.chartTooltip.style.top = (e.clientY - 15) + "px";
      window.chartTooltip.innerHTML = `
        <strong>${labels[i]}</strong><br>
        $${v.toFixed(2)}
      `;
    });

    rect.addEventListener("mouseleave", () => {
      window.chartTooltip.style.display = "none";
    });

    svg.appendChild(rect);
  });

  // -----------------------
  // Return for extensions
  // -----------------------
  return svg;
}


This gives you perfectly aligned hovers, dotted vertical lines, consistent axis scaling, and matching charts across all pages.
