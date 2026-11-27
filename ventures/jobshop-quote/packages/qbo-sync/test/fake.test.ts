import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { FakeAccountingSync } from "../src/fake.ts";
import { type AccountingSync, AccountingValidationError } from "../src/port.ts";
import { planPayAppInvoice } from "../src/retainage.ts";

let sync: FakeAccountingSync;
beforeEach(() => {
  sync = new FakeAccountingSync();
});

const rejectsWith = (re: RegExp) => (err: unknown) =>
  err instanceof AccountingValidationError && re.test(err.message);

/** Exercises the port only, so an app's code written against AccountingSync is covered. */
async function billPayAppAndCollect(port: AccountingSync) {
  const { item: retainage } = await port.ensureRetainageSetup();
  const income = await port.ensureAccount({ name: "Construction Income", accountType: "Income" });
  const framing = await port.ensureItem({
    name: "Framing",
    type: "Service",
    incomeAccountId: income.id,
  });
  const customer = await port.upsertCustomer({
    displayName: "Mesa Ridge Builders",
    email: "ap@mesaridge.example",
  });
  const plan = planPayAppInvoice({
    applicationNumber: 1,
    retainageItemId: retainage.id,
    retainageRateBps: 1000,
    workLines: [{ itemId: framing.id, description: "Framing 40%", amountCents: 4_000_000 }],
  });
  const invoice = await port.createInvoice({
    customerId: customer.id,
    docNumber: "PA-0001",
    txnDate: "2026-11-30",
    lines: plan.lines,
  });
  const payment = await port.recordPayment({
    customerId: customer.id,
    totalCents: 3_600_000,
    applyTo: [{ invoiceId: invoice.id, amountCents: 3_600_000 }],
  });
  return { retainage, customer, invoice, payment };
}

describe("FakeAccountingSync", () => {
  it("runs a pay app from setup to payment", async () => {
    const { invoice, payment, retainage } = await billPayAppAndCollect(sync);
    assert.equal(invoice.totalCents, 3_600_000);
    assert.equal(payment.unappliedCents, 0);
    assert.equal((await sync.getInvoice(invoice.id))?.balanceCents, 0);
    assert.equal((await sync.findInvoiceByDocNumber("PA-0001"))?.id, invoice.id);
    assert.equal((await sync.getPayment(payment.id))?.totalCents, 3_600_000);
    const account = await sync.findAccountByName("Retainage Receivable");
    assert.equal(account?.accountType, "Other Current Asset");
    assert.equal(retainage.incomeAccountId, account?.id);
  });

  it("is idempotent for setup, items and unchanged customers", async () => {
    const a = await sync.ensureRetainageSetup();
    const b = await sync.ensureRetainageSetup();
    assert.deepEqual(a, b);
    const c1 = await sync.upsertCustomer({ displayName: "X", email: "x@example.com" });
    const c2 = await sync.upsertCustomer({ displayName: "X", email: "x@example.com" });
    assert.equal(c2.syncToken, c1.syncToken);
    const c3 = await sync.upsertCustomer({ displayName: "X", email: "y@example.com" });
    assert.equal(c3.id, c1.id);
    assert.equal(c3.email, "y@example.com");
    assert.equal(c3.syncToken, "1");
    assert.equal(sync.customers.size, 1);
  });

  it("rejects what QuickBooks would reject", async () => {
    const { customer, invoice, retainage } = await billPayAppAndCollect(sync);
    await assert.rejects(
      sync.createInvoice({
        customerId: customer.id,
        docNumber: "PA-0001",
        lines: [{ itemId: retainage.id, amountCents: 1 }],
      }),
      rejectsWith(/duplicate DocNumber/),
    );
    await assert.rejects(
      sync.createInvoice({
        customerId: customer.id,
        lines: [{ itemId: retainage.id, amountCents: -1 }],
      }),
      rejectsWith(/negative/),
    );
    await assert.rejects(
      sync.createInvoice({ customerId: customer.id, lines: [] }),
      rejectsWith(/at least one line/),
    );
    await assert.rejects(
      sync.createInvoice({ customerId: "nope", lines: [{ itemId: retainage.id, amountCents: 1 }] }),
      rejectsWith(/unknown customer/),
    );
    await assert.rejects(
      sync.recordPayment({
        customerId: customer.id,
        totalCents: 1,
        applyTo: [{ invoiceId: invoice.id, amountCents: 1 }],
      }),
      rejectsWith(/exceeds invoice/),
    );
    await assert.rejects(
      sync.recordPayment({
        customerId: customer.id,
        totalCents: 10,
        applyTo: [{ invoiceId: invoice.id, amountCents: 20 }],
      }),
      rejectsWith(/exceed the payment total/),
    );
    const other = await sync.upsertCustomer({ displayName: "Other GC" });
    const inv2 = await sync.createInvoice({
      customerId: other.id,
      lines: [{ itemId: retainage.id, amountCents: 500 }],
    });
    await assert.rejects(
      sync.recordPayment({
        customerId: customer.id,
        totalCents: 500,
        applyTo: [{ invoiceId: inv2.id, amountCents: 500 }],
      }),
      rejectsWith(/another customer/),
    );
    await assert.rejects(
      sync.createInvoice({
        customerId: customer.id,
        txnDate: "11/30/2026",
        lines: [{ itemId: retainage.id, amountCents: 1 }],
      }),
      rejectsWith(/YYYY-MM-DD/),
    );
  });

  it("keeps an unapplied remainder on a partial application", async () => {
    const { customer } = await billPayAppAndCollect(sync);
    const p = await sync.recordPayment({ customerId: customer.id, totalCents: 500, applyTo: [] });
    assert.equal(p.unappliedCents, 500);
  });

  it("answers a repeated requestId with the first payment instead of a second one", async () => {
    const { customer } = await billPayAppAndCollect(sync);
    const input = { customerId: customer.id, totalCents: 700, applyTo: [], requestId: "r-1" };
    const before = sync.payments.size;
    const first = await sync.recordPayment(input);
    const again = await sync.recordPayment(input);
    assert.equal(again.id, first.id);
    assert.equal(sync.payments.size, before + 1);
    const other = await sync.recordPayment({ ...input, requestId: "r-2" });
    assert.notEqual(other.id, first.id);
  });

  it("answers a repeated invoice requestId with the first invoice and keeps the customer memo", async () => {
    const income = await sync.ensureAccount({ name: "Sales", accountType: "Income" });
    const item = await sync.ensureItem({
      name: "Parts",
      type: "NonInventory",
      incomeAccountId: income.id,
    });
    const customer = await sync.upsertCustomer({ displayName: "Acme Robotics" });
    const input = {
      customerId: customer.id,
      docNumber: "Q1001",
      customerMemo: "Your PO 4500123.",
      requestId: "jsq-abc",
      lines: [{ itemId: item.id, amountCents: 5_000, qty: 2, unitPriceCents: 2_500 }],
    };
    const first = await sync.createInvoice(input);
    const again = await sync.createInvoice(input);
    assert.equal(again.id, first.id);
    assert.equal(sync.invoices.size, 1);
    assert.equal(first.customerMemo, "Your PO 4500123.");
  });

  it("returns copies, so callers cannot mutate its state", async () => {
    const { invoice } = await billPayAppAndCollect(sync);
    const got = await sync.getInvoice(invoice.id);
    if (!got) throw new Error("missing");
    got.balanceCents = 999;
    assert.equal((await sync.getInvoice(invoice.id))?.balanceCents, 0);
  });

  it("lists sale items with their account names and hides inactive ones", async () => {
    const income = await sync.ensureAccount({ name: "Construction Income", accountType: "Income" });
    const labor = await sync.ensureItem({
      name: "Labor",
      type: "Service",
      incomeAccountId: income.id,
    });
    const extras = await sync.ensureItem({
      name: "Extras",
      type: "NonInventory",
      incomeAccountId: income.id,
    });
    assert.deepEqual(
      (await sync.listSaleItems()).map((i) => [i.name, i.incomeAccountName]),
      [
        ["Extras", "Construction Income"],
        ["Labor", "Construction Income"],
      ],
    );
    assert.equal((await sync.getItem(labor.id))?.incomeAccountName, "Construction Income");
    sync.inactiveItems.add(extras.id);
    assert.equal(await sync.getItem(extras.id), null);
    assert.deepEqual(
      (await sync.listSaleItems()).map((i) => i.name),
      ["Labor"],
    );
  });
});

