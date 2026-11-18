// League notices from the organiser (2026-11-18): a short message on the player page ("Courts 3-4 closed
// Tuesday", "Fees due Friday", "Play-offs start 12 Dec"), shown until a date the organiser picks, and,
// with SMTP on, emailed to every team's contacts in one click. A notice can also go to one team only:
// it then shows on that team's captain page and is emailed to that team, never on the shared page.
// What this replaces: the group chat or mass email the organiser sends outside the league tool, which
// players lose; TeamSnap and LeagueApps do this as paid-plan messaging behind per-player accounts.
// Zero dependencies. State: state.notices = [{ id, at, text, until, team, emailed }].
export const MAX_NOTICES = 30; // bounds the state file
export const MAX_NOTICE = 1000; // characters
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateDay = (s) => {
  if (!DATE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number), t = Date.UTC(y, m - 1, d);
  return new Date(t).getUTCDate() === d && m >= 1 && m <= 12 ? Math.floor(t / 86400000) : null;
};
const isoDay = (d) => new Date(d * 86400000).toISOString().slice(0, 10);

/**
 * The admin form -> { notice } or { error }. teams: the league's team names; "team" is an index or "all".
 * today: a day number; "until" must be today or later (blank: shown for 14 days).
 */
export function parseNotice(form, teams, today, now = Date.now()) {
  const text = String(form.get("text") ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { error: "Write the notice first." };
  if (text.length > MAX_NOTICE) return { error: `Keep a notice under ${MAX_NOTICE} characters (this one is ${text.length}).` };
  const rawUntil = String(form.get("until") ?? "").trim();
  let until = today + 14;
  if (rawUntil) {
    const d = dateDay(rawUntil);
    if (d === null) return { error: "Show until is a date, YYYY-MM-DD." };
    if (d < today) return { error: "Show until is in the past, so nobody would see the notice." };
    if (d > today + 366) return { error: "Show until is more than a year away; pick an earlier date." };
    until = d;
  }
  const rawTeam = String(form.get("team") ?? "all");
  let team = null;
  if (rawTeam !== "all") {
    const i = Number(rawTeam);
    if (!Number.isInteger(i) || i < 0 || i >= teams.length) return { error: "Pick a team from the list, or everyone." };
    team = teams[i];
  }
  return { notice: { text, until, team, at: now } };
}

/** Add a notice (newest first), giving it an id; the oldest past the cap are dropped. */
export function addNotice(state, notice) {
  state.notices = Array.isArray(state.notices) ? state.notices : [];
  state.noticeSeq = (Number(state.noticeSeq) || 0) + 1;
  const n = { id: state.noticeSeq, emailed: 0, ...notice };
  state.notices.unshift(n);
  state.notices.length = Math.min(state.notices.length, MAX_NOTICES);
  return n;
}

export function removeNotice(state, id) {
  const list = Array.isArray(state.notices) ? state.notices : [];
  const i = list.findIndex((n) => n.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

/** Notices a reader sees today: the whole league's, plus one team's when `team` is given (a captain page). */
export function liveNotices(notices, today, team = null) {
  return (Array.isArray(notices) ? notices : []).filter((n) => n.until >= today && (n.team === null || n.team === undefined || (team !== null && n.team === team)));
}

/** Notice text as HTML: escaped, line breaks kept, plain https links made clickable (nothing else). */
export function noticeBody(text) {
  return esc(text).replace(/https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g, (u) => `<a href="${u}" rel="noopener nofollow">${u}</a>`).replace(/\n/g, "<br>");
}

const posted = (n) => new Date(n.at).toISOString().slice(0, 10);

/** The "From the organiser" block for the player page (empty when nothing is live). */
export function noticesHtml(notices, today, team = null) {
  const live = liveNotices(notices, today, team);
  if (!live.length) return "";
  const items = live.map((n) => `<li><p>${noticeBody(n.text)}</p><p class="note">${posted(n)}${n.team ? ` · for ${esc(n.team)} only` : ""}</p></li>`).join("");
  return `<section aria-labelledby="notices"><h2 id="notices">From the organiser</h2><ul>${items}</ul></section>`;
}

/** The admin block: the post form and every stored notice with its state and a Remove button. */
export function adminNoticesHtml(state, key, teams, today, { canEmail = false } = {}) {
  const k = esc(encodeURIComponent(key));
  const opts = `<option value="all">Everyone (the league page)</option>` + teams.map((t, i) => `<option value="${i}">${esc(t)} only (their captain page)</option>`).join("");
  const list = (Array.isArray(state.notices) ? state.notices : []).map((n) => {
    const live = n.until >= today;
    return `<li><p>${noticeBody(n.text)}</p><p class="note">${n.team ? `For ${esc(n.team)} only` : "For everyone"} · posted ${posted(n)} · ${live ? `shown until ${isoDay(n.until)}` : `ended ${isoDay(n.until)}`}${n.emailed ? ` · emailed to ${n.emailed} team${n.emailed === 1 ? "" : "s"}` : ""}</p><form method="post" action="/admin/notice?key=${k}" style="display:inline"><input type="hidden" name="id" value="${n.id}"><button name="act" value="remove">Remove</button></form></li>`;
  }).join("");
  return `<h2>Notices</h2><form method="post" action="/admin/notice?key=${k}"><label>Notice (up to ${MAX_NOTICE} characters; https links become clickable)<textarea name="text" maxlength="${MAX_NOTICE}" required></textarea></label>
<label>Who sees it <select name="team">${opts}</select></label>
<label>Show until (YYYY-MM-DD; blank: two weeks)<input name="until" placeholder="${isoDay(today + 14)}"></label>
<label><input type="checkbox" name="email" value="1" style="width:auto"${canEmail ? "" : " disabled"}> Also email it to the team contacts${canEmail ? "" : " (needs SMTP, see below)"}</label>
<button name="act" value="post">Post notice</button></form>${list ? `<ul>${list}</ul>` : `<p class="note">No notices yet.</p>`}`;
}

/**
 * One email per team with a contact address: { team, to, subject, text }. A team notice goes to that
 * team only. leagueUrl (optional) is the player page; captain links are never put in a shared email.
 */
export function noticeEmails(notice, contacts, teams, { leagueTitle = "League", leagueUrl = "" } = {}) {
  const targets = notice.team ? [notice.team] : teams;
  const out = [], missing = [];
  for (const team of targets) {
    const to = Object.prototype.hasOwnProperty.call(contacts, team) && Array.isArray(contacts[team]) ? [...contacts[team]] : [];
    if (!to.length) { missing.push(team); continue; }
    const first = notice.text.split("\n")[0].slice(0, 60);
    out.push({
      team, to,
      subject: `${leagueTitle}: ${first}${notice.text.length > first.length ? "…" : ""}`,
      text: [`Hi ${team},`, "", "A notice from your league organiser:", "", notice.text, "", ...(leagueUrl ? ["The league page, with the schedule and table:", leagueUrl, ""] : []), "Reply to your organiser, not to this address, if it is an automatic sender.", "Check dates and venues with your organiser."].join("\n"),
    });
  }
  return { emails: out, missing };
}
