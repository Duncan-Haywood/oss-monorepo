import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, program, addAffiliate, applyEvent, balances, createPayouts, markPaid, voidPayout, adjust, setStatus, click, dueOf, DAY } from "./engine.mjs";

const T0 = Date.UTC(2026, 0, 1);
const prog = program({ percent: 20, months: 3, holdDays: 30, minPayout: 1000 });
let n = 0;
const ev = (type, object, at = T0) => ({ id: `evt_${++n}`, type, created: Math.floor(at / 1000), data: { object } });
const session = (o = {}) => ({ id: `cs_${++n}`, mode: "subscription", payment_status: "paid", customer: "cus_1", client_reference_id: "ref_ann", customer_details: { email: "buyer@example.com" }, currency: "usd", ...o });
const invoice = (o = {}) => ({ id: `in_${++n}`, customer: "cus_1", amount_paid: 10000, tax: 0, currency: "usd", payment_intent: `pi_${n}`, charge: `ch_${n}`, ...o });

function setup() {
  const s = newState();
  const ann = addAffiliate(s, { name: "Ann", email: "ann@example.com", code: "ann" }, T0);
  return { s, ann };
}

test("addAffiliate validates and refuses a taken code", () => {
  const { s } = setup();
  assert.throws(() => addAffiliate(s, { name: "X", email: "bad", code: "xx1" }, T0), /email/);
  assert.throws(() => addAffiliate(s, { name: "X", email: "x@y.co", code: "A!" }, T0), /code/);
  assert.throws(() => addAffiliate(s, { name: "Bob", email: "b@y.co", code: "ann" }, T0), /taken/);
  assert.throws(() => addAffiliate(s, { name: "Bob", email: "b@y.co", code: "bob", percent: 150 }, T0), /percent/);
  assert.equal(addAffiliate(s, { name: "Zoë Q", email: "z@y.co" }, T0).code, "zo-q");
});

test("checkout attributes the customer; the first invoice earns a percentage of the net amount", () => {
  const { s } = setup();
  assert.match(applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 })[0], /attributed cus_1 to ann/);
  const log = applyEvent(s, ev("invoice.paid", invoice({ amount_paid: 12000, tax: 2000 })), { program: prog, now: T0 });
  assert.match(log[0], /commission 20\.00 USD/); // 20% of 10 000 net, not of 12 000
  assert.equal(Object.values(s.commissions)[0].amount, 2000);
});

test("a repeated event id is ignored; a repeated invoice (payment_succeeded after paid) pays once", () => {
  const { s } = setup();
  applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 });
  const inv = invoice();
  const e = ev("invoice.paid", inv);
  applyEvent(s, e, { program: prog, now: T0 });
  assert.match(applyEvent(s, e, { program: prog, now: T0 })[0], /duplicate/);
  applyEvent(s, ev("invoice.payment_succeeded", inv), { program: prog, now: T0 });
  assert.equal(Object.keys(s.commissions).length, 1);
});

test("the commission window stops after `months` payments; lifetime never stops", () => {
  const { s } = setup();
  applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 });
  const logs = [1, 2, 3, 4].map(() => applyEvent(s, ev("invoice.paid", invoice()), { program: prog, now: T0 })[0]);
  assert.match(logs[2], /commission/);
  assert.match(logs[3], /past the commission window/);
  const { s: s2 } = setup();
  const life = program({ months: 0 });
  applyEvent(s2, ev("checkout.session.completed", session()), { program: life, now: T0 });
  for (let i = 0; i < 30; i++) applyEvent(s2, ev("invoice.paid", invoice()), { program: life, now: T0 });
  assert.equal(Object.keys(s2.commissions).length, 30);
});

