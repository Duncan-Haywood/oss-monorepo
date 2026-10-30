import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { exampleDesk, unpaid, quote, taxSummary, normalizeDesk } from "./engine.mjs";
import * as V from "./invoices.mjs";
import { verifyStripeSignature, stripeSignature, formEncode, tipCents, recordStripeEvent, MIN_CHARGE_CENTS } from "./invoices-server.mjs";
import { handler } from "./server.mjs";

const TODAY = "2026-11-02";
const token = "0123456789abcdef0123456789abcdef";
const desk0 = () => {
  const d = exampleDesk(TODAY);
  d.profile.invoicing = { venmo: "grace-example", zelle: "grace@example.com", checkTo: "Grace Example", dueDays: 7, tips: true };
  return d;
};
const sum = (xs) => Math.round(xs.reduce((a, x) => a + x, 0) * 100) / 100;

test("an invoice for one sit carries quote() lines, the due date and a sequential number", () => {
  const d = desk0();
  const bk3 = d.bookings.find((b) => b.id === "bk_3"); // 2026-10-30, 17:00-21:00, 2 kids, unpaid
  const inv = V.createInvoice(d, { familyId: "fam_a", from: bk3.date, issued: TODAY, id: "inv_1", token });
  assert.equal(inv.number, "INV-2026-001");
  assert.equal(inv.due, "2026-11-09");
  assert.deepEqual(inv.keys, ["bk_3"]);
  const q = quote(bk3, d.profile.rates, d.profile.holidays);
  assert.equal(inv.total, q.total);
  assert.equal(inv.total, 92); // 4 h × ($20 + $3 for the second child)
  assert.deepEqual(inv.items[0].lines.map((l) => l.amount), q.lines.map((l) => l.amount));
  d.invoices = [inv];
  assert.equal(V.nextInvoiceNumber(d, "2026"), "INV-2026-002");
  assert.equal(V.createInvoice(d, { familyId: "fam_a", from: bk3.date, issued: TODAY, id: "inv_2", token }), null, "a sit on an open invoice is not billed twice");
  inv.status = "void";
  assert.ok(V.createInvoice(d, { familyId: "fam_a", from: bk3.date, issued: TODAY, id: "inv_2", token }), "voiding frees the sit");
});

test("a weekly invoice bills each sit of a recurring booking in the period, and payments apply oldest first like unpaid()", () => {
  const d = desk0();
  const bk4 = d.bookings.find((b) => b.id === "bk_4"); // weekly from 2026-11-03, 15:30-18:30, 2 kids, 6 weeks
  const inv = V.createInvoice(d, { familyId: "fam_a", from: "2026-11-03", to: "2026-11-16", issued: "2026-11-17", id: "inv_w", token });
  assert.deepEqual(inv.keys, ["bk_4#0", "bk_4#1"]);
  assert.equal(inv.total, 138); // 2 × 3 h × $23
  d.invoices = [inv];
  bk4.payments = [{ amount: 100, date: "2026-11-17", method: "Venmo" }];
  const st = V.invoiceStatus(d, inv, "2026-11-17");
  assert.deepEqual(st.items.map((i) => i.paid), [69, 31]);
  assert.equal(st.balance, 38);
  assert.equal(st.state, "part paid");
  assert.equal(unpaid(d, "2026-11-16").find((u) => u.booking.id === "bk_4").owed, 38, "the invoice balance matches unpaid() through the period");
  assert.equal(V.invoiceStatus(d, inv, "2026-11-30").state, "overdue");
});

