// Captain move requests for the self-hosted league page (server.mjs). A captain asks to move one of
// their team's upcoming games to a later date; the other captain agrees or declines from their own
// captain link; the organiser approves an agreed move with one click, which writes the rainout line
// (`2026-10-13 Hawks, Owls -> 2026-10-27`) the organiser would otherwise type, rebuilds the season and
// keeps it only if the game really lands on that date. Every date is checked against the live season
// when the captain asks (blackouts, the two teams' other games, a free court and slot), so a request the
// organiser sees is one that fits. Requests are keyed by fixture id, which a game keeps across rainouts,
// withdrawals and late teams. Zero dependencies.
import { dayIso, dayLabel, parseDate } from "./dates.mjs";

export const MAX_NOTE = 200;
export const MAX_OPEN = 200; // requests in the state file at once
export const HORIZON_DAYS = 180; // how far past the game's current date a move may go
export const SHOWN_GAMES = 12; // upcoming games listed on a captain's page
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const where = (g) => `${dayLabel(g.day)}${g.time ? " " + g.time : ""}${g.court ? ", " + g.court : ""}`;

/** Every fixture-tagged game on or after `today`, soonest first, in the shape confirm.mjs uses. */
export function movableGames(schedule, today) {
  const out = [];
  for (const r of schedule?.rounds || []) for (const m of r.matches || []) {
    if (!m.fixture || r.day < today) continue;
    out.push({ fixture: m.fixture, day: r.day, time: m.time || "", court: m.court || "", home: m.home, away: m.away, homeName: schedule.teams[m.home], awayName: schedule.teams[m.away] });
  }
  return out.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time) || a.fixture.localeCompare(b.fixture));
}

/** Where a fixture sits in a schedule, or null. */
export function findFixture(schedule, fixture) {
  for (const r of schedule?.rounds || []) for (const m of r.matches || []) {
    if (m.fixture === fixture) return { fixture, day: r.day, time: m.time || "", court: m.court || "", home: m.home, away: m.away, homeName: schedule.teams[m.home], awayName: schedule.teams[m.away] };
  }
  return null;
}

/** The rainout line that moves `game` to day `to`: the organiser's own syntax, so it stays editable. */
export const moveLine = (g, to) => `${dayIso(g.day)} ${g.homeName}, ${g.awayName} -> ${dayIso(to)}`;

/**
 * Try the move on the league's fields: append the rainout line, rebuild with `build` (server.mjs
 * buildLeague) and keep it only if the fixture now sits on `to` and the build added no warning. Returns
 * { fields, game } (the new fields, not yet saved, and where the game lands) or { error }.
 */
export function tryMove(fields, build, fixture, to) {
  const before = build(fields);
  if (before.error) return { error: `The league does not build: ${before.error}` };
  const g = findFixture(before.schedule, fixture);
  if (!g) return { error: "That game is no longer in the schedule." };
  if (to <= g.day) return { error: `Pick a date after ${dayLabel(g.day)}: a game can only be moved later.` };
  // A rainout line names teams, not one game: on a night when either team plays twice it would move both.
  const same = movableGames(before.schedule, g.day).filter((x) => x.day === g.day && x.fixture !== fixture && [x.home, x.away].some((t) => t === g.home || t === g.away));
  if (same.length) return { error: `${g.homeName} or ${g.awayName} play${same.length === 1 ? "s" : ""} another game that night, so this one cannot be moved on its own here; ask the organiser to move it by hand.` };
  const prev = String(fields.rainouts || "").replace(/\s+$/, "");
  const next = { ...fields, rainouts: (prev ? prev + "\n" : "") + moveLine(g, to) };
  const after = build(next);
  if (after.error) return { error: `The league would not build: ${after.error}` };
  const h = findFixture(after.schedule, fixture);
  const fresh = after.warnings.filter((w) => !before.warnings.includes(w));
  // A rainout line names teams, not one game: on a night with more than one game per team it would
  // move the others too. Keep the move only if every other fixture stays on its date.
  const days = (s) => new Map(movableGames(s, -Infinity).map((x) => [x.fixture, x.day]));
  const was = days(before.schedule), now = days(after.schedule);
  const others = [...was].filter(([id, d]) => id !== fixture && now.get(id) !== d);
  if (h && h.day === to && !fresh.length && others.length) return { error: `Moving this game would also move ${others.length} other game${others.length === 1 ? "" : "s"} that night; ask the organiser to move it by hand.` };
  if (!h || h.day !== to || fresh.length) {
    const why = fresh.find((w) => /cannot play on|not after|is not one of/.test(w)) || fresh[0];
    return { error: why ? why.replace(/ Leave the date off to let it search\./, "") : `${g.homeName} v ${g.awayName} cannot move to ${dayLabel(to)}.` };
  }
  return { fields: next, game: h, from: g };
}

