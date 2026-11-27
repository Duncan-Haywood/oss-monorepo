import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  costAccountIdsOf,
  costReaderFor,
  expenseLinesOf,
  fakeCosts,
  jobMatch,
  journalLinesOf,
  MAX_PAGES,
  PAGE_SIZE,
  purchaseOrderLinesOf,
  QboCostReader,
} from "../src/costs.ts";
import { FakeAccountingSync } from "../src/fake.ts";
import type { AccessTokenProvider } from "../src/oauth.ts";
import { QuickBooksOnlineSync } from "../src/qbo.ts";
import { scriptedFetch } from "./http.ts";

const tokens: AccessTokenProvider = {
  realmId: "9130",
  async getAccessToken() {
    return "access";
  },
  async forceRefresh() {
    return "access";
  },
};

const bill = {
  Id: "146",
  TxnDate: "2026-10-03",
  DocNumber: "INV-7781",
  VendorRef: { value: "56", name: "Graybar Electric" },
  Line: [
    {
      Id: "1",
      Amount: 1250.4,
      Description: "Wire, 500 ft THHN",
      DetailType: "AccountBasedExpenseLineDetail",
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: "80", name: "Job Materials" },
        CustomerRef: { value: "58", name: "Acme GC:Riverside Clinic" },
      },
    },
    {
      Id: "2",
      Amount: 99,
      DetailType: "AccountBasedExpenseLineDetail",
      AccountBasedExpenseLineDetail: { AccountRef: { value: "81", name: "Office" } },
    },
    {
      Id: "3",
      Amount: 300,
      DetailType: "ItemBasedExpenseLineDetail",
      ItemBasedExpenseLineDetail: {
        ItemRef: { value: "9", name: "Lift rental" },
        CustomerRef: { value: "99", name: "Another job" },
      },
    },
  ],
};

describe("expenseLinesOf", () => {
  it("keeps only lines tagged to the wanted customers, with vendor, account and amount", () => {
    const lines = expenseLinesOf("Bill", bill, jobMatch({ customerIds: ["58"] }));
    assert.deepEqual(lines, [
      {
        txnType: "Bill",
        txnId: "146",
        lineId: "1",
        txnDate: "2026-10-03",
        docNumber: "INV-7781",
        vendorName: "Graybar Electric",
        customerId: "58",
        accountName: "Job Materials",
        description: "Wire, 500 ft THHN",
        amountCents: 125040,
      },
    ]);
  });

  it("reads item-based lines and signs credits negative", () => {
    const ids = jobMatch({ customerIds: ["99"] });
    assert.equal(expenseLinesOf("Bill", bill, ids)[0]?.itemName, "Lift rental");
    assert.equal(expenseLinesOf("VendorCredit", bill, ids)[0]?.amountCents, -30000);
    const refund = {
      ...bill,
      PaymentType: "CreditCard",
      Credit: true,
      EntityRef: { value: "1", name: "Home Depot" },
    };
    const [line] = expenseLinesOf("Purchase", refund, ids);
    assert.equal(line?.amountCents, -30000);
    assert.equal(line?.vendorName, "Home Depot");
    assert.equal(line?.paymentType, "CreditCard");
    const check = { ...bill, PaymentType: "Check", Credit: false };
    assert.equal(expenseLinesOf("Purchase", check, ids)[0]?.amountCents, 30000);
  });
});