test("self-referral, unknown codes and paused affiliates earn nothing", () => {
  const { s, ann } = setup();
  assert.match(applyEvent(s, ev("checkout.session.completed", session({ customer_details: { email: "Ann@Example.com" } })), { program: prog })[0], /self-referral/);
  assert.match(applyEvent(s, ev("checkout.session.completed", session({ client_reference_id: "ref_nobody" })), { program: prog })[0], /unknown/);
  setStatus(s, ann.id, "paused");
  assert.match(applyEvent(s, ev("checkout.session.completed", session()), { program: prog })[0], /paused/);
  assert.deepEqual(s.customers, {});
});

test("the first referrer keeps the customer; a later code does not steal them", () => {
  const { s } = setup();
  addAffiliate(s, { name: "Bob", email: "bo@example.com", code: "bob" }, T0);
  applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 });
  applyEvent(s, ev("checkout.session.completed", session({ client_reference_id: "ref_bob" })), { program: prog, now: T0 });
  applyEvent(s, ev("invoice.paid", invoice()), { program: prog, now: T0 });
  assert.equal(Object.values(s.commissions)[0].affiliateId, s.codes.ann);
});

test("one-time checkout earns on the session; metadata.ref works; invoice for the same payment does not double up", () => {
  const { s } = setup();
  const cs = session({ mode: "payment", amount_total: 5900, total_details: { amount_tax: 900 }, client_reference_id: null, metadata: { ref: "ANN" }, payment_intent: "pi_x" });
  assert.match(applyEvent(s, ev("checkout.session.completed", cs), { program: prog, now: T0 }).join("\n"), /commission 10\.00 USD/);
  applyEvent(s, ev("invoice.paid", invoice({ payment_intent: "pi_x" })), { program: prog, now: T0 });
  assert.equal(Object.keys(s.commissions).length, 1);
});

test("guest checkout without a Stripe customer is attributed by email", () => {
  const { s } = setup();
  const cs = session({ mode: "payment", customer: null, amount_total: 1000, total_details: { amount_tax: 0 } });
  applyEvent(s, ev("checkout.session.completed", cs), { program: prog, now: T0 });
  assert.ok(s.customers["email:buyer@example.com"]);
  assert.equal(Object.keys(s.commissions).length, 1);
});

test("a partial refund shrinks the commission in proportion and is idempotent across events", () => {
  const { s } = setup();
  applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 });
  const inv = invoice({ amount_paid: 10000 });
  applyEvent(s, ev("invoice.paid", inv), { program: prog, now: T0 });
  const charge = { id: inv.charge, object: "charge", amount: 10000, amount_refunded: 2500, payment_intent: inv.payment_intent };
  applyEvent(s, ev("charge.refunded", charge), { program: prog, now: T0 });
  assert.equal(Object.values(s.commissions)[0].amount, 1500);
  applyEvent(s, ev("charge.refunded", { ...charge, amount_refunded: 10000 }), { program: prog, now: T0 });
  assert.equal(Object.values(s.commissions)[0].amount, 0);
});

test("refund after payout leaves a negative balance that the next earnings absorb", () => {
  const { s, ann } = setup();
  applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 });
  const inv = invoice({ amount_paid: 10000 });
  applyEvent(s, ev("invoice.paid", inv), { program: prog, now: T0 });
  const later = T0 + 31 * DAY;
  const [p] = createPayouts(s, prog, later);
  assert.equal(p.amount, 2000);
  markPaid(s, p.id, "wise 123", later);
  applyEvent(s, ev("charge.refunded", { id: inv.charge, object: "charge", amount: 10000, amount_refunded: 10000 }, later), { program: prog, now: later });
  assert.equal(balances(s, prog, later)[ann.id].due.usd, -2000);
  assert.deepEqual(createPayouts(s, prog, later), []); // nothing to pay on a negative balance
  applyEvent(s, ev("invoice.paid", invoice({ amount_paid: 10000 }), later), { program: prog, now: later });
  assert.equal(balances(s, prog, later + 31 * DAY)[ann.id].due.usd, 0); // 2000 earned - 2000 clawed back
});

