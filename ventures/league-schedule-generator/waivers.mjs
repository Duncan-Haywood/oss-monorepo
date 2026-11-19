// Player waivers for the self-hosted league page (server.mjs). The organiser pastes their own waiver or
// code-of-conduct text in /admin; every distinct text is kept as a version (a SHA-256 of the text), so a
// signature always points at the exact words that person agreed to. Players sign from the league link
// (/league/waiver?t=...): their team, full name, a typed signature that must match the name, a tick, and
// for a minor the parent or guardian's name. A captain signs on the team sign-up form. /admin shows who on
// each roster has signed the current text, who signed an older one and who has not, and exports every
// signature as CSV. This records agreement to text the organiser wrote; it does not write a waiver and is
// not legal advice. Zero dependencies.
import { createHash } from "node:crypto";
import { cleanName, EMAIL } from "./availability.mjs";

export const MAX_WAIVER_TEXT = 12000;
export const MAX_SIGNATURES = 3000; // bounds the state file
export const MAX_VERSIONS = 20;
const MAX_FULL_NAME = 80;

const tidy = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const low = (s) => tidy(s).toLocaleLowerCase();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The waiver text as stored: line endings unified, trailing space trimmed, capped. "" means no waiver. */
export function cleanWaiverText(raw) {
  return String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/[ \t]+$/gm, "").trim().slice(0, MAX_WAIVER_TEXT);
}

/** A version id for a text: the first 16 hex characters of its SHA-256 (after cleanWaiverText). */
export function waiverVersion(text) {
  const t = cleanWaiverText(text);
  return t ? createHash("sha256").update(t, "utf8").digest("hex").slice(0, 16) : "";
}

/**
 * Keep the current text as a version: { id, text, from } is stored the first time a text is seen, so an
 * older version stays readable for the signatures that point at it. Versions nobody signed are dropped
 * once there are more than MAX_VERSIONS. Returns the current version id ("" when there is no waiver).
 */
export function rememberVersion(state, now = Date.now()) {
  const text = cleanWaiverText(state.fields?.waiverText), id = waiverVersion(text);
  if (!id) return "";
  state.waiverVersions = state.waiverVersions || {};
  if (!state.waiverVersions[id]) state.waiverVersions[id] = { text, from: now };
  const ids = Object.keys(state.waiverVersions);
  if (ids.length > MAX_VERSIONS) {
    const used = new Set((state.waivers || []).map((w) => w.version));
    for (const v of ids.sort((a, b) => state.waiverVersions[a].from - state.waiverVersions[b].from)) {
      if (Object.keys(state.waiverVersions).length <= MAX_VERSIONS) break;
      if (v !== id && !used.has(v)) delete state.waiverVersions[v];
    }
  }
  return id;
}

/** The current version id, or "" when the organiser has no waiver text. */
export const currentVersion = (state) => waiverVersion(state.fields?.waiverText);

/** A full name for a signature: a first and last name, letters required, no control characters. */
export function cleanFullName(raw, label = "Your full name") {
  const s = tidy(raw);
  if (!s) return { error: `${label}: type it in full.` };
  if ([...s].length > MAX_FULL_NAME) return { error: `${label}: keep it to ${MAX_FULL_NAME} characters.` };
  if (/[\u0000-\u001f\u007f<>]/.test(s)) return { error: `${label}: it has characters the page cannot show.` };
  if (!/\p{L}/u.test(s)) return { error: `${label}: it needs letters.` };
  return { name: s };
}

/**
 * The signing part of a form (the waiver page, or the captain's part of the sign-up form) ->
 * { sig: { name, email, minor, guardian } } or { error }. The typed signature must match the signer's
 * name (the player's, or the guardian's for a minor), without case or extra spaces; "agree" must be ticked.
 * `prefix` lets the sign-up form keep these fields apart from its own ("w_").
 */
