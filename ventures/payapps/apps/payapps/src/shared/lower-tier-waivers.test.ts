import { describe, expect, it } from "vitest";
import {
  type CompanyLowerTierInput,
  defaultLowerTierKind,
  type LowerTierFacts,
  lowerTierDateProblem,
  lowerTierDaysWaiting,
  lowerTierEmailFor,
  lowerTierPartyEmails,
  lowerTierPartyKey,
  lowerTierRequestText,
  lowerTierStatus,
  lowerTierSuggestions,
  lowerTierToChase,
  lowerTierToChaseText,
  summarizeLowerTier,
} from "./lower-tier-waivers";

const row = (o: Partial<LowerTierFacts>): LowerTierFacts => ({
  party: "ABC Supply",
  partyKind: "supplier",
  kind: "conditional-progress",
  throughDate: null,
  amountCents: null,
  requestedOn: null,
  receivedOn: null,
  ...o,
});

describe("lower-tier waivers", () => {
  it("matches a party by name, ignoring case, spacing, commas and periods", () => {
    expect(lowerTierPartyKey(" ABC  Supply, Inc. ")).toBe(lowerTierPartyKey("abc supply inc"));
    expect(lowerTierPartyKey("ABC Supply")).not.toBe(lowerTierPartyKey("ABC Supply West"));
  });

  it("status and days waiting", () => {
    expect(lowerTierStatus(row({}))).toBe("owed");
    expect(lowerTierStatus(row({ requestedOn: "2026-11-01" }))).toBe("requested");
    expect(lowerTierStatus(row({ requestedOn: "2026-11-01", receivedOn: "2026-11-03" }))).toBe(
      "received",
    );
    expect(lowerTierDaysWaiting(row({ requestedOn: "2026-11-01" }), "2026-11-26")).toBe(25);
    expect(lowerTierDaysWaiting(row({}), "2026-11-26")).toBeNull();
    expect(
      lowerTierDaysWaiting(
        row({ requestedOn: "2026-11-01", receivedOn: "2026-11-02" }),
        "2026-11-26",
      ),
    ).toBeNull();
  });

  it("refuses impossible and out-of-order dates", () => {
    const day = "2026-11-26";
    expect(lowerTierDateProblem(row({ throughDate: "2026-02-30" }), day)).toMatch(
      /not a real date/,
    );
    expect(lowerTierDateProblem(row({ receivedOn: "2026-11-27" }), day)).toMatch(/future/);
    expect(lowerTierDateProblem(row({ requestedOn: "2026-11-27" }), day)).toMatch(/future/);
    expect(
      lowerTierDateProblem(row({ requestedOn: "2026-11-20", receivedOn: "2026-11-10" }), day),
    ).toMatch(/before it was requested/);
    // A through date after today is fine: a conditional waiver can cover the period still running.
    expect(lowerTierDateProblem(row({ throughDate: "2026-11-30" }), day)).toBeNull();
  });

  it("summarizes what is in and who still owes one, each party once", () => {
    const s = summarizeLowerTier([
      row({ party: "ABC Supply", receivedOn: "2026-11-02" }),
      row({ party: "Valley Insulation", requestedOn: "2026-11-01" }),
      row({ party: "valley insulation", kind: "unconditional-progress" }),
      row({ party: "Rio Rentals" }),
    ]);
    expect(s).toEqual({
      total: 4,
      received: 1,
      outstanding: 3,
      notRequested: 2,
      outstandingParties: ["Valley Insulation", "Rio Rentals"],
      complete: false,
    });
    expect(summarizeLowerTier([]).complete).toBe(false);
    expect(summarizeLowerTier([row({ receivedOn: "2026-11-02" })]).complete).toBe(true);
  });

  it("suggests the job's vendors and last time's parties, less those already listed", () => {
    const s = lowerTierSuggestions({
      commitments: [
        { vendor: "ABC Supply", kind: "purchase_order", invoicedCents: 40_000, afterAsOf: false },
        { vendor: "abc supply", kind: "purchase_order", invoicedCents: 10_000, afterAsOf: false },
        { vendor: "Valley Insulation", kind: "subcontract", invoicedCents: 0, afterAsOf: false },
        { vendor: "Rio Rentals", kind: "purchase_order", invoicedCents: 9_000, afterAsOf: true },
        { vendor: "Already Listed", kind: "purchase_order", invoicedCents: 5, afterAsOf: false },
        { vendor: "  ", kind: "purchase_order", invoicedCents: 5, afterAsOf: false },
      ],
      previous: [
        { party: "Rio Rentals", partyKind: "supplier" },
        { party: "Desert Steel", partyKind: null },
      ],
      current: [{ party: "already listed" }],
    });
    expect(s).toEqual([
      {
        party: "ABC Supply",
        partyKind: "supplier",
        invoicedCents: 50_000,
        source: "commitments",
        preselected: true,
      },
      {
        party: "Valley Insulation",
        partyKind: "subcontractor",
        invoicedCents: 0,
        source: "commitments",
        preselected: false,
      },
      {
        party: "Rio Rentals",
        partyKind: "supplier",
        invoicedCents: 0,
        source: "both",
        preselected: true,
      },
      {
        party: "Desert Steel",
        partyKind: null,
        invoicedCents: null,
        source: "last-pay-app",
        preselected: true,
      },
    ]);
  });

  it("a vendor with both a PO and a subcontract is a sub-subcontractor", () => {
    const [s] = lowerTierSuggestions({
      commitments: [
        { vendor: "Valley", kind: "purchase_order", invoicedCents: 0, afterAsOf: false },
        { vendor: "Valley", kind: "subcontract", invoicedCents: 100, afterAsOf: false },
      ],
      previous: [],
      current: [],
    });
    expect(s).toMatchObject({ partyKind: "subcontractor", invoicedCents: 100, preselected: true });
  });

  it("asks for conditional waivers of the application's own scope", () => {
    expect(defaultLowerTierKind(false)).toBe("conditional-progress");
    expect(defaultLowerTierKind(true)).toBe("conditional-final");
  });

  it("writes a plain request with what is known and nothing that is not", () => {
    const full = lowerTierRequestText({
      party: "ABC Supply",
      kind: "conditional-progress",
      throughDate: "2026-10-31",
      amountCents: 125_000,
      jobName: "Mesa Clinic TI",
      jobNumber: "24-117",
      gcName: "Copper State Builders",
      contractorName: "Test Mechanical",
    });
    expect(full).toContain("Hello ABC Supply,");
    expect(full).toContain(
      "For our pay application to Copper State Builders on Mesa Clinic TI (job 24-117), please send us a conditional progress lien waiver through 2026-10-31 for $1,250.00.",
    );
    expect(full.endsWith("Test Mechanical")).toBe(true);
    const bare = lowerTierRequestText({
      party: "Valley",
      kind: "unconditional-final",
      throughDate: null,
      amountCents: null,
      jobName: "Mesa",
      gcName: "GC",
      contractorName: "Us",
    });
    expect(bare).toContain("please send us an unconditional final lien waiver.");
  });
});

