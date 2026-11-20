// Referees on the self-hosted league page (server.mjs). The organiser lists officials in the same
// format as the browser page (parseOfficials in calc.mjs: name, own team in brackets, weekdays, max N).
// Every game gets one official, and each official gets a private link (the league link plus a key, an
// HMAC of their name like a captain's) where they see their own games, add them to a calendar, give a
// game back when they cannot make it, and take any open game they are free for.
//
// Picks are kept per fixture id, which a game keeps across rainouts, withdrawals and late teams, so a
// moved game keeps its official. Every pick is re-checked against the hard rules each time the page is
// built (works that weekday, not from either team, one game per time slot, under the cap): a pick that a
// later change broke (the game moved to a night the official cannot work, their team joined the league)
// is dropped from the game and named for the organiser, never kept silently. Games with no pick are
// dealt by assignOfficials' rule (least loaded first). Saving in /admin pins those dealt picks, so
// adding an official later does not reshuffle games people were already told about.
// Zero dependencies.
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseOfficials, dayOfWeek, dayLabel } from "./calc.mjs";

export const LATE_DAYS = 2; // a game given back with fewer days' notice is flagged to the organiser
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const low = (s) => String(s ?? "").trim().toLowerCase();

/** An official's key: 22 base64url characters of an HMAC of their name under ADMIN_KEY. */
export function officialKey(secret, name) {
  return createHmac("sha256", String(secret)).update(`official\n${low(name)}`).digest("base64url").slice(0, 22);
}

/** The index of the official a key belongs to, or -1; every official compared in constant time. */
export function officialByKey(secret, officials, key) {
  const k = Buffer.from(String(key ?? ""));
  let found = -1;
  officials.forEach((o, i) => {
    const want = Buffer.from(officialKey(secret, o.name));
    if (want.length === k.length && timingSafeEqual(want, k)) found = i;
  });
  return found;
}

/** The officials list from the league's fields, read against its teams. */
export function readOfficials(fields, teams) {
  return parseOfficials(fields?.officials || "", teams);
}

/** Why official `o` (index i) cannot take game g, or "" if they can. ctx = { busy:Set, load:number[] }. */
function blocker(o, i, g, ctx) {
  if (o.days && !o.days.includes(dayOfWeek(g.day))) return "off that weekday";
  if (o.team === g.home || o.team === g.away) return "belongs to a team in the game";
  if (ctx.busy.has(`${i}|${g.day}|${g.time}`)) return "already on a game at that time";
  if (ctx.load[i] >= o.max) return "at their game cap";
  return "";
}

/**
 * Who officiates each game, from the saved picks and the rules. picks: { [fixture]: { name, via, at, by?, late? } }
 * where name "" marks a game an official gave back (open until someone takes it or the organiser fills it).
 * Returns { games: [{ fixture, day, time, court, home, away, homeName, awayName, label, official, via, late, by }],
 * conflicts: [{ game, name, why }], loads: number[] }. A game whose official is "" is open.
 */
export function settleOfficials(schedule, officials, picks = {}) {
  const games = [];
  for (const r of schedule?.rounds || []) for (const m of r.matches || []) {
    if (!m.fixture) continue;
    games.push({ fixture: m.fixture, day: r.day, time: m.time || "", court: m.court || "", home: m.home, away: m.away, homeName: schedule.teams[m.home], awayName: schedule.teams[m.away], label: r.label, official: "", via: "", late: false, by: "" });
  }
  games.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time) || a.court.localeCompare(b.court));
  const ctx = { busy: new Set(), load: officials.map(() => 0) };
  const index = new Map(officials.map((o, i) => [low(o.name), i]));
  const take = (g, i, via) => { g.official = officials[i].name; g.via = via; ctx.busy.add(`${i}|${g.day}|${g.time}`); ctx.load[i]++; };
  const conflicts = [];
  // Saved picks first, in date order, so a cap is spent on the games people were told about.
  for (const g of games) {
    const p = picks[g.fixture];
    if (!p) continue;
    if (p.name === "") { g.via = "open"; g.late = !!p.late; g.by = p.by || ""; continue; }
    const i = index.get(low(p.name));
    const why = i === undefined ? "is no longer on the officials list" : blocker(officials[i], i, g, ctx);
    if (why) { conflicts.push({ game: g, name: p.name, why }); g.via = "open"; g.by = p.name; continue; }
    take(g, i, p.via || "auto");
  }
  // Then deal the games nobody has picked: least loaded, then fewest games with these teams, then list order.
  const seen = officials.map(() => new Map());
  for (const g of games) if (g.official) { const i = index.get(low(g.official)); for (const t of [g.home, g.away]) seen[i].set(t, (seen[i].get(t) || 0) + 1); }
  for (const g of games) {
    if (g.official || g.via === "open") continue;
    const ok = officials.map((o, i) => i).filter((i) => !blocker(officials[i], i, g, ctx));
    if (!ok.length) { g.via = "none"; continue; }
    const s = (i) => (seen[i].get(g.home) || 0) + (seen[i].get(g.away) || 0);
    ok.sort((a, b) => ctx.load[a] - ctx.load[b] || s(a) - s(b) || a - b);
    take(g, ok[0], "dealt");
    for (const t of [g.home, g.away]) seen[ok[0]].set(t, (seen[ok[0]].get(t) || 0) + 1);
  }
  return { games, conflicts, loads: ctx.load, ctx };
}

