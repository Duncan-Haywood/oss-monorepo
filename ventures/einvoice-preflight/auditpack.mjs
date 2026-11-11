// Branded audit pack: a batch preflight run as one printable evidence document on the
// accountant's or finance team's own letterhead. Cover block (logo, name, contact, date),
// a summary, one row per file (pass / fail, finding counts), the findings grouped by rule
// with the fix, then a fixed statement of what a preflight does and does not show. The
// checks themselves are never gated; this is presentation. Pure, no network: every typed
// string, file name and finding is escaped, the logo is accepted only as a raster data: URL.
import { summarizePreflight, isBlocking, severityLabel } from "./report.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c) : "#1f5f86");
/** Only raster data URLs (an SVG can carry script). */
export function safeLogo(u) {
  const s = String(u || "");
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 700000 ? s : "";
}

const blocking = (r) => r.errors.filter(isBlocking).length;

/**
 * @param {{ reports: any[], readErrors: any[] }} result  from preflightDocuments()
 * @param {{ title?: string, author?: string, contact?: string, accent?: string, logo?: string, notes?: string, date?: string, scope?: string }} [o]
 */
export function auditPackHtml(result, o = {}) {
  const { reports, readErrors } = result;
  const sum = summarizePreflight(result);
  const title = esc((o.title || "").trim() || "E-invoice preflight audit pack");
  const meta = [o.author, o.date, o.contact].map((x) => esc((x || "").trim())).filter(Boolean).join(" · ");
  const accent = safeColor(o.accent);
  const logo = safeLogo(o.logo);
  const scope = esc((o.scope || "").trim());
  const notes = (o.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const files = reports.length
    ? `<table><thead><tr><th>File</th><th>Result</th><th class="n">Blocking</th><th class="n">Notes</th></tr></thead><tbody>` +
      reports.map((r) => {
        const b = blocking(r);
        return `<tr><td><code>${esc(r.file)}</code></td><td class="${b ? "fail" : "pass"}">${b ? "FAIL" : "PASS"}</td><td class="n">${b}</td><td class="n">${r.errors.length - b}</td></tr>`;
      }).join("") + `</tbody></table>`
    : `<p>No invoice was checked.</p>`;

  const rules = Object.keys(sum.ruleCounts).sort();
  const byRule = rules.length
    ? `<table><thead><tr><th>Rule</th><th class="n">Files</th><th class="n">Times</th><th>What the check found</th><th>Recommended fix</th></tr></thead><tbody>` +
      rules.map((rule) => {
        const inFiles = reports.filter((r) => r.errors.some((e) => e.rule === rule)).length;
        return `<tr><td><code>${esc(rule)}</code></td><td class="n">${inFiles}</td><td class="n">${sum.ruleCounts[rule]}</td><td>${esc(sum.ruleMessages[rule])}</td><td>${esc(sum.ruleFixes[rule])}</td></tr>`;
      }).join("") + `</tbody></table>`
    : `<p>No findings in the supported checks.</p>`;

  const detail = reports.filter((r) => r.errors.length).map((r) =>
    `<h3><code>${esc(r.file)}</code></h3><ul>` +
    r.errors.map((e) => `<li>${severityLabel(e) ? `<em>${severityLabel(e)}</em> ` : ""}<strong>${esc(e.rule)}</strong> at <code>${esc(e.path || "/")}</code>: ${esc(e.message)}<br><span class="fixline">Fix: ${esc(e.fix)}</span></li>`).join("") + `</ul>`).join("");

  const read = readErrors.length
    ? `<h2>Files that could not be read</h2><ul>${readErrors.map((e) => `<li><code>${esc(e.file)}</code>: ${esc(e.error)}</li>`).join("")}</ul>`
    : "";
  const noteBlock = notes.length ? `<h2>Preparer's notes</h2><ul>${notes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>:root{--a:${accent}}body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:54rem;padding:1rem;color:#1a1a1a;background:#fff}.bar{display:flex;align-items:center;gap:.75rem;border-bottom:4px solid var(--a);padding-bottom:.5rem;margin-bottom:1rem}.bar .logo{max-height:3.5rem;max-width:8rem}.bar small{display:block;color:#555}h1,h2{color:var(--a)}h1{margin:0;font-size:1.5rem}h3{font-size:1rem;margin:1rem 0 .25rem}table{border-collapse:collapse;width:100%;margin-bottom:.75rem}th,td{text-align:left;padding:.3rem .5rem;border-bottom:1px solid #ccc;vertical-align:top}th{border-bottom:2px solid var(--a)}.n{text-align:right}.pass{color:#1a6b2f;font-weight:700}.fail{color:#b3261e;font-weight:700}.verdict{font-size:1.1rem;font-weight:700}.fixline{color:#444}.assume{font-size:.85rem;color:#444;border-top:1px solid #ccc;margin-top:1.5rem;padding-top:.5rem}code{word-break:break-all}@media print{body{max-width:none}h2,h3{break-after:avoid}tr,li{break-inside:avoid}}</style></head>
<body>
<header class="bar">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<div><h1>${title}</h1><small>${meta}</small></div></header>
<h2>Summary</h2>
<p class="verdict ${sum.status === "pass" ? "pass" : "fail"}">Overall: ${sum.status.toUpperCase()}</p>
${scope ? `<p><strong>Scope:</strong> ${scope}</p>` : ""}
<p>${sum.filesChecked} invoice file(s) checked: ${sum.filesPassed} passed, ${sum.filesFailed} failed; ${sum.observations} observation(s) in all; ${sum.readErrors} file(s) could not be read.</p>
<h2>Result by file</h2>
${files}
<h2>Findings by rule</h2>
${byRule}
${detail ? `<h2>Findings by file</h2>${detail}` : ""}
${read}
${noteBlock}
<p class="assume"><strong>What this shows and does not show.</strong> A preflight runs this tool's published checks on the files supplied (EN 16931 arithmetic and mandatory-field rules, the profile and country rules named in the findings) before they are sent. A PASS means no supported check found a defect. It is <strong>not</strong> a declaration that an invoice is legally valid, accepted by a tax authority or access point, or compliant in any country; those rest on the authority's own validation at submission. Findings marked <em>note</em> are style observations the standard does not require. Observations from the supplied files only, not tax, legal or financial advice; no warranty; review each change before submitting an invoice.</p>
</body></html>
`;
}