test("recording a payment spreads it over the invoice's sits, keeps a tip separate and is idempotent by ref", () => {
  const d = desk0();
  d.bookings.push({ id: "bk_5", familyId: "fam_b", date: "2026-10-20", start: "15:00", end: "18:00", kids: 1, status: "done" });
  d.bookings.push({ id: "bk_6", familyId: "fam_b", date: "2026-10-27", start: "15:00", end: "19:00", kids: 1, status: "done", paid: 20, paidDate: "2026-10-27", method: "cash" });
  const inv = V.createInvoice(d, { familyId: "fam_b", from: "2026-10-20", to: "2026-10-31", issued: TODAY, id: "inv_b", token });
  assert.equal(inv.total, 140); // 3 h × $20 + 4 h × $20
  d.invoices = [inv];
  assert.equal(V.invoiceStatus(d, inv, TODAY).balance, 120, "a legacy `paid` field counts");
  const incomeBefore = taxSummary(d, 2026, TODAY).income;
  const rid = V.recordInvoicePayment(d, inv, { amount: 120, tip: 15, date: TODAY, method: "Zelle", ref: "zelle-77" });
  assert.equal(rid, "INV-2026-001-R1");
  const st = V.invoiceStatus(d, inv, TODAY);
  assert.equal(st.balance, 0);
  assert.equal(st.state, "paid");
  assert.equal(st.tips, 15);
  assert.equal(d.bookings.find((b) => b.id === "bk_6").payments[0].amount, 20, "the legacy payment was kept when payments became a list");
  assert.equal(unpaid(d, TODAY).filter((u) => u.booking.familyId === "fam_b").length, 0, "a tip never counts against what a sit costs, and the sits are paid");
  assert.equal(taxSummary(d, 2026, TODAY).income, incomeBefore + 135, "tips are income");
  assert.equal(V.recordInvoicePayment(d, inv, { amount: 120, date: TODAY, ref: "zelle-77" }), null);
  assert.throws(() => V.recordInvoicePayment(d, inv, { amount: 0, date: TODAY }), /amount/);
  const r = V.receipts(d).find((x) => x.id === rid);
  assert.equal(r.amount, 120);
  assert.equal(r.tip, 15);
  assert.deepEqual(r.sits.sort(), ["2026-10-20", "2026-10-27"]);
  const html = V.receiptHTML(d, rid);
  assert.match(html, /Total received<\/td><td class="n">\$135\.00/);
  assert.match(html, /Balance left on invoice INV-2026-001: \$0\.00/);
});

test("a tip alone does not pay a sit (unpaid() ignores tips)", () => {
  const d = desk0();
  d.bookings.find((b) => b.id === "bk_3").payments = [{ amount: 10, date: TODAY, method: "cash", tip: true }];
  assert.equal(unpaid(d, TODAY).find((u) => u.booking.id === "bk_3").owed, 92);
});

test("the aging buckets add up to unpaid() on any day, using the invoice due date when there is one", () => {
  const d = desk0();
  d.bookings.push({ id: "old", familyId: "fam_b", date: "2026-08-15", start: "18:00", end: "21:00", kids: 1, status: "done" });
  d.bookings.push({ id: "mid", familyId: "fam_b", date: "2026-09-20", start: "18:00", end: "21:00", kids: 1, status: "done", payments: [{ amount: 25, date: "2026-09-20" }] });
  for (const day of ["2026-10-01", TODAY, "2026-11-20", "2026-12-31"]) {
    const ag = V.aging(d, day);
    assert.equal(ag.total, sum(unpaid(d, day).map((u) => u.owed)), day);
  }
  let ag = V.aging(d, TODAY);
  assert.equal(ag.buckets.d60p, 60, "2026-08-15 is 79 days past");
  assert.equal(ag.buckets.d31_60, 35, "2026-09-20, $60 less $25, is 43 days past");
  assert.equal(ag.buckets.d1_30, 92, "bk_3 from 3 days ago");
  assert.equal(ag.buckets.current, 0);
  d.invoices = [V.createInvoice(d, { familyId: "fam_a", from: "2026-10-30", issued: "2026-10-31", id: "i", token })];
  ag = V.aging(d, TODAY);
  assert.equal(ag.buckets.current, 92, "on an invoice due 2026-11-07, so not yet due");
  assert.equal(ag.rows.find((r) => r.bookingId === "bk_3").invoice, "INV-2026-001");
  assert.equal(ag.byFamily.fam_b, 95);
});