/** A captain's form post -> { req: { act, fixture, side, to?, note? } } or { error }. Only their own team's games. */
export function parseMoveRequest(form, games, team, today) {
  const g = games.find((x) => x.fixture === String(form.get("fixture") ?? ""));
  if (!g || (g.home !== team && g.away !== team)) return { error: "Pick one of your team's upcoming games." };
  const side = g.home === team ? "home" : "away";
  const act = String(form.get("act") ?? "ask");
  if (act !== "ask") return ["agree", "decline", "withdraw"].includes(act) ? { req: { act, fixture: g.fixture, side } } : { error: "Unknown action." };
  const raw = String(form.get("to") ?? "").trim();
  const to = raw ? parseDate(raw) : null;
  if (to === null) return { error: "Type the new date, like 2026-10-27." };
  if (to <= g.day) return { error: `Pick a date after ${dayLabel(g.day)}: a game can only be moved later.` };
  if (to < today) return { error: "That date has passed." };
  if (to > g.day + HORIZON_DAYS) return { error: `Pick a date within ${HORIZON_DAYS} days of the game.` };
  const note = String(form.get("note") ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, MAX_NOTE);
  return { req: { act, fixture: g.fixture, side, from: g.day, to, note } };
}

/**
 * Record a captain's action in `store` (fixture id -> { side, from, to, note, at, status }).
 * status: "asked" (waiting for the other captain), "agreed" (waiting for the organiser), "declined" (by
 * the other captain), "refused" (by the organiser). Returns { ok, status } or { error }.
 */
export function recordMove(store, req, now = Date.now()) {
  const e = store[req.fixture];
  const open = e && (e.status === "asked" || e.status === "agreed");
  if (req.act === "ask") {
    if (open && e.side !== req.side) return { error: "The other captain has already asked to move this game: agree or decline theirs first." };
    if (!open && Object.keys(store).length >= MAX_OPEN) return { error: "Too many move requests are waiting. Ask the organiser." };
    store[req.fixture] = { side: req.side, from: req.from, to: req.to, note: req.note, at: now, status: "asked" };
    return { ok: true, status: "asked" };
  }
  if (!open) return { error: "There is no open move request for this game." };
  if (req.act === "withdraw") {
    if (e.side !== req.side) return { error: "Only the captain who asked can withdraw it; you can decline it." };
    delete store[req.fixture];
    return { ok: true, status: "withdrawn" };
  }
  if (e.side === req.side) return { error: "The other captain answers this request, not you." };
  if (e.status !== "asked") return { error: "You have already agreed; it is with the organiser." };
  e.status = req.act === "agree" ? "agreed" : "declined";
  e.answeredAt = now;
  return { ok: true, status: e.status };
}

/**
 * Drop requests whose game has passed, left the schedule or moved by some other edit (the request's
 * date no longer matches the game). Returns the number dropped; mutates `store`.
 */
export function pruneMoves(store, schedule, today) {
  let n = 0;
  for (const [fixture, e] of Object.entries(store)) {
    const g = findFixture(schedule, fixture);
    if (!g || g.day !== e.from || g.day < today) { delete store[fixture]; n++; }
  }
  return n;
}

/** Open requests for the organiser: agreed first (they need a click), then waiting, oldest first. */
export function openMoves(store, schedule) {
  const out = [];
  for (const [fixture, e] of Object.entries(store || {})) {
    if (e.status !== "asked" && e.status !== "agreed") continue;
    const g = findFixture(schedule, fixture);
    if (!g || g.day !== e.from) continue;
    out.push({ game: g, ...e });
  }
  return out.sort((a, b) => Number(b.status === "agreed") - Number(a.status === "agreed") || a.game.day - b.game.day || a.game.fixture.localeCompare(b.game.fixture));
}

const asker = (g, e) => (e.side === "home" ? g.homeName : g.awayName);
const answerer = (g, e) => (e.side === "home" ? g.awayName : g.homeName);

