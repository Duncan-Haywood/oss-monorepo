// @ts-check
// The branded change report for the wandering-level model (`--model drift`, drift-cli.mjs driftResult):
// the same letterhead as the other reports (report.mjs reportShell), then what the page shows for this
// model, in the same words (drift-view.mjs): the plain-language reading, the heavy-tail check and the
// benchmark score, the chart with the fitted level drawn per stretch, the jumps, the stretches between
// them, and assumptions written for a level that wanders. Pure: strings in, strings out; every typed
// string, column name and label escaped (the shell restricts the colour and logo).
import { esc, fmt, reportShell } from "./report.mjs";
import { driftSummary, driftNotes, driftChartSvg, driftTableHtml, driftSegmentsHtml } from "./drift-view.mjs";
import { DRIFT_PAPER } from "./drift-cli.mjs";

/**
 * @param {any} r driftResult() (or the page worker's copy of it)
 * @param {{ title?: string, author?: string, contact?: string, accent?: string, logo?: string, notes?: string, date?: string, ignored?: string[] }} [o]
 * o.ignored: page options the model did not use (drift-view.mjs driftIgnored), so the reader is told.
 */
export function driftReportHtml(r, o = {}) {
  const notes = (o.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ignored = (o.ignored || []).filter(Boolean);
  const warn = driftNotes(r).map((t) => `<p class="warn"><strong>Read with care:</strong> ${esc(t)}</p>`);
  if (ignored.length) warn.unshift(`<p class="warn">This model uses only the value column, the penalty and the steady-growth option; these settings were ignored: ${esc(ignored.join(", "))}.</p>`);
  const lead = r.changes.length
    ? `<p class="agreed"><strong>Jumps too big for the drift:</strong> ${r.changes.length}, the largest ${esc(biggest(r).label)} (${biggest(r).jump >= 0 ? "+" : ""}${fmt(biggest(r).jump)}, ${Math.abs(biggest(r).jumpSd).toFixed(1)} noise sd).</p>`
    : `<p class="agreed"><strong>No jump stands out from the drift.</strong> The movement in this series is explained by a level that wanders a little every step, not by a sudden change.</p>`;
  const noteBlock = notes.length ? `<h2>Analyst's notes</h2><ul>${notes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
  const fit = `Noise sd ${fmt(r.sigma)}; wander sd ${fmt(r.omega)} a step${r.noise === "ml" ? " (chosen together with the jumps by penalised likelihood)" : " (from lag differences)"}; penalty ${Number(r.penalty).toFixed(2)} per jump${r.slope ? `; a steady growth of ${fmt(r.slope)} a step taken out first` : ""}.`;
  const body = `<h2>What changed</h2>
${lead}<p>${esc(driftSummary(r))}</p>
${warn.join("\n")}
<p class="legend">● series · red line: fitted level, which may wander between jumps · dashed red: a jump</p>
${driftChartSvg(r)}
<h2>Jumps</h2>
<table><tbody>${driftTableHtml(r)}</tbody></table>
<h2>Stretches between jumps</h2>
<table><tbody>${driftSegmentsHtml(r)}</tbody></table>
<p class="legend">${esc(fit)}</p>
${noteBlock}
<p class="assume"><strong>Assumptions and limits.</strong> Between jumps the level is modelled as a random walk (it may wander a little every step) with independent Gaussian noise around it, following ${esc(DRIFT_PAPER.authors)} (${esc(DRIFT_PAPER.venue)}); each stretch is scored by a local-level Kalman filter and the best set of jumps is found exactly. Slow wander is not counted as a change, so a gradual shift spread over many steps will not be listed. Seasonality, a trend other than a steady growth, autocorrelated noise and heavy tails are not modelled; heavy-tailed or bursty series (prices, counts) can still show extra jumps. A listed jump shows that the data are better described with a sudden step there than by wander alone. <strong>It does not show what caused the change.</strong> ${r.n} points analysed. Statistical estimates from the supplied data, not advice; no warranty; check results before relying on them.</p>`;
  return reportShell({ ...o, title: (o.title || "").trim() || "Change report: jumps on a wandering level" }, body);
}

/** @param {any} r */
function biggest(r) { return r.changes.reduce((/** @type {any} */ a, /** @type {any} */ c) => (Math.abs(c.jumpSd) > Math.abs(a.jumpSd) ? c : a)); }
