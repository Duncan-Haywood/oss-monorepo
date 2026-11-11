// @ts-check
// The branded change report for several columns measured at the same points (multivariate.mjs): the same
// letterhead as the one-column report (report.mjs reportShell), then the reading that held up on labelled
// multi-column series first (each column's agreed changes, merged), the small-multiples chart the page shows,
// the merged list, each column's own list, the one-segmentation-for-all-columns table with each column's shift
// in its own noise sds, and the assumptions written for several columns. Pure: strings in, strings out; every
// typed string, column name and label escaped (the shell restricts the colour and logo).
import { esc, reportShell } from "./report.mjs";
import { multiChartSvg, agreedTableHtml, jointTableHtml } from "./multi-view.mjs";
import { jointNoiseNote } from "./multivariate.mjs";

/**
 * @param {{ cols: number[][], names: string[], labels: string[] }} p parsed columns (parseColumns)
 * @param {any} r analyzeMulti() on the same columns
 * @param {{ title?: string, author?: string, contact?: string, accent?: string, logo?: string, notes?: string, date?: string }} [o]
 */
export function multiReportHtml(p, r, o = {}) {
  const notes = (o.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lead = r.agreed.length
    ? `<p class="agreed"><strong>Agreed changes:</strong> ${r.agreed.length} change${r.agreed.length === 1 ? "" : "s"} that every one of six settings finds, column by column: ${r.agreed.slice(0, 12).map((/** @type {any} */ c) => `${esc(c.label)} (${esc(c.columns.join(", "))})`).join("; ")}${r.agreed.length > 12 ? `; and ${r.agreed.length - 12} more in the table below` : ""}.</p>`
    : `<p class="agreed"><strong>Agreed changes:</strong> no change that every setting agrees on in any of the ${r.columns.length} columns.</p>`;
  const warn = r.overcutWarning ? `<p class="warn"><strong>Read with care:</strong> ${esc(r.overcutWarning)}</p>` : "";
  const perColumn = `<table><thead><tr><th>Column</th><th class="n">Agreed changes</th><th>New segments from</th></tr></thead><tbody>` +
    r.perColumn.map((/** @type {any} */ c) => `<tr><td>${esc(c.column)}</td><td class="n">${c.changes.length}</td><td>${c.changes.length ? c.changes.slice(0, 20).map((/** @type {number} */ i) => esc(p.labels[i])).join(", ") + (c.changes.length > 20 ? `, and ${c.changes.length - 20} more` : "") : "none"}</td></tr>`).join("") + `</tbody></table>`;
  const noteBlock = notes.length ? `<h2>Analyst's notes</h2><ul>${notes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
  const model = r.model === "meanvar" ? "level and volatility" : "level";
  const body = `<h2>What changed</h2>
${lead}<p>${esc(r.columns.length)} columns (${esc(r.columns.join(", "))}), ${r.n} points${r.filled ? ` (${r.filled} missing cells carried forward)` : ""}. One segmentation for all columns: ${r.joint.length} change${r.joint.length === 1 ? "" : "s"}.</p>
${warn}
<p class="legend">grey: each column · solid blue: agreed change in that column · dashed red: one segmentation for all columns, with each segment's mean</p>
${multiChartSvg(p, r)}
<h2>Agreed changes, merged across columns</h2>
<p class="legend">Changes in different columns within ${r.tolerance} points count as one.</p>
<table><tbody>${agreedTableHtml(r)}</tbody></table>
<h2>Each column on its own</h2>
${perColumn}
<h2>One segmentation for all columns</h2>
<p class="legend">${esc(model)} model, penalty ${Number(r.penalty).toFixed(1)} per change${esc(jointNoiseNote(r))}. Each cell is the column's shift and, in brackets, that shift in the column's own noise sds; bold marks a shift of 1 sd or more${r.model === "meanvar" ? " or a volatility ratio of 1.5 or more either way" : ""}.</p>
<div style="overflow-x:auto"><table><tbody>${jointTableHtml(r, p)}</tbody></table></div>
${noteBlock}
<p class="assume"><strong>Assumptions and limits.</strong> Each column is checked alone with six settings of PELT (Killick, Fearnhead and Eckley 2012; level and slope models, with and without a noise floor or a trend with autocorrelated noise), and a change is listed when all six find it; on held-out labelled series this summary was the most reliable one the tool offers. The one segmentation for all columns sums each column's cost, scaled by that column's noise, and treats the columns as independent given the segments; it can cut a smooth, trending or autocorrelated column into steps. A change found in several columns at once is not evidence that one caused another, and <strong>a detected change does not show what caused it.</strong> ${r.columns.length} columns, ${r.n} points analysed. Statistical estimates from the supplied data, not advice; no warranty; check results before relying on them.</p>`;
  return reportShell({ ...o, title: (o.title || "").trim() || "Change report: several columns" }, body);
}
