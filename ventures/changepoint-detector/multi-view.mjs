// @ts-check
// The page's view of several columns at once (multivariate.mjs): one small chart per column on a
// shared time axis, with the column-by-column agreed changes as solid marks (the reading that held
// up on labelled real series) and the one-segmentation-for-all-columns changes as dashed marks, then
// the two lists as tables and a per-point CSV. Pure: strings in, strings out; every label escaped.
import { esc, fmt } from "./report.mjs";

/**
 * @param {{ cols: number[][], names: string[], labels: string[] }} p parsed columns (parseColumns)
 * @param {any} r analyzeMulti() on the same columns
 */
export function multiChartSvg(p, r) {
  const W = 900, H = 110, GAP = 14, P = 44, n = p.labels.length;
  const X = (/** @type {number} */ i) => P + (i / Math.max(1, n - 1)) * (W - P - 10);
  const parts = [];
  const top = (/** @type {number} */ k) => k * (H + GAP);
  p.cols.forEach((c, k) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of c) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const pad = (hi - lo) * 0.06 || 1;
    const Y = (/** @type {number} */ v) => top(k) + 16 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - 22);
    parts.push(`<text x="${P}" y="${top(k) + 11}" font-size="12" font-weight="600" fill="#24323f">${esc(p.names[k])}</text>`);
    for (const t of [lo, hi]) parts.push(`<text x="${P - 6}" y="${Y(t) + 4}" font-size="10" text-anchor="end" fill="#4c5a68">${fmt(t)}</text>`);
    const step = Math.max(1, Math.floor(n / 1500));
    let d = "";
    for (let i = 0; i < n; i += step) d += `${d ? "L" : "M"}${X(i).toFixed(1)},${Y(c[i]).toFixed(1)}`;
    parts.push(`<path d="${d}" fill="none" stroke="#8aa1b1" stroke-width="1"/>`);
    // segment means of the joint fit, per column
    const segs = [0, ...r.joint.map((/** @type {any} */ j) => j.index), n];
    for (let s = 0; s + 1 < segs.length; s++) {
      let a = 0;
      for (let i = segs[s]; i < segs[s + 1]; i++) a += c[i];
      const m = a / (segs[s + 1] - segs[s]);
      parts.push(`<line x1="${X(segs[s]).toFixed(1)}" x2="${X(segs[s + 1] - 1).toFixed(1)}" y1="${Y(m).toFixed(1)}" y2="${Y(m).toFixed(1)}" stroke="#c0392b" stroke-width="2" opacity="0.7"/>`);
    }
    const y1 = top(k) + 14, y2 = top(k) + H;
    for (const j of r.joint) parts.push(`<line x1="${X(j.index - 0.5).toFixed(1)}" x2="${X(j.index - 0.5).toFixed(1)}" y1="${y1}" y2="${y2}" stroke="#c0392b" stroke-dasharray="3 3" opacity="0.6"/>`);
    for (const a of r.agreed) if (a.columns.includes(p.names[k])) parts.push(`<line x1="${X(a.index - 0.5).toFixed(1)}" x2="${X(a.index - 0.5).toFixed(1)}" y1="${y1}" y2="${y2}" stroke="#1f5f86" stroke-width="2.5"><title>${esc(a.label)}: agreed in ${esc(a.columns.join(", "))}</title></line>`);
  });
  const base = top(p.cols.length) - GAP + 4;
  const tickEvery = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += tickEvery) parts.push(`<text x="${X(i).toFixed(1)}" y="${base + 12}" font-size="11" text-anchor="middle" fill="#4c5a68">${esc(p.labels[i]).slice(0, 10)}</text>`);
  return `<svg viewBox="0 0 ${W} ${base + 18}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/** The agreed-changes table. @param {any} r */
export function agreedTableHtml(r) {
  if (!r.agreed.length) return `<tr><td>No change that every setting agrees on in any column.</td></tr>`;
  return `<tr><th>New segment from</th><th class="n">Columns</th><th>Found in</th></tr>` +
    r.agreed.map((/** @type {any} */ c) => `<tr><td>${esc(c.label)}</td><td class="n">${c.support} of ${c.of}</td><td>${esc(c.columns.join(", "))}</td></tr>`).join("");
}

/**
 * The joint-segmentation table: per change, the shift in each column in that column's noise sds and, under the
 * level-and-volatility model, how many times the column's sd grew or shrank (after over before). Given the parsed
 * columns p, the ratio is computed from the segments either side of the change.
 * @param {any} r
 * @param {{ cols: number[][] } | null} [p]
 */
export function jointTableHtml(r, p = null) {
  if (!r.joint.length) return `<tr><td>No change at this penalty.</td></tr>`;
  const vol = r.model === "meanvar" && p;
  const segs = [0, ...r.joint.map((/** @type {any} */ j) => j.index), r.n];
  const sd = (/** @type {number[]} */ c, /** @type {number} */ s, /** @type {number} */ t) => { let m = 0; for (let i = s; i < t; i++) m += c[i]; m /= t - s; let v = 0; for (let i = s; i < t; i++) v += (c[i] - m) ** 2; return Math.sqrt(v / Math.max(1, t - s - 1)); };
  const cell = (/** @type {any} */ s, /** @type {number} */ k, /** @type {number} */ ci) => {
    let out = `${fmt(s.shift)} (${s.sds >= 0 ? "+" : ""}${s.sds.toFixed(1)})`, bold = Math.abs(s.sds) >= 1;
    if (vol) {
      const a = sd(p.cols[ci], segs[k], segs[k + 1]), b = sd(p.cols[ci], segs[k + 1], segs[k + 2]);
      const ratio = a > 0 ? b / a : Infinity;
      out += ` · sd ×${Number.isFinite(ratio) ? ratio.toFixed(2) : "n/a"}`;
      if (ratio >= 1.5 || ratio <= 1 / 1.5) bold = true;
    }
    return `<td class="n"${bold ? ' style="font-weight:600"' : ""}>${out}</td>`;
  };
  return `<tr><th>New segment from</th>${r.columns.map((/** @type {string} */ c) => `<th class="n">${esc(c)} shift (noise sd)${vol ? " · sd after/before" : ""}</th>`).join("")}</tr>` +
    r.joint.map((/** @type {any} */ j, /** @type {number} */ k) => `<tr><td>${esc(j.label)}</td>${j.shifts.map((/** @type {any} */ s, /** @type {number} */ ci) => cell(s, k, ci)).join("")}</tr>`).join("");
}

/** One-line reading for the summary paragraph. @param {any} r */
export function multiSummary(r) {
  const head = `${r.columns.length} columns, ${r.n} points${r.filled ? ` (${r.filled} missing cells carried forward)` : ""}.`;
  const agreed = r.agreed.length
    ? ` Changes every setting agrees on, column by column: ${r.agreed.slice(0, 12).map((/** @type {any} */ c) => `${c.label} (${c.columns.join(", ")})`).join("; ")}${r.agreed.length > 12 ? `; and ${r.agreed.length - 12} more` : ""}.`
    : " No change that every setting agrees on in any column.";
  return `${head}${agreed} One segmentation for all columns: ${r.joint.length} change${r.joint.length === 1 ? "" : "s"}.`;
}

/**
 * Per-point CSV: label, each column's value, the joint segment, and the agreed-change marker.
 * @param {{ cols: number[][], names: string[], labels: string[] }} p
 * @param {any} r
 */
export function multiCsv(p, r) {
  const q = (/** @type {any} */ s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const starts = new Set(r.joint.map((/** @type {any} */ j) => j.index));
  const agreedAt = new Map(r.agreed.map((/** @type {any} */ a) => [a.index, a.columns.join(" ")]));
  const rows = [["label", ...p.names, "joint_segment", "agreed_change_in"].map(q).join(",")];
  let seg = 1;
  for (let i = 0; i < p.labels.length; i++) {
    if (starts.has(i)) seg++;
    rows.push([q(p.labels[i]), ...p.cols.map((c) => c[i]), seg, q(agreedAt.get(i) || "")].join(","));
  }
  return rows.join("\n");
}