test("a dispute withholds the commission and winning it restores it", () => {
  const { s } = setup();
  applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 });
  const inv = invoice();
  applyEvent(s, ev("invoice.paid", inv), { program: prog, now: T0 });
  applyEvent(s, ev("charge.dispute.created", { object: "dispute", charge: inv.charge, payment_intent: inv.payment_intent }), { program: prog, now: T0 });
  assert.equal(Object.values(s.commissions)[0].amount, 0);
  applyEvent(s, ev("charge.dispute.closed", { object: "dispute", status: "won", charge: inv.charge }), { program: prog, now: T0 });
  assert.equal(Object.values(s.commissions)[0].amount, 2000);
});

test("hold period: nothing is due before it ends; payout respects the minimum and never double-counts", () => {
  const { s, ann } = setup();
  applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 });
  applyEvent(s, ev("invoice.paid", invoice({ amount_paid: 3000 })), { program: prog, now: T0 }); // 600 commission
  assert.equal(balances(s, prog, T0 + 5 * DAY)[ann.id].pending.usd, 600);
  assert.equal(balances(s, prog, T0 + 5 * DAY)[ann.id].due.usd, 0);
  assert.deepEqual(createPayouts(s, prog, T0 + 31 * DAY), []); // 600 < minPayout 1000
  const forced = createPayouts(s, prog, T0 + 31 * DAY, { force: true });
  assert.equal(forced[0].amount, 600);
  assert.deepEqual(createPayouts(s, prog, T0 + 60 * DAY, { force: true }), []);
});

test("voiding an open payout makes the money due again; a paid payout cannot be voided", () => {
  const { s, ann } = setup();
  applyEvent(s, ev("checkout.session.completed", session()), { program: prog, now: T0 });
  applyEvent(s, ev("invoice.paid", invoice()), { program: prog, now: T0 });
  const t = T0 + 40 * DAY;
  const [p] = createPayouts(s, prog, t);
  assert.ok(voidPayout(s, p.id));
  assert.equal(balances(s, prog, t)[ann.id].due.usd, 2000);
  const [p2] = createPayouts(s, prog, t);
  markPaid(s, p2.id, "ref", t);
  assert.equal(voidPayout(s, p2.id), null);
});

test("per-affiliate overrides beat the programme; manual adjustments are payable at once", () => {
  const s = newState();
  const vip = addAffiliate(s, { name: "Vip", email: "v@example.com", code: "vip", percent: 50, months: 0 }, T0);
  applyEvent(s, ev("checkout.session.completed", session({ client_reference_id: "ref_vip" })), { program: prog, now: T0 });
  for (let i = 0; i < 5; i++) applyEvent(s, ev("invoice.paid", invoice({ amount_paid: 1000 })), { program: prog, now: T0 });
  assert.equal(Object.values(s.commissions).length, 5);
  assert.equal(Object.values(s.commissions)[0].amount, 500);
  adjust(s, vip.id, { amount: 1500, note: "bonus" }, T0);
  assert.equal(balances(s, prog, T0)[vip.id].due.usd, 1500);
});

test("click counts only known codes; unknown event shapes are ignored without throwing", () => {
  const { s } = setup();
  assert.equal(click(s, "ann"), true);
  assert.equal(click(s, "zzz"), false);
  assert.equal(s.clicks.ann, 1);
  assert.deepEqual(applyEvent(s, { id: "e", type: "customer.created", data: { object: {} } }, { program: prog }), []);
  assert.deepEqual(applyEvent(s, null), ["ignored: not an event"]);
});

test("program() normalises and rejects", () => {
  assert.equal(program({ months: 0 }).months, null);
  assert.equal(program({ percent: 500 }).percent, 100);
  assert.throws(() => program({ holdDays: "x" }), /invalid/);
  assert.equal(dueOf({ status: "void", amount: 5, paid: 0, at: 0 }, prog, T0 + 99 * DAY), 0);
});