describe("QboCostReader", () => {
  it("queries Bill, Purchase, VendorCredit and JournalEntry in the date window and pages by 1,000", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...bill, Id: String(i + 1) }));
    const http = scriptedFetch([
      { json: { QueryResponse: { Bill: full } } },
      { json: { QueryResponse: { Bill: [bill] } } },
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: { VendorCredit: [{ ...bill, Id: "7" }] } } },
      { json: { QueryResponse: {} } },
    ]);
    const reader = new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }).client,
    );
    const r = await reader.listExpenseLines({
      fromDate: "2026-01-01",
      toDate: "2026-11-26",
      customerIds: ["58"],
    });
    assert.equal(http.remaining(), 0);
    const sql = http.requests.map((q) => q.url.searchParams.get("query"));
    assert.deepEqual(sql, [
      "select * from Bill where TxnDate >= '2026-01-01' and TxnDate <= '2026-11-26' startposition 1 maxresults 1000",
      "select * from Bill where TxnDate >= '2026-01-01' and TxnDate <= '2026-11-26' startposition 1001 maxresults 1000",
      "select * from Purchase where TxnDate >= '2026-01-01' and TxnDate <= '2026-11-26' startposition 1 maxresults 1000",
      "select * from VendorCredit where TxnDate >= '2026-01-01' and TxnDate <= '2026-11-26' startposition 1 maxresults 1000",
      "select * from JournalEntry where TxnDate >= '2026-01-01' and TxnDate <= '2026-11-26' startposition 1 maxresults 1000",
    ]);
    assert.equal(r.lines.length, PAGE_SIZE + 2);
    assert.equal(r.truncated, false);
    assert.equal(r.lines.filter((l) => l.amountCents < 0).length, 1);
  });

  it("stops after the page cap and says so", async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...bill, Id: String(i + 1) }));
    const http = scriptedFetch([
      ...Array.from({ length: MAX_PAGES }, () => ({ json: { QueryResponse: { Bill: full } } })),
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: {} } },
    ]);
    const reader = new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }).client,
    );
    const r = await reader.listExpenseLines({
      fromDate: "2026-01-01",
      toDate: "2026-11-26",
      customerIds: ["58"],
    });
    assert.equal(r.truncated, true);
  });

  it("refuses a date that is not YYYY-MM-DD before sending anything", async () => {
    const http = scriptedFetch([]);
    const reader = new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }).client,
    );
    await assert.rejects(
      reader.listExpenseLines({
        fromDate: "2026-01-01' or 1=1",
        toDate: "2026-11-26",
        customerIds: ["58"],
      }),
      /YYYY-MM-DD/,
    );
    assert.equal(http.requests.length, 0);
  });

  it("lists active customers and jobs by fully qualified name", async () => {
    const http = scriptedFetch([
      {
        json: {
          QueryResponse: {
            Customer: [
              {
                Id: "58",
                DisplayName: "Riverside Clinic",
                FullyQualifiedName: "Acme GC:Riverside Clinic",
                ParentRef: { value: "57" },
              },
              { Id: "57", DisplayName: "Acme GC", FullyQualifiedName: "Acme GC" },
              { Id: "60", DisplayName: "Gone", Active: false },
            ],
          },
        },
      },
    ]);
    const reader = new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }).client,
    );
    const list = await reader.listCustomers();
    assert.deepEqual(
      list.map((c) => [c.id, c.fullyQualifiedName, c.parentId]),
      [
        ["57", "Acme GC", undefined],
        ["58", "Acme GC:Riverside Clinic", "57"],
      ],
    );
  });
});

describe("the fake cost book", () => {
  it("is reached through costReaderFor and filters by customer and date", async () => {
    const books = new FakeAccountingSync();
    const costs = fakeCosts(books);
    const gc = costs.addCustomer("Acme GC");
    const job = costs.addCustomer("Riverside Clinic", gc.id);
    costs.addExpense({
      txnType: "Bill",
      txnDate: "2026-10-03",
      vendorName: "Graybar",
      lines: [
        { customerId: job.id, accountName: "Job Materials", amountCents: 125040 },
        { customerId: gc.id, accountName: "Job Materials", amountCents: 500 },
      ],
    });
    costs.addExpense({
      txnType: "Purchase",
      paymentType: "CreditCard",
      credit: true,
      txnDate: "2026-12-01",
      lines: [{ customerId: job.id, amountCents: 100 }],
    });
    const reader = costReaderFor(books);
    assert.equal(reader, costs);
    assert.equal((await reader.listCustomers())[1]?.fullyQualifiedName, "Acme GC:Riverside Clinic");
    const r = await reader.listExpenseLines({
      fromDate: "2026-10-01",
      toDate: "2026-11-30",
      customerIds: [job.id],
    });
    assert.deepEqual(
      r.lines.map((l) => [l.vendorName, l.amountCents]),
      [["Graybar", 125040]],
    );
  });
});

