import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AccessTokenProvider } from "../src/oauth.ts";
import { AccountingValidationError } from "../src/port.ts";
import {
  escapeQueryValue,
  QboApiError,
  type QboEnvironment,
  QuickBooksOnlineSync,
} from "../src/qbo.ts";
import { planPayAppInvoice } from "../src/retainage.ts";
import { jsonBody, type ScriptedResponse, scriptedFetch } from "./http.ts";

function fakeTokens(): AccessTokenProvider & { refreshes: number } {
  let n = 1;
  return {
    realmId: "9130",
    refreshes: 0,
    async getAccessToken() {
      return `access-${n}`;
    },
    async forceRefresh() {
      n += 1;
      this.refreshes += 1;
      return `access-${n}`;
    },
  };
}

function setup(script: ScriptedResponse[], environment: QboEnvironment = "sandbox") {
  const http = scriptedFetch(script);
  const tokens = fakeTokens();
  const sync = new QuickBooksOnlineSync({ tokens, environment, fetch: http.fetch });
  return { http, tokens, sync };
}

describe("QboClient basics", () => {
  it("targets the company path with minorversion 75 and a bearer token", async () => {
    const { http, sync } = setup([{ fixture: "query-empty.json" }]);
    assert.equal(await sync.findCustomerByDisplayName("Nobody"), null);
    const req = http.requests[0];
    assert.equal(req?.url.origin, "https://sandbox-quickbooks.api.intuit.com");
    assert.equal(req?.url.pathname, "/v3/company/9130/query");
    assert.equal(req?.url.searchParams.get("minorversion"), "75");
    assert.equal(
      req?.url.searchParams.get("query"),
      "select * from Customer where DisplayName = 'Nobody' maxresults 1",
    );
    assert.equal(req?.headers.authorization, "Bearer access-1");
    assert.equal(req?.headers.accept, "application/json");
  });

  it("uses the production host in production", async () => {
    const { http, sync } = setup([{ fixture: "query-empty.json" }], "production");
    await sync.findItemByName("x");
    assert.equal(http.requests[0]?.url.origin, "https://quickbooks.api.intuit.com");
  });

  it("escapes quotes and backslashes in query literals", async () => {
    assert.equal(escapeQueryValue("O'Neil \\ Sons"), "O\\'Neil \\\\ Sons");
    const { http, sync } = setup([{ fixture: "query-empty.json" }]);
    await sync.findCustomerByDisplayName("O'Neil Framing");
    assert.match(http.requests[0]?.url.searchParams.get("query") ?? "", /'O\\'Neil Framing'/);
  });

  it("refreshes once and retries after a 401", async () => {
    const { http, sync, tokens } = setup([
      { status: 401, fixture: "fault-auth.json" },
      { fixture: "query-customer.json" },
    ]);
    const c = await sync.findCustomerByDisplayName("Mesa Ridge Builders");
    assert.equal(c?.id, "58");
    assert.equal(tokens.refreshes, 1);
    assert.equal(http.requests[1]?.headers.authorization, "Bearer access-2");
  });

  it("gives up after a second 401", async () => {
    const { sync } = setup([
      { status: 401, fixture: "fault-auth.json" },
      { status: 401, fixture: "fault-auth.json" },
    ]);
    await assert.rejects(
      sync.findItemByName("x"),
      (e: unknown) => e instanceof QboApiError && e.status === 401,
    );
  });

  it("turns a Fault into QboApiError with code, type and intuit_tid", async () => {
    const { sync } = setup([{ status: 400, fixture: "fault-validation.json" }]);
    await assert.rejects(
      sync.getInvoice("1"),
      (e: unknown) =>
        e instanceof QboApiError &&
        e.status === 400 &&
        e.faultType === "ValidationFault" &&
        e.errors[0]?.code === "6000" &&
        e.intuitTid === "fixture-tid" &&
        !e.retryable &&
        /code 6000/.test(e.message),
    );
  });

  it("marks 429 and 5xx retryable", async () => {
    const { sync } = setup([{ status: 429, json: {} }]);
    await assert.rejects(
      sync.getPayment("1"),
      (e: unknown) => e instanceof QboApiError && e.retryable,
    );
  });
});

describe("customers", () => {
  it("creates a customer that does not exist", async () => {
    const { http, sync } = setup([
      { fixture: "query-empty.json" },
      { fixture: "customer-create.json" },
    ]);
    const c = await sync.upsertCustomer({
      displayName: "Mesa Ridge Builders",
      companyName: "Mesa Ridge Builders LLC",
      email: "ap@mesaridge.example",
    });
    const post = http.requests[1];
    assert.equal(post?.method, "POST");
    assert.equal(post?.url.pathname, "/v3/company/9130/customer");
    assert.deepEqual(jsonBody(post), {
      DisplayName: "Mesa Ridge Builders",
      CompanyName: "Mesa Ridge Builders LLC",
      PrimaryEmailAddr: { Address: "ap@mesaridge.example" },
    });
    assert.deepEqual(c, {
      id: "58",
      syncToken: "0",
      displayName: "Mesa Ridge Builders",
      companyName: "Mesa Ridge Builders LLC",
      email: "ap@mesaridge.example",
    });
  });

  it("does nothing when an existing customer is unchanged", async () => {
    const { http, sync } = setup([{ fixture: "query-customer.json" }]);
    const c = await sync.upsertCustomer({
      displayName: "Mesa Ridge Builders",
      email: "ap@mesaridge.example",
    });
    assert.equal(c.syncToken, "2");
    assert.equal(http.requests.length, 1);
  });

  it("sparse-updates a changed customer with Id and SyncToken", async () => {
    const { http, sync } = setup([
      { fixture: "query-customer.json" },
      { fixture: "customer-update.json" },
    ]);
    const c = await sync.upsertCustomer({
      displayName: "Mesa Ridge Builders",
      email: "billing@mesaridge.example",
    });
    assert.deepEqual(jsonBody(http.requests[1]), {
      Id: "58",
      SyncToken: "2",
      sparse: true,
      PrimaryEmailAddr: { Address: "billing@mesaridge.example" },
    });
    assert.equal(c.email, "billing@mesaridge.example");
    assert.equal(c.syncToken, "3");
  });
});

describe("items", () => {
  it("lists active Service and NonInventory items that post to an income account, by name", async () => {
    const { http, sync } = setup([{ fixture: "query-sale-items.json" }]);
    const items = await sync.listSaleItems();
    const q = http.requests[0]?.url.searchParams.get("query") ?? "";
    assert.match(q, /select \* from Item where Type IN \('Service', 'NonInventory'\)/);
    assert.deepEqual(
      items.map((i) => [i.id, i.name, i.type, i.incomeAccountId, i.incomeAccountName]),
      [
        ["13", "Conduit and wire", "NonInventory", "80", "Materials Income"],
        ["12", "Electrical Labor", "Service", "79", "Construction Income"],
      ],
    );
  });

  it("reads one item by id with a query, so an inactive one reads as gone", async () => {
    const { http, sync } = setup([
      { fixture: "query-item-wrong-account.json" },
      { fixture: "query-empty.json" },
    ]);
    const item = await sync.getItem("31");
    assert.equal(item?.name, "Retainage");
    assert.equal(item?.incomeAccountName, "Services");
    assert.match(http.requests[0]?.url.searchParams.get("query") ?? "", /Id = '31'/);
    assert.equal(await sync.getItem("o'1"), null);
    assert.match(http.requests[1]?.url.searchParams.get("query") ?? "", /Id = 'o\\'1'/);
  });
});

describe("retainage setup", () => {
  it("creates an Other Current Asset account and a Service item posting to it", async () => {
    const { http, sync } = setup([
      { fixture: "query-empty.json" },
      { fixture: "account-create.json" },
      { fixture: "query-empty.json" },
      { fixture: "item-create.json" },
    ]);
    const { account, item } = await sync.ensureRetainageSetup();
    assert.equal(http.requests[1]?.url.pathname, "/v3/company/9130/account");
    assert.deepEqual(jsonBody(http.requests[1]), {
      Name: "Retainage Receivable",
      AccountType: "Other Current Asset",
      AccountSubType: "OtherCurrentAssets",
      Description: "Retainage withheld by customers on progress billings, not yet released.",
    });
    assert.equal(http.requests[3]?.url.pathname, "/v3/company/9130/item");
    assert.deepEqual(jsonBody(http.requests[3]), {
      Name: "Retainage",
      Type: "Service",
      IncomeAccountRef: { value: "92" },
      Description: "Retainage held (negative lines) and released (positive lines).",
    });
    assert.equal(account.id, "92");
    assert.equal(item.incomeAccountId, "92");
  });

  it("refuses an existing Retainage item that posts elsewhere", async () => {
    const { sync } = setup([
      { fixture: "query-empty.json" },
      { fixture: "account-create.json" },
      { fixture: "query-item-wrong-account.json" },
    ]);
    await assert.rejects(
      sync.ensureRetainageSetup(),
      /posts to account 1, not the retainage account 92/,
    );
  });
});

describe("invoices and payments", () => {
  it("posts a pay app as SalesItemLineDetail lines with a negative retainage line", async () => {
    const { http, sync } = setup([{ fixture: "invoice-create-payapp.json" }]);
    const plan = planPayAppInvoice({
      applicationNumber: 2,
      retainageItemId: "31",
      retainageRateBps: 1000,
      workLines: [
        { itemId: "12", description: "Framing, 60% complete this period", amountCents: 3_000_000 },
      ],
    });
    const invoice = await sync.createInvoice({
      customerId: "58",
      docNumber: "PA-0002",
      txnDate: "2026-11-30",
      dueDate: "2026-12-30",
      lines: plan.lines,
    });
    assert.equal(http.requests[0]?.url.pathname, "/v3/company/9130/invoice");
    assert.deepEqual(jsonBody(http.requests[0]), {
      CustomerRef: { value: "58" },
      DocNumber: "PA-0002",
      TxnDate: "2026-11-30",
      DueDate: "2026-12-30",
      Line: [
        {
          DetailType: "SalesItemLineDetail",
          Amount: 30000,
          Description: "Framing, 60% complete this period",
          SalesItemLineDetail: { ItemRef: { value: "12" } },
        },
        {
          DetailType: "SalesItemLineDetail",
          Amount: -3000,
          Description: "Retainage held (10%), pay application #2",
          SalesItemLineDetail: { ItemRef: { value: "31" } },
        },
      ],
    });
    // The SubTotalLineDetail line in the response is not an item line and is dropped.
    assert.equal(invoice.lines.length, 2);
    assert.equal(invoice.totalCents, plan.summary.netCents);
    assert.equal(invoice.balanceCents, 2_700_000);
    assert.equal(invoice.docNumber, "PA-0002");
  });

  it("sends Qty and UnitPrice when given", async () => {
    const { http, sync } = setup([{ fixture: "invoice-create-payapp.json" }]);
    await sync.createInvoice({
      customerId: "58",
      lines: [{ itemId: "12", amountCents: 7_500, qty: 3, unitPriceCents: 2_500 }],
    });
    const line = (jsonBody(http.requests[0]).Line as Record<string, unknown>[])[0];
    assert.deepEqual(line?.SalesItemLineDetail, {
      ItemRef: { value: "12" },
      Qty: 3,
      UnitPrice: 25,
    });
  });

  it("sends the invoice's own billing email as BillEmail, and nothing when unset", async () => {
    const { http, sync } = setup([{ fixture: "invoice-create-payapp.json" }]);
    await sync.createInvoice({
      customerId: "58",
      billEmail: "ap@builder.example",
      lines: [{ itemId: "12", amountCents: 100 }],
    });
    assert.deepEqual(jsonBody(http.requests[0]).BillEmail, { Address: "ap@builder.example" });
    const { http: http2, sync: sync2 } = setup([{ fixture: "invoice-create-payapp.json" }]);
    await sync2.createInvoice({ customerId: "58", lines: [{ itemId: "12", amountCents: 100 }] });
    assert.equal("BillEmail" in jsonBody(http2.requests[0]), false);
  });

  it("refuses a billing email that is not exactly one address", async () => {
    const { http, sync } = setup([]);
    for (const billEmail of [
      "",
      "ap",
      "ap@builder",
      "a@b.example, c@d.example",
      "a@b.example;c@d.example",
      "Accounts <ap@builder.example>",
      "ap@builder.example\r\nBcc: x@y.example",
      `${"a".repeat(95)}@b.example`,
    ]) {
      await assert.rejects(
        sync.createInvoice({
          customerId: "58",
          billEmail,
          lines: [{ itemId: "12", amountCents: 1 }],
        }),
        /billEmail must be one email address/,
        billEmail,
      );
    }
    assert.equal(http.requests.length, 0);
  });

  it("validates before sending anything", async () => {
    const { http, sync } = setup([]);
    await assert.rejects(
      sync.createInvoice({ customerId: "58", lines: [{ itemId: "31", amountCents: -100 }] }),
      AccountingValidationError,
    );
    await assert.rejects(
      sync.createInvoice({
        customerId: "58",
        lines: [{ itemId: "12", amountCents: 100, qty: 3, unitPriceCents: 25 }],
      }),
      /does not equal amountCents/,
    );
    await assert.rejects(
      sync.recordPayment({ customerId: "58", totalCents: 0, applyTo: [] }),
      AccountingValidationError,
    );
    assert.equal(http.requests.length, 0);
  });

  it("reads an invoice by DocNumber and maps its balance", async () => {
    const { http, sync } = setup([{ fixture: "query-invoice.json" }]);
    const inv = await sync.findInvoiceByDocNumber("PA-0002");
    assert.equal(
      http.requests[0]?.url.searchParams.get("query"),
      "select * from Invoice where DocNumber = 'PA-0002' maxresults 1",
    );
    assert.equal(inv?.id, "1047");
    assert.equal(inv?.balanceCents, 700_000);
    assert.deepEqual(
      inv?.lines.map((l) => [l.itemId, l.amountCents]),
      [
        ["12", 3_000_000],
        ["31", -300_000],
      ],
    );
  });

  it("records a payment linked to the invoice", async () => {
    const { http, sync } = setup([{ fixture: "payment-create.json" }]);
    const p = await sync.recordPayment({
      customerId: "58",
      totalCents: 2_000_000,
      txnDate: "2026-12-15",
      paymentRefNum: "CHK-4471",
      applyTo: [{ invoiceId: "1047", amountCents: 2_000_000 }],
    });
    assert.equal(http.requests[0]?.url.pathname, "/v3/company/9130/payment");
    assert.deepEqual(jsonBody(http.requests[0]), {
      CustomerRef: { value: "58" },
      TotalAmt: 20000,
      TxnDate: "2026-12-15",
      PaymentRefNum: "CHK-4471",
      Line: [{ Amount: 20000, LinkedTxn: [{ TxnId: "1047", TxnType: "Invoice" }] }],
    });
    assert.deepEqual(p, {
      id: "2210",
      syncToken: "0",
      customerId: "58",
      totalCents: 2_000_000,
      unappliedCents: 0,
      txnDate: "2026-12-15",
      paymentRefNum: "CHK-4471",
      appliedTo: [{ invoiceId: "1047", amountCents: 2_000_000 }],
    });
    assert.equal(http.requests[0]?.url.searchParams.get("requestid"), null);
  });

  it("sends a payment's requestId as the requestid query parameter, and checks its form", async () => {
    const { http, sync } = setup([{ fixture: "payment-create.json" }]);
    await sync.recordPayment({
      customerId: "58",
      totalCents: 2_000_000,
      applyTo: [{ invoiceId: "1047", amountCents: 2_000_000 }],
      requestId: "0f3a9c2e5b7d41e8a6c4b2d9e1f07a35",
    });
    const url = http.requests[0]?.url;
    assert.equal(url?.searchParams.get("requestid"), "0f3a9c2e5b7d41e8a6c4b2d9e1f07a35");
    assert.equal(url?.searchParams.get("minorversion"), "75");
    await assert.rejects(
      sync.recordPayment({
        customerId: "58",
        totalCents: 100,
        applyTo: [],
        requestId: "bad id&x=1",
      }),
      /requestId/,
    );
    assert.equal(http.requests.length, 1);
  });

  it("posts a credit memo with positive item lines and its requestid", async () => {
    const { http, sync } = setup([{ fixture: "creditmemo-create.json" }]);
    const memo = await sync.createCreditMemo({
      customerId: "58",
      docNumber: "CR24-117-03",
      txnDate: "2026-12-20",
      privateNote: "Balance closed short on pay application #3.",
      lines: [{ itemId: "12", amountCents: 500_000, description: "Backcharge: cleanup" }],
      requestId: "1b2c3d4e5f60718293a4b5c6d7e8f901",
    });
    const req = http.requests[0];
    assert.equal(req?.url.pathname, "/v3/company/9130/creditmemo");
    assert.equal(req?.url.searchParams.get("requestid"), "1b2c3d4e5f60718293a4b5c6d7e8f901");
    assert.deepEqual(jsonBody(req), {
      CustomerRef: { value: "58" },
      DocNumber: "CR24-117-03",
      TxnDate: "2026-12-20",
      PrivateNote: "Balance closed short on pay application #3.",
      Line: [
        {
          DetailType: "SalesItemLineDetail",
          Amount: 5000,
          Description: "Backcharge: cleanup",
          SalesItemLineDetail: { ItemRef: { value: "12" } },
        },
      ],
    });
    assert.deepEqual(memo, {
      id: "2301",
      syncToken: "0",
      customerId: "58",
      docNumber: "CR24-117-03",
      txnDate: "2026-12-20",
      totalCents: 500_000,
      remainingCents: 500_000,
    });
  });

  it("refuses a credit memo line that is not a positive amount, sending nothing", async () => {
    const { http, sync } = setup([]);
    await assert.rejects(
      sync.createCreditMemo({ customerId: "58", lines: [{ itemId: "12", amountCents: -1 }] }),
      AccountingValidationError,
    );
    await assert.rejects(sync.createCreditMemo({ customerId: "58", lines: [] }), /at least one/);
    assert.equal(http.requests.length, 0);
  });

  it("applies a credit memo to one invoice as a zero payment linking both", async () => {
    const { http, sync } = setup([{ fixture: "payment-apply-credit.json" }]);
    const p = await sync.applyCreditMemo({
      customerId: "58",
      invoiceId: "1047",
      creditMemoId: "2301",
      amountCents: 500_000,
      txnDate: "2026-12-20",
      requestId: "aa11bb22cc33dd44ee55ff6600778899",
    });
    const req = http.requests[0];
    assert.equal(req?.url.pathname, "/v3/company/9130/payment");
    assert.equal(req?.url.searchParams.get("requestid"), "aa11bb22cc33dd44ee55ff6600778899");
    assert.deepEqual(jsonBody(req), {
      CustomerRef: { value: "58" },
      TotalAmt: 0,
      TxnDate: "2026-12-20",
      Line: [
        { Amount: 5000, LinkedTxn: [{ TxnId: "1047", TxnType: "Invoice" }] },
        { Amount: 5000, LinkedTxn: [{ TxnId: "2301", TxnType: "CreditMemo" }] },
      ],
    });
    assert.equal(p.totalCents, 0);
    assert.deepEqual(p.appliedTo, [{ invoiceId: "1047", amountCents: 500_000 }]);
  });

  it("reads a credit memo by DocNumber with a query", async () => {
    const { http, sync } = setup([
      {
        json: {
          QueryResponse: {
            CreditMemo: [
              {
                Id: "2301",
                SyncToken: "1",
                CustomerRef: { value: "58" },
                DocNumber: "CR24-117-03",
                TotalAmt: 5000,
                RemainingCredit: 0,
              },
            ],
          },
        },
      },
    ]);
    const memo = await sync.findCreditMemoByDocNumber("CR24-117-03");
    assert.equal(
      http.requests[0]?.url.searchParams.get("query"),
      "select * from CreditMemo where DocNumber = 'CR24-117-03' maxresults 1",
    );
    assert.equal(memo?.remainingCents, 0);
    assert.equal(memo?.totalCents, 500_000);
  });
});