describe("lower-tier waivers still out across jobs", () => {
  const c = (o: Partial<CompanyLowerTierInput>): CompanyLowerTierInput => ({
    id: "w",
    projectId: "p1",
    projectName: "Clinic TI",
    projectNumber: "2207",
    gcName: "Harbor Builders",
    payAppId: "a1",
    payAppNumber: 4,
    party: "ABC Supply",
    requestedOn: null,
    receivedOn: null,
    ...o,
  });
  const today = "2026-11-26";

  it("groups by pay application, skips received rows, names each party once, longest wait first", () => {
    const out = lowerTierToChase(
      [
        c({ party: "ABC Supply", requestedOn: "2026-11-14" }),
        c({ party: "abc  supply." }),
        c({ party: "Ferguson" }),
        c({ party: "Valley Rebar", receivedOn: "2026-11-20", requestedOn: "2026-11-01" }),
        c({
          payAppId: "a2",
          payAppNumber: 2,
          projectId: "p2",
          projectName: "Annex",
          party: "Ferguson",
        }),
        c({
          payAppId: "a3",
          payAppNumber: 5,
          projectName: "Clinic TI",
          party: "X",
          requestedOn: "2026-11-01",
        }),
        c({ payAppId: "a4", payAppNumber: 1, party: "Y", receivedOn: "2026-11-02" }),
      ],
      today,
    );
    expect(
      out.map((a) => [a.payAppId, a.outstanding, a.notRequested, a.daysWaiting, a.parties]),
    ).toEqual([
      ["a3", 1, 0, 25, ["X"]],
      ["a1", 3, 2, 12, ["ABC Supply", "Ferguson"]],
      ["a2", 1, 1, null, ["Ferguson"]],
    ]);
  });

  it("says how many are out, who, how long, and how many are not asked for", () => {
    const [a] = lowerTierToChase(
      [
        c({ party: "ABC Supply", requestedOn: "2026-11-14" }),
        c({ party: "Ferguson", requestedOn: "2026-11-20" }),
        c({ party: "Valley Rebar" }),
        c({ party: "Desert Lumber" }),
      ],
      today,
    );
    if (!a) throw new Error("expected one");
    expect(lowerTierToChaseText(a)).toBe(
      "Clinic TI (#2207), pay app 4 to Harbor Builders: 4 lower-tier waivers still out (ABC Supply, Ferguson, Valley Rebar and 1 more), the oldest asked for 12 days ago, 2 not asked for yet.",
    );
    const [one] = lowerTierToChase([c({ projectNumber: null, requestedOn: today })], today);
    if (!one) throw new Error("expected one");
    expect(lowerTierToChaseText(one)).toBe(
      "Clinic TI, pay app 4 to Harbor Builders: 1 lower-tier waiver still out (ABC Supply), asked for today.",
    );
    const [none] = lowerTierToChase([c({}), c({ party: "Ferguson" })], today);
    if (!none) throw new Error("expected one");
    expect(lowerTierToChaseText(none)).toBe(
      "Clinic TI (#2207), pay app 4 to Harbor Builders: 2 lower-tier waivers still out (ABC Supply and Ferguson), none asked for yet.",
    );
  });
});