test("the printable invoice shows the lines, balance, the sitter's own payment handles and a print button", () => {
  const d = desk0();
  const inv = V.createInvoice(d, { familyId: "fam_a", from: "2026-10-30", issued: TODAY, id: "i", token });
  d.invoices = [inv];
  const html = V.invoiceHTML(d, inv, TODAY, { payUrl: "https://grace.example/pay/" + token });
  assert.match(html, /Invoice INV-2026-001/);
  assert.match(html, /Bill to: <strong>Rivera family/);
  assert.match(html, /4 h × \$23\/h \(2 children\)/);
  assert.match(html, /Balance due<\/td><td class="n">\$92\.00/);
  assert.match(html, /Venmo: @grace-example/);
  assert.match(html, /Zelle: grace@example\.com/);
  assert.match(html, /Check payable to: Grace Example/);
  assert.match(html, /onclick="print\(\)"/);
  assert.match(html, /@media print/);
  assert.match(html, /https:\/\/grace\.example\/pay\//);
  const text = V.invoiceText(d, inv, TODAY);
  assert.match(text, /Balance due \$92\.00/);
  d.families[0].name = `<script>alert(1)</script>`;
  assert.doesNotMatch(V.invoiceHTML(d, inv, TODAY), /<script>alert/);
});

test("an agreed price on the booking overrides the quote, like unpaid()", () => {
  const d = desk0();
  d.bookings.find((b) => b.id === "bk_3").price = 80;
  const inv = V.createInvoice(d, { familyId: "fam_a", from: "2026-10-30", issued: TODAY, id: "i", token });
  assert.equal(inv.total, 80);
  assert.equal(unpaid(d, TODAY).find((u) => u.booking.id === "bk_3").owed, 80);
});

test("invoices survive normalizeDesk", () => {
  const d = desk0();
  d.invoices = [V.createInvoice(d, { familyId: "fam_a", from: "2026-10-30", issued: TODAY, id: "i", token })];
  assert.equal(normalizeDesk(JSON.parse(JSON.stringify(d))).invoices.length, 1);
});

// ---------- Stripe ----------

test("Stripe-Signature: a known-answer vector computed with openssl, tolerance, v0 ignored, rotation", () => {
  const secret = "whsec_test_secret_for_kit";
  const body = '{"id":"evt_test_1","type":"checkout.session.completed"}';
  // printf '%s' '1700000000.<body>' | openssl dgst -sha256 -hmac 'whsec_test_secret_for_kit' -hex
  const known = "014dbb6528cca9a2ed622c7a7a591cd0a090dc7af6150f729d1588ac479a9e5b";
  assert.equal(stripeSignature(secret, "1700000000", body), known);
  assert.ok(verifyStripeSignature(`t=1700000000,v1=${known}`, body, secret, 1700000100));
  assert.ok(verifyStripeSignature(`t=1700000000,v1=${"0".repeat(64)},v1=${known},v0=abc`, body, secret, 1700000000), "any v1 may match while a secret is rolled");
  assert.ok(!verifyStripeSignature(`t=1700000000,v1=${known}`, body, secret, 1700000301), "older than 5 minutes");
  assert.ok(!verifyStripeSignature(`t=1700000000,v0=${known}`, body, secret, 1700000000), "only v1 counts");
  assert.ok(!verifyStripeSignature(`t=1700000000,v1=${known}`, body + " ", secret, 1700000000), "body changed");
  assert.ok(!verifyStripeSignature(`t=1700000001,v1=${known}`, body, secret, 1700000001), "timestamp changed");
  assert.ok(!verifyStripeSignature(`t=1700000000,v1=${known}`, body, "whsec_other", 1700000000));
  assert.ok(!verifyStripeSignature(`t=1700000000,v1=${known}`, body, secret, 1700000000, 0), "a tolerance of 0 never passes");
  assert.ok(!verifyStripeSignature("", body, secret, 1700000000));
});

test("form encoding uses Stripe's bracketed keys; tips are a percent of the balance or a capped custom amount", () => {
  assert.equal(formEncode({ mode: "payment", "line_items[0]": { quantity: 1, price_data: { currency: "usd", unit_amount: 9200 } }, metadata: { a: "x y" } }),
    "mode=payment&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=9200&metadata%5Ba%5D=x%20y");
  assert.equal(tipCents({ tip: "15" }, 9200), 1380);
  assert.equal(tipCents({ tip: "none" }, 9200), 0);
  assert.equal(tipCents({ tip: "custom", tipAmount: "12.5" }, 9200), 1250);
  assert.equal(tipCents({ tip: "custom", tipAmount: "999" }, 9200), 9200);
  assert.equal(tipCents({ tip: "custom", tipAmount: "-3" }, 9200), 0);
  assert.equal(tipCents({ tip: "50" }, 9200), 0);
});

async function serve(state, env, fetchImpl, nowMs) {
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, env, () => nowMs, fetchImpl));
  await new Promise((r) => srv.listen(0, r));
  return { base: `http://127.0.0.1:${srv.address().port}`, saves: () => saves, close: () => new Promise((r) => srv.close(r)) };
}

