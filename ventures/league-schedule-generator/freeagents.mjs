// Free agents for the self-hosted league page (server.mjs): a player with no team opens /join, types their
// name, email, how much they have played and (optionally) a friend to be placed with. The organiser sees
// them in /admin with a suggested team for each, chosen by the same search the balanced-teams page uses for
// late sign-ups (teams.mjs addLateSignups): rosters pinned, the smallest filled first, any tags the
// organiser asks about (a coed league's women, goalies) spread evenly, then team strength as even as it
// can be. The organiser places them one at a time or all at once. Placing a player adds them to that
// team's roster line (so availability, reminders and waivers see them at once) and, with SMTP on, emails
// the player their team and league link and tells the team's contacts who joined. Zero dependencies.
import { cleanName, EMAIL, MAX_ROSTER, parseRosters, parseContacts } from "./availability.mjs";
import { addLateSignups, parseTeamsCsv, MAX_PLAYERS } from "./teams.mjs";

export const MAX_FREE_AGENTS = 300; // waiting players; bounds the state file
export const MAX_NOTE = 300;
export const MAX_PER_ADDRESS = 5; // joins from one address per hour
export const LEVELS = { 1: "New to the sport", 2: "Played a season or two", 3: "Experienced" };
export const MAX_TAG_QUESTIONS = 4;
export const MAX_SHEET = 20000; // characters of the optional ratings sheet
const HOUR = 60 * 60 * 1000;
const levelLabel = (n) => (Object.hasOwn(LEVELS, n) ? LEVELS[n] : "");

const tidy = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const lower = (s) => String(s).toLocaleLowerCase();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The tag questions the organiser asks on /join: "Woman=F, Goalie=G" (label=tag), or plain labels
 * ("Goalie", whose tag is GOALIE). The tag is what the balanced-teams sheet uses, so a free agent's
 * "Woman" counts with the sheet's F players. Returns [{ label, tag }], at most MAX_TAG_QUESTIONS.
 */
