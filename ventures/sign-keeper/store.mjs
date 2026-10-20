// E-signature request rules. Pure functions over a plain-object state; the only
// I/O is node:crypto hashing. The audit trail is a hash chain: each event's hash
// covers the previous hash, so editing or deleting an event, or the document text,
// is detectable by anyone who reruns `verify`.
import { createHash } from "node:crypto";

export const LIMITS = { title: 120, body: 20000, name: 100, email: 120, reason: 300, maxRequests: 5000, perIpPerDay: 20, maxViews: 20, defaultDays: 14, maxDays: 90 };
export const CONSENT_TEXT = "I agree to sign this document electronically, that my typed name is my signature, and that I may keep an electronic copy and ask for a paper one.";
export const ZERO = "0".repeat(64);

export const newState = () => ({ requests: {}, rate: {} });
export const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);
// Line breaks are kept in the body: a contract is read as paragraphs. Normalised so one hash covers every browser.
const cleanBody = (s) => String(s ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "").replace(/[ \t]+\n/g, "\n").trim();
const same = (a, b) => a.normalize("NFKC").toLowerCase().replace(/\s+/g, " ") === b.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");

const eventHash = (prev, e) => sha256(`${prev}\n${JSON.stringify([e.type, e.at, e.detail ?? null])}`);
function push(r, type, at, detail) {
  const e = { type, at, detail: detail ?? null };
  e.hash = eventHash(r.events.length ? r.events[r.events.length - 1].hash : ZERO, e);
  r.events.push(e);
}

export function status(r, now) {
  if (r.voidedAt) return "voided";
  if (r.signature) return "signed";
  if (r.declined) return "declined";
  return now >= r.expiresAt ? "expired" : "pending";
}

export function createRequest(state, { title, body, signerName, signerEmail, days }, { token, now }) {
  const t = clean(title, LIMITS.title), text = cleanBody(body);
  if (!t) return { error: "title is required" };
  if (text.length < 20) return { error: "document text must be at least 20 characters" };
  if (text.length > LIMITS.body) return { error: `document text is limited to ${LIMITS.body} characters` };
  const email = clean(signerEmail, LIMITS.email).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "signerEmail does not look right" };
  const d = days === undefined || days === "" ? LIMITS.defaultDays : Number(days);
  if (!Number.isInteger(d) || d < 1 || d > LIMITS.maxDays) return { error: `days must be a whole number from 1 to ${LIMITS.maxDays}` };
  if (Object.keys(state.requests).length >= LIMITS.maxRequests) return { error: "request limit reached" };
  const r = { id: token, title: t, body: text, docHash: sha256(text), signerName: clean(signerName, LIMITS.name), signerEmail: email, createdAt: now, expiresAt: now + d * 86400000, events: [], signature: null, declined: null, voidedAt: null };
  push(r, "created", now, { docHash: r.docHash });
  state.requests[token] = r;
  return { request: r };
}

export function view(r, { now }) {
  if (r.events.filter((e) => e.type === "viewed").length < LIMITS.maxViews) push(r, "viewed", now);
}

// ipKey is an HMAC the server keeps for the audit line; the raw address is never stored.
export function sign(state, r, input, { now, ipKey }) {
  if (clean(input.website, 200)) return { error: "ignored", silent: true }; // honeypot
  const st = status(r, now);
  if (st !== "pending") return { error: st === "signed" ? "This document has already been signed." : `This request is ${st}.` };
  const name = clean(input.name, LIMITS.name);
  if (name.length < 2) return { error: "Please type your full name." };
  if (r.signerName && !same(name, r.signerName)) return { error: "The name must match the one the sender asked to sign." };
  if (!(input.consent === true || input.consent === "on" || input.consent === "true" || input.consent === "1")) return { error: "Please tick the box to agree to sign electronically." };
  if (sha256(r.body) !== r.docHash) return { error: "This document no longer matches its recorded fingerprint, so it cannot be signed." };
  const day = new Date(now).toISOString().slice(0, 10), rk = `${day}:${ipKey}`;
  for (const k of Object.keys(state.rate)) if (!k.startsWith(day)) delete state.rate[k];
  if ((state.rate[rk] || 0) >= LIMITS.perIpPerDay) return { error: "Too many attempts today. Please try again tomorrow." };
  state.rate[rk] = (state.rate[rk] || 0) + 1;
  r.signature = { name, at: now, docHash: r.docHash, consent: CONSENT_TEXT, ipKey };
  push(r, "signed", now, { name, docHash: r.docHash, ipKey });
  return { request: r };
}

export function decline(r, input, { now }) {
  const st = status(r, now);
  if (st !== "pending") return { error: `This request is ${st}.` };
  const reason = clean(input.reason, LIMITS.reason);
  r.declined = { at: now, reason };
  push(r, "declined", now, { reason });
  return { request: r };
}

export function voidRequest(r, { now }) {
  if (r.signature) return { error: "A signed document cannot be voided. Keep the certificate and create a new request if terms change." };
  if (r.voidedAt) return { request: r };
  r.voidedAt = now;
  push(r, "voided", now);
  return { request: r };
}

// Recompute the whole chain and the document fingerprint from stored data.
export function verify(r) {
  const problems = [];
  if (sha256(r.body) !== r.docHash) problems.push("document text does not match its recorded SHA-256");
  let prev = ZERO;
  r.events.forEach((e, i) => { if (eventHash(prev, e) !== e.hash) problems.push(`event ${i + 1} (${e.type}) was altered or reordered`); prev = e.hash; });
  if (r.signature) {
    const s = r.events.find((e) => e.type === "signed");
    if (!s) problems.push("signature has no matching audit event");
    else if (s.detail?.docHash !== r.docHash || s.detail?.name !== r.signature.name) problems.push("signature differs from its audit event");
  }
  return { ok: problems.length === 0, problems, head: prev, events: r.events.length };
}

export function stats(state, now) {
  const out = { pending: 0, signed: 0, declined: 0, expired: 0, voided: 0 };
  for (const r of Object.values(state.requests)) out[status(r, now)]++;
  return out;
}

const cell = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
export function toCsv(state, now) {
  const rows = [["id", "title", "status", "signer_asked", "signed_name", "created", "signed_at", "doc_sha256"]];
  for (const r of Object.values(state.requests)) rows.push([r.id, r.title, status(r, now), r.signerName, r.signature?.name, new Date(r.createdAt).toISOString(), r.signature ? new Date(r.signature.at).toISOString() : "", r.docHash]);
  return rows.map((row) => row.map((v) => `"${cell(v).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}

// Admin list: no body, no signer tokens beyond the id the admin already holds.
export const summarize = (r, now) => ({ id: r.id, title: r.title, status: status(r, now), signerName: r.signerName, signerEmail: r.signerEmail, createdAt: r.createdAt, expiresAt: r.expiresAt, signedName: r.signature?.name ?? null, signedAt: r.signature?.at ?? null, docHash: r.docHash });