/** Officials who could take an open game g as things stand (each under every rule), in list order. */
export function eligibleFor(settled, officials, g) {
  const ctx = rebuiltCtx(settled, officials);
  return officials.map((o, i) => i).filter((i) => !blocker(officials[i], i, g, ctx));
}

function rebuiltCtx(settled, officials) {
  const busy = new Set(), load = officials.map(() => 0), index = new Map(officials.map((o, i) => [low(o.name), i]));
  for (const g of settled.games) {
    if (!g.official) continue;
    const i = index.get(low(g.official));
    busy.add(`${i}|${g.day}|${g.time}`); load[i]++;
  }
  return { busy, load };
}

/**
 * Write every dealt pick into `picks` (so later changes to the list leave announced games alone) and drop
 * picks for fixtures the schedule no longer has. Returns the number of picks written.
 */
export function pinDealt(picks, settled, now = Date.now()) {
  const live = new Set(settled.games.map((g) => g.fixture));
  for (const f of Object.keys(picks)) if (!live.has(f)) delete picks[f];
  let n = 0;
  for (const g of settled.games) if (g.via === "dealt") { picks[g.fixture] = { name: g.official, via: "auto", at: now }; n++; }
  return n;
}

/** Forget the picks of games from `today` on (the organiser's "deal again"), keeping played games as they were. */
export function clearUpcoming(picks, settled, today) {
  let n = 0;
  for (const g of settled.games) if (g.day >= today && picks[g.fixture]) { delete picks[g.fixture]; n++; }
  return n;
}

/** An official's request from their page: { act: "drop"|"take", fixture }. */
export function parseOfficialRequest(form) {
  const act = String(form.get("act") || ""), fixture = String(form.get("fixture") || "");
  if (act !== "drop" && act !== "take") return { error: "Choose to give a game back or take one." };
  if (!/^[\w.-]{1,40}$/.test(fixture)) return { error: "That game is not on the schedule." };
  return { req: { act, fixture } };
}

/**
 * Apply an official's drop or take to `picks`. official = index into officials. Only games from `today` on.
 * A drop leaves the game open (flagged late inside LATE_DAYS); a take needs an open game the official is free for.
 * Returns { ok, game, message } or { error }.
 */
export function officialAction(picks, settled, officials, official, req, today, now = Date.now()) {
  const g = settled.games.find((x) => x.fixture === req.fixture);
  if (!g) return { error: "That game is not on the schedule any more." };
  if (g.day < today) return { error: "That game has already been played." };
  const me = officials[official];
  if (req.act === "drop") {
    if (low(g.official) !== low(me.name)) return { error: "You are not down for that game." };
    const late = g.day - today < LATE_DAYS;
    picks[g.fixture] = { name: "", via: "open", at: now, by: me.name, late };
    return { ok: true, game: g, late, message: `Given back: ${g.homeName} v ${g.awayName}, ${dayLabel(g.day)}${g.time ? " " + g.time : ""}. It is open for the other officials${late ? ", and the organiser has been told it is short notice" : ""}.` };
  }
  if (g.official) return { error: low(g.official) === low(me.name) ? "You are already down for that game." : "Someone took that game first." };
  if (!eligibleFor(settled, officials, g).includes(official)) {
    const ctx = rebuiltCtx(settled, officials);
    return { error: `You cannot take that game: you are ${blocker(me, official, g, ctx) || "not free for it"}.` };
  }
  picks[g.fixture] = { name: me.name, via: "taken", at: now };
  return { ok: true, game: g, message: `Yours: ${g.homeName} v ${g.awayName}, ${dayLabel(g.day)}${g.time ? " " + g.time : ""}, ${g.court}. It is in your calendar feed now.` };
}