describe("lower-tier party emails", () => {
  it("keeps the newest address per party, matched as party names are", () => {
    const book = lowerTierPartyEmails([
      { party: "ABC Supply, Inc.", partyEmail: " new@abc.example " },
      { party: "abc supply inc", partyEmail: "old@abc.example" },
      { party: "Valley", partyEmail: null },
      { party: "Valley", partyEmail: "  " },
      { party: "constructor", partyEmail: "c@x.example" },
    ]);
    expect(book).toEqual({ "abc supply inc": "new@abc.example", constructor: "c@x.example" });
  });

  it("a row's own address wins, then the saved one, then none", () => {
    const book = { "abc supply": "saved@abc.example" };
    expect(lowerTierEmailFor({ party: "ABC Supply", partyEmail: "own@abc.example" }, book)).toBe(
      "own@abc.example",
    );
    expect(lowerTierEmailFor({ party: "ABC Supply.", partyEmail: null }, book)).toBe(
      "saved@abc.example",
    );
    expect(lowerTierEmailFor({ party: "Valley" }, book)).toBeNull();
    // Inherited object keys are not addresses.
    expect(lowerTierEmailFor({ party: "constructor" }, {})).toBeNull();
    expect(lowerTierEmailFor({ party: "toString", partyEmail: "" }, {})).toBeNull();
  });
});
