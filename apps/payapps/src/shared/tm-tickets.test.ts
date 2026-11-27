// T&M ticket rules (src/shared/tm-tickets.ts): prices section by section, what is checked, what a
// signature covers, rates carried from earlier tickets, the log's summary, change order numbers and
// descriptions, percent parsing, and reading a signature JPEG's frame.
import { describe, expect, it } from "vitest";
import { SIGNATURE_JPEG_B64 } from "../../test/fixtures/signature-jpeg";
import {
  base64ToBytes,
  changeOrderDescription,
  jpegInfo,
  nextChangeOrderNumber,
  nextTicketNumber,
  parsePercentToBps,
  priceTicket,
  ratesFromTickets,
  signatureProblem,
  signedFactsKey,
  summarizeTickets,
  type TmTicketFacts,
  ticketStage,
  tmTicketProblem,
} from "./tm-tickets";

const ticket = (over: Partial<TmTicketFacts> = {}): TmTicketFacts => ({
  number: 1,
  workDate: "2026-11-20",
  description: "Relocate two receptacles at the nurse station",
  labor: [
    { trade: "Journeyman electrician", workers: 2, hoursEach: 3.5, rateCents: 9850 },
    { trade: "Apprentice", workers: 1, hoursEach: 3.5, rateCents: 5525 },
  ],
  material: [{ description: "3/4 in EMT", quantity: 40, unit: "ft", unitCostCents: 87 }],
  equipment: [{ description: "Scissor lift, 19 ft", hours: 4, rateCents: 3500 }],
  laborMarkupBps: 1500,
  materialMarkupBps: 1000,
  equipmentMarkupBps: 0,
  ...over,
});

describe("priceTicket", () => {
  it("prices each section and marks it up on its own subtotal", () => {
    const p = priceTicket(ticket());
    // Labor: 2 x 3.5 x 98.50 = 689.50; 1 x 3.5 x 55.25 = 193.375 -> 193.38 (half up). 882.88.
    expect(p.labor).toEqual({ subtotalCents: 88288, markupCents: 13243, unpriced: 0 });
    // Material: 40 x 0.87 = 34.80, 10% = 3.48.
    expect(p.material).toEqual({ subtotalCents: 3480, markupCents: 348, unpriced: 0 });
    expect(p.equipment).toEqual({ subtotalCents: 14000, markupCents: 0, unpriced: 0 });
    expect(p.manHours).toBe(10.5);
    expect(p.priced).toBe(true);
    expect(p.totalCents).toBe(88288 + 13243 + 3480 + 348 + 14000);
  });

  it("has no total while any line is unpriced, and none for an empty ticket", () => {
    const t = ticket();
    const p = priceTicket({
      ...t,
      material: [{ description: "Boxes", quantity: 4, unit: "ea", unitCostCents: null }],
    });
    expect(p.priced).toBe(false);
    expect(p.totalCents).toBeNull();
    expect(p.material.unpriced).toBe(1);
    expect(p.pricedSoFarCents).toBe(88288 + 13243 + 14000);
    expect(priceTicket({ ...t, labor: [], material: [], equipment: [] }).totalCents).toBeNull();
  });
});

describe("tmTicketProblem", () => {
  const latest = "2026-11-27";
  it("accepts a sound ticket and lines priced later", () => {
    expect(tmTicketProblem(ticket(), latest)).toBeNull();
    expect(
      tmTicketProblem(
        ticket({ labor: [{ trade: "Laborer", workers: 1, hoursEach: 8, rateCents: null }] }),
        latest,
      ),
    ).toBeNull();
  });
  it.each([
    [{ number: 0 }, /Ticket number/],
    [{ workDate: "2026-02-30" }, /YYYY-MM-DD/],
    [{ workDate: "2026-11-28" }, /after today/],
    [{ description: "  " }, /Describe the extra work/],
    [{ labor: [], material: [], equipment: [] }, /at least one/],
    [
      { labor: [{ trade: "", workers: 1, hoursEach: 1, rateCents: 1 }] },
      /Labor line 1: enter the trade/,
    ],
    [{ labor: [{ trade: "X", workers: 1.5, hoursEach: 1, rateCents: 1 }] }, /number of workers/],
    [{ labor: [{ trade: "X", workers: 1, hoursEach: 1.1, rateCents: 1 }] }, /quarter hours/],
    [{ labor: [{ trade: "X", workers: 1, hoursEach: 0, rateCents: 1 }] }, /quarter hours/],
    [{ labor: [{ trade: "X", workers: 1, hoursEach: 1, rateCents: 1.5 }] }, /rate per hour/],
    [
      { material: [{ description: "Wire", quantity: 0.0001, unit: null, unitCostCents: 1 }] },
      /three decimals/,
    ],
    [{ equipment: [{ description: "Lift", hours: 25, rateCents: 1 }] }, /Equipment line 1/],
    [{ laborMarkupBps: 10_001 }, /Labor markup/],
  ] as const)("refuses %j", (over, msg) => {
    expect(tmTicketProblem(ticket(over as Partial<TmTicketFacts>), latest)).toMatch(msg);
  });
});

