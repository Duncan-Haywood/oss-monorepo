// Team sign-ups for the self-hosted league page (server.mjs). A captain opens /register, enters the team,
// their own name and email, and the players; the sign-up waits in /admin until the organiser approves it,
// which adds the team to Teams, its players to Rosters and the captain's email to Contacts. When the league
// is full (a team cap), sign-ups go on a waitlist instead. A fee is optional and is paid on the organiser's
// own payment page (a Stripe, Square or PayPal payment link they paste in): this code never sees a card or
// a key, and the organiser ticks "Paid" by hand. Zero dependencies.
import { cleanName, EMAIL, MAX_ROSTER } from "./availability.mjs";

export const MAX_REGISTRATIONS = 200; // waiting + waitlist; bounds the state file
export const MAX_TEAM_NAME = 40;
export const MAX_NOTE = 500;
export const MAX_PER_ADDRESS = 5; // sign-ups from one address per hour
const HOUR = 60 * 60 * 1000;

const ctrl = /[\u0000-\u001f\u007f]/;
const tidy = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const teamList = (text) => String(text ?? "").split(/\r?\n/).map((l) => tidy(l.split("\t")[0])).filter(Boolean);

/** A team name the schedule, the results box and the roster lines can all read back. */
export function cleanTeamName(raw) {
  const s = tidy(raw);
  if (!s) return { error: "Type your team's name." };
  if ([...s].length > MAX_TEAM_NAME) return { error: `Keep the team name to ${MAX_TEAM_NAME} characters.` };
  if (ctrl.test(s)) return { error: "The team name has characters the page cannot show." };
  // ':' splits roster and contact lines, ',' and ';' split a one-line team list, '->' marks a moved game,
  // and a leading number or bullet would be read as list numbering.
  if (/[:,;<>"]/.test(s) || /^(\d{1,3}[.)]|[-•*–])\s/.test(s) || /\s[+-]\d+$/.test(s)) return { error: "Use letters, numbers and spaces in the team name (no : , ; < > or quotes)." };
  if (!/\p{L}/u.test(s)) return { error: "The team name needs at least one letter." };
  return { name: s };
}

/** Settings the organiser types in /admin, cleaned: { open, fee, payUrl, maxTeams, closes }. */
export function regSettings(f = {}) {
  const payUrl = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>]*)?$/.test(String(f.regPayUrl || "").trim()) ? String(f.regPayUrl).trim() : "";
  const closes = /^\d{4}-\d{2}-\d{2}$/.test(String(f.regCloses || "").trim()) ? String(f.regCloses).trim() : "";
  return {
    open: Boolean(f.regOpen),
    fee: tidy(f.regFee).slice(0, 60),
    payUrl,
    maxTeams: Math.min(64, Math.max(0, Math.trunc(Number(f.regMaxTeams) || 0))),
    closes,
  };
}

/** Why sign-ups are closed right now, or "" when they are open. `today` is "YYYY-MM-DD" (UTC). */
export function closedReason(f, today) {
  const s = regSettings(f);
  if (!s.open) return "Sign-ups are not open.";
  if (s.closes && today > s.closes) return `Sign-ups closed on ${s.closes}.`;
  return "";
}

/** Places taken: teams already listed plus sign-ups waiting for approval (not the waitlist). */
export function placesTaken(f, regs = []) {
  return teamList(f.teams).length + regs.filter((r) => r.status === "waiting").length;
}

/**
 * A sign-up form post -> { req } or { error }. `taken` is every team name already in use (listed or
 * signed up), compared without case. A filled honeypot field ("website") is reported as { spam: true }.
 */
