import { test } from "node:test";
import assert from "node:assert/strict";
import { createStripe, normalizeLine, normalizeCreditNote } from "./stripe.mjs";

const inv = { id: "in_1", created: 1700000000, currency: "usd", status_transitions: { paid_at: 1700003600 } };

test("normalizeLine nets discounts and tax included in the price", () => {
  const l = normalizeLine(inv, { id: "il_1", amount: 12000, period: { start: 1700000000, end: 1731536000 }, discount_amounts: [{ amount: 2000 }], tax_amounts: [{ amount: 500, inclusive: true }, { amount: 900, inclusive: false }] });
  assert.equal(l.amount, 9500);
  assert.equal(l.billedAt, 1700003600 * 1000);
  assert.equal(l.start, 1700000000 * 1000);
});

test("normalizeLine falls back to the invoice date when the line has no period", () => {
  const l = normalizeLine(inv, { id: "il_2", amount: 100 });
  assert.equal(l.start, l.end);
  assert.equal(normalizeLine(inv, { id: "x" }), null);
});

test("normalizeCreditNote makes negative one-off lines on the issue date", () => {
  const out = normalizeCreditNote({ id: "cn_1", invoice: "in_1", created: 1700100000, currency: "usd", lines: { data: [{ id: "cnl_1", amount: 3000, tax_amounts: [{ amount: 200, inclusive: true }] }] } });
  assert.equal(out[0].amount, -2800);
  assert.equal(out[0].start, out[0].end);
});

test("client only issues GET requests, pages, and fetches extra lines when truncated", async () => {
  const calls = [];
  const pages = {
    "/v1/invoices?status=paid&limit=100": { data: [{ ...inv, lines: { data: [{ id: "il_a", amount: 1 }], has_more: true } }], has_more: true },
    "/v1/invoices?status=paid&limit=100&starting_after=in_1": { data: [{ ...inv, id: "in_2", lines: { data: [{ id: "il_c", amount: 3 }] } }], has_more: false },
    "/v1/invoices/in_1/lines?limit=100": { data: [{ id: "il_a", amount: 1 }, { id: "il_b", amount: 2 }], has_more: false },
    "/v1/credit_notes?limit=100": { data: [{ id: "cn_v", status: "void", lines: { data: [{ id: "l", amount: 5 }] } }], has_more: false },
  };
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method || "GET", auth: opts.headers.authorization });
    const path = url.replace("https://api.stripe.com", "");
    return { ok: path in pages, status: 200, json: async () => pages[path] };
  };
  const s = createStripe({ key: "rk_x", fetchImpl });
  const lines = await s.listLines();
  assert.deepEqual(lines.map((l) => l.id), ["il_a", "il_b", "il_c"]);
  assert.deepEqual(await s.listCreditNotes(), []);
  assert.ok(calls.every((c) => c.method === "GET" && c.auth === "Bearer rk_x"));
});

test("an API error carries the status", async () => {
  const s = createStripe({ key: "rk_x", fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "bad key" } }) }) });
  await assert.rejects(() => s.listLines(), (e) => e.status === 401 && e.message === "bad key");
});

test("normalizeCreditNote keeps the credited invoice line id", () => {
  const out = normalizeCreditNote({ id: "cn_2", invoice: "in_1", created: 1700100000, lines: { data: [{ id: "cnl_2", amount: 500, invoice_line_item: "il_9" }] } });
  assert.equal(out[0].credits, "il_9");
});

test("normalizeCreditNote: exclusive tax and a zero discount change nothing, the currency is kept", () => {
  const out = normalizeCreditNote({ id: "cn_3", invoice: "in_1", created: 1700100000, currency: "eur", lines: { data: [{ id: "cnl_3", amount: 3000, discount_amounts: [{ amount: 0 }, { amount: 500 }], tax_amounts: [{ amount: 600, inclusive: false }, { amount: 100, inclusive: true }] }] } });
  assert.equal(out[0].amount, -2400);
  assert.equal(out[0].currency, "eur");
  assert.equal(normalizeCreditNote({ id: "cn_4", created: 1, lines: { data: [{ id: "l", amount: 1 }] } })[0].currency, "usd");
});

// Stripe API 2025-03-31 (basil) and later replace tax_amounts[{inclusive}] with
// taxes[{tax_behavior}] on invoice and credit note lines. An unpinned key gets the
// account's version, so a new account sent inclusive VAT straight into revenue
// (red team 2026-11-18).
test("normalizeLine and normalizeCreditNote net inclusive tax in the basil `taxes` shape", () => {
  const l = normalizeLine(inv, { id: "il_9", amount: 12000, period: { start: 1700000000, end: 1731536000 }, discount_amounts: [{ amount: 2000 }], taxes: [{ amount: 500, tax_behavior: "inclusive" }, { amount: 900, tax_behavior: "exclusive" }] });
  assert.equal(l.amount, 9500);
  const cn = normalizeCreditNote({ id: "cn_9", invoice: "in_1", created: 1700100000, currency: "usd", lines: { data: [{ id: "cnl_9", amount: 3000, taxes: [{ amount: 200, tax_behavior: "inclusive" }, { amount: 50, tax_behavior: "exclusive" }] }] } });
  assert.equal(cn[0].amount, -2800);
});

// A credit note embeds its first lines only; the rest come from
// /v1/credit_notes/{id}/lines (quality re-audit 2026-11-21).
test("listCreditNotes fetches the remaining lines of a truncated credit note", async () => {
  const pages = {
    "/v1/credit_notes?limit=100": { data: [{ id: "cn_big", created: 1700100000, currency: "usd", lines: { data: [{ id: "c1", amount: 100 }], has_more: true } }], has_more: false },
    "/v1/credit_notes/cn_big/lines?limit=100": { data: [{ id: "c1", amount: 100 }, { id: "c2", amount: 200, invoice_line_item: "il_2" }], has_more: false },
  };
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.method || "GET", "GET");
    const path = url.replace("https://api.stripe.com", "");
    return { ok: path in pages, status: path in pages ? 200 : 404, json: async () => pages[path] };
  };
  const out = await createStripe({ key: "rk_x", fetchImpl }).listCreditNotes();
  assert.deepEqual(out.map((l) => [l.id, l.amount, l.credits]), [["cn_big:c1", -100, undefined], ["cn_big:c2", -200, "il_2"]]);
});
