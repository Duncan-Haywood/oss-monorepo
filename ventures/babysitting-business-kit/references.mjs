// Babysitting Business Kit: references and testimonials with recorded consent.
//
// The sitter makes a private link per reference (/ref/<token> on their own server) and
// texts it. The referee writes their own words and ticks two separate boxes: whether new
// families may contact them, and whether their words may appear on the sitter's website
// as first name and last initial. Each answer is stored as a consent-log entry with the
// time and the exact wording shown, so the sitter can show what was agreed to. A referee
// can withdraw through the same link at any time; the sitter can record a "no" in the app.
//
// Consent is derived from that log, never assumed:
//   - nothing in the log and no flag set by the sitter means no;
//   - a withdrawal made by the referee cannot be overridden by the sitter, only by the
//     referee answering a new link.
// The engine's publishableTestimonials() and buildSite() read `consentPublic`, which
// syncFlags() keeps equal to the derived answer; referencePacket() reads `consentContact`.
//
// Pure functions shared by the browser app and server.mjs. Callers pass the time.

import { shortName, addDays, daysBetween } from "./engine.mjs";

export const FORM_VERSION = "ref-form-1";
export const INVITE_DAYS = 30;
export const LIMITS = { words: 1500, relationship: 120, howLong: 80, contact: 120, body: 16 * 1024 };
// Days after the first ask to send a follow-up; after the last one, stop asking.
export const FOLLOW_UP_AFTER = [5, 12]; // the first matches the engine's five-day Today item

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

// ---------- the two consent statements, exactly as the referee sees them ----------

export function consentWording(scope, sitterName, refName) {
  const me = String(sitterName || "the sitter").trim();
  if (scope === "contact") return `New families may contact me. ${me} may give my name, how I know ${me}, and the contact details I give here (or, if I leave them blank, the phone or email ${me} already has for me) to families thinking of hiring ${me}, so they can ask me about their babysitting.`;
  return `My words may appear on the website, as first name and last initial. ${me} may show what I wrote above on ${me}'s babysitting website and posts, signed "${shortName(refName) || "first name and last initial"}".`;
}

// ---------- tokens ----------

