// @ts-check
// Branded staff schedule pack: the week on the business's own letterhead. A wall copy (everyone's
// shifts in one grid) and one page per person to hand out or text as a PDF. No pay or wages appear
// anywhere on it, so it is safe to post. The roster itself is never gated; this is presentation.
// Pure, no network, every typed string escaped, the logo accepted only as a raster data: URL.
import { DAYS, fmtClock, num } from "./calc.mjs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** @param {unknown} s */
export const htmlEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
/** @param {string} c */
export function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c) : "#1f4e5f"; }
/** Only raster data URLs (an SVG can carry script). @param {string} u */
export function safeLogo(u) {
  const s = String(u || "");
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 700000 ? s : "";
}
/** @param {string|null|undefined} weekStart */
function labeler(weekStart) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekStart || ""));
  const base = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  return (/** @type {number} */ d) => {
    if (base === null) return DAYS[d];
    const dt = new Date(base + d * 86400000);
    return `${DAYS[d]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  };
}

/**
 * @param {any} roster from buildRoster
 * @param {{ business?: string, weekStart?: string|null, accent?: string, logo?: string, contact?: string, notes?: string }} [o]
 */
export function staffPackHtml(roster, o = {}) {
  const biz = htmlEsc((o.business || "").trim() || "Staff schedule");
  const accent = safeColor(o.accent || "");
  const logo = safeLogo(o.logo || "");
  const contact = htmlEsc((o.contact || "").trim());
  const notes = (o.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dl = labeler(o.weekStart);
  const week = o.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(o.weekStart) ? `Week of ${htmlEsc(dl(0))}` : "This week";
  const bar = `<header class="bar">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<div><h1 class="biz">${biz}</h1> <span>${week}</span></div></header>`;
  /** @type {Map<string, any[]>} */
  const by = new Map();
  for (const a of roster.assignments) {
    if (!a.person) continue;
    if (!by.has(a.person)) by.set(a.person, []);
    by.get(a.person)?.push(a.slot);
  }
  const sorted = (/** @type {string} */ n) => (by.get(n) || []).slice().sort((a, b) => a.day - b.day || a.startMin - b.startMin);
  const cell = (/** @type {any} */ s) => `${fmtClock(s.startMin)}-${fmtClock(s.endMin)}${s.label ? " " + htmlEsc(s.label) : ""}`;
  const names = roster.people.map((/** @type {any} */ p) => p.name);
  const head = `<tr><th>Person</th>${DAYS.map((_, d) => `<th>${htmlEsc(dl(d))}</th>`).join("")}</tr>`;
  const wall = names.map((/** @type {string} */ n) => `<tr><th>${htmlEsc(n)}</th>${DAYS.map((_, d) => `<td>${sorted(n).filter((s) => s.day === d).map(cell).join("<br>")}</td>`).join("")}</tr>`).join("");
  const open = roster.assignments.filter((/** @type {any} */ a) => !a.person);
  const openBlock = open.length ? `<p class="open"><strong>Still open:</strong> ${open.map((/** @type {any} */ a) => `${htmlEsc(dl(a.slot.day))} ${fmtClock(a.slot.startMin)}-${fmtClock(a.slot.endMin)}${a.slot.label ? " " + htmlEsc(a.slot.label) : ""}`).join("; ")}</p>` : "";
  const pages = roster.people.map((/** @type {any} */ p) => {
    const sl = sorted(p.name);
    const rows = sl.map((s) => `<tr><td>${htmlEsc(dl(s.day))}</td><td>${fmtClock(s.startMin)}-${fmtClock(s.endMin)}${s.endMin > 1440 ? " (next day)" : ""}</td><td>${htmlEsc(s.label || "")}</td><td>${htmlEsc(s.role || "")}</td></tr>`).join("");
    const body = sl.length ? `<table><thead><tr><th>Day</th><th>Time</th><th>Shift</th><th>Role</th></tr></thead><tbody>${rows}</tbody></table><p>Total ${num(p.hours)} hours.</p>` : "<p>You have no shifts this week.</p>";
    return `<section class="sheet"><h2>${htmlEsc(p.name)}</h2><p class="wk">${week}</p>${body}${contact ? `<p class="contact">Questions or swaps: ${contact}</p>` : ""}</section>`;
  }).join("\n");
  const noteBlock = notes.length ? `<section class="sheet"><h2>Notes</h2><ul>${notes.map((l) => `<li>${htmlEsc(l)}</li>`).join("")}</ul></section>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${biz}: staff schedule</title>
<style>:root{--a:${accent}}body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:60rem;padding:1rem;color:#1a1a1a;background:#fff}.bar h1{display:inline;font-size:1em;margin:0}.bar{display:flex;align-items:center;gap:.75rem;border-bottom:4px solid var(--a);padding-bottom:.5rem;margin-bottom:1rem}.bar span{color:#555}.logo{max-height:3.5rem;max-width:8rem}h2{color:var(--a)}table{border-collapse:collapse;width:100%;margin-bottom:.75rem}th,td{text-align:left;padding:.35rem .5rem;border:1px solid #ccc;vertical-align:top}thead th,tr:first-child th{border-bottom:2px solid var(--a)}.wk{color:#555}.open{color:#8a2a00}.sheet{page-break-before:always}.contact{margin-top:1.5rem}footer{color:#555;font-size:.85rem;margin-top:2rem}@media print{body{max-width:none}}</style></head>
<body>
${bar}
<h2>The week</h2>
<table><thead>${head}</thead><tbody>${wall}</tbody></table>
${openBlock}
${pages}
${noteBlock}
<footer>Made with the free shift roster builder. Check shifts against your own scheduling-notice, break and minor-labor rules. <strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax or financial advice. You are responsible for reviewing and verifying its output before relying on it.</footer>
</body></html>
`;
}
