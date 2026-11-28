import { describe, expect, it } from "vitest";
import {
  compareWithPrevious,
  computeSwornStatement,
  OWN_FORCES_NAME,
  swornHasErrors,
  swornHeaderFromProject,
  swornRowsFromCommitments,
  swornStatementFileName,
  swornStatementSchema,
} from "./sworn-statement";

const base = {
  projectName: "Oak Park Library",
  contractorName: "Lakeside Electric LLC",
  statementDate: "2026-11-26",
};
// The public guide's worked example (pay-app-guides/sworn.mjs EXAMPLE), in cents: $480,000 with a
// $12,000 change order, $85,000 paid, $32,900 owing, $13,100 retainage.
const example = (extra: Record<string, unknown> = {}) =>
  computeSwornStatement(
    swornStatementSchema.parse({
      ...base,
      contractSumCents: 48_000_000,
      requestedCents: 3_290_000,
      rows: [
        {
          name: "Own forces (labor and profit)",
          contractCents: 26_800_000,
          changesCents: 1_200_000,
          retainageCents: 560_000,
          paidCents: 4_000_000,
          owingCents: 1_040_000,
        },
        {
          name: "Valley Electric Supply",
          address: "120 Mill Rd, Springfield",
          work: "Wire and gear",
          contractCents: 15_000_000,
          retainageCents: 750_000,
          paidCents: 4_500_000,
          owingCents: 2_250_000,
        },
        {
          name: "Lowvolt Systems LLC",
          address: "8 Oak St",
          work: "Fire alarm",
          contractCents: 5_000_000,
        },
      ],
      affiantName: "Jordan Lee",
      ...extra,
    }),
  );