export function newToken(rand = globalThis.crypto) {
  const b = new Uint8Array(18);
  rand.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
function sameToken(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0 && a.length > 0;
}

// A fresh link for one reference. Replaces any earlier link, which stops working.
export function createInvite(ref, nowIso, { days = INVITE_DAYS, token = newToken() } = {}) {
  const expires = new Date(Date.parse(nowIso) + days * 864e5).toISOString();
  return { ...ref, invite: { token, created: nowIso, expires } };
}
export function revokeInvite(ref) {
  const { invite, ...rest } = ref;
  return rest;
}
export function inviteLink(ref, serverUrl) {
  if (!ref.invite || !/^https?:\/\//.test(serverUrl || "")) return "";
  return `${String(serverUrl).replace(/\/+$/, "")}/ref/${ref.invite.token}`;
}
export function inviteState(ref, nowMs) {
  if (!ref || !ref.invite) return "none";
  if (ref.invite.used) return "used";
  return Date.parse(ref.invite.expires) > nowMs ? "open" : "expired";
}
export function findByToken(desk, token) {
  if (!TOKEN_RE.test(String(token || ""))) return null;
  let hit = null;
  for (const r of desk.references) if (r.invite && sameToken(r.invite.token, token)) hit = r;
  return hit;
}

// ---------- the consent log ----------

const entryId = (at, scope, by) => `${at}|${scope}|${by}`;

// Current answer for "contact" or "public": true, false or undefined (never asked).
export function consentNow(ref, scope) {
  const log = Array.isArray(ref.consentLog) ? ref.consentLog.filter((e) => e && e.scope === scope) : [];
  const legacy = scope === "public" ? ref.consentPublic : ref.consentContact;
  if (!log.length) return legacy === true ? true : legacy === false ? false : undefined;
  let state, locked = false;
  for (const e of [...log].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    if (e.by === "referee") { state = e.granted === true; locked = !state; }
    else if (e.granted !== true) state = false;
    else if (!locked) state = true;
  }
  return state;
}
export function syncFlags(ref) {
  const out = { ...ref };
  for (const [scope, key] of [["public", "consentPublic"], ["contact", "consentContact"]]) {
    if (!Array.isArray(out.consentLog) || !out.consentLog.some((e) => e && e.scope === scope)) continue;
    const v = consentNow(out, scope);
    if (v === undefined) delete out[key]; else out[key] = v;
  }
  return out;
}

// The app's reference form sets yes/no by hand (consent the sitter got in person or by
// text). Log each change as sitter-recorded, so a later sync cannot silently undo it.
export function recordSitterConsent(prev, next, nowIso) {
  const out = { ...next, consentLog: [...((prev && prev.consentLog) || next.consentLog || [])] };
  for (const [scope, key] of [["public", "consentPublic"], ["contact", "consentContact"]]) {
    const before = prev ? consentNow(prev, scope) : undefined;
    const after = next[key];
    if (after === undefined || after === before) continue;
    out.consentLog.push({ id: entryId(nowIso, scope, "sitter"), at: nowIso, scope, granted: after === true, by: "sitter", via: "app", wording: `Recorded by the sitter in the app: ${scope === "public" ? "may the quote go on the website" : "may new families be given their contact"}: ${after ? "yes" : "no"}.` });
  }
  if (!out.consentLog.length) delete out.consentLog;
  return syncFlags(out);
}

// Withdraw one or both consents. by = "referee" (through their link) or "sitter".
export function withdrawConsent(ref, scopes, nowIso, by = "sitter") {
  const log = [...(ref.consentLog || [])];
  for (const scope of scopes) {
    log.push({ id: entryId(nowIso, scope, by), at: nowIso, scope, granted: false, by, via: by === "referee" ? "link" : "app", wording: by === "referee" ? `Withdrawn by the referee through their link: ${scope === "public" ? "my words may appear on the website" : "new families may contact me"}.` : `Withdrawn, recorded by the sitter in the app.` });
  }
  return syncFlags({ ...ref, consentLog: log });
}

// ---------- the referee's submission ----------

function field(fields, k) { return String(fields[k] ?? "").replace(/\r\n?/g, "\n").trim(); }

// Validate a submitted form. Returns { ok, error?, spam?, submission? }.
export function readSubmission(fields, ref, sitterName, nowIso) {
  if (field(fields, "website")) return { ok: false, spam: true };
  const words = field(fields, "words"), relationship = field(fields, "relationship"), howLong = field(fields, "howLong"), contact = field(fields, "contact");
  for (const [k, v] of Object.entries({ words, relationship, howLong, contact })) {
    if (v.length > LIMITS[k]) return { ok: false, error: `Please keep that under ${LIMITS[k]} characters.` };
  }
  const allowContact = fields.consentContact === "yes" || fields.consentContact === "on" || fields.consentContact === true;
  const allowPublic = fields.consentPublic === "yes" || fields.consentPublic === "on" || fields.consentPublic === true;
  if (!words && !allowContact) return { ok: false, error: "Please write a few words, or tick that new families may contact you." };
  return {
    ok: true,
    submission: {
      at: nowIso, formVersion: FORM_VERSION, words, relationship, howLong, contact,
      consent: [
        { id: entryId(nowIso, "contact", "referee"), at: nowIso, scope: "contact", granted: allowContact, by: "referee", via: "link", wording: consentWording("contact", sitterName, ref.name) },
        { id: entryId(nowIso, "public", "referee"), at: nowIso, scope: "public", granted: allowPublic && !!words, by: "referee", via: "link", wording: consentWording("public", sitterName, ref.name) },
      ],
    },
  };
}

// Store a submission on its reference: the words, the consent proof, the link used up.
export function applySubmission(ref, sub) {
  const out = { ...ref, submission: { ...sub, consent: undefined }, received: sub.at.slice(0, 10) };
  delete out.submission.consent;
  if (sub.words) out.quote = sub.words;
  if (sub.relationship) out.relationship = sub.relationship;
  if (sub.howLong) out.howLong = sub.howLong;
  if (sub.contact) out.refereeContact = sub.contact;
  out.consentLog = [...(ref.consentLog || []), ...sub.consent];
  if (out.invite) out.invite = { ...out.invite, used: sub.at };
  return syncFlags(out);
}

// ---------- sync: the server's copy and the app's copy meet ----------

// The app PUTs its whole desk. Submissions and withdrawals that reached the server since
// the app last synced must survive, so merge each reference before the desk is replaced.
export function mergeReferences(serverDesk, incomingRefs) {
  const byId = new Map((serverDesk.references || []).map((r) => [r.id, r]));
  return (incomingRefs || []).filter((r) => r && typeof r === "object").map((inc) => {
    const srv = byId.get(inc.id);
    if (!srv) return syncFlags(inc);
    let out = { ...inc };
    const seen = new Set();
    out.consentLog = [...(inc.consentLog || []), ...(srv.consentLog || [])].filter((e) => e && !seen.has(e.id || JSON.stringify(e)) && seen.add(e.id || JSON.stringify(e)));
    if (!out.consentLog.length) delete out.consentLog;
    const subAt = (r) => (r.submission && r.submission.at) || "";
    if (subAt(srv) > subAt(inc)) {
      out.submission = srv.submission;
      for (const k of ["quote", "received", "relationship", "howLong", "refereeContact"]) if (srv[k] !== undefined) out[k] = srv[k];
    }
    if (srv.invite && (!inc.invite || (inc.invite.token === srv.invite.token && srv.invite.used && !inc.invite.used))) out.invite = srv.invite;
    return syncFlags(out);
  });
}

// ---------- what reaches people outside ----------

// The sitter's printable packet for a family: only people who said families may contact
// them, with relationship, how long, contact and (only if they also said yes) their words.
export function packetEntries(desk) {
  return desk.references.filter((r) => consentNow(r, "contact") === true && r.name).map((r) => ({
    name: String(r.name).trim(),
    relationship: r.relationship || "",
    howLong: r.howLong || "",
    contact: r.refereeContact || r.contact || "",
    quote: consentNow(r, "public") === true && r.quote ? r.quote : "",
    since: ((r.consentLog || []).filter((e) => e.scope === "contact" && e.granted).map((e) => e.at).sort().pop() || "").slice(0, 10),
  }));
}

export function referencePacket(desk, today, { forFamily = "" } = {}) {
  const p = desk.profile;
  const rows = packetEntries(desk);
  const certs = (p.certifications || []).filter(Boolean);
  const contactLine = [p.phone, p.email].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>References for ${esc(p.name)}</title>
<style>body{font:16px/1.55 Georgia,serif;color:#2b2433;max-width:44rem;margin:2rem auto;padding:0 1rem}h1{margin:0}h2{color:#b0507a;font-size:1.15rem;margin-top:1.6em}.ref{border-top:1px solid #ddd;padding:.7em 0}.ref b{font-size:1.05rem}.soft{color:#6a6175;font-size:.9rem}blockquote{margin:.4em 0;font-style:italic}@media print{body{margin:0}a{color:inherit}}</style></head><body>
<h1>References for ${esc(p.name)}</h1>
<p class="soft">${esc(p.businessName || "Babysitting")} · ${esc(p.area || p.city || "")}${contactLine ? ` · ${contactLine}` : ""}${forFamily ? `<br>Prepared for ${esc(forFamily)} on ${esc(today)}` : `<br>Prepared ${esc(today)}`}</p>
${certs.length ? `<h2>Certifications</h2><ul>${certs.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
<h2>People you may contact</h2>
${rows.length ? rows.map((r) => `<div class="ref"><b>${esc(r.name)}</b>${r.relationship ? `, ${esc(r.relationship)}` : ""}${r.howLong ? ` <span class="soft">(${esc(r.howLong)})</span>` : ""}<br>${r.contact ? esc(r.contact) : `<span class="soft">ask ${esc(p.name)} for their contact</span>`}${r.quote ? `<blockquote>“${esc(r.quote)}”</blockquote>` : ""}${r.since ? `<div class="soft">Agreed to be contacted on ${esc(r.since)}.</div>` : ""}</div>`).join("") : `<p class="soft">No one has agreed to be contacted yet.</p>`}
<p class="soft">Everyone listed agreed to be contacted by families considering ${esc(p.name)}. Please use these details only for that, and do not pass them on.</p>
</body></html>
`;
}

// ---------- request messages ----------

export const RELATIONSHIPS = {
  parent: { label: "a parent you sit for", match: /mom|dad|mother|father|parent|family|client|grand/i },
  teacher: { label: "a teacher or school staff", match: /teach|school|professor|tutor|principal|counsel/i },
  church: { label: "a church leader or nursery coordinator", match: /church|pastor|youth|nursery|ministry|parish|priest|vbs|sunday/i },
  coach: { label: "a coach or activity leader", match: /coach|camp|scout|club|team|instructor|leader/i },
  employer: { label: "an employer or supervisor", match: /boss|manager|employer|supervisor|work|job/i },
  other: { label: "someone else who knows you well", match: /$^/ },
};
export function relationshipKind(ref) {
  if (ref.relationKind && RELATIONSHIPS[ref.relationKind]) return ref.relationKind;
  if (ref.familyId) return "parent";
  const t = String(ref.relationship || "");
  for (const [k, v] of Object.entries(RELATIONSHIPS)) if (v.match.test(t)) return k;
  return "other";
}

const OPENERS = {
  parent: (me) => `It's ${me}. I've loved sitting for your kids.`,
  teacher: (me) => `It's ${me}, from your class.`,
  church: (me) => `It's ${me}. Thank you for letting me help with the kids at church.`,
  coach: (me) => `It's ${me}, from the team.`,
  employer: (me) => `It's ${me}. I'm growing my babysitting business alongside work.`,
  other: (me) => `It's ${me}.`,
};
const WHAT = {
  parent: "what it has been like having me sit for your family",
  teacher: "what I'm like as a person: responsible, on time, good with others. Families like to hear from someone who isn't a parent too",
  church: "how I've been with the kids in the nursery or children's ministry",
  coach: "how I show up: on time, steady, good with younger kids",
  employer: "whether I'm reliable and trustworthy at work",
  other: "what you know of me with kids, or how reliable I am",
};

// The first ask. With a link the referee answers in two minutes and picks consent
// themselves; without one they reply by text and the sitter records the answer.
export function requestMessage(ref, profile, { link = "", kind = relationshipKind(ref) } = {}) {
  const me = profile.name;
  const how = link
    ? `It takes about two minutes here: ${link}\nYou choose, separately, whether new families may contact you and whether your words can go on my website (first name and last initial only). The link works for ${INVITE_DAYS} days.`
    : `You can just reply to this text. Please also tell me (1) if it's okay for new families to call or text you and (2) if I may put your words on my website as "${shortName(ref.name)}". A yes to one is not a yes to the other.`;
  return `Hi ${first(ref.name)}! ${OPENERS[kind](me)} I'm asking a few people for a reference for my babysitting. Would you write two or three honest sentences about ${WHAT[kind]}?\n${how}\nIf you'd rather not, that is completely fine. Thank you!`;
}

export function followUpText(ref, profile, step, { link = "" } = {}) {
  const me = profile.name;
  if (step === 1) return `Hi ${first(ref.name)}, it's ${me} again. No pressure at all, just checking whether you had a minute for that babysitting reference.${link ? ` Here's the link: ${link}` : ""} Thank you!`;
  return `Hi ${first(ref.name)}, last nudge from me (${me}) about the reference, I promise. If now isn't a good time, no worries at all and thank you anyway.${link ? ` ${link}` : ""}`;
}

// Where each reference stands, and the message for the next step if one is due.
// ref.requested = date first asked; ref.followUps = follow-ups sent.
export function nextStep(ref, today, profile, { serverUrl = "", nowMs = Date.parse(`${today}T12:00:00Z`) } = {}) {
  const link = inviteState(ref, nowMs) === "open" ? inviteLink(ref, serverUrl) : "";
  if (ref.received || (ref.invite && ref.invite.used)) return { action: "done", note: "answered" };
  if (!ref.requested) return { action: "ask", note: "not asked yet", message: requestMessage(ref, profile, { link }) };
  const sent = Number(ref.followUps) || 0;
  if (sent >= FOLLOW_UP_AFTER.length) return { action: "stop", note: "no reply after two follow-ups; let it go" };
  const due = addDays(ref.requested, FOLLOW_UP_AFTER[sent]);
  if (daysBetween(due, today) < 0) return { action: "wait", note: `follow up on ${due}`, due };
  if (ref.invite && inviteState(ref, nowMs) === "expired") return { action: "follow up", note: "link expired: make a new one first", due, step: sent + 1, message: followUpText(ref, profile, sent + 1) };
  return { action: "follow up", note: `asked ${daysBetween(ref.requested, today)} days ago`, due, step: sent + 1, message: followUpText(ref, profile, sent + 1, { link }) };
}

// ---------- the referee's page (server) ----------

function refPage(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>body{font:17px/1.6 Georgia,serif;max-width:36rem;margin:2.5rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}label{display:block;margin-top:12px;font-weight:600}input,textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #bbb;border-radius:8px;font:inherit}.box{display:flex;gap:10px;align-items:flex-start;font-weight:400;background:#fff;border:1px solid #eadfd8;border-radius:10px;padding:10px 12px}.box input{width:auto;margin-top:6px}button{margin-top:16px;background:#b0507a;color:#fff;border:0;border-radius:8px;padding:12px 18px;font:inherit;font-weight:700}.soft{color:#6a6175;font-size:.9rem}.hp{position:absolute;left:-9999px}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}
const HEADERS = { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "cache-control": "no-store" };
const reply = (code, title, body, extra = {}) => ({ code, html: refPage(title, body), headers: HEADERS, ...extra });
const GONE = () => reply(404, "This link isn't working", `<p>This reference link has expired or is not valid. If someone asked you for a reference, ask them to send a new link.</p>`);

// GET or POST /ref/<token>. `fields` is the parsed form for a POST. Returns
// { code, html, headers, ref? (the updated reference, to store), notice? (for the sitter) }.
export function handleRef(desk, method, token, fields, nowMs) {
  const ref = findByToken(desk, token);
  if (!ref) return GONE();
  const nowIso = new Date(nowMs).toISOString();
  const me = desk.profile.name;
  const state = inviteState(ref, nowMs);
  const action = `/ref/${esc(ref.invite.token)}`;
  if (state === "used") {
    const pub = consentNow(ref, "public") === true, con = consentNow(ref, "contact") === true;
    if (method === "POST" && fields && fields.action === "withdraw") {
      const scopes = [fields.withdrawContact && "contact", fields.withdrawPublic && "public"].filter(Boolean);
      if (!scopes.length) return reply(400, "Nothing chosen", `<p>Tick what you'd like to withdraw.</p><p><a href="${action}">Back</a></p>`);
      const updated = withdrawConsent(ref, scopes, nowIso, "referee");
      return reply(200, "Done", `<p>Withdrawn. ${scopes.includes("public") ? `Your words will come off ${esc(me)}'s website the next time it is rebuilt, and stay only in ${esc(me)}'s private notes. ` : ""}${scopes.includes("contact") ? `${esc(me)} will no longer give your details to families.` : ""}</p>`, { ref: updated, notice: `${shortName(ref.name)} withdrew consent: ${scopes.join(" and ")}.` });
    }
    if (!pub && !con) return reply(200, "Thank you", `<p>You've already answered, and you haven't agreed to be contacted or quoted, so there is nothing to withdraw.</p>`);
    return reply(200, "Thank you", `<p>You've already sent your reference for ${esc(me)}. You can withdraw your permission at any time:</p><form method="post" action="${action}"><input type="hidden" name="action" value="withdraw">${con ? `<label class="box"><input type="checkbox" name="withdrawContact" value="1"> New families may no longer contact me</label>` : ""}${pub ? `<label class="box"><input type="checkbox" name="withdrawPublic" value="1"> Take my words off the website</label>` : ""}<button type="submit">Withdraw</button></form>`);
  }
  if (state !== "open") return reply(410, "This link has expired", `<p>This link from ${esc(me)} has expired. If you'd still like to give a reference, ask ${esc(me)} for a new link.</p>`);
  if (method === "POST") {
    const r = readSubmission(fields || {}, ref, me, nowIso);
    if (r.spam) return reply(200, "Thank you!", `<p>Thank you.</p>`);
    if (!r.ok) return reply(400, "Almost", `<p>${esc(r.error)}</p><p><a href="${action}">Back</a></p>`);
    const updated = applySubmission(ref, r.submission);
    const c = r.submission.consent;
    return reply(200, "Thank you!", `<p>Your reference for ${esc(me)} is saved.</p><p>New families may contact you: <b>${c[0].granted ? "yes" : "no"}</b>. Your words on the website: <b>${c[1].granted ? "yes" : "no"}</b>.</p><p class="soft">Changed your mind? Open this same link again to withdraw.</p>`, { ref: updated, notice: `Reference received from ${shortName(ref.name)}: families may contact: ${c[0].granted ? "yes" : "no"}; website: ${c[1].granted ? "yes" : "no"}. Sync the app to see it.` });
  }
  return reply(200, `A reference for ${me}`, `<p>${esc(me)} asked you for a babysitting reference. Thank you for taking a minute.</p>
<form method="post" action="${action}">
<label for="words">In your own words: what is ${esc(me)} like with kids?</label><textarea id="words" name="words" rows="6" maxlength="${LIMITS.words}"></textarea>
<label for="relationship">How do you know ${esc(me)}?</label><input id="relationship" name="relationship" maxlength="${LIMITS.relationship}" value="${esc(ref.relationship || "")}">
<label for="howLong">For how long?</label><input id="howLong" name="howLong" maxlength="${LIMITS.howLong}" placeholder="e.g. 2 years">
<label for="contact">Phone or email families may use (only if you tick the first box)</label><input id="contact" name="contact" maxlength="${LIMITS.contact}" autocomplete="off">
<p class="soft">Two separate questions. Leave a box empty for no.</p>
<label class="box"><input type="checkbox" name="consentContact" value="yes"> <span>${esc(consentWording("contact", me, ref.name))}</span></label>
<label class="box"><input type="checkbox" name="consentPublic" value="yes"> <span>${esc(consentWording("public", me, ref.name))}</span></label>
<label class="hp" for="hp">Leave this empty</label><input class="hp" id="hp" name="website" tabindex="-1" autocomplete="off">
<button type="submit">Send</button></form>
<p class="soft">This goes only to ${esc(me)}. The time you send it and the wording of the boxes you tick are saved with it, as a record of what you agreed to. You can withdraw later through this same link.</p>`);
}