const purchaseOrder = {
  Id: "201",
  TxnDate: "2026-09-12",
  DocNumber: "1001",
  POStatus: "Open",
  VendorRef: { value: "56", name: "Graybar Electric" },
  Line: [
    {
      Id: "1",
      Amount: 18000,
      Description: "Switchgear, 400 A",
      DetailType: "ItemBasedExpenseLineDetail",
      ItemBasedExpenseLineDetail: {
        ItemRef: { value: "12", name: "Electrical materials" },
        CustomerRef: { value: "58" },
      },
    },
    {
      Id: "2",
      Amount: 500,
      DetailType: "AccountBasedExpenseLineDetail",
      AccountBasedExpenseLineDetail: { AccountRef: { value: "81", name: "Shop supplies" } },
    },
  ],
};

describe("purchase orders", () => {
  it("maps an order's lines for the customer, with its status and vendor", () => {
    const lines = purchaseOrderLinesOf(purchaseOrder, jobMatch({ customerIds: ["58"] }));
    assert.deepEqual(lines, [
      {
        txnId: "201",
        lineId: "1",
        txnDate: "2026-09-12",
        docNumber: "1001",
        vendorName: "Graybar Electric",
        customerId: "58",
        itemName: "Electrical materials",
        description: "Switchgear, 400 A",
        amountCents: 1_800_000,
        status: "Open",
        manuallyClosed: false,
      },
    ]);
    const closed = purchaseOrderLinesOf(
      { ...purchaseOrder, POStatus: "Closed", ManuallyClosed: true },
      jobMatch({ customerIds: ["58"] }),
    );
    assert.equal(closed[0]?.status, "Closed");
    assert.equal(closed[0]?.manuallyClosed, true);
    assert.equal(
      purchaseOrderLinesOf(
        { ...purchaseOrder, POStatus: "x" },
        jobMatch({ customerIds: ["58"] }),
      )[0]?.status,
      null,
    );
  });

  it("passes a bill line's purchase-order link through", () => {
    const linked = {
      ...bill,
      Line: [
        {
          ...bill.Line[0],
          LinkedTxn: [
            { TxnId: "9", TxnType: "ItemReceipt" },
            { TxnId: "201", TxnType: "PurchaseOrder", TxnLineId: "1" },
          ],
        },
        { ...bill.Line[0], Id: "4", LinkedTxn: [{ TxnId: "202", TxnType: "PurchaseOrder" }] },
      ],
    };
    const lines = expenseLinesOf("Bill", linked, jobMatch({ customerIds: ["58"] }));
    assert.deepEqual(
      lines.map((l) => l.purchaseOrder),
      [{ txnId: "201", lineId: "1" }, { txnId: "202" }],
    );
    assert.equal(
      expenseLinesOf("Bill", bill, jobMatch({ customerIds: ["58"] }))[0]?.purchaseOrder,
      undefined,
    );
  });

  it("queries PurchaseOrder in the date window", async () => {
    const http = scriptedFetch([{ json: { QueryResponse: { PurchaseOrder: [purchaseOrder] } } }]);
    const reader = new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }).client,
    );
    const r = await reader.listPurchaseOrderLines({
      fromDate: "2026-01-01",
      toDate: "2026-11-26",
      customerIds: ["58"],
    });
    assert.deepEqual(
      http.requests.map((q) => q.url.searchParams.get("query")),
      [
        "select * from PurchaseOrder where TxnDate >= '2026-01-01' and TxnDate <= '2026-11-26' startposition 1 maxresults 1000",
      ],
    );
    assert.equal(r.lines.length, 1);
    assert.equal(r.truncated, false);
  });

  it("are kept by the fake, with links from its bills", async () => {
    const books = new FakeAccountingSync();
    const costs = fakeCosts(books);
    const job = costs.addCustomer("Riverside Clinic");
    const po = costs.addPurchaseOrder({
      txnDate: "2026-09-12",
      docNumber: "1001",
      vendorName: "Graybar",
      lines: [{ customerId: job.id, accountName: "Job Materials", amountCents: 1_800_000 }],
    });
    costs.addExpense({
      txnType: "Bill",
      txnDate: "2026-10-03",
      lines: [
        {
          customerId: job.id,
          accountName: "Job Materials",
          amountCents: 900_000,
          purchaseOrder: { txnId: po, lineId: "1" },
        },
      ],
    });
    const q = { fromDate: "2026-09-01", toDate: "2026-11-30", customerIds: [job.id] };
    const pos = await costs.listPurchaseOrderLines(q);
    assert.deepEqual(
      pos.lines.map((l) => [l.docNumber, l.amountCents, l.status]),
      [["1001", 1_800_000, "Open"]],
    );
    costs.setPurchaseOrderStatus(po, "Closed", true);
    costs.setLineAmount(po, "1", 2_000_000);
    const again = await costs.listPurchaseOrderLines(q);
    assert.deepEqual(
      again.lines.map((l) => [l.amountCents, l.status, l.manuallyClosed]),
      [[2_000_000, "Closed", true]],
    );
    const bills = await costs.listExpenseLines(q);
    assert.deepEqual(bills.lines[0]?.purchaseOrder, { txnId: po, lineId: "1" });
  });
});

