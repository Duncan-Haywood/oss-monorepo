// Inline-SVG charts as strings, so the server and the browser demo draw the same thing.
import { formatMoney } from "./metrics.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// MRR line with stacked new/(churn) bars underneath. months: backfill()/state rows.
export function mrrChart(months, currency = "usd", { width = 760, height = 280 } = {}) {
  if (!months.length) return "";
  const pad = { l: 64, r: 12, t: 12, b: 28 }, w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const top = Math.max(1, ...months.map((m) => m.mrr)) * 1.1;
  const x = (i) => pad.l + (months.length === 1 ? w / 2 : (i * w) / (months.length - 1));
  const y = (v) => pad.t + h - (v / top) * h;
  const line = months.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m.mrr).toFixed(1)}`).join(" ");
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(top * f / 1.1).toFixed(1)}" y2="${y(top * f / 1.1).toFixed(1)}" stroke="currentColor" opacity=".12"/><text x="${pad.l - 6}" y="${(y(top * f / 1.1) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor">${esc(formatMoney(top * f / 1.1, currency))}</text>`).join("");
  const labels = months.map((m, i) => (months.length <= 8 || i % 2 === (months.length - 1) % 2 ? `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="11" fill="currentColor">${esc(m.month.slice(2))}</text>` : "")).join("");
  const dots = months.map((m, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(m.mrr).toFixed(1)}" r="3" fill="#4338ca"><title>${esc(m.month)}: ${esc(formatMoney(m.mrr, currency))} MRR, ${m.customers} customers</title></circle>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly recurring revenue by month" style="width:100%;height:auto;color:#4a4a63">${grid}<path d="${line}" fill="none" stroke="#4338ca" stroke-width="2.5"/>${dots}${labels}</svg>`;
}
