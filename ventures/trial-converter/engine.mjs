// The trial state machine. Holds a `state` object ({cases, seen, stats}) that
// the server persists as JSON. Effects (Stripe, email, alerts) are injected so
// the whole thing is testable without a network.
import { planTrial, replan, mergePolicy, formatMoney } from "./trial.mjs";
import { renderEmail } from "./templates.mjs";

const DAY = 86400000;
const MAX_SEEN = 500;
const MAX_ATTEMPTS = 3;

export function newState() {
  const g = () => ({ converted: 0, lost: 0 });
  return { cases: {}, seen: [], stats: { emails: 0, extensions: 0, card: g(), nocard: g() } };
}

function closeCase(state, c, outcome, now) {
  if (c.status !== "open") return;
  c.status = outcome; c.closedAt = now;
  for (const s of c.steps) if (s.status === "pending") s.status = "skipped";
  if (outcome === "converted" || outcome === "lost") state.stats[c.cardAtStart ? "card" : "nocard"][outcome] += 1;
}

const unix = (s) => (Number.isFinite(Number(s)) ? Number(s) * 1000 : null);

function priceOf(sub) {
  const item = sub.items?.data?.[0];
  const price = item?.price || item?.plan || {};
  const unit = price.unit_amount ?? price.amount ?? 0;
  return { amountMinor: unit * (item?.quantity || 1), currency: price.currency || sub.currency || "usd", interval: price.recurring?.interval || price.interval || "month" };
}