// A payroll service's journal entry, split by job: wages and employer taxes debited to cost
// accounts with the job as the line's customer, cash and payroll liabilities credited (no job).
const payrollJe = {
  Id: "312",
  TxnDate: "2026-11-14",
  DocNumber: "PR-1114",
  Line: [
    {
      Id: "0",
      Amount: 4200,
      Description: "Field wages, week ending 11/14",
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Debit",
        AccountRef: { value: "120", name: "Direct Labor" },
        Entity: { Type: "Customer", EntityRef: { value: "58", name: "Acme GC:Riverside Clinic" } },
      },
    },
    {
      Id: "1",
      Amount: 321.3,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Debit",
        AccountRef: { value: "121", name: "Payroll Taxes - Field" },
        Entity: { Type: "Job", EntityRef: { value: "58" } },
      },
    },
    {
      Id: "2",
      Amount: 1800,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Debit",
        AccountRef: { value: "120", name: "Direct Labor" },
        Entity: { Type: "Customer", EntityRef: { value: "99" } },
      },
    },
    {
      Id: "3",
      Amount: 6321.3,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Credit",
        AccountRef: { value: "10", name: "Checking" },
      },
    },
    {
      Id: "4",
      Amount: 150,
      Description: "Reclass: hours charged to the wrong job",
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Credit",
        AccountRef: { value: "120", name: "Direct Labor" },
        Entity: { Type: "Customer", EntityRef: { value: "58" } },
      },
    },
    {
      Id: "5",
      Amount: 500,
      Description: "Write-off",
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Credit",
        AccountRef: { value: "11", name: "Accounts Receivable (A/R)" },
        Entity: { Type: "Customer", EntityRef: { value: "58" } },
      },
    },
    {
      Id: "6",
      Amount: 75,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Debit",
        AccountRef: { value: "120", name: "Direct Labor" },
        Entity: { Type: "Vendor", EntityRef: { value: "58" } },
      },
    },
  ],
};

const chart = [
  { Id: "120", Name: "Direct Labor", Classification: "Expense", AccountType: "Cost of Goods Sold" },
  { Id: "121", Name: "Payroll Taxes - Field", AccountType: "Cost of Goods Sold" },
  { Id: "10", Name: "Checking", Classification: "Asset", AccountType: "Bank" },
  {
    Id: "11",
    Name: "Accounts Receivable (A/R)",
    Classification: "Asset",
    AccountType: "Accounts Receivable",
  },
];

