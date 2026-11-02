// @ts-check
// Branded print pack: the season on the organiser's own letterhead, as one page set to print or
// save as PDF. A cover (league name, season, logo, contact), the full schedule, one tear-off page
// per team (their games only, with home/away and a bye marked) and a rules/notes page. The schedule
// itself is never gated; this is presentation. Pure and self-contained: no network, every typed
// string escaped, the logo accepted only as a raster data: URL.
import { dayLabel, htmlEsc } from "./calc.mjs";

/** @param {string} c */
export function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c) : "#1f4e5f"; }

/** Only raster data URLs are allowed (no SVG, which can carry script). @param {string} u */
export function safeLogo(u) {
  const s = String(u || "");
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 700000 ? s : "";
}

/**
 * @param {any} schedule from buildSchedule
 * @param {{ league?: string, season?: string, accent?: string, logo?: string, contact?: string, notes?: string }} [o]
 */
export function printPackHtml(schedule, o = {}) {
  const league = htmlEsc((o.league || "").trim() || "League schedule");
  const season = htmlEsc((o.season || "").trim());
  const accent = safeColor(o.accent || "");
  const logo = safeLogo(o.logo || "");
  const contact = htmlEsc((o.contact || "").trim());
  const notes = (o.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const teams = schedule.teams;
  const head = `<header class="bar">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<div><strong>${league}</strong>${season ? ` <span>${season}</span>` : ""}</div></header>`;
  const timed = schedule.rounds.some((r) => r.matches.some((m) => m.time));
  const full = schedule.rounds.map((r) => {
    const rows = r.matches.map((m) => `<tr>${timed ? `<td>${htmlEsc(m.time)}</td>` : ""}<td>${htmlEsc(m.court)}</td><td>${htmlEsc(m.homeName)}</td><td>${htmlEsc(m.awayName)}</td></tr>`).join("");
    const bye = r.bye !== null && r.bye !== undefined ? `<p class="bye">Bye: ${htmlEsc(teams[r.bye])}</p>` : "";
    return `<section class="round"><h3>${htmlEsc(r.label)} <span>${htmlEsc(dayLabel(r.day))}</span></h3><table><thead><tr>${timed ? "<th>Time</th>" : ""}<th>Court</th><th>Home</th><th>Away</th></tr></thead><tbody>${rows}</tbody></table>${bye}</section>`;
  }).join("\n");
  const perTeam = teams.map((name, i) => {
    const rows = schedule.rounds.map((r) => {
      const m = r.matches.find((x) => x.home === i || x.away === i);
      if (m) {
        const home = m.home === i;
        return `<tr><td>${htmlEsc(dayLabel(r.day))}</td>${timed ? `<td>${htmlEsc(m.time)}</td>` : ""}<td>${htmlEsc(m.court)}</td><td>${home ? "Home" : "Away"}</td><td>${htmlEsc(home ? m.awayName : m.homeName)}</td></tr>`;
      }
      return r.bye === i ? `<tr class="bye"><td>${htmlEsc(dayLabel(r.day))}</td><td colspan="${timed ? 4 : 3}">Bye</td></tr>` : "";
    }).join("");
    return `<section class="sheet"><h2>${htmlEsc(name)}</h2><table><thead><tr><th>Date</th>${timed ? "<th>Time</th>" : ""}<th>Court</th><th></th><th>Opponent</th></tr></thead><tbody>${rows}</tbody></table>${contact ? `<p class="contact">Questions: ${contact}</p>` : ""}</section>`;
  }).join("\n");
  const noteBlock = notes.length ? `<section class="sheet"><h2>Rules and notes</h2><ul>${notes.map((l) => `<li>${htmlEsc(l)}</li>`).join("")}</ul></section>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%23471b7e'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='system-ui,sans-serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23fff'%3EL%3C/text%3E%3C/svg%3E"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${league}${season ? " " + season : ""}: season schedule</title>
<style>:root{--a:${accent}}body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:50rem;padding:1rem;color:#1a1a1a;background:#fff}.bar{display:flex;align-items:center;gap:.75rem;border-bottom:4px solid var(--a);padding-bottom:.5rem;margin-bottom:1rem}.bar span{color:#555}.logo{max-height:3.5rem;max-width:8rem}h1,h2,h3{color:var(--a)}h3 span{font-weight:400;color:#555}table{border-collapse:collapse;width:100%;margin-bottom:.75rem}th,td{text-align:left;padding:.35rem .5rem;border-bottom:1px solid #ccc}th{border-bottom:2px solid var(--a)}.bye,.bye td{color:#555;font-style:italic}.cover{text-align:center;padding:4rem 0;page-break-after:always}.cover .logo{max-height:9rem;max-width:18rem;margin-bottom:1.5rem}.cover h1{font-size:2.4rem;margin:.2rem 0}.sheet{page-break-before:always}.round{break-inside:avoid}.contact{margin-top:1.5rem}footer{color:#555;font-size:.85rem;margin-top:2rem}@media print{body{max-width:none}}</style></head>
<body>
<section class="cover">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<h1>${league}</h1>${season ? `<p>${season}</p>` : ""}<p>${teams.length} teams · ${schedule.rounds.length} rounds · ${htmlEsc(dayLabel(schedule.rounds[0]?.day ?? 0))} to ${htmlEsc(dayLabel(schedule.rounds[schedule.rounds.length - 1]?.day ?? 0))}</p>${contact ? `<p>${contact}</p>` : ""}</section>
${head}
<h2>Full schedule</h2>
${full}
${perTeam}
${noteBlock}
<footer>Made with the free league schedule generator. Check dates and venues with your organiser. <strong>No warranty.</strong> This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax or financial advice. You are responsible for reviewing and verifying its output before relying on it.</footer>
</body></html>
`;
}