export function faTagQuestions(text) {
  const out = [], seen = new Set();
  for (const part of String(text ?? "").split(/[,\n]/)) {
    const [l, t] = part.split("=");
    const label = tidy(l).replace(/[<>"]/g, "").slice(0, 30);
    if (!label) continue;
    const tag = tidy(t ?? label).toUpperCase().replace(/[\s/+|&,]+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 20);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag); out.push({ label, tag });
    if (out.length >= MAX_TAG_QUESTIONS) break;
  }
  return out;
}

/** Settings the organiser types in /admin, cleaned: { open, fee, target, closes, tagQuestions }. */
export function faSettings(f = {}) {
  const closes = /^\d{4}-\d{2}-\d{2}$/.test(String(f.faCloses || "").trim()) ? String(f.faCloses).trim() : "";
  return {
    open: Boolean(f.faOpen),
    fee: tidy(f.faFee).slice(0, 60),
    target: Math.min(MAX_ROSTER, Math.max(0, Math.trunc(Number(f.faTarget) || 0))),
    closes,
    tagQuestions: faTagQuestions(f.faTags),
  };
}

/** Why /join is closed right now, or "" when it is open. `today` is "YYYY-MM-DD" (UTC). */
export function faClosedReason(f, today) {
  const s = faSettings(f);
  if (!s.open) return "The organiser is not taking free agents right now.";
  if (s.closes && today > s.closes) return `Free-agent sign-ups closed on ${s.closes}.`;
  return "";
}

/**
 * A /join form post -> { req } or { error }; a filled honeypot ("website") -> { spam: true }.
 * `taken` is the free agents already waiting, so the same name and email cannot join twice.
 */
export function parseFreeAgent(form, taken = [], fields = {}) {
  if (String(form.get("website") || "").trim()) return { spam: true };
  const n = cleanName(form.get("name"));
  if (n.error) return { error: n.error };
  if (/[:,;<>"]/.test(n.name)) return { error: "Use letters, spaces, hyphens and apostrophes in your name (no : , ; < > or quotes), so it fits on a roster line." };
  const email = tidy(form.get("email"));
  if (!EMAIL.test(email) || email.length > 200) return { error: "Type your email address, so the organiser can tell you your team." };
  if (taken.some((a) => lower(a.email) === lower(email) && lower(a.name) === lower(n.name))) return { error: `${n.name} is already on the free-agent list with that email.` };
  const phone = tidy(form.get("phone"));
  if (phone && !/^[0-9+()./ -]{6,30}$/.test(phone)) return { error: "Type the phone number with digits, spaces and + ( ) - only, or leave it blank." };
  const level = Number(form.get("level"));
  if (!levelLabel(level)) return { error: "Pick how much you have played." };
  let withName = "";
  if (tidy(form.get("with"))) {
    const w = cleanName(form.get("with"));
    if (w.error) return { error: `Friend: ${w.error}` };
    withName = w.name;
  }
  const note = String(form.get("note") || "").replace(/\r\n/g, "\n").trim();
  if ([...note].length > MAX_NOTE) return { error: `Keep the note to ${MAX_NOTE} characters.` };
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(note)) return { error: "The note has characters the page cannot show." };
  const asked = faTagQuestions(fields.faTags);
  const picked = new Set(typeof form.getAll === "function" ? form.getAll("tag").map(String) : []);
  const tags = asked.filter((q) => picked.has(q.tag)).map((q) => q.tag);
  return { req: { name: n.name, email, phone, level, with: withName, note, tags } };
}

/** Per-address limit: true when this address may post another join now. Mutates `hits`. */
export function allowJoin(hits, who, now = Date.now(), max = MAX_PER_ADDRESS) {
  if (hits.size > 5000) hits.clear();
  const list = (hits.get(who) || []).filter((t) => now - t < HOUR);
  if (list.length >= max) { hits.set(who, list); return false; }
  list.push(now);
  hits.set(who, list);
  return true;
}

/** Store a parsed free agent. Returns { agent } or { error } when the list is full. Ids only grow. */
export function addFreeAgent(state, req, now = Date.now()) {
  state.freeAgents = state.freeAgents || [];
  if (state.freeAgents.length >= MAX_FREE_AGENTS) return { error: "The organiser has too many free agents to place. Try again later, or contact them directly." };
  state.faSeq = (state.faSeq || 0) + 1;
  const agent = { id: state.faSeq, ...req, at: now };
  state.freeAgents.push(agent);
  return { agent };
}

/**
 * Friend groups among the waiting players. A player's "with" names another waiting player by full name,
 * or by first name when exactly one waiting player has it; anything else (a name on a team already, two
 * players called Sam) is not guessed and the player stands alone. Groups are kept to `max` players.
 * Returns groups as arrays of agents, in sign-up order of their first member.
 */
export function friendGroups(agents, max = 4) {
  const idx = new Map(agents.map((a, i) => [a.id, i]));
  const parent = agents.map((_, i) => i), size = agents.map(() => 1);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byFull = new Map(), byFirst = new Map();
  for (const a of agents) {
    const full = lower(a.name), first = full.split(" ")[0];
    byFull.set(full, byFull.has(full) ? null : a);
    byFirst.set(first, byFirst.has(first) ? null : a);
  }
  for (const a of agents) {
    if (!a.with) continue;
    const w = lower(a.with);
    const b = byFull.get(w) ?? (w.includes(" ") ? undefined : byFirst.get(w));
    if (!b || b.id === a.id) continue;
    const x = find(idx.get(a.id)), y = find(idx.get(b.id));
    if (x === y || size[x] + size[y] > max) continue;
    parent[y] = x; size[x] += size[y];
  }
  const groups = new Map();
  for (const a of agents) { const r = find(idx.get(a.id)); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(a); }
  return [...groups.values()];
}

/**
 * Suggested teams for the waiting players. Groups go in order of most experience first (then sign-up
 * order), each to the team with the fewest players (roster plus suggestions so far), ties broken by the
 * lowest total experience already placed there by free agents, then by the team's order. A team at the
 * target roster size (0 = none) takes no one, and a group that fits no team is left unplaced with the
 * reason. Returns { picks: Map(agentId -> team), unplaced: [{ agent, why }] }.
 */
function leastFilled(state, teams) {
  const f = state.fields || {}, s = faSettings(f);
  const rosters = parseRosters(f.rosters, teams).rosters;
  const count = new Map(teams.map((t) => [t, (Object.prototype.hasOwnProperty.call(rosters, t) ? rosters[t] : []).length]));
  const xp = new Map(teams.map((t) => [t, 0]));
  for (const p of state.placedAgents || []) if (xp.has(p.team)) xp.set(p.team, xp.get(p.team) + p.level);
  const groups = friendGroups(state.freeAgents || []);
  const weight = (g) => g.reduce((s, a) => s + a.level, 0) / g.length;
  groups.sort((a, b) => weight(b) - weight(a) || b.length - a.length || a[0].at - b[0].at || a[0].id - b[0].id);
  const picks = new Map(), unplaced = [];
  for (const g of groups) {
    const fits = teams.filter((t) => count.get(t) + g.length <= (s.target || MAX_ROSTER));
    if (!fits.length) { for (const a of g) unplaced.push({ agent: a, why: g.length > 1 ? `no team has room for ${g.length} together` : "every team is at the roster size you set" }); continue; }
    let best = fits[0];
    for (const t of fits) if (count.get(t) < count.get(best) || (count.get(t) === count.get(best) && xp.get(t) < xp.get(best))) best = t;
    for (const a of g) picks.set(a.id, best);
    count.set(best, count.get(best) + g.length);
    xp.set(best, xp.get(best) + g.reduce((s, a) => s + a.level, 0));
  }
  return { picks, unplaced };
}

const tagsOfAgent = (a) => (Array.isArray(a.tags) ? a.tags : []);

/**
 * The optional ratings sheet: the balanced-teams page's CSV (Team, Player, Rating, Tag), pasted in /admin,
 * read by player name. Returns { byName: Map(lower name -> { rating, tags }), lo, hi, mid, errors }.
 */
export function readSheet(text) {
  const { teams, errors } = parseTeamsCsv(String(text ?? "").slice(0, MAX_SHEET));
  const byName = new Map();
  for (const T of teams) for (const p of T.players) byName.set(lower(p.name), { rating: p.rating, tags: p.tags });
  const r = [...byName.values()].map((x) => x.rating).sort((a, b) => a - b);
  const lo = r.length ? r[0] : 1, hi = r.length ? r[r.length - 1] : 3;
  const mid = r.length ? (r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2) : 2;
  return { byName, lo, hi, mid, errors: errors.slice(0, 5) };
}

/** Team totals and tag counts for a placement, on the same ratings the fit used. */
function measure(base, add, teams) {
  const total = new Map(teams.map((t) => [t, 0])), size = new Map(teams.map((t) => [t, 0]));
  const tc = new Map();
  const put = (t, p) => {
    total.set(t, total.get(t) + p.rating); size.set(t, size.get(t) + 1);
    for (const g of p.tags) { if (!tc.has(g)) tc.set(g, new Map(teams.map((x) => [x, 0]))); tc.get(g).set(t, tc.get(g).get(t) + 1); }
  };
  base.forEach((T, i) => T.players.forEach((p) => put(teams[i], p)));
  for (const [p, t] of add) put(t, p);
  const v = [...total.values()];
  let tagExcess = 0;
  for (const m of tc.values()) { const c = [...m.values()]; tagExcess += Math.max(0, Math.max(...c) - Math.min(...c) - 1); }
  return { spread: Math.round((Math.max(...v) - Math.min(...v)) * 1000) / 1000, tagExcess, size };
}

/**
 * Suggested teams for the waiting players. Who can be placed at all is decided as before (groups that fit
 * under the roster size the organiser set; the rest are named with the reason). Those players are then
 * placed by teams.mjs's late-sign-up search: every rostered player pinned to their team, friends kept
 * together, team sizes evened up (the smallest rosters fill first) and capped at the roster size, each tag
 * the organiser asks about on /join spread so its count per team differs by at most one, then the gap
 * between the strongest and weakest team total made as small as it can be. Ratings: a free agent's level
 * (1-3), or with a ratings sheet pasted, the sheet's rating for a named player and the level mapped onto the
 * sheet's range for the rest. The answer is kept only when it is no worse than the least-filled rule on
 * (tags kept, gap); otherwise, or with under two teams or too many players, the least-filled rule stands.
 * Returns { picks: Map(agentId -> team), unplaced: [{ agent, why }], fit: { by, spread, leastFilledSpread,
 * tagsSplitBy, notes } }.
 */
export function suggestPlacements(state, teams) {
  const old = leastFilled(state, teams);
  const f = state.fields || {}, s = faSettings(f);
  const notes = [];
  const fit = (by, extra = {}) => ({ ...old, fit: { by, notes, ...extra } });
  if (teams.length < 2 || !old.picks.size) return fit("least-filled");
  const sheet = readSheet(f.faSheet);
  if (sheet.errors.length) notes.push(`Ratings sheet: ${sheet.errors[0]}`);
  const useSheet = sheet.byName.size > 0;
  const fromLevel = (lv) => (useSheet && sheet.hi > sheet.lo ? sheet.lo + ((lv - 1) / 2) * (sheet.hi - sheet.lo) : useSheet ? sheet.mid : lv);
  const rosters = parseRosters(f.rosters, teams).rosters;
  const placedBy = new Map((state.placedAgents || []).map((a) => [`${lower(a.team)}\n${lower(a.name)}`, a]));
  let unknown = 0;
  const before = { teams: teams.map((t, ti) => ({
    name: t,
    players: (Object.prototype.hasOwnProperty.call(rosters, t) ? rosters[t] : []).map((nm, j) => {
      const sh = sheet.byName.get(lower(nm)), pa = placedBy.get(`${lower(t)}\n${lower(nm)}`);
      const rating = sh ? sh.rating : pa ? fromLevel(pa.level) : (unknown++, useSheet ? sheet.mid : 2);
      const tags = sh ? sh.tags : pa ? tagsOfAgent(pa) : [];
      return { name: `r${ti}.${j}`, rating, tags, tag: tags.join(" ") };
    }),
  })) };
  const waiting = (state.freeAgents || []).filter((a) => old.picks.has(a.id));
  const players = waiting.map((a) => ({ name: `a${a.id}`, rating: fromLevel(a.level), tags: tagsOfAgent(a), tag: tagsOfAgent(a).join(" ") }));
  const together = friendGroups(waiting).filter((g) => g.length > 1).map((g) => g.map((a) => `a${a.id}`));
  if (players.length + before.teams.reduce((n, T) => n + T.players.length, 0) > MAX_PLAYERS) {
    notes.push(`Over ${MAX_PLAYERS} players in all, so the least-filled rule picked the teams.`);
    return fit("least-filled");
  }
  const cap = teams.map(() => s.target || MAX_ROSTER);
  let res;
  try {
    res = addLateSignups({ players, together, apart: [], drop: [] }, before, { maxMoves: 0, capacity: cap });
  } catch (e) {
    notes.push(`The balanced search stopped (${e.message}), so the least-filled rule picked the teams.`);
    return fit("least-filled");
  }
  const byInternal = new Map(waiting.map((a, i) => [`a${a.id}`, [a, players[i]]]));
  const picks = new Map(), add = [];
  for (const l of res.late) { const [a, p] = byInternal.get(l.name); picks.set(a.id, l.team); add.push([p, l.team]); }
  const oldAdd = waiting.map((a, i) => [players[i], old.picks.get(a.id)]);
  const mNew = measure(before.teams, add, teams), mOld = measure(before.teams, oldAdd, teams);
  const overCap = teams.some((t, i) => mNew.size.get(t) > cap[i] && mNew.size.get(t) > before.teams[i].players.length);
  const together_ok = together.every((g) => new Set(g.map((nm) => picks.get(byInternal.get(nm)[0].id))).size === 1);
  if (unknown && useSheet) notes.push(`${unknown} rostered player${unknown === 1 ? " is" : "s are"} not on the ratings sheet, so counted at its middle rating (${sheet.mid}).`);
  const extra = { spread: mNew.spread, leastFilledSpread: mOld.spread, tagsSplitBy: mNew.tagExcess, leastFilledTagsSplitBy: mOld.tagExcess };
  if (picks.size !== old.picks.size || overCap || !together_ok || mNew.tagExcess > mOld.tagExcess || (mNew.tagExcess === mOld.tagExcess && mNew.spread > mOld.spread + 1e-9)) {
    return fit("least-filled", { spread: mOld.spread, leastFilledSpread: mOld.spread, tagsSplitBy: mOld.tagExcess, leastFilledTagsSplitBy: mOld.tagExcess });
  }
  return { picks, unplaced: old.unplaced, fit: { by: "balanced", notes, ...extra } };
}

const addLine = (text, line) => { const prev = String(text || "").replace(/\s+$/, ""); return (prev ? prev + "\n" : "") + line; };

/**
 * Place free agent `id` on `team`: the name goes at the end of that team's roster line (a new line when the
 * team has none), the player leaves the waiting list and is kept in placedAgents with the team. Refuses a
 * team not on the list, a full roster, or a name the roster already has (the organiser renames one first).
 */
export function placeFreeAgent(state, id, team, teams, now = Date.now()) {
  const list = state.freeAgents || [], i = list.findIndex((a) => a.id === id);
  if (i < 0) return { error: "That player is no longer waiting." };
  const t = teams.find((x) => lower(x) === lower(team));
  if (!t) return { error: "Pick a team from the list." };
  const a = list[i], f = { ...state.fields };
  const roster = parseRosters(f.rosters, teams).rosters;
  const names = Object.prototype.hasOwnProperty.call(roster, t) ? roster[t] : [];
  if (names.length >= MAX_ROSTER) return { error: `${t} already has ${MAX_ROSTER} players on its roster.` };
  if (names.some((x) => lower(x) === lower(a.name))) return { error: `${t}'s roster already has a ${a.name}. Change one of the names (a last initial is enough) before placing.` };
  const lines = String(f.rosters || "").split(/\r?\n/);
  const at = lines.findIndex((l) => { const c = l.indexOf(":"); return c > 0 && lower(l.slice(0, c).trim()) === lower(t); });
  if (at >= 0) { lines[at] = lines[at].replace(/\s+$/, "") + (lines[at].slice(lines[at].indexOf(":") + 1).trim() ? ", " : " ") + a.name; f.rosters = lines.join("\n"); }
  else f.rosters = addLine(f.rosters, `${t}: ${a.name}`);
  state.fields = f;
  list.splice(i, 1);
  const placed = { ...a, team: t, placedAt: now };
  state.placedAgents = [...(state.placedAgents || []), placed].slice(-MAX_FREE_AGENTS);
  return { agent: placed };
}

/** Take a waiting free agent off the list (the player is not emailed). */
export function removeFreeAgent(state, id) {
  const list = state.freeAgents || [], i = list.findIndex((a) => a.id === id);
  if (i < 0) return { error: "That player is no longer waiting." };
  const [agent] = list.splice(i, 1);
  return { agent };
}

/**
 * The two emails a placement sends: the player gets their team, the team's contact addresses (so they can
 * reach the captain) and the league link; the team's contacts get the player's name, email, phone, level
 * and note. Either is left out when it has nobody to go to. The organiser is copied on both.
 */
export function placedEmails(state, agent, teams, { organiser = "", leagueUrl = "" } = {}) {
  const contacts = parseContacts(state.fields?.contacts, teams).contacts;
  const to = Object.prototype.hasOwnProperty.call(contacts, agent.team) && Array.isArray(contacts[agent.team]) ? contacts[agent.team] : [];
  const cc = organiser ? [organiser] : [];
  const out = [];
  const p = [
    `You are on ${agent.team}.`,
    "",
    to.length ? `Your team's contact: ${to.join(", ")}. Say hello before the first game.` : "The organiser will put you in touch with your team.",
  ];
  const fee = faSettings(state.fields).fee;
  if (fee) p.push("", `Free-agent fee: ${fee}. The organiser will tell you how to pay.`);
  if (leagueUrl) p.push("", `Fixtures, results and your team's calendar: ${leagueUrl}`, "On that page you can also say whether you can make each game.");
  p.push("", "You signed up as a free agent on a league page run by your organiser. Reply to this email to reach them.");
  out.push({ kind: "player", to: [agent.email, ...cc.filter((x) => x !== agent.email)], subject: `Your team: ${agent.team}`, text: p.join("\n") });
  if (to.length) {
    const t = [
      `${agent.name} joins ${agent.team} as a free agent.`,
      "",
      `Email: ${agent.email}${agent.phone ? `\nPhone: ${agent.phone}` : ""}`,
      `Experience: ${levelLabel(agent.level)}`,
    ];
    if (agent.note) t.push(`Their note: ${agent.note}`);
    t.push("", `${agent.name} is on your roster on the league page now. Please get in touch before your next game.`);
    if (leagueUrl) t.push("", `League page: ${leagueUrl}`);
    out.push({ kind: "team", to: [...to, ...cc.filter((x) => !to.includes(x))], subject: `New player for ${agent.team}: ${agent.name}`, text: t.join("\n") });
  }
  return out;
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // a spreadsheet must not run a typed formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every free agent, placed first then waiting, as CSV for the organiser's records. */
export function freeAgentsCsv(state) {
  const rows = [["status", "name", "email", "phone", "experience", "with", "team", "signed_up_utc", "placed_utc", "note", "tags"]];
  for (const a of state.placedAgents || []) rows.push(["placed", a.name, a.email, a.phone, levelLabel(a.level), a.with, a.team, new Date(a.at).toISOString(), new Date(a.placedAt).toISOString(), a.note, tagsOfAgent(a).join(" ")]);
  for (const a of state.freeAgents || []) rows.push(["waiting", a.name, a.email, a.phone, levelLabel(a.level), a.with, "", new Date(a.at).toISOString(), "", a.note, tagsOfAgent(a).join(" ")]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The public /join form (or the reason it is closed). */
export function joinFormHtml(state, today, values = {}) {
  const f = state.fields, s = faSettings(f), why = faClosedReason(f, today);
  if (why) return `<p>${esc(why)} Ask the organiser if you want to play.</p>`;
  const v = (k) => esc(values[k] ?? "");
  const opts = Object.entries(LEVELS).map(([k, l]) => `<option value="${k}"${String(values.level ?? "") === k ? " selected" : ""}>${esc(l)}</option>`).join("");
  return `<p>No team? Sign up on your own and the organiser places you on a team that needs players.</p>${s.fee ? `<p>Fee: <strong>${esc(s.fee)}</strong>, paid as the organiser tells you once you are placed.</p>` : ""}${s.closes ? `<p class="note">Free-agent sign-ups close at the end of ${esc(s.closes)} (UTC).</p>` : ""}
<form method="post" action="/join">
<label>Your name (first name and last initial is fine)<input name="name" required maxlength="40" autocomplete="name" value="${v("name")}"></label>
<label>Email<input name="email" type="email" required maxlength="200" autocomplete="email" value="${v("email")}"></label>
<label>Phone (optional)<input name="phone" type="tel" maxlength="30" autocomplete="tel" value="${v("phone")}"></label>
<label>How much have you played?<select name="level" required><option value="">Pick one</option>${opts}</select></label>
${s.tagQuestions.length ? `<fieldset><legend>Tick any that apply (the organiser spreads these evenly across teams; optional)</legend>${s.tagQuestions.map((q) => `<label><input type="checkbox" name="tag" value="${esc(q.tag)}" style="width:auto"${(values.tags || []).includes(q.tag) ? " checked" : ""}> ${esc(q.label)}</label>`).join("")}</fieldset>` : ""}
<label>A friend also signing up as a free agent, to be placed with (optional)<input name="with" maxlength="40" value="${v("with")}"></label>
<label>Anything the organiser should know, e.g. nights you cannot play or a position (optional)<textarea name="note" maxlength="${MAX_NOTE}" style="min-height:3rem">${v("note")}</textarea></label>
<label style="position:absolute;left:-9999px" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
<button>Join as a free agent</button></form>
<p class="note">The organiser sees what you type here. Once you are placed, your name appears on your team's roster on the league page, and your email and phone go to your team's captain so they can reach you.</p>`;
}

/** The page after joining. */
export function joinedHtml(agent) {
  return `<p class="ok">${esc(agent.name)}, you are on the free-agent list.</p><p>The organiser places free agents on teams that need players and emails ${esc(agent.email)} with your team.${agent.with ? ` You asked to be placed with ${esc(agent.with)}; if they sign up too, you are suggested to the same team.` : ""}</p><p class="note">There is no account to log in to. To change anything, reply to the organiser's email.</p>`;
}

/** The free-agent list in /admin: each player with a team picker (the suggestion selected) and buttons. */
export function adminFreeAgentsHtml(state, key, teams) {
  const waiting = state.freeAgents || [], placed = state.placedAgents || [];
  if (!waiting.length && !placed.length) return "";
  const k = esc(key), s = faSettings(state.fields);
  const { picks, unplaced, fit } = suggestPlacements(state, teams);
  const tagLabel = new Map(s.tagQuestions.map((q) => [q.tag, q.label]));
  const why = new Map(unplaced.map((u) => [u.agent.id, u.why]));
  const rosters = parseRosters(state.fields?.rosters, teams).rosters;
  const size = (t) => (Object.prototype.hasOwnProperty.call(rosters, t) ? rosters[t] : []).length;
  const row = (a) => {
    const pick = picks.get(a.id);
    const opts = teams.map((t) => `<option${t === pick ? " selected" : ""} value="${esc(t)}">${esc(t)} (${size(t)})</option>`).join("");
    const tg = tagsOfAgent(a).map((t) => tagLabel.get(t) || t);
    return `<li><strong>${esc(a.name)}</strong> · ${esc(levelLabel(a.level))}${tg.length ? ` · ${esc(tg.join(", "))}` : ""}${a.with ? ` · with ${esc(a.with)}` : ""} · <a href="mailto:${esc(a.email)}">${esc(a.email)}</a>${a.phone ? ", " + esc(a.phone) : ""}${a.note ? `<br><span class="note">${esc(a.note)}</span>` : ""}${pick ? "" : `<br><span class="note">No suggestion: ${esc(why.get(a.id) || "no teams yet")}.</span>`}
<form method="post" action="/admin/free-agent?key=${k}" style="display:inline"><input type="hidden" name="id" value="${a.id}"><select name="team" style="width:auto">${opts}</select><button name="act" value="place">Place</button><button name="act" value="remove">Remove</button></form></li>`;
  };
  const parts = [];
  if (waiting.length) {
    const how = fit.by === "balanced"
      ? `the smallest rosters filled first (numbers in brackets), friends kept together${s.target ? `, no team past ${s.target} players` : ""}${s.tagQuestions.length ? `, ${s.tagQuestions.map((q) => q.label).join(" and ")} spread evenly` : ""}, then team strength made as even as it can be: strongest minus weakest team total ${fit.spread} after placing (the smallest-roster-first rule alone: ${fit.leastFilledSpread}${fit.leastFilledTagsSplitBy > fit.tagsSplitBy ? `, and it splits a tag unevenly` : ""})`
      : `the smallest roster first (numbers in brackets), experience spread evenly, friends kept together${s.target ? `, no team past ${s.target} players` : ""}`;
    const rated = String(state.fields?.faSheet || "").trim() ? "Ratings come from the sheet you pasted." : "Ratings are each free agent's experience (1-3); rostered players count as 2 unless you paste a ratings sheet below.";
    parts.push(`<h2>Free agents waiting (${waiting.length})</h2><p class="note">Each player's team is pre-picked: ${how}. ${fit.by === "balanced" ? rated + " " : ""}Change the pick before you click Place if you know better.</p>${fit.notes.length ? `<ul class="err">${fit.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}<ul>${waiting.map(row).join("")}</ul>`);
    if (picks.size) parts.push(`<form method="post" action="/admin/free-agent?key=${k}"><button name="act" value="place-all">Place all ${picks.size} as suggested</button></form>`);
  }
  if (placed.length) parts.push(`<p class="note">${placed.length} free agent${placed.length === 1 ? "" : "s"} placed so far.</p>`);
  parts.push(`<p><a href="/admin/free-agents.csv?key=${k}">Download every free agent (CSV)</a></p>`);
  return parts.join("");
}