test("server: the pay link shows the invoice; with Stripe on, POST creates a Checkout Session on the sitter's key and redirects", async () => {
  const d = desk0();
  const inv = V.createInvoice(d, { familyId: "fam_a", from: "2026-10-30", issued: TODAY, id: "inv_s", token });
  d.invoices = [inv];
  const state = { desk: d };
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }) }; };
  const nowMs = Date.parse("2026-11-02T15:00:00Z");
  let s = await serve(state, {}, fetchImpl, nowMs);
  try {
    const off = await fetch(`${s.base}/pay/${token}`);
    assert.equal(off.status, 200);
    assert.equal(off.headers.get("cache-control"), "no-store");
    const html = await off.text();
    assert.match(html, /Venmo: @grace-example/);
    assert.doesNotMatch(html, /by card/, "card form only with Stripe keys");
    assert.equal((await fetch(`${s.base}/pay/${token}`, { method: "POST", body: "" })).status, 400);
    assert.equal((await fetch(`${s.base}/pay/${"f".repeat(32)}`)).status, 404);
    assert.equal((await fetch(`${s.base}/pay/nope`)).status, 404);
  } finally { await s.close(); }
  const env = { STRIPE_SECRET_KEY: "sk_test_sitter", STRIPE_WEBHOOK_SECRET: "whsec_x", PUBLIC_URL: "https://grace.example" };
  s = await serve(state, env, fetchImpl, nowMs);
  try {
    assert.match(await (await fetch(`${s.base}/pay/${token}`)).text(), /Pay \$92\.00 by card/);
    const r = await fetch(`${s.base}/pay/${token}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "tip=20", redirect: "manual" });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_test_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(calls[0].init.headers.authorization, "Bearer sk_test_sitter");
    const p = new URLSearchParams(calls[0].init.body);
    assert.equal(p.get("mode"), "payment");
    assert.equal(p.get("line_items[0][price_data][unit_amount]"), "9200");
    assert.equal(p.get("line_items[0][price_data][currency]"), "usd");
    assert.equal(p.get("line_items[1][price_data][product_data][name]"), "Tip");
    assert.equal(p.get("line_items[1][price_data][unit_amount]"), "1840");
    assert.equal(p.get("metadata[invoice_id]"), "inv_s");
    assert.equal(p.get("metadata[tip_cents]"), "1840");
    assert.equal(p.get("success_url"), `https://grace.example/pay/${token}?paid=1`);
  } finally { await s.close(); }
  assert.ok(MIN_CHARGE_CENTS === 50);
});