// Feed one verified Stripe event in. `hasCard` is resolved by the caller (it can
// need an API call) and only used when a trial is first seen or its card state
// is re-read.
export function applyEvent(state, event, { now, policy, hasCard }) {
  if (state.seen.includes(event.id)) return { ignored: "duplicate" };
  state.seen.push(event.id);
  if (state.seen.length > MAX_SEEN) state.seen.splice(0, state.seen.length - MAX_SEEN);
  const obj = event.data?.object || {};
  switch (event.type) {
    case "customer.subscription.created": case "customer.subscription.updated": case "customer.subscription.trial_will_end": {
      const id = obj.id;
      if (!id) return { ignored: "no subscription id" };
      const c = state.cases[id];
      const end = unix(obj.trial_end);
      if (obj.status === "trialing" && end) {
        const card = hasCard ?? Boolean(obj.default_payment_method);
        if (!c) {
          const start = unix(obj.trial_start) ?? now;
          if (end <= now) return { ignored: "trial already over" };
          const price = priceOf(obj);
          const open = {
            subscription: id, customer: typeof obj.customer === "string" ? obj.customer : obj.customer?.id, email: obj.customer_email || null, name: null,
            trialStart: start, trialEnd: end, hasCard: card, cardAtStart: card, extensions: 0, ...price, status: "open", steps: [], log: [], t0: now,
          };
          open.steps = planTrial({ start, end, hasCard: card, policy, now });
          state.cases[id] = open;
          return { opened: id, mode: card ? "card" : "nocard", steps: open.steps.length };
        }
        if (c.status !== "open") return { ignored: `case is ${c.status}` };
        const moved = end !== c.trialEnd, carded = card !== c.hasCard;
        if (!moved && !carded) return { ignored: "no change" };
        // A trial moved by the merchant (or by us) re-plans from the new end.
        if (moved) c.trialEnd = end;
        c.hasCard = card;
        c.steps = replan(c, { now, policy });
        return { updated: id, moved, cardAdded: carded && card, mode: card ? "card" : "nocard" };
      }
      if (c && c.status === "open" && ["active", "past_due", "incomplete"].includes(obj.status)) {
        closeCase(state, c, "converted", now);
        return { closed: id, outcome: "converted" };
      }
      if (c && c.status === "open" && ["canceled", "incomplete_expired", "paused", "unpaid"].includes(obj.status)) {
        closeCase(state, c, "lost", now);
        return { closed: id, outcome: "lost" };
      }
      return { ignored: c ? `status ${obj.status}` : "not a trial" };
    }
    case "customer.subscription.deleted": case "customer.subscription.paused": {
      const c = state.cases[obj.id];
      if (c) closeCase(state, c, "lost", now);
      return c ? { closed: obj.id, outcome: "lost" } : { ignored: "no case" };
    }
    case "invoice.paid": case "invoice.payment_succeeded": {
      const sub = obj.subscription || obj.parent?.subscription_details?.subscription;
      const c = sub && state.cases[sub];
      if (c && obj.amount_paid > 0) { closeCase(state, c, "converted", now); return { closed: sub, outcome: "converted" }; }
      return { ignored: "no case" };
    }
    case "payment_method.attached": {
      // A card was added by a customer in a card-less trial: flip them to the
      // card plan (the heads-up email replaces the begging).
      let n = 0;
      for (const c of Object.values(state.cases)) {
        if (c.status === "open" && c.customer === obj.customer && !c.hasCard) {
          c.hasCard = true; c.steps = replan(c, { now, policy }); n++;
        }
      }
      return { cardAdded: n };
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

const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

function emailVars(c, deps, extra = {}) {
  return {
    name: c.name || "there", amount: formatMoney(c.amountMinor, c.currency), interval: c.interval, company: deps.company || "our team",
    address: deps.address || "", end_date: dateOf(c.trialEnd), manage_url: deps.manageUrl(c),
    tips_line: deps.tipsUrl ? ` A good place to start: ${deps.tipsUrl}` : "", ...extra,
  };
}

// Run everything due. deps: {stripe, sendEmail, alert, manageUrl, company, address, tipsUrl, policy, dryRun}
export async function tick(state, now, deps) {
  const policy = mergePolicy(deps.policy);
  const done = [];
  for (const { c, s } of dueSteps(state, now)) {
    if (c.status !== "open") continue;
    const note = (msg) => { c.log.push({ at: now, step: s.id, msg }); done.push(`${c.subscription} ${s.id}: ${msg}`); };
    try {
      if (c.trialEnd <= now) { s.status = "skipped"; note("trial already ended"); continue; }
      if (s.kind === "email") {
        if (now - s.at > policy.staleHours * 3600000) { s.status = "skipped"; note("too late to send, skipped"); continue; }
        if (!c.email) {
          // The subscription event rarely carries the address; fetch it once.
          if (deps.stripe?.customerEmail) { const e = await deps.stripe.customerEmail(c.customer).catch(() => null); if (e) { c.email = e.email; c.name = c.name || e.name; } }
          if (!c.email) { s.status = "skipped"; note("no customer email"); continue; }
        }
        const mail = renderEmail(s.template, emailVars(c, deps, s.extraDays ? { extra_days: s.extraDays } : {}));
        if (!deps.dryRun) await deps.sendEmail({ to: c.email, ...mail });
        s.status = "done"; state.stats.emails += 1; note(deps.dryRun ? `dry run: would email ${s.template}` : `emailed ${s.template}`);
      } else if (s.kind === "extend") {
        if (c.hasCard || c.extensions >= 1) { s.status = "skipped"; note("card added or already extended"); continue; }
        const newEnd = c.trialEnd + s.days * DAY;
        if (!deps.dryRun) {
          const sub = await deps.stripe.getSubscription(c.subscription);
          if (sub.status !== "trialing" || sub.default_payment_method) { s.status = "skipped"; note(`subscription is ${sub.status}${sub.default_payment_method ? " with a card" : ""}`); continue; }
          await deps.stripe.extendTrial(c.subscription, Math.floor(newEnd / 1000), `tc-${c.subscription}-extend`);
        }
        s.status = "done"; c.extensions += 1; c.trialEnd = newEnd; state.stats.extensions += 1;
        c.steps = replan(c, { now, policy });
        c.steps.push({ id: `extended-x${c.extensions}`, kind: "email", template: "extended", at: now, status: "pending", extraDays: s.days });
        note(deps.dryRun ? `dry run: would extend the trial ${s.days} days` : `trial extended ${s.days} days to ${dateOf(newEnd)}`);
      }
    } catch (e) {
      s.tries = (s.tries || 0) + 1;
      note(`error: ${e.message}`);
      if (s.tries >= MAX_ATTEMPTS) { s.status = "failed"; await deps.alert?.(`trial-converter: step ${s.id} on ${c.subscription} failed ${MAX_ATTEMPTS} times: ${e.message}`).catch(() => {}); }
      else s.at = now + 5 * 60000 * s.tries;
    }
  }
  return done;
}

const ratio = (g) => (g.converted + g.lost ? Math.round((1000 * g.converted) / (g.converted + g.lost)) / 10 : null);

export function summary(state) {
  const open = Object.values(state.cases).filter((c) => c.status === "open");
  const s = state.stats;
  return {
    open: open.length, openWithoutCard: open.filter((c) => !c.hasCard).length,
    converted: s.card.converted + s.nocard.converted, lost: s.card.lost + s.nocard.lost,
    conversionPctWithCard: ratio(s.card), conversionPctWithoutCard: ratio(s.nocard),
    emails: s.emails, extensions: s.extensions,
  };
}
