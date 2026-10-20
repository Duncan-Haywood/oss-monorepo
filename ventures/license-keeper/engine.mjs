// Turns Stripe events into licenses. Idempotent: a replayed event changes nothing.
import { issue, revoke, extend, findBy, claimsOf, DAY } from "./store.mjs";
import { signLicense } from "./token.mjs";

// deps: {plans, stripe, signKey, sendEmail, company, graceDays, now, dryRun}
// plans: {"price_xxx": {product, plan, features, machines, days}}  (days: null = perpetual)
export function licenseEmail(l, token, company = "us") {
  return {
    to: l.email,
    subject: `Your ${l.product} license key`,
    text: `Thanks for buying ${l.product} (${l.plan}).\n\nYour license key:\n\n${token}\n\nPaste it into the app's license screen. It works on up to ${l.machines} machine${l.machines === 1 ? "" : "s"}. Keep this email; the key is how you activate.\n\nIf anything goes wrong, reply to this email.\n\n- ${company}\n`,
  };
}

export async function deliver(state, l, deps) {
  const token = await signLicense(deps.signKey, claimsOf(l));
  const msg = licenseEmail(l, token, deps.company);
  if (deps.dryRun) return `DRY RUN: would email ${l.id} (${l.product}/${l.plan}) to ${l.email}`;
  await deps.sendEmail(msg);
  l.history.push({ at: deps.now, what: "key emailed" });
  return `emailed ${l.id} to ${l.email}`;
}

const grace = (deps) => (deps.graceDays ?? 3) * DAY * 1000;

export async function applyEvent(state, event, deps) {
  if (state.seen[event.id]) return ["duplicate event ignored"];
  state.seen[event.id] = deps.now;
  const ids = Object.keys(state.seen);
  if (ids.length > 5000) for (const k of ids.slice(0, ids.length - 5000)) delete state.seen[k];
  const o = event.data.object;
  const log = [];

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (o.payment_status !== "paid" && o.payment_status !== "no_payment_required") return ["session not paid yet; waiting for async_payment_succeeded"];
    const email = o.customer_details?.email || o.customer_email;
    if (!email) return [`session ${o.id} has no email; issue by hand with POST /v1/licenses`];
    let items;
    try { items = await deps.stripe.lineItems(o.id); } catch (e) { delete state.seen[event.id]; throw e; } // let Stripe retry
    let periodEnd = null;
    if (o.mode === "subscription" && o.subscription) {
      try { periodEnd = (await deps.stripe.subscription(o.subscription)).current_period_end * 1000; } catch (e) { delete state.seen[event.id]; throw e; }
    }
    for (const it of items) {
      const cfg = deps.plans[it.priceId];
      if (!cfg) { log.push(`price ${it.priceId} has no plan in PLANS_JSON; skipped`); continue; }
      const expiresAt = o.mode === "subscription" ? (periodEnd ? periodEnd + grace(deps) : deps.now + 35 * DAY * 1000) : cfg.days ? deps.now + cfg.days * DAY * 1000 : null;
      const l = issue(state, {
        product: cfg.product, email, plan: cfg.plan, features: cfg.features || [], machines: (cfg.machines || 1) * it.quantity, expiresAt,
        stripe: { session: o.id, customer: o.customer || null, subscription: o.subscription || null, paymentIntent: o.payment_intent || null },
      }, deps.now);
      log.push(await deliver(state, l, deps));
    }
    return log.length ? log : ["session had no priced items"];
  }

  if (event.type === "invoice.paid" && o.subscription) {
    const end = Math.max(0, ...(o.lines?.data || []).map((x) => x.period?.end || 0)) * 1000;
    if (!end) return ["invoice had no period; ignored"];
    for (const l of findBy(state, "subscription", o.subscription)) if (extend(state, l.id, end + grace(deps), deps.now)) log.push(`extended ${l.id}`);
    return log.length ? log : ["invoice.paid: nothing to extend"];
  }

  if (event.type === "customer.subscription.deleted") {
    for (const l of findBy(state, "subscription", o.id)) { l.history.push({ at: deps.now, what: "subscription ended; license runs to its paid-through date" }); log.push(`noted end of subscription on ${l.id}`); }
    return log.length ? log : ["no license for this subscription"];
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const full = event.type === "charge.dispute.created" || (o.refunded === true);
    if (!full) return ["partial refund: license kept"];
    for (const l of findBy(state, "paymentIntent", o.payment_intent)) { revoke(state, l.id, event.type === "charge.refunded" ? "refunded" : "disputed", deps.now); log.push(`revoked ${l.id}`); }
    return log.length ? log : ["no license for this charge"];
  }

  return [`ignored ${event.type}`];
}