test("server: a signed checkout.session.completed records the payment once; a bad signature records nothing; Sync keeps it", async () => {
  const d = desk0();
  const inv = V.createInvoice(d, { familyId: "fam_a", from: "2026-10-30", issued: TODAY, id: "inv_s", token });
  d.invoices = [inv];
  const appCopy = JSON.parse(JSON.stringify(d)); // what the browser holds before the payment
  const state = { desk: d };
  const nowMs = Date.parse("2026-11-02T15:00:00Z"), t = Math.floor(nowMs / 1000);
  const secret = "whsec_sitter_endpoint";
  const sent = [];
  const env = { STRIPE_SECRET_KEY: "sk_test_sitter", STRIPE_WEBHOOK_SECRET: secret, NOTIFY_WEBHOOK_URL: "https://ntfy.example/grace", ADMIN_KEY: "adminkey" };
  const s = await serve(state, env, async (url, init) => { sent.push({ url, init }); return { ok: true }; }, nowMs);
  const event = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", created: t, data: { object: { id: "cs_test_9", object: "checkout.session", payment_status: "paid", amount_total: 10120, metadata: { invoice_id: "inv_s", tip_cents: "920" } } } });
  const post = (body, sig) => fetch(`${s.base}/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body });
  try {
    assert.equal((await post(event, `t=${t},v1=${stripeSignature("whsec_wrong", t, event)}`)).status, 400);
    assert.equal(V.invoiceStatus(state.desk, inv).paid, 0);
    const ok = await post(event, `t=${t},v1=${stripeSignature(secret, t, event)}`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).recorded, true);
    let st = V.invoiceStatus(state.desk, state.desk.invoices[0], TODAY);
    assert.equal(st.balance, 0);
    assert.equal(st.tips, 9.2);
    assert.match(sent.at(-1).init.body, /Card payment: \$101\.20 for invoice INV-2026-001/);
    assert.equal((await (await post(event, `t=${t},v1=${stripeSignature(secret, t, event)}`)).json()).recorded, false, "Stripe retries are not double-counted");
    // the app syncs its older copy: the card payment is kept
    const r = await fetch(`${s.base}/api/desk`, { method: "PUT", headers: { authorization: "Bearer adminkey", "content-type": "application/json" }, body: JSON.stringify(appCopy) });
    assert.equal(r.status, 200);
    st = V.invoiceStatus(state.desk, state.desk.invoices[0], TODAY);
    assert.equal(st.balance, 0);
    assert.equal(state.desk.bookings.find((b) => b.id === "bk_3").payments.filter((p) => p.stripe === "cs_test_9").length, 2, "care and tip, once each");
  } finally { await s.close(); }
});

test("recordStripeEvent ignores other events, unpaid sessions and unknown invoices", () => {
  const d = desk0();
  assert.equal(recordStripeEvent(d, { type: "payment_intent.succeeded", data: { object: {} } }).recorded, false);
  assert.equal(recordStripeEvent(d, { type: "checkout.session.completed", data: { object: { payment_status: "unpaid", metadata: {} } } }).recorded, false);
  assert.equal(recordStripeEvent(d, { type: "checkout.session.completed", data: { object: { payment_status: "paid", metadata: { invoice_id: "x" } } } }).why, "no such invoice");
});

test("the Stripe variables are documented and the payment code calls no account but the sitter's", () => {
  const guide = fs.readFileSync(new URL("./self-host.html", import.meta.url), "utf8");
  const code = fs.readFileSync(new URL("./invoices-server.mjs", import.meta.url), "utf8");
  for (const k of new Set([...code.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))) assert.ok(guide.includes(`<code>${k}</code>`), `${k} missing from self-host.html`);
  assert.match(fs.readFileSync(new URL("./README.md", import.meta.url), "utf8"), /STRIPE_WEBHOOK_SECRET/);
  assert.doesNotMatch(code, /sk_(live|test)_[A-Za-z0-9]{8,}|acct_[A-Za-z0-9]{6,}/, "no keys or connected accounts in the code");
  assert.match(fs.readFileSync(new URL("./Dockerfile", import.meta.url), "utf8"), /invoices-server\.mjs/);
});
