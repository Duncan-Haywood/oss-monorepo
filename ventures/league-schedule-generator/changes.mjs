// Schedule-change emails for the self-hosted league page (server.mjs). When the organiser saves a
// published league, the season before and after the save are compared fixture by fixture (every match
// keeps its `fixture` id across rainouts, withdrawals and late teams), and each team whose own games
// moved, were cancelled or were added gets one email listing only those games. Past games are ignored.
// The browser page already offers paste-ready notices for rainouts (calc.mjs changeNotices); this
// covers any edit, and sends them on the organiser's own SMTP only when they tick the box. Zero dependencies.
import { dayLabel } from "./dates.mjs";

export const MAX_CHANGES_LISTED = 40; // per email; a rebuilt season is summarised, not listed in full

/** Every dated, fixture-tagged game on or after `today`, keyed by fixture id. */
function gamesFrom(schedule, today) {
  const out = new Map();
  if (!schedule?.rounds) return out;
  for (const r of schedule.rounds) for (const m of r.matches || []) {
    if (!m.fixture || r.day < today) continue;
    out.set(m.fixture, { fixture: m.fixture, day: r.day, time: m.time || "", court: m.court || "", home: schedule.teams[m.home], away: schedule.teams[m.away] });
  }
  return out;
}

/**
 * Fixtures that differ between two builds of the same league, from `today` on (a day number, as
 * dayNumber gives). Returns a list of { kind: "moved" | "cancelled" | "added", before, after } sorted
 * by the earlier of the two dates. A game moved from the past into the future counts as added; one
 * moved from the future into the past as cancelled. Renamed teams compare by fixture id, so a rename
 * alone reads as "moved" only if the date, time or court changed too.
 */
export function scheduleChanges(before, after, today) {
  const a = gamesFrom(before, today), b = gamesFrom(after, today);
  const out = [];
  for (const [id, g] of a) {
    const h = b.get(id);
    if (!h) out.push({ kind: "cancelled", before: g, after: null });
    else if (h.day !== g.day || h.time !== g.time || h.court !== g.court) out.push({ kind: "moved", before: g, after: h });
  }
  for (const [id, h] of b) if (!a.has(id)) out.push({ kind: "added", before: null, after: h });
  const when = (c) => Math.min(c.before?.day ?? Infinity, c.after?.day ?? Infinity);
  return out.sort((x, y) => when(x) - when(y) || (x.before || x.after).fixture.localeCompare((y.before || y.after).fixture));
}

const where = (g) => `${dayLabel(g.day)}${g.time ? " " + g.time : ""}${g.court ? ", " + g.court : ""}`;

/** One line of a team's email, from that team's side ("vs Owls (home)"). */
export function changeLine(c, team) {
  const g = c.after || c.before;
  const vs = g.home === team ? `vs ${g.away} (home)` : `at ${g.home} (away)`;
  if (c.kind === "moved") return `- ${vs}: was ${where(c.before)}, now ${where(c.after)}`;
  if (c.kind === "cancelled") return `- ${vs}: ${where(c.before)} is cancelled`;
  return `- ${vs}: new game, ${where(c.after)}`;
}

/**
 * The emails to send for `changes`: one per team with at least one changed game and at least one
 * address (its contacts, plus the organiser copied). Returns [{ team, to, subject, text }]. A team
 * with more than MAX_CHANGES_LISTED changes gets the first ones and a pointer to the league page.
 */
export function changeEmails(changes, { contacts = {}, organiser = "", leagueUrl = "", leagueName = "" } = {}) {
  const byTeam = new Map();
  for (const c of changes) {
    const teams = new Set([c.before?.home, c.before?.away, c.after?.home, c.after?.away].filter(Boolean));
    for (const t of teams) { if (!byTeam.has(t)) byTeam.set(t, []); byTeam.get(t).push(c); }
  }
  const out = [];
  for (const [team, list] of byTeam) {
    const own = Object.prototype.hasOwnProperty.call(contacts, team) && Array.isArray(contacts[team]) ? contacts[team] : [];
    const to = [...own];
    if (organiser && !to.includes(organiser)) to.push(organiser);
    if (!own.length) continue; // the organiser alone already knows what they changed
    const shown = list.slice(0, MAX_CHANGES_LISTED);
    const lines = [
      `Hi ${team}, the organiser changed ${list.length === 1 ? "one of your games" : `${list.length} of your games`}${leagueName ? ` in ${leagueName}` : ""}:`,
      ...shown.map((c) => changeLine(c, team)),
      ...(list.length > shown.length ? [`- and ${list.length - shown.length} more: see the league page.`] : []),
      "Your other games are unchanged.",
      leagueUrl ? `The league page and your calendar feed already show the new times: ${leagueUrl}` : "If you subscribed to the team calendar, it shows the new times once your app next reads the feed.",
      "",
      "Sent once by the league's own server when the organiser saved the change. Reply to the organiser with questions.",
    ];
    const first = list[0];
    const subject = list.length === 1
      ? `${team}: game ${first.kind === "cancelled" ? "cancelled" : first.kind === "added" ? "added" : "moved"} (${dayLabel((first.after || first.before).day)})`
      : `${team}: ${list.length} games changed`;
    out.push({ team, to, subject, text: lines.join("\n") });
  }
  return out;
}

/** A short summary for the admin page: "3 games changed for 4 teams (Hawks, Owls, ...)" or "". */
export function changeSummary(changes) {
  if (!changes.length) return "";
  const teams = new Set();
  for (const c of changes) for (const g of [c.before, c.after]) if (g) { teams.add(g.home); teams.add(g.away); }
  const names = [...teams];
  return `${changes.length} upcoming game${changes.length === 1 ? "" : "s"} changed for ${names.length} team${names.length === 1 ? "" : "s"} (${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""})`;
}