export function parseSignature(form, { prefix = "" } = {}) {
  const get = (k) => form.get(prefix + k);
  const n = cleanFullName(get("fullname"));
  if (n.error) return { error: n.error };
  const minor = get("minor") === "1";
  let guardian = "";
  if (minor) {
    const g = cleanFullName(get("guardian"), "Parent or guardian's full name");
    if (g.error) return { error: g.error };
    guardian = g.name;
  }
  const email = tidy(get("email"));
  if (email && (!EMAIL.test(email) || email.length > 200)) return { error: "Type a whole email address, or leave it blank." };
  if (get("agree") !== "1") return { error: "Tick the box to say you have read the text and agree to it." };
  const signer = minor ? guardian : n.name;
  if (low(get("signature")) !== low(signer)) return { error: minor ? "The signature must be the parent or guardian's full name, typed exactly as above." : "The signature must be your full name, typed exactly as above." };
  return { sig: { name: n.name, email, minor, guardian } };
}

/** A signature form post from the league page -> { req: { team, ...sig } } or { error }. `teams` is the schedule's list. */
export function parseWaiverForm(form, teams) {
  const i = Number(form.get("team"));
  if (!Number.isInteger(i) || i < 0 || i >= teams.length) return { error: "Pick your team." };
  const s = parseSignature(form);
  if (s.error) return { error: s.error };
  return { req: { team: teams[i], ...s.sig } };
}

/**
 * Store a signature against the current version. The same person (team and name, without case) signing the
 * same version again replaces their earlier row, so a typo in the email can be fixed by signing again.
 * Returns { sig, replaced } or { error }.
 */
export function recordSignature(state, req, now = Date.now()) {
  const version = rememberVersion(state, now);
  if (!version) return { error: "The organiser has not set a waiver." };
  state.waivers = state.waivers || [];
  const i = state.waivers.findIndex((w) => w.version === version && low(w.team) === low(req.team) && low(w.name) === low(req.name));
  if (i < 0 && state.waivers.length >= MAX_SIGNATURES) return { error: "The organiser's waiver list is full. Tell them, so they can export and clear it." };
  state.waiverSeq = (state.waiverSeq || 0) + 1;
  const sig = { id: state.waiverSeq, version, team: req.team, name: req.name, email: req.email || "", minor: !!req.minor, guardian: req.guardian || "", at: now, via: req.via || "page" };
  if (i >= 0) state.waivers[i] = sig; else state.waivers.push(sig);
  return { sig, replaced: i >= 0 };
}

export function removeSignature(state, id) {
  const i = (state.waivers || []).findIndex((w) => w.id === id);
  if (i < 0) return { error: "That signature is already gone." };
  const [sig] = state.waivers.splice(i, 1);
  return { sig };
}

/**
 * Who on each roster has signed. A roster entry ("Ben", or "Ben Ong") matches a signature for the same team
 * whose full name is the entry, or whose first word is the entry when only one signature on that team starts
 * with it (two Bens on one team and a roster line of "Ben" stay unmatched rather than guessed).
 * Returns { version, teams: [{ team, signed: [{ entry, sig }], older: [{ entry, sig }], missing: [entry] }],
 * extra: [sig] (current-version signatures that match no roster entry), counts: { roster, signed } }.
 */
export function waiverStatus(state, rosters = {}, teams = []) {
  const version = currentVersion(state), sigs = state.waivers || [];
  const out = { version, teams: [], extra: [], counts: { roster: 0, signed: 0 } };
  if (!version) return out;
  const used = new Set();
  const pick = (team, entry, list) => {
    const e = low(entry), mine = list.filter((w) => low(w.team) === low(team));
    const exact = mine.filter((w) => low(w.name) === e);
    if (exact.length) return exact[exact.length - 1];
    if (e.includes(" ")) return null;
    const first = mine.filter((w) => low(w.name).split(" ")[0] === e);
    const people = new Set(first.map((w) => low(w.name)));
    return people.size === 1 ? first[first.length - 1] : null;
  };
  const current = sigs.filter((w) => w.version === version), older = sigs.filter((w) => w.version !== version);
  for (const team of teams) {
    const entries = Object.prototype.hasOwnProperty.call(rosters, team) && Array.isArray(rosters[team]) ? rosters[team] : [];
    const row = { team, signed: [], older: [], missing: [] };
    for (const entry of entries) {
      out.counts.roster++;
      const s = pick(team, entry, current);
      if (s) { row.signed.push({ entry, sig: s }); used.add(s.id); out.counts.signed++; continue; }
      const o = pick(team, entry, older);
      if (o) row.older.push({ entry, sig: o }); else row.missing.push(entry);
    }
    if (entries.length) out.teams.push(row);
  }
  out.extra = current.filter((w) => !used.has(w.id));
  return out;
}

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const when = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

