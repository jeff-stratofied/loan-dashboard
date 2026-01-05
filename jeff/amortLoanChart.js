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
  const w = Math.max(300, container.getBoundingClientRect().width);

  const schedule = loan?.amort?.schedule || [];
  if (!schedule.length) return;

  const balances = schedule.map(s => s.balance);
  const maxY = Math.max(...balances, 1);

  const stepX = (w - pad * 2) / Math.max(1, schedule.length - 1);

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  const path = schedule.map((s, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (s.balance / maxY) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const line = document.createElementNS(svgNS, 'path');
  line.setAttribute('d', path);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'var(--accent)');
  line.setAttribute('stroke-width', '2.5');

  svg.appendChild(line);
  container.appendChild(svg);
}
