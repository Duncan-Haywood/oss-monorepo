// The recovery state machine. Holds a `state` object ({cases, seen}) that the
// server persists as JSON. Effects (Stripe, email, alerts) are injected so the
// whole thing is testable without a network.
import { planRecovery, replan, classifyDecline, formatMoney, mergePolicy } from "./dunning.mjs";
import { renderEmail } from "./templates.mjs";
import { findExpiring } from "./expiry.mjs";
import { assignArm, experiment } from "./holdout.mjs";
import { buildDigest, renderDigest, DIGEST_EVERY_MS } from "./digest.mjs";

export function newState() { return { cases: {}, seen: [], stats: { recoveredMinor: {}, recovered: 0, lost: 0, emails: 0, retries: 0 } }; }

const MAX_SEEN = 500;
const MAX_ATTEMPTS = 3; // per step, then it is marked failed and the owner is told

function closeCase(state, c, outcome, now) {
  if (c.status !== "open") return;
  c.status = outcome; c.closedAt = now;
  for (const s of c.steps) if (s.status === "pending") s.status = "skipped";
  if (outcome === "recovered") {
    state.stats.recovered += 1;
    state.stats.recoveredMinor[c.currency] = (state.stats.recoveredMinor[c.currency] || 0) + c.amountMinor;
  } else if (outcome === "lost") state.stats.lost += 1;
}

// Operator action: stop chasing one invoice (customer phoned, goodwill, dispute).
// The case stays on record as "stopped" and later failures of the same invoice
// do not restart it. It is not counted as recovered or lost.
export function stopCase(state, invoiceId, now) {
  const c = state.cases[invoiceId];
  if (!c) return { error: "no such case", code: 404 };
  if (c.status !== "open") return { error: `case is already ${c.status}`, code: 409 };
  closeCase(state, c, "stopped", now);
  c.log.push(`${new Date(now).toISOString()} stopped by operator`);
  return { stopped: invoiceId };
}

// Feed one verified Stripe event in. `declineCode` is resolved by the caller
// (it needs an API call) and only used for payment_failed.
export function applyEvent(state, event, { now, policy, declineCode, holdoutPct = 0 }) {
  if (state.seen.includes(event.id)) return { ignored: "duplicate" };
  state.seen.push(event.id);
  if (state.seen.length > MAX_SEEN) state.seen.splice(0, state.seen.length - MAX_SEEN);
  const obj = event.data?.object || {};
  switch (event.type) {
    case "invoice.payment_failed": {
      if (!obj.id) return { ignored: "no invoice id" };
      if (obj.paid || obj.status === "paid") return { ignored: "already paid" };
      const existing = state.cases[obj.id];
      if (existing && existing.status === "stopped") return { ignored: "stopped by operator" };
      if (existing && existing.status === "open") {
        existing.attempts = obj.attempt_count ?? existing.attempts + 1;
        existing.lastDecline = declineCode || existing.lastDecline;
        if (existing.arm === "holdout") return { updated: obj.id, class: existing.class, arm: "holdout" };
        const next = replan(existing, { declineCode: existing.lastDecline, now, policy });
        existing.class = next.class; existing.steps = next.steps;
        return { updated: obj.id, class: existing.class };
      }
      const plan = planRecovery({ declineCode, t0: now, policy });
      const arm = assignArm(obj.customer || obj.id, holdoutPct);
      // Holdout: record the failure, take no action, close it on the same clock.
      if (arm === "holdout") plan.steps = plan.steps.filter((s) => s.kind === "expire");
      state.cases[obj.id] = {
        ...(holdoutPct ? { arm } : {}),
        invoiceId: obj.id, customer: obj.customer, subscription: obj.subscription || obj.parent?.subscription_details?.subscription || null,
        email: obj.customer_email || null, name: obj.customer_name || null,
        amountMinor: obj.amount_remaining ?? obj.amount_due ?? 0, currency: obj.currency || "usd",
        hostedUrl: obj.hosted_invoice_url || null, t0: now, attempts: obj.attempt_count ?? 1,
        lastDecline: declineCode || null, class: plan.class, steps: plan.steps, status: "open", log: [],
      };
      return { opened: obj.id, class: plan.class };
    }
    case "invoice.paid": case "invoice.payment_succeeded": {
      const c = state.cases[obj.id];
      if (c) closeCase(state, c, "recovered", now);
      return c ? { closed: obj.id, outcome: "recovered" } : { ignored: "no case" };
    }
    case "invoice.voided": case "invoice.marked_uncollectible": {
      const c = state.cases[obj.id];
      if (c) closeCase(state, c, "voided", now);
      return c ? { closed: obj.id, outcome: "voided" } : { ignored: "no case" };
    }
    case "customer.subscription.deleted": {
      let n = 0;
      for (const c of Object.values(state.cases)) if (c.status === "open" && c.subscription === obj.id) { closeCase(state, c, "voided", now); n++; }
      return { closed: n };
    }
    case "payment_method.attached": case "customer.updated": {
      // Customer put a new card on file: try the open invoices now, once.
      const cust = obj.customer || (event.type === "customer.updated" ? obj.id : null);
      let n = 0;
      for (const c of Object.values(state.cases)) {
        if (c.status === "open" && c.arm !== "holdout" && c.customer === cust && !c.steps.some((s) => s.id.startsWith("card-updated") && s.status === "pending")) {
          c.steps.push({ id: `card-updated-${now}`, kind: "retry", at: now, status: "pending", reason: "card updated" }); n++;
        }
      }
      return { queued: n };
    }
    default:
      return { ignored: event.type };
  }
}