/** The public signing page body: the text, then the form. `values` refills the form after an error. */
export function waiverFormHtml(state, teams, token, values = {}) {
  const text = cleanWaiverText(state.fields?.waiverText), version = waiverVersion(text);
  if (!version) return "<p>The organiser has not set a waiver for this league.</p>";
  const v = (k) => esc(values[k] ?? "");
  const opts = teams.map((n, i) => `<option value="${i}"${String(values.team ?? "") === String(i) ? " selected" : ""}>${esc(n)}</option>`).join("");
  return `<div style="white-space:pre-wrap;border:1px solid #ccc;padding:1rem;max-height:28rem;overflow:auto" tabindex="0" aria-label="Waiver text">${esc(text)}</div>
<p class="note">Version ${esc(version)}, set by your organiser. Read all of it before you sign.</p>
<form method="post" action="/league/waiver?t=${esc(encodeURIComponent(token))}">
<label>Your team <select name="team">${opts}</select></label>
<label>Your full name<input name="fullname" required maxlength="${MAX_FULL_NAME}" autocomplete="name" value="${v("fullname")}"></label>
<label>Email (optional, for the organiser's records)<input name="email" type="email" maxlength="200" autocomplete="email" value="${v("email")}"></label>
<label><input type="checkbox" name="minor" value="1" style="width:auto"${values.minor === "1" ? " checked" : ""}> The player is under the age of majority where we play, and a parent or guardian is signing</label>
<label>Parent or guardian's full name (only for a minor)<input name="guardian" maxlength="${MAX_FULL_NAME}" value="${v("guardian")}"></label>
<label><input type="checkbox" name="agree" value="1" style="width:auto" required> I have read the text above and agree to it</label>
<label>Signature: type the signer's full name again (the player's, or the parent or guardian's)<input name="signature" required maxlength="${MAX_FULL_NAME}" value="${v("signature")}"></label>
<button>Sign</button></form>
<p class="note">The organiser sees your name, team, email, the time you signed and which version of the text you agreed to. Other players do not.</p>`;
}

/** The captain's part of the sign-up form, shown only when the league has a waiver. */
export function registerWaiverHtml(state, values = {}) {
  const text = cleanWaiverText(state.fields?.waiverText);
  if (!text) return "";
  const v = (k) => esc(values["w_" + k] ?? "");
  return `<fieldset><legend>League waiver (the captain signs here; players sign from the league page)</legend>
<div style="white-space:pre-wrap;border:1px solid #ccc;padding:.75rem;max-height:16rem;overflow:auto" tabindex="0" aria-label="Waiver text">${esc(text)}</div>
<label>Captain's full name<input name="w_fullname" required maxlength="${MAX_FULL_NAME}" value="${v("fullname")}"></label>
<label><input type="checkbox" name="w_minor" value="1" style="width:auto"${values.w_minor === "1" ? " checked" : ""}> The captain is a minor and a parent or guardian is signing</label>
<label>Parent or guardian's full name (only for a minor)<input name="w_guardian" maxlength="${MAX_FULL_NAME}" value="${v("guardian")}"></label>
<label><input type="checkbox" name="w_agree" value="1" style="width:auto" required> I have read the text above and agree to it</label>
<label>Signature: type the signer's full name again<input name="w_signature" required maxlength="${MAX_FULL_NAME}" value="${v("signature")}"></label>
</fieldset>`;
}

