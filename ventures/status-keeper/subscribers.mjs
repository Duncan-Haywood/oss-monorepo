// Email subscriptions for the status page: double opt-in, one-click unsubscribe, notices on
// incidents and maintenance. Server-side only (uses node:crypto). Sending is injected, so the
// logic runs under test with no network; server.mjs wires it to Resend when keys are set.
import { randomBytes } from "node:crypto";

export const MAX_SUBSCRIBERS = 5000;
export const PENDING_TTL_MS = 48 * 3600_000;
export const RESEND_COOLDOWN_MS = 3600_000;
export const CONFIRM_MAILS_PER_HOUR = 30; // caps how many strangers a bot can make us email

export const validEmail = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(e);
const norm = (e) => String(e).trim().toLowerCase();
const subs = (state) => (state.subscribers ||= []);
const newToken = () => randomBytes(18).toString("base64url");

// Returns {action:"confirm"|"already"|"cooldown"|"full"|"rate"|"invalid", sub?}. "already" and
// "cooldown" look identical to the caller of the HTTP API, so the form cannot probe who is subscribed.
export function subscribe(state, rawEmail, now, token = newToken()) {
  if (!validEmail(String(rawEmail).trim())) return { action: "invalid" };
  const email = norm(rawEmail);
  prune(state, now);
  const list = subs(state);
  const existing = list.find((s) => s.email === email);
  if (existing?.status === "active") return { action: "already", sub: existing };
  const recent = (state.confirmSent ||= []).filter((t) => now - t < 3600_000);
  state.confirmSent = recent;
  if (existing) {
    if (now - existing.createdAt < RESEND_COOLDOWN_MS) return { action: "cooldown", sub: existing };
    if (recent.length >= CONFIRM_MAILS_PER_HOUR) return { action: "rate" };
    existing.createdAt = now; recent.push(now);
    return { action: "confirm", sub: existing };
  }
  if (list.length >= MAX_SUBSCRIBERS) return { action: "full" };
  if (recent.length >= CONFIRM_MAILS_PER_HOUR) return { action: "rate" };
  const sub = { email, status: "pending", token, createdAt: now, confirmedAt: null };
  list.push(sub); recent.push(now);
  return { action: "confirm", sub };
}

export function prune(state, now) {
  const list = subs(state);
  state.subscribers = list.filter((s) => s.status === "active" || now - s.createdAt < PENDING_TTL_MS);
}

export function confirm(state, token, now) {
  const s = subs(state).find((x) => x.token === token && token);
  if (!s) return null;
  if (s.status === "pending") {
    if (now - s.createdAt >= PENDING_TTL_MS) return null;
    s.status = "active"; s.confirmedAt = now;
  }
  return s;
}

export function unsubscribe(state, token) {
  const list = subs(state);
  const i = list.findIndex((x) => x.token === token && token);
  if (i < 0) return null;
  return list.splice(i, 1)[0];
}

export const activeCount = (state) => subs(state).filter((s) => s.status === "active").length;

const link = (base, path, token) => `${base.replace(/\/$/, "")}${path}?t=${encodeURIComponent(token)}`;

export function confirmationMail(sub, meta) {
  return {
    to: sub.email,
    subject: `Confirm your subscription to ${meta.title} status updates`,
    text: `Someone (hopefully you) asked for ${meta.title} status updates at this address.\n\nConfirm: ${link(meta.publicUrl, "/confirm", sub.token)}\n\nIf this was not you, ignore this email and nothing will be sent. The request expires in 48 hours.\n`,
  };
}

// event: {kind:"incident"|"update"|"resolved"|"maintenance", incident?, maintenance?}
export function noticeMail(event, sub, meta) {
  const unsub = link(meta.publicUrl, "/unsubscribe", sub.token);
  let subject, body;
  if (event.kind === "maintenance") {
    const m = event.maintenance;
    subject = `[${meta.title}] Scheduled maintenance: ${m.title}`;
    body = `${m.title}\nFrom ${new Date(m.startsAt).toISOString()} to ${new Date(m.endsAt).toISOString()}.\nChecks during this window do not count against uptime.`;
  } else {
    const i = event.incident, u = i.updates[i.updates.length - 1];
    subject = `[${meta.title}] ${event.kind === "resolved" ? "Resolved" : i.status === "investigating" && event.kind === "incident" ? "Incident" : "Update"}: ${i.title}`;
    body = `${i.title}\nStatus: ${u.status}\n\n${u.message || "(no details yet)"}`;
  }
  return {
    to: sub.email, subject,
    text: `${body}\n\nLive status: ${meta.publicUrl}\nUnsubscribe: ${unsub}\n`,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// Send one notice to every active subscriber. Never throws; returns {sent, failed}.
export async function notifyAll(state, event, meta, send) {
  let sent = 0, failed = 0;
  for (const sub of subs(state).filter((s) => s.status === "active")) {
    try { await send(noticeMail(event, sub, meta)); sent++; } catch { failed++; }
  }
  return { sent, failed };
}