export function dueSteps(state, now) {
  const out = [];
  for (const c of Object.values(state.cases)) {
    if (c.status !== "open") continue;
    for (const s of c.steps) if (s.status === "pending" && s.at <= now) out.push({ c, s });
  }
  return out.sort((a, b) => a.s.at - b.s.at);
}

function emailVars(c, deps) {
  return {
    name: c.name || "there", amount: formatMoney(c.amountMinor, c.currency), company: deps.company || "our team",
    address: deps.address || "", update_url: deps.updateUrl(c), deadline: new Date(c.t0 + (deps.policy.graceDays) * 86400000).toISOString().slice(0, 10),
  };
}

// Run everything due. deps: {stripe, sendEmail, alert, updateUrl, company, address, policy, dryRun, cancelOnExpire}
export async function tick(state, now, deps) {
  const policy = mergePolicy(deps.policy);
  const done = [];
  for (const { c, s } of dueSteps(state, now)) {
    if (c.status !== "open") continue;
    const note = (msg) => { c.log.push({ at: now, step: s.id, msg }); done.push(`${c.invoiceId} ${s.id}: ${msg}`); };
    try {
      if (s.kind === "email") {
        if (!c.email) { s.status = "skipped"; note("no customer email on invoice"); continue; }
        const mail = renderEmail(s.template, emailVars(c, { ...deps, policy }));
        if (!deps.dryRun) await deps.sendEmail({ to: c.email, ...mail });
        s.status = "done"; state.stats.emails += 1; note(deps.dryRun ? `dry run: would email ${s.template}` : `emailed ${s.template}`);
      } else if (s.kind === "retry") {
        if (deps.dryRun) { s.status = "done"; note("dry run: would retry payment"); continue; }
        const inv = await deps.stripe.getInvoice(c.invoiceId);
        if (inv.status !== "open") { closeCase(state, c, inv.status === "paid" ? "recovered" : "voided", now); note(`invoice is ${inv.status}`); continue; }
        state.stats.retries += 1;
        try {
          await deps.stripe.payInvoice(c.invoiceId, `dd-${c.invoiceId}-${s.id}`);
          s.status = "done"; closeCase(state, c, "recovered", now); note("retry succeeded");
        } catch (e) {
          if (e.status && e.status !== 402 && e.status < 500 && e.status !== 429) throw e;
          s.status = "done"; c.attempts += 1;
          if (e.declineCode || e.code) {
            c.lastDecline = e.declineCode || e.code;
            const next = replan(c, { declineCode: c.lastDecline, now, policy });
            c.class = next.class; c.steps = next.steps;
          }
          note(`retry declined: ${c.lastDecline || e.message}`);
        }
      } else if (s.kind === "expire") {
        if (c.arm === "holdout") { s.status = "done"; closeCase(state, c, "lost", now); note("holdout: grace period over, left alone by design"); continue; }
        if (deps.cancelOnExpire && c.subscription && !deps.dryRun) await deps.stripe.cancelSubscription(c.subscription, `dd-${c.invoiceId}-cancel`);
        s.status = "done"; closeCase(state, c, "lost", now);
        note(deps.cancelOnExpire && !deps.dryRun ? "grace period over: subscription cancelled" : "grace period over: left for you to decide");
        await deps.alert?.(`dunning-engine: ${c.invoiceId} (${formatMoney(c.amountMinor, c.currency)}, ${c.email || c.customer}) was not recovered in ${policy.graceDays} days.`);
      }
    } catch (e) {
      s.tries = (s.tries || 0) + 1;
      note(`error: ${e.message}`);
      if (s.tries >= MAX_ATTEMPTS) { s.status = "failed"; await deps.alert?.(`dunning-engine: step ${s.id} on ${c.invoiceId} failed ${MAX_ATTEMPTS} times: ${e.message}`).catch(() => {}); }
      else s.at = now + 5 * 60000 * s.tries; // back off, try again on a later tick
    }
  }
  await sendDigest(state, now, deps, done);
  return done;
}

