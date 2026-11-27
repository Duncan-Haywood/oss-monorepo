// Class and location tracking (QuickBooks Plus and Advanced): preferences, the Class and
// Department lists, and ClassRef/DepartmentRef on invoices and credit memos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeAccountingSync } from "../src/fake.ts";
import type { AccessTokenProvider } from "../src/oauth.ts";
import { AccountingValidationError } from "../src/port.ts";
import {
  creditMemoToQbo,
  invoiceToQbo,
  QuickBooksOnlineSync,
  trackingPrefsFromQbo,
} from "../src/qbo.ts";
import { jsonBody, type ScriptedResponse, scriptedFetch } from "./http.ts";

const tokens: AccessTokenProvider = {
  realmId: "9130",
  getAccessToken: async () => "access",
  forceRefresh: async () => "access",
};

function setup(script: ScriptedResponse[]) {
  const http = scriptedFetch(script);
  return {
    http,
    sync: new QuickBooksOnlineSync({ tokens, environment: "sandbox", fetch: http.fetch }),
  };
}

describe("tracking preferences", () => {
  it("reads per-line, per-transaction and off from AccountingInfoPrefs", () => {
    assert.deepEqual(trackingPrefsFromQbo(undefined), {
      classTracking: "off",
      locationTracking: false,
      locationLabel: null,
    });
    assert.equal(
      trackingPrefsFromQbo({ AccountingInfoPrefs: { ClassTrackingPerTxn: true } }).classTracking,
      "per-transaction",
    );
    assert.equal(
      trackingPrefsFromQbo({
        AccountingInfoPrefs: { ClassTrackingPerTxn: true, ClassTrackingPerTxnLine: true },
      }).classTracking,
      "per-line",
    );
    assert.deepEqual(
      trackingPrefsFromQbo({
        AccountingInfoPrefs: { TrackDepartments: true, DepartmentTerminology: " Division " },
      }),
      { classTracking: "off", locationTracking: true, locationLabel: "Division" },
    );
  });

  it("reads the home currency from CurrencyPrefs, and leaves it out when absent or malformed", () => {
    assert.equal(
      trackingPrefsFromQbo({ CurrencyPrefs: { HomeCurrency: { value: "CAD" } } }).homeCurrency,
      "CAD",
    );
    assert.equal("homeCurrency" in trackingPrefsFromQbo({}), false);
    assert.equal(
      "homeCurrency" in
        trackingPrefsFromQbo({ CurrencyPrefs: { HomeCurrency: { value: "dollars" } } }),
      false,
    );
  });

  it("GETs the company's preferences resource", async () => {
    const { http, sync } = setup([
      {
        json: {
          Preferences: {
            AccountingInfoPrefs: { ClassTrackingPerTxnLine: true, TrackDepartments: true },
          },
        },
      },
    ]);
    const prefs = await sync.getTrackingPrefs();
    assert.equal(prefs.classTracking, "per-line");
    assert.equal(prefs.locationTracking, true);
    assert.equal(http.requests[0]?.method, "GET");
    assert.equal(http.requests[0]?.url.pathname, "/v3/company/9130/preferences");
  });
});

describe("classes and locations", () => {
  it("lists classes sorted by full name, sub-classes under their parent", async () => {
    const { http, sync } = setup([
      {
        json: {
          QueryResponse: {
            Class: [
              { Id: "3", Name: "Service", FullyQualifiedName: "Service" },
              {
                Id: "5",
                Name: "Tenant improvements",
                FullyQualifiedName: "New work:Tenant improvements",
              },
              { Id: "4", Name: "New work", FullyQualifiedName: "New work" },
              { Id: "6", Name: "Old", FullyQualifiedName: "Old", Active: false },
            ],
          },
        },
      },
    ]);
    const classes = await sync.listClasses();
    assert.deepEqual(
      classes.map((c) => c.fullName),
      ["New work", "New work:Tenant improvements", "Service"],
    );
    assert.equal(
      http.requests[0]?.url.searchParams.get("query"),
      "select * from Class maxresults 1000",
    );
  });

  it("reads one location from the Department entity, inactive as gone", async () => {
    const { http, sync } = setup([
      { json: { QueryResponse: { Department: [{ Id: "2", Name: "Denver" }] } } },
      { json: { QueryResponse: { Department: [{ Id: "7", Name: "Boise", Active: false }] } } },
    ]);
    assert.deepEqual(await sync.getLocation("2"), { id: "2", name: "Denver", fullName: "Denver" });
    assert.equal(await sync.getLocation("7"), null);
    assert.equal(
      http.requests[0]?.url.searchParams.get("query"),
      "select * from Department where Id = '2' maxresults 1",
    );
  });
});