describe("credit memos (fake)", () => {
  async function invoiced() {
    const income = await sync.ensureAccount({ name: "Contract Income", accountType: "Income" });
    const item = await sync.ensureItem({
      name: "Contract Billing",
      type: "Service",
      incomeAccountId: income.id,
    });
    const customer = await sync.upsertCustomer({ displayName: "Harbor Builders" });
    const invoice = await sync.createInvoice({
      customerId: customer.id,
      lines: [{ itemId: item.id, amountCents: 4_500_000 }],
    });
    return { item, customer, invoice };
  }

  it("creates unapplied credit and applies it to the chosen invoice", async () => {
    const { item, customer, invoice } = await invoiced();
    const memo = await sync.createCreditMemo({
      customerId: customer.id,
      docNumber: "CR1",
      lines: [{ itemId: item.id, amountCents: 500_000 }],
      requestId: "r1",
    });
    assert.equal(memo.remainingCents, 500_000);
    assert.equal((await sync.findCreditMemoByDocNumber("CR1"))?.id, memo.id);
    // The same requestid answers with the first memo.
    const again = await sync.createCreditMemo({
      customerId: customer.id,
      docNumber: "CR1",
      lines: [{ itemId: item.id, amountCents: 500_000 }],
      requestId: "r1",
    });
    assert.equal(again.id, memo.id);
    await sync.applyCreditMemo({
      customerId: customer.id,
      invoiceId: invoice.id,
      creditMemoId: memo.id,
      amountCents: 500_000,
    });
    assert.equal((await sync.getInvoice(invoice.id))?.balanceCents, 4_000_000);
    assert.equal((await sync.getCreditMemo(memo.id))?.remainingCents, 0);
    await assert.rejects(
      sync.applyCreditMemo({
        customerId: customer.id,
        invoiceId: invoice.id,
        creditMemoId: memo.id,
        amountCents: 1,
      }),
      rejectsWith(/exceeds/),
    );
  });

  it("auto-applies to the oldest open invoice when the company applies credits itself", async () => {
    const { item, customer, invoice } = await invoiced();
    sync.autoApplyCredits = true;
    const memo = await sync.createCreditMemo({
      customerId: customer.id,
      lines: [{ itemId: item.id, amountCents: 100_000 }],
    });
    assert.equal(memo.remainingCents, 0);
    assert.equal((await sync.getInvoice(invoice.id))?.balanceCents, 4_400_000);
  });
});
