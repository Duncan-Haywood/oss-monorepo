// Win-back emails to subscribers who cancelled through the flow. Pure logic plus one
// async runner; the HTTP shell and the mail provider are injected (see server.mjs).
// Off unless WINBACK_URL is set. Each step is sent once, never to someone who opted
// out or came back, and always with a one-click unsubscribe and your postal address.
import { createHmac, timingSafeEqual } from "node:crypto";

const DAY = 86400000;
export const DEFAULT_WINBACK = { steps: [{ afterDays: 14 }, { afterDays: 60 }], maxPerRun: 25 };

export const mergeWinback = (w = {}) => {
  const steps = (Array.isArray(w.steps) && w.steps.length ? w.steps : DEFAULT_WINBACK.steps)
    .map((s) => ({ afterDays: Math.min(365, Math.max(1, Math.round(Number(s.afterDays) || 14))) }))
    .sort((a, b) => a.afterDays - b.afterDays).slice(0, 4);
  return { steps, maxPerRun: Math.min(200, Math.max(1, Number(w.maxPerRun) || DEFAULT_WINBACK.maxPerRun)) };
};

const sign = (secret, customer) => createHmac("sha256", secret).update(`unsub:${customer}`).digest("base64url");
export const unsubToken = (secret, customer) => `${Buffer.from(customer).toString("base64url")}.${sign(secret, customer)}`;
export function readUnsubToken(secret, token) {
  const [b, sig] = String(token).split(".");
  if (!b || !sig) return null;
  const customer = Buffer.from(b, "base64url").toString();
  const want = Buffer.from(sign(secret, customer)), got = Buffer.from(sig);
  return /^cus_[A-Za-z0-9]+$/.test(customer) && want.length === got.length && timingSafeEqual(want, got) ? customer : null;
}

const OPENERS = {
  too_expensive: "You told us price was the reason. If that has changed, or you only needed fewer features, it is a good moment to look again.",
  not_using: "You told us you were not getting enough use out of it. If your situation has changed, picking up where you left off takes a minute.",
  missing_feature: "You told us something was missing. We have kept building since you left, and it may be worth another look.",
  switching: "You moved to another product. If it has not worked out, your account and history are easy to pick up again.",
  temporary: "You said you only needed a break. If you are ready to start again, everything is where you left it.",
  technical: "You told us something was not working. If it is still on your mind, reply to this email and tell us what happened.",
  other: "You cancelled a while ago. If your needs have changed, you are welcome back.",
};

// Plain text on purpose: no tracking pixels, nothing to block.
export function buildWinback({ step, reason, company, url, address, unsubUrl, code, codeText }) {
  const last = step.last;
  const lines = [
    OPENERS[reason] || OPENERS.other, "",
    ...(last && code ? [codeText || `Use code ${code} when you come back.`, ""] : []),
    `Come back: ${url}`, "",
    last ? "This is the last note we will send about it." : "If now is not the time, no reply is needed.",
    "", `${company}`, ...(address ? [address] : []), "",
    `Do not want these? ${unsubUrl}`,
  ];
  return { subject: last ? `Last note from ${company}` : `Still thinking about ${company}?`, text: lines.join("\n") };
}

// Which step (index) is due for this session, or null.
export function dueStep(s, { now, steps, optedOut, live }) {
  if (s.outcome !== "canceled" || !s.churned || !s.churnedAt || !s.reason) return null;
  if (optedOut || s.winback?.won) return null;
  const sent = new Set((s.winback?.sent || []).filter((x) => live ? !x.dry : true).map((x) => x.step));
  for (let i = 0; i < steps.length; i++) {
    if (sent.has(i)) continue;
    return now - s.churnedAt >= steps[i].afterDays * DAY ? i : null; // steps go in order, one per run
  }
  return null;
}

// deps: {stripe, sendEmail, dryRun, publicUrl, linkSecret, winback, company, address, url, code, codeText}
export async function runWinback(state, now, deps) {
  const log = [], cfg = mergeWinback(deps.winback);
  let sentCount = 0;
  state.optouts ||= {};
  for (const s of Object.values(state.sessions)) {
    if (sentCount >= cfg.maxPerRun) break;
    const i = dueStep(s, { now, steps: cfg.steps, optedOut: state.optouts[s.customer], live: !deps.dryRun });
    if (i === null) continue;
    try {
      if (await deps.stripe.hasActiveSubscription(s.customer)) { (s.winback ||= { sent: [] }).won = true; log.push(`winback: ${s.customer} already resubscribed`); continue; }
      const cust = await deps.stripe.getCustomer(s.customer);
      if (!cust.email) { (s.winback ||= { sent: [] }).sent.push({ step: i, at: now, dry: Boolean(deps.dryRun), skipped: "no_email" }); continue; }
      const msg = buildWinback({
        step: { ...cfg.steps[i], last: i === cfg.steps.length - 1 }, reason: s.reason, company: deps.company || "us", url: deps.url,
        address: deps.address, unsubUrl: `${deps.publicUrl}/u/${unsubToken(deps.linkSecret, s.customer)}`, code: deps.code, codeText: deps.codeText,
      });
      if (!deps.dryRun) await deps.sendEmail({ to: cust.email, ...msg, unsubUrl: `${deps.publicUrl}/u/${unsubToken(deps.linkSecret, s.customer)}` });
      (s.winback ||= { sent: [] }).sent.push({ step: i, at: now, dry: Boolean(deps.dryRun) });
      sentCount++;
      log.push(`winback: ${deps.dryRun ? "would send" : "sent"} step ${i + 1} to ${s.customer}`);
    } catch (e) { log.push(`winback: ${s.customer} failed: ${e.message}`); }
  }
  return log;
}

export function summarizeWinback(sessions, optouts = {}) {
  let sent = 0, won = 0, emailed = 0;
  for (const s of sessions) {
    const real = (s.winback?.sent || []).filter((x) => !x.dry && !x.skipped);
    sent += real.length;
    if (real.length) emailed++;
    if (s.winback?.won && real.length) won++;
  }
  return { emailed, sent, optedOut: Object.keys(optouts).length, resubscribed: won, resubscribeRate: emailed ? Math.round((won / emailed) * 1000) / 10 : null };
}
