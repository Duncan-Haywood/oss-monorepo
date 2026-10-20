// Online acceptance for a proposal: pure state transitions, no network, no clock, no randomness.
// A document is the exact HTML the freelancer downloaded from Proposal Maker. The client opens a private link,
// types their name and agrees; the server records who, when, and the SHA-256 of the exact bytes they saw.
import { createHash } from "node:crypto";

export const CONSENT =
  "I have read this proposal and agree to it. I understand that typing my name below is my electronic signature and has the same intent as signing on paper.";
export const MAX_HTML = 2_000_000;

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const newState = () => ({ docs: {}, byToken: {} });
const fail = (status, message) => Object.assign(new Error(message), { status });

export function titleOf(html) {
  const m = /<title>([^<]{0,200})<\/title>/i.exec(html);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : "Proposal";
}

const isEmail = (s) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s) && s.length <= 254;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

export function publish(state, { html, title, clientEmail, expires }, { id, token, now }) {
  if (typeof html !== "string" || !/<html[\s>]/i.test(html)) throw fail(400, "html must be the proposal file downloaded from Proposal Maker");
  if (html.length > MAX_HTML) throw fail(413, "proposal file is too large");
  if (clientEmail && !isEmail(String(clientEmail))) throw fail(400, "client email is not valid");
  if (expires && !isDay(String(expires))) throw fail(400, "expires must be YYYY-MM-DD");
  const doc = {
    id, token, title: String(title || titleOf(html)).slice(0, 200), html, sha256: sha256(html),
    clientEmail: clientEmail ? String(clientEmail).toLowerCase() : "", expires: expires || "",
    createdAt: now, status: "sent", views: [], events: [{ type: "published", at: now }],
  };
  state.docs[id] = doc; state.byToken[token] = id;
  return doc;
}

export const byToken = (state, token) => state.docs[state.byToken[token]] || null;
export const isExpired = (doc, now) => doc.status === "sent" && Boolean(doc.expires) && now >= Date.parse(doc.expires + "T00:00:00Z") + 86_400_000;
export const effectiveStatus = (doc, now) => (isExpired(doc, now) ? "expired" : doc.status);

// One view per viewer hash per hour, so a refresh does not look like three readings.
export function recordView(doc, { viewer, now }) {
  if (doc.status !== "sent") return false;
  if (doc.views.some((v) => v.viewer === viewer && now - v.at < 3_600_000)) return false;
  doc.views.push({ viewer, at: now });
  if (doc.views.length > 200) doc.views.shift();
  doc.events.push({ type: "viewed", at: now });
  return true;
}

export function accept(doc, { name, agree, email, viewer, userAgent }, now) {
  if (doc.status !== "sent") throw fail(409, `this proposal was already ${doc.status}`);
  if (isExpired(doc, now)) throw fail(410, "this proposal has expired; ask for a new one");
  const n = String(name || "").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 120) throw fail(400, "type your full name to sign");
  if (!agree) throw fail(400, "tick the box to confirm you agree");
  if (email && !isEmail(String(email))) throw fail(400, "that email address is not valid");
  doc.status = "accepted";
  doc.signature = { name: n, email: email ? String(email).toLowerCase() : doc.clientEmail, at: now, viewer, userAgent: String(userAgent || "").slice(0, 200), docSha256: doc.sha256, consent: CONSENT };
  doc.events.push({ type: "accepted", at: now });
  return doc;
}

export function decline(doc, { reason, viewer }, now) {
  if (doc.status !== "sent") throw fail(409, `this proposal was already ${doc.status}`);
  doc.status = "declined";
  doc.decline = { reason: String(reason || "").trim().slice(0, 1000), at: now, viewer };
  doc.events.push({ type: "declined", at: now });
  return doc;
}

export function remove(state, id) {
  const d = state.docs[id]; if (!d) return false;
  delete state.byToken[d.token]; delete state.docs[id]; return true;
}

// Admin rows never carry the document body or the share token's owner-only secrets beyond the link itself.
export function summary(doc, now) {
  return { id: doc.id, title: doc.title, status: effectiveStatus(doc, now), createdAt: doc.createdAt, expires: doc.expires, views: doc.views.length, lastViewedAt: doc.views.length ? doc.views[doc.views.length - 1].at : null, signedBy: doc.signature ? doc.signature.name : null, signedAt: doc.signature ? doc.signature.at : null };
}

export function stats(state, now) {
  const rows = Object.values(state.docs).map((d) => summary(d, now));
  const by = (s) => rows.filter((r) => r.status === s).length;
  const decided = by("accepted") + by("declined");
  return { total: rows.length, open: by("sent"), accepted: by("accepted"), declined: by("declined"), expired: by("expired"), unopened: rows.filter((r) => r.status === "sent" && !r.views).length, winRate: decided ? Math.round((by("accepted") / decided) * 100) : null };
}

export function toCsv(state, now) {
  const q = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const iso = (t) => (t ? new Date(t).toISOString() : "");
  const head = "id,title,status,created,views,signed_by,signed_at";
  return [head, ...Object.values(state.docs).map((d) => summary(d, now)).map((r) => [r.id, r.title, r.status, iso(r.createdAt), r.views, r.signedBy, iso(r.signedAt)].map(q).join(","))].join("\n") + "\n";
}