/** The organiser sets a game's official (name) or opens it (name ""). The rules still hold. */
export function adminAssign(picks, settled, officials, fixture, name, now = Date.now()) {
  const g = settled.games.find((x) => x.fixture === fixture);
  if (!g) return { error: "That game is not on the schedule." };
  if (!name) { picks[fixture] = { name: "", via: "open", at: now, by: g.official || "" }; return { ok: true, game: g }; }
  const i = officials.findIndex((o) => low(o.name) === low(name));
  if (i < 0) return { error: `${name} is not on the officials list.` };
  if (low(g.official) === low(name)) return { ok: true, game: g };
  // Check against everyone else's games: free this game first.
  const without = { games: settled.games.map((x) => (x === g ? { ...x, official: "" } : x)) };
  if (!eligibleFor(without, officials, g).includes(i)) return { error: `${officials[i].name} cannot take ${g.homeName} v ${g.awayName}: ${blocker(officials[i], i, g, rebuiltCtx(without, officials))}.` };
  picks[fixture] = { name: officials[i].name, via: "organiser", at: now };
  return { ok: true, game: g };
}

/** Fill every open or unstaffed game from `today` on by the dealing rule; returns how many were filled. */
export function fillOpen(picks, settled, officials, today, now = Date.now()) {
  let filled = 0;
  let cur = settled;
  for (const g of settled.games) {
    if (g.day < today || g.official) continue;
    const ok = eligibleFor(cur, officials, g);
    if (!ok.length) continue;
    const load = rebuiltCtx(cur, officials).load;
    ok.sort((a, b) => load[a] - load[b] || a - b);
    picks[g.fixture] = { name: officials[ok[0]].name, via: "organiser", at: now };
    cur = { games: cur.games.map((x) => (x.fixture === g.fixture ? { ...x, official: officials[ok[0]].name } : x)) };
    filled++;
  }
  return filled;
}

/** The schedule with each match's `official` set from a settlement (for scheduleIcs' per-official feed). */
export function withOfficials(schedule, settled) {
  const by = new Map(settled.games.map((g) => [g.fixture, g.official]));
  const s = JSON.parse(JSON.stringify(schedule));
  for (const r of s.rounds) for (const m of r.matches) if (m.fixture) m.official = by.get(m.fixture) || "";
  return s;
}

const when = (g) => `${esc(dayLabel(g.day))}${g.time ? " " + esc(g.time) : ""}`;
const vs = (g) => `${esc(g.homeName)} v ${esc(g.awayName)}`;

/** An official's own section: their games, give-back buttons, the open games they can take, their calendar. */
export function officialHtml(settled, officials, official, { token, key, today, calendar = "" }) {
  const me = officials[official];
  const action = `/league/official?t=${esc(encodeURIComponent(token))}&amp;o=${esc(encodeURIComponent(key))}`;
  const btn = (g, act, label) => `<form method="post" action="${action}" style="display:inline"><input type="hidden" name="fixture" value="${esc(g.fixture)}"><button name="act" value="${act}">${label}</button></form>`;
  const mine = settled.games.filter((g) => g.day >= today && low(g.official) === low(me.name));
  const open = settled.games.filter((g) => g.day >= today && !g.official);
  const can = open.filter((g) => eligibleFor(settled, officials, g).includes(official));
  const rows = mine.map((g) => `<li>${when(g)}, ${esc(g.court)}: ${vs(g)} ${btn(g, "drop", "Can't make it")}</li>`).join("");
  const takes = can.map((g) => `<li>${when(g)}, ${esc(g.court)}: ${vs(g)}${g.late ? " <strong>(short notice)</strong>" : ""} ${btn(g, "take", "Take this game")}</li>`).join("");
  const capNote = Number.isFinite(me.max) ? ` You are down for ${settled.games.filter((g) => low(g.official) === low(me.name)).length} of your ${me.max}-game cap this season.` : "";
  return `<section id="official"><h2>${esc(me.name)}: your games</h2>${rows ? `<ul>${rows}</ul>` : "<p>You have no upcoming games.</p>"}<p class="note">"Can't make it" opens the game for the other officials straight away${LATE_DAYS ? ` (inside ${LATE_DAYS} days the organiser is told it is short notice)` : ""}.${capNote}</p>${calendar ? `<p>Your games in your calendar: ${calendar}</p>` : ""}<h3>Open games you can take</h3>${takes ? `<ul>${takes}</ul>` : "<p>None right now.</p>"}${open.length > can.length ? `<p class="note">${open.length - can.length} more open game${open.length - can.length === 1 ? "" : "s"} clash with your nights, your team or your other games.</p>` : ""}</section>`;
}