describe("ClassRef and DepartmentRef on the wire", () => {
  it("puts a line class in SalesItemLineDetail and the transaction's on the invoice", () => {
    const body = invoiceToQbo({
      customerId: "1",
      classId: "4",
      locationId: "2",
      lines: [{ itemId: "9", amountCents: 1000, classId: "5" }],
    });
    assert.deepEqual(body.ClassRef, { value: "4" });
    assert.deepEqual(body.DepartmentRef, { value: "2" });
    const line = (body.Line as { SalesItemLineDetail: Record<string, unknown> }[])[0];
    assert.deepEqual(line?.SalesItemLineDetail.ClassRef, { value: "5" });
  });

  it("leaves both out when not set", () => {
    const body = invoiceToQbo({ customerId: "1", lines: [{ itemId: "9", amountCents: 1000 }] });
    assert.equal("ClassRef" in body, false);
    assert.equal("DepartmentRef" in body, false);
  });

  it("sends a credit memo's location and class", () => {
    const body = creditMemoToQbo({
      customerId: "1",
      locationId: "2",
      lines: [{ itemId: "9", amountCents: 500, classId: "5" }],
    });
    assert.deepEqual(body.DepartmentRef, { value: "2" });
    const line = (body.Line as { SalesItemLineDetail: Record<string, unknown> }[])[0];
    assert.deepEqual(line?.SalesItemLineDetail.ClassRef, { value: "5" });
  });

  it("reads them back from a created invoice", async () => {
    const { http, sync } = setup([
      {
        json: {
          Invoice: {
            Id: "130",
            SyncToken: "0",
            CustomerRef: { value: "1" },
            ClassRef: { value: "4" },
            DepartmentRef: { value: "2" },
            TotalAmt: 10,
            Balance: 10,
            Line: [
              {
                DetailType: "SalesItemLineDetail",
                Amount: 10,
                SalesItemLineDetail: { ItemRef: { value: "9" }, ClassRef: { value: "5" } },
              },
            ],
          },
        },
      },
    ]);
    const inv = await sync.createInvoice({
      customerId: "1",
      locationId: "2",
      lines: [{ itemId: "9", amountCents: 1000, classId: "5" }],
    });
    assert.equal(inv.classId, "4");
    assert.equal(inv.locationId, "2");
    assert.equal(inv.lines[0]?.classId, "5");
    assert.deepEqual(jsonBody(http.requests[0]).DepartmentRef, { value: "2" });
  });

  it("refuses an id that is not a QuickBooks id before sending", async () => {
    const { http, sync } = setup([]);
    await assert.rejects(
      sync.createInvoice({
        customerId: "1",
        locationId: "2' or 1=1",
        lines: [{ itemId: "9", amountCents: 1000 }],
      }),
      AccountingValidationError,
    );
    await assert.rejects(
      sync.createInvoice({
        customerId: "1",
        lines: [{ itemId: "9", amountCents: 1000, classId: "" }],
      }),
      AccountingValidationError,
    );
    assert.equal(http.requests.length, 0);
  });
});

describe("FakeAccountingSync tracking", () => {
  it("lists active classes and locations and keeps them on the invoice", async () => {
    const books = new FakeAccountingSync();
    const parent = books.addClass("New work");
    const ti = books.addClass("Tenant improvements", parent);
    const old = books.addClass("Old");
    books.inactiveTracking.add(old.id);
    const denver = books.addLocation("Denver");
    assert.deepEqual(
      (await books.listClasses()).map((c) => c.fullName),
      ["New work", "New work:Tenant improvements"],
    );
    assert.equal(await books.getClass(old.id), null);
    const income = await books.ensureAccount({ name: "Income", accountType: "Income" });
    const item = await books.ensureItem({
      name: "Work",
      type: "Service",
      incomeAccountId: income.id,
    });
    const customer = await books.upsertCustomer({ displayName: "GC" });
    const inv = await books.createInvoice({
      customerId: customer.id,
      locationId: denver.id,
      lines: [{ itemId: item.id, amountCents: 100, classId: ti.id }],
    });
    assert.equal(inv.locationId, denver.id);
    assert.equal(inv.lines[0]?.classId, ti.id);
  });

  it("refuses a class or location the company does not have", async () => {
    const books = new FakeAccountingSync();
    const income = await books.ensureAccount({ name: "Income", accountType: "Income" });
    const item = await books.ensureItem({
      name: "Work",
      type: "Service",
      incomeAccountId: income.id,
    });
    const customer = await books.upsertCustomer({ displayName: "GC" });
    await assert.rejects(
      books.createInvoice({
        customerId: customer.id,
        classId: "999",
        lines: [{ itemId: item.id, amountCents: 100 }],
      }),
      /unknown class/,
    );
    await assert.rejects(
      books.createCreditMemo({
        customerId: customer.id,
        locationId: "999",
        lines: [{ itemId: item.id, amountCents: 100 }],
      }),
      /unknown location/,
    );
  });
});