describe("journal entries", () => {
  it("counts the job's lines on cost accounts: debits as costs, credits negative", () => {
    const costIds = costAccountIdsOf(chart);
    assert.deepEqual([...costIds].sort(), ["120", "121"]);
    const lines = journalLinesOf(payrollJe, jobMatch({ customerIds: ["58"] }), costIds);
    assert.deepEqual(
      lines.map((l) => [l.txnType, l.lineId, l.accountName, l.amountCents, l.description]),
      [
        ["JournalEntry", "0", "Direct Labor", 420000, "Field wages, week ending 11/14"],
        ["JournalEntry", "1", "Payroll Taxes - Field", 32130, undefined],
        ["JournalEntry", "4", "Direct Labor", -15000, "Reclass: hours charged to the wrong job"],
      ],
    );
    assert.equal(lines[0]?.docNumber, "PR-1114");
    assert.equal(lines[0]?.txnDate, "2026-11-14");
    assert.equal(lines[0]?.vendorName, undefined);
  });

  it("reads the chart of accounts only when an entry names the job", async () => {
    const other = { ...payrollJe, Id: "313", Line: [payrollJe.Line[2], payrollJe.Line[3]] };
    const quiet = scriptedFetch([
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: { JournalEntry: [other] } } },
    ]);
    const r1 = await new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: quiet.fetch }).client,
    ).listExpenseLines({ fromDate: "2026-11-01", toDate: "2026-11-30", customerIds: ["58"] });
    assert.equal(quiet.remaining(), 0);
    assert.equal(quiet.requests.length, 4);
    assert.deepEqual(r1.lines, []);

    const http = scriptedFetch([
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: { JournalEntry: [payrollJe, other] } } },
      { json: { QueryResponse: { Account: chart } } },
    ]);
    const r2 = await new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }).client,
    ).listExpenseLines({ fromDate: "2026-11-01", toDate: "2026-11-30", customerIds: ["58"] });
    assert.equal(http.remaining(), 0);
    assert.equal(
      http.requests[4]?.url.searchParams.get("query"),
      "select * from Account startposition 1 maxresults 1000",
    );
    assert.deepEqual(
      r2.lines.map((l) => l.amountCents),
      [420000, 32130, -15000],
    );
  });

  it("are kept by the fake, with their accounts", async () => {
    const books = new FakeAccountingSync();
    const costs = fakeCosts(books);
    const job = costs.addCustomer("Riverside Clinic");
    costs.addJournalEntry({
      txnDate: "2026-11-14",
      docNumber: "PR-1114",
      lines: [
        {
          postingType: "Debit",
          accountName: "Direct Labor",
          customerId: job.id,
          amountCents: 420000,
        },
        {
          postingType: "Credit",
          accountName: "Checking",
          classification: "Asset",
          amountCents: 420000,
        },
        {
          postingType: "Credit",
          accountName: "Accounts Receivable",
          classification: "Asset",
          customerId: job.id,
          amountCents: 9900,
        },
      ],
    });
    const r = await costReaderFor(books).listExpenseLines({
      fromDate: "2026-11-01",
      toDate: "2026-11-30",
      customerIds: [job.id],
    });
    assert.deepEqual(
      r.lines.map((l) => [l.txnType, l.accountName, l.amountCents]),
      [["JournalEntry", "Direct Labor", 420000]],
    );
    const outside = await costReaderFor(books).listExpenseLines({
      fromDate: "2026-12-01",
      toDate: "2026-12-31",
      customerIds: [job.id],
    });
    assert.deepEqual(outside.lines, []);
  });
});