export function parseRegistration(form, taken = []) {
  if (String(form.get("website") || "").trim()) return { spam: true };
  const t = cleanTeamName(form.get("team"));
  if (t.error) return { error: t.error };
  if (taken.some((x) => x.toLocaleLowerCase() === t.name.toLocaleLowerCase())) return { error: `A team called "${t.name}" is already signed up. Pick another name, or ask the organiser.` };
  const c = cleanName(form.get("captain"));
  if (c.error) return { error: `Captain: ${c.error}` };
  const email = tidy(form.get("email"));
  if (!EMAIL.test(email) || email.length > 200) return { error: "Type the captain's email address, so the organiser can reach the team." };
  const phone = tidy(form.get("phone"));
  if (phone && !/^[0-9+()./ -]{6,30}$/.test(phone)) return { error: "Type the phone number with digits, spaces and + ( ) - only, or leave it blank." };
  const players = [];
  for (const part of String(form.get("players") || "").split(/[,\n]/)) {
    if (!part.trim()) continue;
    const n = cleanName(part);
    if (n.error) return { error: `Player "${part.trim().slice(0, 40)}": ${n.error}` };
    if (players.some((x) => x.toLocaleLowerCase() === n.name.toLocaleLowerCase())) continue;
    if (players.length >= MAX_ROSTER) return { error: `Up to ${MAX_ROSTER} players per team.` };
    players.push(n.name);
  }
  const note = String(form.get("note") || "").replace(/\r\n/g, "\n").trim();
  if ([...note].length > MAX_NOTE) return { error: `Keep the note to ${MAX_NOTE} characters.` };
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(note)) return { error: "The note has characters the page cannot show." };
  return { req: { team: t.name, captain: c.name, email, phone, players, note } };
}

/** Every team name in use: listed teams, and sign-ups still waiting or on the waitlist. */
export function namesInUse(f, regs = []) {
  return [...teamList(f.teams), ...regs.map((r) => r.team)];
}

/**
 * Store a parsed sign-up. Returns { reg } with its status ("waiting", or "waitlist" when the cap is
 * reached) or { error } when the store is full. Ids only grow, so an admin button never hits the wrong row.
 */
export function addRegistration(state, req, now = Date.now()) {
  state.registrations = state.registrations || [];
  if (state.registrations.length >= MAX_REGISTRATIONS) return { error: "The organiser has too many sign-ups to review. Try again later, or contact them directly." };
  const s = regSettings(state.fields);
  const full = s.maxTeams > 0 && placesTaken(state.fields, state.registrations) >= s.maxTeams;
  state.regSeq = (state.regSeq || 0) + 1;
  const reg = { id: state.regSeq, ...req, at: now, status: full ? "waitlist" : "waiting", paid: false };
  state.registrations.push(reg);
  return { reg };
}

/** Per-address limit on sign-ups: true when this address may post another one now. Mutates `hits`. */
export function allowSignup(hits, who, now = Date.now(), max = MAX_PER_ADDRESS) {
  if (hits.size > 5000) hits.clear();
  const list = (hits.get(who) || []).filter((t) => now - t < HOUR);
  if (list.length >= max) { hits.set(who, list); return false; }
  list.push(now);
  hits.set(who, list);
  return true;
}

/**
 * Approve sign-up `id`: the team goes on the Teams list, its players into Rosters, the captain's
 * email into Contacts, and the sign-up leaves the queue. Returns { fields, reg } or { error }.
 */
export function approveRegistration(state, id) {
  const regs = state.registrations || [];
  const i = regs.findIndex((r) => r.id === id);
  if (i < 0) return { error: "That sign-up is no longer waiting." };
  const r = regs[i], f = { ...state.fields };
  if (teamList(f.teams).some((x) => x.toLocaleLowerCase() === r.team.toLocaleLowerCase())) return { error: `"${r.team}" is already on the Teams list.` };
  const add = (text, line) => { const prev = String(text || "").replace(/\s+$/, ""); return (prev ? prev + "\n" : "") + line; };
  f.teams = add(f.teams, r.team);
  const players = r.players.some((p) => p.toLocaleLowerCase() === r.captain.toLocaleLowerCase()) ? r.players : [r.captain, ...r.players].slice(0, MAX_ROSTER);
  f.rosters = add(f.rosters, `${r.team}: ${players.join(", ")}`);
  f.contacts = add(f.contacts, `${r.team}: ${r.email}`);
  state.fields = f;
  regs.splice(i, 1);
  state.approvedSignups = [...(state.approvedSignups || []), { ...r, approvedAt: Date.now() }].slice(-MAX_REGISTRATIONS);
  return { fields: f, reg: r };
}