// Once a week, if DIGEST_TO is set: a plain-text summary to the owner. The
// first call only starts the clock, so a fresh install does not mail an empty
// week. deps adds: digestTo, sendEmail, company, dryRun.
async function sendDigest(state, now, deps, done) {
  if (!deps.digestTo) return;
  const dg = (state.digest ||= { last: now });
  if (now - dg.last < DIGEST_EVERY_MS) return;
  const mail = renderDigest(buildDigest(state, now), { company: deps.company, dryRun: deps.dryRun });
  try {
    if (!deps.dryRun) await deps.sendEmail({ to: deps.digestTo, ...mail });
  } catch (e) { done.push(`digest: error: ${e.message}`); dg.last = now - DIGEST_EVERY_MS + 3600000; return; }
  dg.last = now;
  done.push(deps.dryRun ? `digest: dry run: would email ${deps.digestTo}: ${mail.subject}` : `digest: emailed ${deps.digestTo}`);
}

const SCAN_EVERY_MS = 24 * 3600000;

// Once a day: email customers whose card expires soon, once per card. Skips
// customers who already have an open recovery case (they are being dunned).
// deps adds: expiryNotices (bool), expiryDays, stripe.listSubscriptionsWithCards.
export async function scanExpiring(state, now, deps) {
  if (!deps.expiryNotices) return [];
  const ex = (state.expiry ||= { lastScan: 0, notified: {} });
  if (now - ex.lastScan < SCAN_EVERY_MS) return [];
  const done = [];
  const subs = await deps.stripe.listSubscriptionsWithCards();
  ex.lastScan = now;
  const dunned = new Set(Object.values(state.cases).filter((c) => c.status === "open").map((c) => c.customer));
  for (const x of findExpiring(subs, now, { withinDays: deps.expiryDays ?? 30 })) {
    if (ex.notified[x.pm] || dunned.has(x.customer)) continue;
    if (!x.email) { done.push(`expiry ${x.pm}: no customer email`); continue; }
    const phrase = x.expired ? `expired on ${x.expires}` : `expires ${x.expires}`;
    const mail = renderEmail("expiring", {
      name: x.name || "there", brand: x.brand, last4: x.last4, expiry_phrase: phrase, company: deps.company || "our team",
      address: deps.address || "", update_url: deps.updateUrl({ customer: x.customer }),
    });
    if (deps.dryRun) { done.push(`expiry ${x.pm}: dry run: would email ${x.email} (card ${phrase})`); continue; }
    try { await deps.sendEmail({ to: x.email, ...mail }); } catch (e) { done.push(`expiry ${x.pm}: error: ${e.message}`); continue; }
    ex.notified[x.pm] = now; state.stats.expiryEmails = (state.stats.expiryEmails || 0) + 1;
    done.push(`expiry ${x.pm}: emailed (card ${phrase})`);
  }
  return done;
}

export function summary(state) {
  const open = Object.values(state.cases).filter((c) => c.status === "open");
  const atRisk = {};
  for (const c of open) atRisk[c.currency] = (atRisk[c.currency] || 0) + c.amountMinor;
  const ex = experiment(state.cases);
  return { open: open.length, atRiskMinor: atRisk, ...state.stats, ...(ex ? { experiment: ex } : {}) };
}
export { classifyDecline };