describe("jobs tracked by class", () => {
  const byClass = jobMatch({ customerIds: [], classIds: ["5000"] });
  const bill = {
    Id: "901",
    TxnDate: "2026-11-03",
    VendorRef: { value: "7", name: "Graybar" },
    Line: [
      {
        Id: "1",
        Amount: 812.4,
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: "80", name: "Job Materials" },
          ClassRef: { value: "5000", name: "Riverside Clinic" },
        },
      },
      {
        Id: "2",
        Amount: 60,
        DetailType: "ItemBasedExpenseLineDetail",
        ItemBasedExpenseLineDetail: {
          ItemRef: { value: "3", name: "Wire" },
          ClassRef: { value: "5000" },
          CustomerRef: { value: "58" },
        },
      },
      {
        Id: "3",
        Amount: 99,
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: "80", name: "Job Materials" },
          ClassRef: { value: "5001", name: "Overhead" },
        },
      },
    ],
  };

  it("matches bill lines by the job's class, with or without a customer", () => {
    const lines = expenseLinesOf("Bill", bill, byClass);
    assert.deepEqual(
      lines.map((l) => [l.lineId, l.amountCents, l.classId, l.customerId]),
      [
        ["1", 81240, "5000", undefined],
        ["2", 6000, "5000", "58"],
      ],
    );
    // A customer-only read ignores classes, as before.
    assert.deepEqual(
      expenseLinesOf("Bill", bill, jobMatch({ customerIds: ["58"] })).map((l) => l.lineId),
      ["2"],
    );
    // Either key matches; a line is listed once even when it carries both.
    assert.deepEqual(
      expenseLinesOf("Bill", bill, jobMatch({ customerIds: ["58"], classIds: ["5000"] })).map(
        (l) => l.lineId,
      ),
      ["1", "2"],
    );
  });

  it("matches journal lines by class, on cost accounts only", () => {
    const je = {
      Id: "77",
      TxnDate: "2026-11-14",
      Line: [
        {
          Id: "0",
          Amount: 1000,
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: {
            PostingType: "Debit",
            AccountRef: { value: "120", name: "Direct Labor" },
            ClassRef: { value: "5000" },
          },
        },
        {
          Id: "1",
          Amount: 1000,
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: {
            PostingType: "Credit",
            AccountRef: { value: "10", name: "Checking" },
            ClassRef: { value: "5000" },
          },
        },
      ],
    };
    const lines = journalLinesOf(je, byClass, costAccountIdsOf(chart));
    assert.deepEqual(
      lines.map((l) => [l.lineId, l.amountCents, l.classId]),
      [["0", 100000, "5000"]],
    );
  });

  it("takes a purchase order's own class for lines that carry none", () => {
    const po = {
      Id: "40",
      TxnDate: "2026-10-01",
      POStatus: "Open",
      ClassRef: { value: "5000" },
      Line: [
        {
          Id: "1",
          Amount: 500,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { value: "80", name: "Job Materials" } },
        },
        {
          Id: "2",
          Amount: 700,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: "80", name: "Job Materials" },
            ClassRef: { value: "5001" },
          },
        },
      ],
    };
    assert.deepEqual(
      purchaseOrderLinesOf(po, byClass).map((l) => [l.lineId, l.classId]),
      [["1", "5000"]],
    );
  });

  it("the reader sends no query when neither customers nor classes are asked for", async () => {
    const http = scriptedFetch([]);
    const reader = new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }).client,
    );
    const q = { fromDate: "2026-11-01", toDate: "2026-11-30", customerIds: [], classIds: [] };
    assert.deepEqual(await reader.listExpenseLines(q), { lines: [], truncated: false });
    assert.deepEqual(await reader.listPurchaseOrderLines(q), { lines: [], truncated: false });
    assert.equal(http.requests.length, 0);
  });

  it("the reader reads the chart of accounts when a journal entry names the class", async () => {
    const je = {
      Id: "78",
      TxnDate: "2026-11-14",
      Line: [
        {
          Id: "0",
          Amount: 250,
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: {
            PostingType: "Debit",
            AccountRef: { value: "120", name: "Direct Labor" },
            ClassRef: { value: "5000" },
          },
        },
      ],
    };
    const http = scriptedFetch([
      { json: { QueryResponse: { Bill: [bill] } } },
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: {} } },
      { json: { QueryResponse: { JournalEntry: [je] } } },
      { json: { QueryResponse: { Account: chart } } },
    ]);
    const r = await new QboCostReader(
      new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }).client,
    ).listExpenseLines({
      fromDate: "2026-11-01",
      toDate: "2026-11-30",
      customerIds: [],
      classIds: ["5000"],
    });
    assert.equal(http.remaining(), 0);
    assert.deepEqual(
      r.lines.map((l) => [l.txnType, l.lineId, l.amountCents]),
      [
        ["Bill", "1", 81240],
        ["Bill", "2", 6000],
        ["JournalEntry", "0", 25000],
      ],
    );
  });

  it("the fake reads classes on bills, journal entries and purchase orders", async () => {
    const books = new FakeAccountingSync();
    const costs = fakeCosts(books);
    costs.addExpense({
      txnType: "Bill",
      txnDate: "2026-11-02",
      lines: [
        { classId: "k1", accountName: "Job Materials", amountCents: 1000 },
        { classId: "k2", accountName: "Job Materials", amountCents: 2000 },
      ],
    });
    costs.addJournalEntry({
      txnDate: "2026-11-03",
      lines: [
        { postingType: "Debit", accountName: "Direct Labor", classId: "k1", amountCents: 300 },
      ],
    });
    costs.addPurchaseOrder({
      txnDate: "2026-11-04",
      classId: "k1",
      lines: [{ accountName: "Job Materials", amountCents: 5000 }],
    });
    const q = { fromDate: "2026-11-01", toDate: "2026-11-30", customerIds: [], classIds: ["k1"] };
    const r = await costs.listExpenseLines(q);
    assert.deepEqual(
      r.lines.map((l) => l.amountCents),
      [1000, 300],
    );
    const po = await costs.listPurchaseOrderLines(q);
    assert.deepEqual(
      po.lines.map((l) => [l.amountCents, l.classId]),
      [[5000, "k1"]],
    );
  });
});