export function declineRegistration(state, id) {
  const regs = state.registrations || [];
  const i = regs.findIndex((r) => r.id === id);
  if (i < 0) return { error: "That sign-up is no longer waiting." };
  const [reg] = regs.splice(i, 1);
  return { reg };
}

/** Flip a sign-up's paid tick (waiting, waitlisted or already approved). */
export function togglePaid(state, id) {
  const r = [...(state.registrations || []), ...(state.approvedSignups || [])].find((x) => x.id === id);
  if (!r) return { error: "No such sign-up." };
  r.paid = !r.paid;
  return { reg: r };
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // a spreadsheet must not run a typed formula; a plain number stays a number
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every sign-up, approved first then waiting then waitlist, as CSV for the organiser's records. */
export function registrationsCsv(state) {
  const rows = [["status", "team", "captain", "email", "phone", "players", "paid", "signed_up_utc", "note"]];
  const all = [...(state.approvedSignups || []).map((r) => ({ ...r, status: "approved" })), ...(state.registrations || [])];
  const order = { approved: 0, waiting: 1, waitlist: 2 };
  all.sort((a, b) => order[a.status] - order[b.status] || a.at - b.at);
  for (const r of all) rows.push([r.status, r.team, r.captain, r.email, r.phone, r.players.join("; "), r.paid ? "yes" : "no", new Date(r.at).toISOString(), r.note]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The public sign-up form (or the reason it is closed), with places left when there is a cap. */
export function registerFormHtml(state, today, values = {}) {
  const f = state.fields, s = regSettings(f), why = closedReason(f, today);
  if (why) return `<p>${esc(why)} Ask the organiser if you want to join.</p>`;
  const taken = placesTaken(f, state.registrations || []);
  const left = s.maxTeams ? Math.max(0, s.maxTeams - taken) : null;
  const places = left === null ? "" : left > 0 ? `<p><strong>${left} of ${s.maxTeams} places left.</strong></p>` : `<p><strong>The league is full.</strong> You can still sign up: your team goes on the waitlist, in order, and the organiser contacts you if a place opens.</p>`;
  const fee = s.fee ? `<p>Fee: <strong>${esc(s.fee)}</strong> per team${s.payUrl ? ", paid on the organiser's payment page after you sign up" : ", paid as the organiser tells you"}.</p>` : "";
  const v = (k) => esc(values[k] ?? "");
  return `${places}${fee}${s.closes ? `<p class="note">Sign-ups close at the end of ${esc(s.closes)} (UTC).</p>` : ""}
<form method="post" action="/register">
<label>Team name<input name="team" required maxlength="${MAX_TEAM_NAME}" value="${v("team")}"></label>
<label>Captain's name<input name="captain" required maxlength="40" autocomplete="name" value="${v("captain")}"></label>
<label>Captain's email<input name="email" type="email" required maxlength="200" autocomplete="email" value="${v("email")}"></label>
<label>Captain's phone (optional)<input name="phone" type="tel" maxlength="30" autocomplete="tel" value="${v("phone")}"></label>
<label>Players, one per line or separated by commas (first names are enough)<textarea name="players">${v("players")}</textarea></label>
<label>Anything the organiser should know (optional)<textarea name="note" maxlength="${MAX_NOTE}" style="min-height:3rem">${v("note")}</textarea></label>
<label style="position:absolute;left:-9999px" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
<button>Sign up</button></form>
<p class="note">The organiser sees what you type here and the players' names appear on the league page. The captain's email and phone are only shown to the organiser.</p>`;
}

/** The page after a sign-up: where it stands and, when there is a fee and a link, how to pay. */
export function registeredHtml(state, reg) {
  const s = regSettings(state.fields);
  const status = reg.status === "waitlist"
    ? `<p class="ok">${esc(reg.team)} is on the waitlist (place ${(state.registrations || []).filter((r) => r.status === "waitlist" && r.id <= reg.id).length}). The organiser will contact ${esc(reg.email)} if a place opens.</p>`
    : `<p class="ok">${esc(reg.team)} is signed up. The organiser reviews every sign-up before the team joins the schedule.</p>`;
  const pay = s.fee && s.payUrl && reg.status !== "waitlist"
    ? `<p>Fee: <strong>${esc(s.fee)}</strong>. <a href="${esc(s.payUrl)}" rel="noopener">Pay on the organiser's payment page</a> and put <strong>${esc(reg.team)}</strong> in the payment's note or reference, so the organiser can match it. The organiser marks the team paid by hand.</p>`
    : s.fee && reg.status !== "waitlist" ? `<p>Fee: <strong>${esc(s.fee)}</strong>. The organiser will tell you how to pay.</p>` : "";
  return `${status}${pay}<p class="note">Keep this page or note the team name; there is no account to log in to.</p>`;
}

/** The sign-up queue in /admin: approve, decline and the paid tick per row; approved teams with their tick. */
export function adminRegistrationsHtml(state, key) {
  const k = esc(key), s = regSettings(state.fields), regs = state.registrations || [], done = state.approvedSignups || [];
  const btn = (r, act, label) => `<button name="act" value="${act}">${label}</button>`;
  const row = (r) => `<li><strong>${esc(r.team)}</strong>${r.status === "waitlist" ? " (waitlist)" : ""}: ${esc(r.captain)}, <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? ", " + esc(r.phone) : ""}; ${r.players.length} player(s)${r.players.length ? ": " + esc(r.players.join(", ")) : ""}${r.note ? `<br><span class="note">${esc(r.note)}</span>` : ""}${s.fee ? ` · ${r.paid ? "paid" : "not paid"}` : ""}
<form method="post" action="/admin/signup?key=${k}" style="display:inline"><input type="hidden" name="id" value="${r.id}">${btn(r, "approve", "Approve")}${btn(r, "decline", "Decline")}${s.fee ? btn(r, "paid", r.paid ? "Mark not paid" : "Mark paid") : ""}</form></li>`;
  const waiting = regs.filter((r) => r.status === "waiting"), list = regs.filter((r) => r.status === "waitlist");
  const unpaid = s.fee ? done.filter((r) => !r.paid) : [];
  const parts = [];
  if (waiting.length) parts.push(`<h2>Sign-ups waiting for you (${waiting.length})</h2><ul>${waiting.map(row).join("")}</ul>`);
  if (list.length) parts.push(`<h2>Waitlist (${list.length})</h2><ul>${list.map(row).join("")}</ul>`);
  if (unpaid.length) parts.push(`<h2>Approved, fee not marked paid (${unpaid.length})</h2><ul>${unpaid.map((r) => `<li>${esc(r.team)} (${esc(r.email)}) <form method="post" action="/admin/signup?key=${k}" style="display:inline"><input type="hidden" name="id" value="${r.id}"><button name="act" value="paid">Mark paid</button></form></li>`).join("")}</ul>`);
  if (regs.length || done.length) parts.push(`<p><a href="/admin/signups.csv?key=${k}">Download every sign-up (CSV)</a></p>`);
  return parts.join("");
}

/** The confirmation email to the captain (and the organiser, when REMINDER_TO is set). */
export function signupEmail(state, reg, { organiser = "", registerUrl = "" } = {}) {
  const s = regSettings(state.fields);
  const lines = [
    reg.status === "waitlist" ? `${reg.team} is on the waitlist. The organiser will contact you if a place opens.` : `${reg.team} is signed up. The organiser reviews every sign-up before the team joins the schedule.`,
    "",
    `Captain: ${reg.captain} <${reg.email}>${reg.phone ? ", " + reg.phone : ""}`,
    `Players: ${reg.players.length ? reg.players.join(", ") : "none listed yet"}`,
  ];
  if (s.fee && reg.status !== "waitlist") lines.push("", `Fee: ${s.fee}.${s.payUrl ? ` Pay here and put "${reg.team}" in the note: ${s.payUrl}` : " The organiser will tell you how to pay."}`);
  if (reg.note) lines.push("", `Your note: ${reg.note}`);
  if (registerUrl) lines.push("", `Sign-up page: ${registerUrl}`);
  lines.push("", "You signed up on a league page run by your organiser. Reply to this email to reach them.");
  return { to: [reg.email, ...(organiser && organiser !== reg.email ? [organiser] : [])], subject: `${reg.status === "waitlist" ? "Waitlist" : "Sign-up received"}: ${reg.team}`, text: lines.join("\n") };
}
