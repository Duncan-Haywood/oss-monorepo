// @ts-check
// Branded season pack: the schedule on the organiser's own letterhead (name, logo, accent
// colour, contact line), a master page, then one fridge-sheet page per team with only that
// team's fixtures. One self-contained printable page (Print, Save as PDF). The free
// schedule, CSV, calendar and score-sheet exports are unchanged; this is extra, never a
// paywall on the schedule itself.
import { htmlEsc, teamSchedule, dayLabel } from "./calc.mjs";

/** A logo may be an https URL or a PNG/JPEG/WebP/GIF data URL; SVG and anything else is dropped. @param {string} v */
export function cleanLogo(v) {
  const s = String(v || "").trim();
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 400000) return s;
  try { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password ? u.href : ""; } catch { return ""; }
}
/** @param {string} v */
export const cleanAccent = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "").trim()) ? String(v).trim() : "#1f3a5f");

/**
 * @param {any} schedule result of buildSchedule()
 * @param {{ title?: string, organiser?: string, season?: string, contact?: string, logo?: string, accent?: string, table?: any[]|null }} [o]
 */
export function seasonPackHtml(schedule, o = {}) {
  const accent = cleanAccent(o.accent || "");
  const logo = cleanLogo(o.logo || "");
  const title = htmlEsc(o.title || "League schedule");
  const head = (/** @type {string} */ sub) => `<header class="brand">${logo ? `<img src="${htmlEsc(logo)}" alt="" style="max-height:64px;max-width:200px">` : ""}<div><strong>${htmlEsc(o.organiser || "")}</strong>${o.season ? ` &middot; ${htmlEsc(o.season)}` : ""}<br><span class="small">${htmlEsc(o.contact || "")}</span></div></header><h1>${title}</h1><h2>${sub}</h2>`;
  const hasTime = schedule.rounds.some((/** @type {any} */ r) => r.matches.some((/** @type {any} */ m) => m.time));
  const master = schedule.rounds.map((/** @type {any} */ r) => {
    const rows = r.matches.map((/** @type {any} */ m) => `<tr>${hasTime ? `<td>${htmlEsc(m.time)}</td>` : ""}<td>${htmlEsc(m.court)}</td><td>${htmlEsc(m.homeName)}</td><td>${htmlEsc(m.awayName)}</td></tr>`).join("");
    const bye = r.bye !== null && r.bye !== undefined ? `<tr class="bye"><td colspan="4">Bye: ${htmlEsc(schedule.teams[r.bye])}</td></tr>` : "";
    return `<h3>${htmlEsc(r.label)} <span>${htmlEsc(dayLabel(r.day))}</span></h3><table><tbody>${rows}${bye}</tbody></table>`;
  }).join("");
  const stand = o.table ? `<h3>Standings</h3><table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead><tbody>${o.table.map((r) => `<tr><td>${r.rank}</td><td>${htmlEsc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.points}</td></tr>`).join("")}</tbody></table>` : "";
  const teams = schedule.teams.map((/** @type {string} */ name, /** @type {number} */ i) => {
    const rows = teamSchedule(schedule, i).map((r) => r.bye
      ? `<tr class="bye"><td>${htmlEsc(dayLabel(r.day))}</td><td colspan="4">Bye</td></tr>`
      : `<tr><td>${htmlEsc(dayLabel(r.day))}</td><td>${htmlEsc(r.time)}</td><td>${htmlEsc(r.court)}</td><td>${htmlEsc(r.venue)}</td><td>${htmlEsc(r.opponent)}</td></tr>`).join("");
    return `<section class="page">${head(htmlEsc(name))}<table><thead><tr><th>Date</th><th>Time</th><th>Court</th><th>H/A</th><th>Opponent</th></tr></thead><tbody>${rows}</tbody></table><p class="small">Dates can move for rainouts; check with your organiser.</p></section>`;
  }).join("");
  const css = `body{font:15px/1.45 system-ui,sans-serif;color:#1a1a1a;background:#fff;max-width:50rem;margin:0 auto;padding:1rem}.brand{display:flex;gap:1rem;align-items:center;border-bottom:3px solid ${accent};padding-bottom:.6rem;margin-bottom:1rem}h1,h2,h3{color:${accent}}h3 span{font-weight:400;color:#555}table{border-collapse:collapse;width:100%;margin-bottom:.8rem}th,td{text-align:left;padding:.3rem .5rem;border-bottom:1px solid #ccc}.bye td{color:#555;font-style:italic}.small{color:#555;font-size:.85rem}.page{page-break-before:always}@media print{body{max-width:none}}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${css}</style></head>
<body><section>${head("Full schedule")}${master}${stand}</section>
${teams}
<p class="small">Check dates and venues with your organiser before you travel.</p>
</body></html>
`;
}