describe("computeSwornStatement", () => {
  it("totals the guide's example by hand and finds nothing wrong", () => {
    const s = example();
    expect(s.totals).toEqual({
      contractCents: 46_800_000,
      changesCents: 1_200_000,
      adjustedCents: 48_000_000,
      completedCents: 13_100_000,
      retainageCents: 1_310_000,
      paidCents: 8_500_000,
      owingCents: 3_290_000,
      balanceCents: 48_000_000 - 8_500_000 - 3_290_000,
      wagesCents: 0,
      fringeCents: 0,
    });
    expect(s.issues).toEqual([]);
    expect(s.rows[0]?.ownForces).toBe(true);
    expect(s.rows[1]?.balanceCents).toBe(15_000_000 - 4_500_000 - 2_250_000);
  });

  it("lists the waivers to collect, own forces left out", () => {
    expect(example().waivers).toEqual([
      { name: "Valley Electric Supply", kind: "unconditional", amountCents: 4_500_000 },
      { name: "Valley Electric Supply", kind: "conditional", amountCents: 2_250_000 },
    ]);
  });

  it("flags rows that do not tie to the contract sum or the request", () => {
    const short = example({ contractSumCents: 50_000_000 });
    expect(short.issues[0]?.message).toMatch(/\$20,000\.00 less than your contract sum/);
    expect(swornHasErrors(short)).toBe(false);
    const over = example({ contractSumCents: 47_000_000 });
    expect(swornHasErrors(over)).toBe(true);
    const ask = example({ requestedCents: 3_000_000 });
    expect(ask.issues.map((i) => i.message).join(" ")).toMatch(
      /shows \$32,900\.00 owing but the pay application asks for \$30,000\.00/,
    );
  });

  it("an earned amount over the contract is an error; invoiced to date that differs is a warning", () => {
    const s = computeSwornStatement(
      swornStatementSchema.parse({
        ...base,
        rows: [
          { name: "A Supply", address: "x", contractCents: 1_000, paidCents: 900, owingCents: 200 },
          {
            name: "B Sub",
            address: "y",
            contractCents: 1_000,
            paidCents: 500,
            billedToDateCents: 700,
          },
        ],
        affiantName: "J",
      }),
    );
    expect(s.issues.map((i) => [i.level, i.where])).toEqual([
      ["error", "Row 1 (A Supply)"],
      ["warning", "Row 2 (B Sub)"],
    ]);
  });

  it("Michigan: notes a missing type of improvement and unpaid wages; missing address everywhere", () => {
    const s = computeSwornStatement(
      swornStatementSchema.parse({
        ...base,
        state: "MI",
        rows: [{ name: "Crew", contractCents: 1_000, wagesCents: 100 }],
      }),
    );
    const msgs = s.issues.map((i) => i.message).join(" | ");
    expect(msgs).toMatch(/No address.*phone column/);
    expect(msgs).toMatch(/No type of improvement/);
    expect(msgs).toMatch(/Unpaid wages \$1\.00/);
    expect(msgs).toMatch(/signer's name/);
  });

  it("notes a party listed twice", () => {
    const s = computeSwornStatement(
      swornStatementSchema.parse({
        ...base,
        rows: [
          { name: "ABC Supply", address: "x", contractCents: 1 },
          { name: "abc  supply", address: "x", contractCents: 1 },
        ],
        affiantName: "J",
      }),
    );
    expect(s.issues).toHaveLength(1);
    expect(s.issues[0]?.message).toMatch(/Listed 2 times/);
  });
});

describe("swornRowsFromCommitments", () => {
  it("one row per vendor, invoiced to date as the cross-check, own forces for the rest", () => {
    const rows = swornRowsFromCommitments(
      [
        {
          vendor: "Valley Electric Supply",
          description: "Wire",
          kind: "purchase_order",
          amountCents: 10_000_00,
          invoicedCents: 4_000_00,
          afterAsOf: false,
        },
        {
          vendor: "valley electric supply ",
          description: "Gear",
          kind: "purchase_order",
          amountCents: 5_000_00,
          invoicedCents: 1_000_00,
          afterAsOf: false,
        },
        {
          vendor: "Lowvolt Systems LLC",
          description: null,
          kind: "subcontract",
          amountCents: 5_000_00,
          invoicedCents: 300_00,
          afterAsOf: true,
        },
      ],
      48_000_00,
    );
    expect(rows).toEqual([
      { name: OWN_FORCES_NAME, contractCents: 28_000_00 },
      {
        name: "Valley Electric Supply",
        contractCents: 15_000_00,
        billedToDateCents: 5_000_00,
        work: "Wire; Gear",
      },
      {
        name: "Lowvolt Systems LLC",
        contractCents: 5_000_00,
        billedToDateCents: 0,
        work: "Subcontract",
      },
    ]);
  });

  it("no own-forces row when commitments cover the contract or it is unknown", () => {
    const c = [
      {
        vendor: "X",
        description: null,
        kind: "subcontract" as const,
        amountCents: 100,
        invoicedCents: 0,
        afterAsOf: false,
      },
    ];
    expect(swornRowsFromCommitments(c, 100)).toHaveLength(1);
    expect(swornRowsFromCommitments(c, null)).toHaveLength(1);
  });
});

describe("header and file name", () => {
  it("takes the latest pay application's number and amount due", () => {
    const h = swornHeaderFromProject(
      {
        name: "Job",
        location: null,
        ownerName: "Village of Oak Park",
        gcName: "Prairie Builders",
        sovTotalCents: 100,
        payApps: [
          { number: 3, periodTo: "2026-09-30", currentPaymentDueCents: 5 },
          { number: 4, periodTo: "2026-10-31", currentPaymentDueCents: 7 },
        ] as never,
      },
      "Lakeside Electric LLC",
      "2026-11-26",
    );
    expect(h.payApp).toBe("No. 4, period to 2026-10-31");
    expect(h.requestedCents).toBe(7);
    expect(h.givenTo).toBe("Prairie Builders");
    const s = swornStatementSchema.parse({ ...h, rows: [{ name: "x", contractCents: 1 }] });
    expect(swornStatementFileName(s)).toBe("sworn-statement-pay-app-4-2026-11-26.pdf");
    expect(swornStatementFileName({ ...s, payApp: "" })).toBe("sworn-statement-2026-11-26.pdf");
  });
});

describe("compareWithPrevious", () => {
  const stmt = (date: string, rows: Record<string, unknown>[]) =>
    swornStatementSchema.parse({ ...base, statementDate: date, payApp: "No. 3", rows });
  const october = stmt("2026-10-25", [
    { name: "Own forces (labor and profit)", contractCents: 1_000_000, paidCents: 500_000 },
    {
      name: "Valley Electric Supply",
      address: "120 Mill Rd",
      contractCents: 15_000_000,
      retainageCents: 500_000,
      paidCents: 2_000_000,
      owingCents: 2_500_000,
    },
    { name: "Lowvolt Systems LLC", contractCents: 5_000_000, paidCents: 1_000_000 },
  ]);

  it("a month that carries owing into paid, with every party kept, raises nothing", () => {
    const november = stmt("2026-11-26", [
      { name: "Own forces (labor and profit)", contractCents: 1_000_000, paidCents: 0 },
      {
        name: "valley  electric supply",
        contractCents: 15_000_000,
        retainageCents: 750_000,
        paidCents: 4_500_000,
        owingCents: 2_250_000,
      },
      { name: "Lowvolt Systems LLC", contractCents: 5_000_000, paidCents: 1_000_000 },
      { name: "New Sub", contractCents: 100_000 },
    ]);
    // Own forces going down is the contractor's own business; a new party is fine.
    expect(compareWithPrevious(november, october)).toEqual([]);
  });

  it("flags a party dropped, paid to date going down and earned to date going down", () => {
    const november = stmt("2026-11-26", [
      {
        name: "Valley Electric Supply",
        contractCents: 15_000_000,
        paidCents: 1_500_000,
        owingCents: 0,
      },
    ]);
    const issues = compareWithPrevious(november, october);
    expect(issues.map((i) => [i.where, i.message.slice(0, 30)])).toEqual([
      ["Valley Electric Supply", "Already paid is $15,000.00, le"],
      ["Valley Electric Supply", "Paid, owing and retainage come"],
      ["Lowvolt Systems LLC", "On the statement given 2026-10"],
    ]);
    expect(issues.every((i) => i.level === "warning")).toBe(true);
    expect(issues[2]?.message).toContain("(No. 3)");
    expect(issues[1]?.message).toContain("$50,000.00");
  });

  it("adds several rows for one party together, and warns of a date before the last", () => {
    const split = stmt("2026-10-01", [
      { name: "Own forces", contractCents: 0 },
      {
        name: "Valley Electric Supply",
        contractCents: 8_000_000,
        paidCents: 1_000_000,
        retainageCents: 500_000,
      },
      {
        name: "Valley Electric Supply",
        contractCents: 7_000_000,
        paidCents: 1_000_000,
        owingCents: 2_500_000,
      },
      { name: "Lowvolt Systems LLC", contractCents: 5_000_000, paidCents: 1_000_000 },
    ]);
    const issues = compareWithPrevious(split, october);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.where).toBe("Statement date");
  });
});