/** The organiser's list: Approve (writes the rainout line) or Refuse. */
export function adminMovesHtml(list, key) {
  if (!list.length) return "";
  const k = esc(key);
  const btn = (fixture, act, label) => `<form method="post" action="/admin/move?key=${k}" style="display:inline"><input type="hidden" name="fixture" value="${esc(fixture)}"><button name="act" value="${act}">${esc(label)}</button></form>`;
  const items = list.map((e) => {
    const g = e.game;
    const head = `${esc(g.homeName)} v ${esc(g.awayName)}, ${esc(where(g))} to <strong>${esc(dayLabel(e.to))}</strong>`;
    const who = e.status === "agreed" ? `asked by ${esc(asker(g, e))}, agreed by ${esc(answerer(g, e))}` : `asked by ${esc(asker(g, e))}; waiting for ${esc(answerer(g, e))}'s captain`;
    const note = e.note ? ` Note: "${esc(e.note)}"` : "";
    const btns = (e.status === "agreed" ? btn(g.fixture, "approve", "Approve the move") : "") + btn(g.fixture, "refuse", "Refuse");
    return `<li>${head} (${who}).${note} ${btns}</li>`;
  }).join("");
  return `<h2>Move requests</h2><p class="note">A captain asks to move a game later; the other captain agrees; you approve. Approving adds the Rainouts line for you (the game keeps its time and court when free), and, with SMTP on, both teams get the change email. Each date was checked against the season when it was asked, and is checked again when you approve.</p><ul>${items}</ul>`;
}

/** The captain's move section on the league page: their upcoming games, each with its request state and a form. */
export function captainMovesHtml(store, games, team, { token, cap }) {
  const mine = games.filter((g) => g.home === team || g.away === team).slice(0, SHOWN_GAMES);
  const q = `t=${encodeURIComponent(token)}&c=${encodeURIComponent(cap)}`;
  const action = `/league/move?${esc(q)}`;
  const hidden = (g) => `<input type="hidden" name="fixture" value="${esc(g.fixture)}">`;
  const small = (g, act, label) => `<form method="post" action="${action}" style="display:inline">${hidden(g)}<button name="act" value="${act}">${esc(label)}</button></form>`;
  const askForm = (g) => `<details><summary>Ask to move this game</summary><form method="post" action="${action}">${hidden(g)}<input type="hidden" name="act" value="ask"><label>New date <input name="to" type="date" required min="${dayIso(g.day + 1)}" max="${dayIso(g.day + HORIZON_DAYS)}" style="width:auto"></label> <label>Note for the other captain (optional) <input name="note" maxlength="${MAX_NOTE}"></label><button>Ask</button></form></details>`;
  const rows = mine.map((g) => {
    const e = store[g.fixture];
    const side = g.home === team ? "home" : "away";
    const vs = side === "home" ? `vs ${esc(g.awayName)} (home)` : `at ${esc(g.homeName)} (away)`;
    let state = "", controls = askForm(g);
    if (e && e.from === g.day) {
      const note = e.note ? ` Their note: "${esc(e.note)}"` : "";
      const theirs = e.side !== side;
      if (e.status === "asked" && theirs) { state = `<strong>${esc(asker(g, e))} ask to move it to ${esc(dayLabel(e.to))}.</strong>${note} The date fits the season.`; controls = small(g, "agree", "Agree") + small(g, "decline", "Decline"); }
      else if (e.status === "asked") { state = `You asked to move it to ${esc(dayLabel(e.to))}; waiting for ${esc(answerer(g, e))}'s captain.`; controls = small(g, "withdraw", "Withdraw"); }
      else if (e.status === "agreed") { state = `Both captains agreed to ${esc(dayLabel(e.to))}; waiting for the organiser.`; controls = theirs ? "" : small(g, "withdraw", "Withdraw"); }
      else if (e.status === "declined") state = `<span class="err">${esc(answerer(g, e))}'s captain declined the move to ${esc(dayLabel(e.to))}.</span>`;
      else if (e.status === "refused") state = `<span class="err">The organiser refused the move to ${esc(dayLabel(e.to))}.</span>`;
    }
    return `<li><strong>${esc(where(g))}</strong> ${vs}${state ? ": " + state : ""} ${controls}</li>`;
  }).join("");
  const body = rows ? `<ul>${rows}</ul>` : "<p>No upcoming games.</p>";
  return `<section id="moves"><h2>Move a game</h2><p class="note">Can't make a date? Ask to move the game later. The new date is checked against the season first (both teams free, a court and slot open). The other captain agrees from their link, then the organiser approves, and everyone's calendar feed follows.</p>${body}</section>`;
}

/** Plain-text email telling the other team a move was asked (their captain link to answer). */
export function moveAskedEmail(g, e, to, link) {
  const team = answerer(g, e);
  return {
    team, to: [...to],
    subject: `${asker(g, e)} ask to move your game (${dayLabel(g.day)})`,
    text: [
      `Hi ${team},`, "",
      `${asker(g, e)}'s captain asks to move ${g.homeName} v ${g.awayName} from ${where(g)} to ${dayLabel(e.to)}.`,
      ...(e.note ? [`Their note: "${e.note}"`] : []),
      "The date was checked against the season: both teams are free and a court is open.", "",
      link ? `Agree or decline with your captain link: ${link}` : "Agree or decline with your team's captain link (ask the organiser if you do not have it).",
      "If both captains agree, the organiser approves it and the league page and calendar feeds follow.",
    ].join("\n"),
  };
}