describe("signedFactsKey", () => {
  const facts = { ...ticket(), location: "Level 2" };
  it("ignores rates, markups and spaces at the ends", () => {
    const repriced = {
      ...facts,
      labor: facts.labor.map((l) => ({ ...l, rateCents: 12000 })),
      laborMarkupBps: 0,
      description: `  ${facts.description} `,
    };
    expect(signedFactsKey(repriced)).toBe(signedFactsKey(facts));
  });
  it("changes with any quantity, the date, the work or the location", () => {
    const base = signedFactsKey(facts);
    const l0 = facts.labor[0] as (typeof facts.labor)[number];
    for (const changed of [
      { ...facts, workDate: "2026-11-21" },
      { ...facts, location: "Level 3" },
      { ...facts, labor: [{ ...l0, hoursEach: 4 }, ...facts.labor.slice(1)] },
      { ...facts, material: [] },
      { ...facts, equipment: [{ description: "Scissor lift, 19 ft", hours: 5, rateCents: 3500 }] },
    ]) {
      expect(signedFactsKey(changed)).not.toBe(base);
    }
  });
});

it("carries the latest rate per trade, material and equipment from earlier tickets", () => {
  const newer = ticket({
    labor: [{ trade: "Journeyman Electrician ", workers: 1, hoursEach: 1, rateCents: 10200 }],
  });
  const older = ticket();
  const r = ratesFromTickets([
    { ...newer, workDate: "2026-11-22" },
    { ...older, workDate: "2026-11-20" },
  ]);
  expect(r.labor).toEqual({ "journeyman electrician": 10200, apprentice: 5525 });
  expect(r.material).toEqual({ "3/4 in emt": 87 });
  expect(r.equipment).toEqual({ "scissor lift, 19 ft": 3500 });
});

it("summarizes the signed work not yet on a change order", () => {
  const s = summarizeTickets([
    { workDate: "2026-11-02", stage: "signed", totalCents: 50000, manHours: 8 },
    { workDate: "2026-11-05", stage: "signed", totalCents: null, manHours: 4 },
    { workDate: "2026-11-01", stage: "on-change-order", totalCents: 70000, manHours: 2 },
    { workDate: "2026-11-09", stage: "unsigned", totalCents: 1000, manHours: 1.5 },
  ]);
  expect(s).toEqual({
    tickets: 4,
    unsigned: 1,
    signedNotOnChangeOrder: 2,
    signedNotOnChangeOrderCents: 50000,
    signedNotOnChangeOrderUnpriced: 1,
    oldestSignedNotOnChangeOrder: "2026-11-02",
    manHours: 15.5,
  });
});

it("reads a ticket's stage from its signature and change order", () => {
  expect(ticketStage({ signed: false, changeOrderStatus: null })).toBe("unsigned");
  expect(ticketStage({ signed: true, changeOrderStatus: null })).toBe("signed");
  expect(ticketStage({ signed: true, changeOrderStatus: "pending" })).toBe("on-change-order");
  expect(ticketStage({ signed: true, changeOrderStatus: "approved" })).toBe("approved");
  expect(ticketStage({ signed: true, changeOrderStatus: "rejected" })).toBe("rejected");
});

it("numbers tickets and change orders after the highest one used", () => {
  expect(nextTicketNumber([])).toBe(1);
  expect(nextTicketNumber([3, 117, 9])).toBe(118);
  expect(nextChangeOrderNumber([])).toBe("1");
  expect(nextChangeOrderNumber(["CO-3", "CO-1"])).toBe("CO-4");
  expect(nextChangeOrderNumber(["PCO 009"])).toBe("PCO 010");
  expect(nextChangeOrderNumber(["7", "Owner"])).toBe("8");
});

it("describes the change order from its tickets, held to 500 characters", () => {
  expect(changeOrderDescription([{ number: 4, description: "Move  two\nreceptacles" }])).toBe(
    "T&M 4: Move two receptacles",
  );
  expect(
    changeOrderDescription([
      { number: 9, description: "Later work" },
      { number: 4, description: "Move two receptacles" },
    ]),
  ).toBe("T&M tickets 4, 9: Move two receptacles and other extra work");
  const long = changeOrderDescription([{ number: 1, description: "x".repeat(600) }]);
  expect(long).toHaveLength(500);
  expect(long.endsWith("...")).toBe(true);
});

it("reads percent text as basis points", () => {
  expect(parsePercentToBps("")).toBe(0);
  expect(parsePercentToBps("15")).toBe(1500);
  expect(parsePercentToBps("12.5%")).toBe(1250);
  expect(parsePercentToBps("100")).toBe(10_000);
  expect(parsePercentToBps("100.01")).toBeNull();
  expect(parsePercentToBps("ten")).toBeNull();
  expect(parsePercentToBps("1.234")).toBeNull();
});

describe("signature JPEG", () => {
  it("reads the frame of a real JPEG", () => {
    const bytes = base64ToBytes(SIGNATURE_JPEG_B64);
    expect(bytes).not.toBeNull();
    expect(jpegInfo(bytes as Uint8Array)).toEqual({ width: 120, height: 40, components: 3 });
    expect(signatureProblem(SIGNATURE_JPEG_B64)).toBeNull();
  });
  it("refuses what is not a JPEG, or too big", () => {
    expect(signatureProblem(btoa("\x89PNG\r\n\x1a\n rest"))).toMatch(/JPEG/);
    expect(signatureProblem("not base64!")).toMatch(/JPEG/);
    expect(signatureProblem("A".repeat(150_004))).toMatch(/too large/);
    // A frame marker saying 4000 x 40.
    const big = base64ToBytes(SIGNATURE_JPEG_B64) as Uint8Array;
    const copy = big.slice();
    for (let i = 2; i < copy.length - 9; i++) {
      if (copy[i] === 0xff && (copy[i + 1] === 0xc0 || copy[i + 1] === 0xc2)) {
        copy[i + 7] = 0x0f;
        copy[i + 8] = 0xa0;
        break;
      }
    }
    let bin = "";
    for (const b of copy) bin += String.fromCharCode(b);
    expect(signatureProblem(btoa(bin))).toMatch(/too large/);
  });
});