/** The league page's view: who officiates the next `nights` game days, open games marked. */
export function leagueOfficialsHtml(settled, today, nights = 2) {
  const up = settled.games.filter((g) => g.day >= today);
  const days = [...new Set(up.map((g) => g.day))].slice(0, nights);
  if (!days.length) return "";
  const rows = up.filter((g) => days.includes(g.day)).map((g) => `<li>${when(g)}, ${esc(g.court)}: ${vs(g)}: ${g.official ? esc(g.official) : "<em>no official yet</em>"}</li>`).join("");
  return `<h2>Officials</h2><ul>${rows}</ul>`;
}

/** The organiser's section: open and unstaffed games with an assign box, broken picks, loads, links, bulk actions. */
export function adminOfficialsHtml(settled, officials, { key, token, base = "", today, secret }) {
  const k = esc(key);
  const needs = settled.games.filter((g) => g.day >= today && !g.official);
  const assign = (g) => {
    const opts = eligibleFor(settled, officials, g).map((i) => `<option>${esc(officials[i].name)}</option>`).join("");
    return opts ? `<form method="post" action="/admin/official?key=${k}" style="display:inline"><input type="hidden" name="fixture" value="${esc(g.fixture)}"><select name="name" aria-label="Official">${opts}</select><button>Assign</button></form>` : `<span class="err">nobody on the list is free</span>`;
  };
  const why = (g) => g.by ? ` (given back by ${esc(g.by)}${g.late ? ", <strong>short notice</strong>" : ""})` : "";
  const needRows = needs.map((g) => `<li>${when(g)}, ${esc(g.court)}: ${vs(g)}${why(g)} ${assign(g)}</li>`).join("");
  const broken = settled.conflicts.filter((c) => c.game.day >= today).map((c) => `<li>${esc(c.name)} was on ${vs(c.game)} (${when(c.game)}) but ${esc(c.why)}, so the game is open.</li>`).join("");
  const loads = officials.map((o, i) => `<li>${esc(o.name)}: ${settled.loads[i]} game${settled.loads[i] === 1 ? "" : "s"}${Number.isFinite(o.max) ? ` of ${o.max}` : ""} — <a href="${esc(`${base || ""}/league?t=${encodeURIComponent(token)}&o=${officialKey(secret, o.name)}`)}">private link</a></li>`).join("");
  const bulk = `<form method="post" action="/admin/officials?key=${k}" style="display:inline"><button name="act" value="fill">Fill open games</button><button name="act" value="redeal" onclick="return confirm('Deal every upcoming game again? Officials may see their games change.')">Deal upcoming games again</button></form>`;
  return `<section id="officials"><h2>Officials</h2>${broken ? `<p class="err">A change broke these picks:</p><ul>${broken}</ul>` : ""}${needRows ? `<h3>Games with no official (${needs.length})</h3><ul>${needRows}</ul>` : "<p class=\"ok\">Every upcoming game has an official.</p>"}${bulk}<h3>Load and links</h3><ul>${loads}</ul><p class="note">Send each official their own private link: they see their games, add them to their calendar, give a game back and take open ones. A link stops working if you rename the official or change ADMIN_KEY.</p></section>`;
}

/** The organiser's email when an official gives a game back. */
export function droppedEmail(game, by, late, to, adminUrl = "") {
  return {
    to: [to],
    subject: `${late ? "Short notice: " : ""}${by} gave back ${game.homeName} v ${game.awayName}`,
    text: `${by} cannot officiate ${game.homeName} v ${game.awayName} on ${dayLabel(game.day)}${game.time ? " at " + game.time : ""} (${game.court}).\n\nThe game is open on the league page, and any official who is free can take it from their link.${adminUrl ? `\nAssign someone yourself: ${adminUrl}#officials` : ""}\n`,
  };
}