/** The league page's pointer to the signing page, and the captain page's list of teammates still to sign. */
export function waiverLinkHtml(state, token, { team = null, rosters = {} } = {}) {
  const version = currentVersion(state);
  if (!version) return "";
  const link = `<a href="/league/waiver?t=${esc(encodeURIComponent(token))}">Sign the league waiver</a>`;
  if (team === null) return `<h2>Waiver</h2><p>Every player signs the organiser's waiver once: ${link}.</p>`;
  const st = waiverStatus(state, rosters, [team]).teams[0];
  if (!st) return `<h2 id="waiver">Waiver</h2><p>${link}. Ask the organiser to add your roster so you can see who has signed.</p>`;
  const left = [...st.missing, ...st.older.map((o) => o.entry)];
  return `<h2 id="waiver">Waiver</h2><p>${st.signed.length} of ${st.signed.length + left.length} on your roster have signed the current text.${left.length ? ` Still to sign: ${esc(left.join(", "))}.` : ""} Send them this page's ${link} link.</p>`;
}

/** The /admin section: the current version, per-team status, unmatched signatures and the CSV link. */
export function adminWaiversHtml(state, key, rosters = {}, teams = []) {
  const k = esc(key), version = currentVersion(state);
  const all = state.waivers || [];
  if (!version) return all.length ? `<h2>Waivers</h2><p>No waiver text is set, so nobody can sign. ${all.length} earlier signature(s) are kept: <a href="/admin/waivers.csv?key=${k}">download them (CSV)</a>.</p>` : "";
  const st = waiverStatus(state, rosters, teams), from = (state.waiverVersions || {})[version]?.from;
  const head = `<p>Current text: version <code>${esc(version)}</code>${from ? ` (since ${esc(day(from))})` : ""}. ${st.counts.roster ? `<strong>${st.counts.signed} of ${st.counts.roster}</strong> roster players have signed it.` : "Add rosters to see who has not signed."}</p>`;
  const rows = st.teams.map((t) => {
    const older = t.older.length ? ` · signed an earlier version: ${esc(t.older.map((o) => o.entry).join(", "))}` : "";
    return `<li><strong>${esc(t.team)}</strong>: ${t.signed.length} of ${t.signed.length + t.older.length + t.missing.length} signed${t.missing.length ? ` · not signed: ${esc(t.missing.join(", "))}` : ""}${older}</li>`;
  }).join("");
  const del = (w) => `<form method="post" action="/admin/waiver?key=${k}" style="display:inline"><input type="hidden" name="id" value="${w.id}"><button name="act" value="remove">Remove</button></form>`;
  const extra = st.extra.length ? `<p>Signed, but not on a roster (add them, or remove a mistaken signature):</p><ul>${st.extra.slice(0, 50).map((w) => `<li>${esc(w.team)}: ${esc(w.name)}${w.minor ? ` (minor; ${esc(w.guardian)})` : ""}, ${esc(when(w.at))} ${del(w)}</li>`).join("")}</ul>` : "";
  return `<h2>Waivers</h2>${head}${rows ? `<ul>${rows}</ul>` : ""}${extra}<p><a href="/admin/waivers.csv?key=${k}">Download every signature (CSV)</a> · <a href="/admin/waiver.txt?key=${k}&amp;v=${esc(version)}">the current text as signed</a></p>`;
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every signature, oldest first, with the version, the date that version was first set and the text's hash. */
export function waiversCsv(state) {
  const rows = [["signed_utc", "team", "full_name", "minor", "guardian", "email", "version", "version_set_utc", "current", "signed_on"]];
  const cur = currentVersion(state), vs = state.waiverVersions || {};
  for (const w of [...(state.waivers || [])].sort((a, b) => a.at - b.at)) {
    rows.push([new Date(w.at).toISOString(), w.team, w.name, w.minor ? "yes" : "no", w.guardian, w.email, w.version, vs[w.version] ? new Date(vs[w.version].from).toISOString() : "", w.version === cur ? "yes" : "no", w.via === "signup" ? "team sign-up" : "league page"]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The exact text of one version, as plain text with its id and first-set date, or null. */
export function versionText(state, id) {
  const v = (state.waiverVersions || {})[String(id ?? "")];
  return v ? `Waiver version ${id}, first set ${new Date(v.from).toISOString()}\nSHA-256 of the text below starts with ${id}.\n\n${v.text}\n` : null;
}
