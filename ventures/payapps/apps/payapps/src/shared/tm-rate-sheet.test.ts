// The job's T&M rate sheet and the weekly email's T&M line (src/shared/tm-tickets.ts): what a
// sheet may hold, which rates fill a blank line, a new ticket's markups, a first sheet drafted from
// the tickets, differences pointed out on a ticket, and the signed tickets left to bill.
import { describe, expect, it } from "vitest";
import {
  type CompanyTmTicketInput,
  jobRates,
  rateSheetDifferences,
  rateSheetFromTickets,
  rateSheetProblem,
  startingMarkups,
  type TmRateSheet,
  ticketsToBill,
  tmToBillText,
} from "./tm-tickets";

const sheet = (over: Partial<TmRateSheet> = {}): TmRateSheet => ({
  labor: [{ name: "Journeyman electrician", rateCents: 9500, unit: null }],
  material: [{ name: "3/4 in EMT", rateCents: 87, unit: "ft" }],
  equipment: [{ name: "Scissor lift", rateCents: 3500, unit: null }],
  laborMarkupBps: 1500,
  materialMarkupBps: null,
  equipmentMarkupBps: null,
  source: null,
  ...over,
});

describe("rateSheetProblem", () => {
  it("accepts a sheet and an empty one", () => {
    expect(rateSheetProblem(sheet())).toBeNull();
    expect(
      rateSheetProblem(sheet({ labor: [], material: [], equipment: [], laborMarkupBps: null })),
    ).toBeNull();
  });

  it("names the problem", () => {
    expect(rateSheetProblem(sheet({ labor: [{ name: " ", rateCents: 1, unit: null }] }))).toBe(
      "Labor rate 1: enter the trade",
    );
    expect(
      rateSheetProblem(
        sheet({
          equipment: [
            { name: "Lift", rateCents: 1, unit: null },
            { name: " LIFT", rateCents: 2, unit: null },
          ],
        }),
      ),
    ).toBe('Equipment: "LIFT" is on the sheet twice');
    expect(
      rateSheetProblem(sheet({ material: [{ name: "Wire", rateCents: 1.5, unit: null }] })),
    ).toBe("Material rate 1: enter the rate in dollars and cents");
    expect(rateSheetProblem(sheet({ materialMarkupBps: 10_001 }))).toMatch(/Material markup/);
    const many = Array.from({ length: 151 }, (_, i) => ({
      name: `T${i}`,
      rateCents: 1,
      unit: null,
    }));
    expect(rateSheetProblem(sheet({ labor: many }))).toMatch(/up to 150/);
  });
});

describe("jobRates and startingMarkups", () => {
  it("takes the sheet's rate first and the tickets' for names it does not have", () => {
    const fromTickets = {
      labor: { "journeyman electrician": 9850, apprentice: 5525 },
      material: {},
      equipment: { "scissor lift": 3000 },
    };
    expect(jobRates(null, fromTickets)).toBe(fromTickets);
    expect(jobRates(sheet(), fromTickets)).toEqual({
      labor: { "journeyman electrician": 9500, apprentice: 5525 },
      material: { "3/4 in emt": 87 },
      equipment: { "scissor lift": 3500 },
    });
  });

  it("starts a ticket with the sheet's markups, then the latest ticket's, then 0", () => {
    const latest = { laborMarkupBps: 1000, materialMarkupBps: 800, equipmentMarkupBps: 500 };
    expect(startingMarkups(sheet(), latest)).toEqual({
      laborMarkupBps: 1500,
      materialMarkupBps: 800,
      equipmentMarkupBps: 500,
    });
    expect(startingMarkups(sheet(), null)).toEqual({
      laborMarkupBps: 1500,
      materialMarkupBps: 0,
      equipmentMarkupBps: 0,
    });
    expect(startingMarkups(null, latest)).toEqual(latest);
  });
});

describe("rateSheetFromTickets", () => {
  it("keeps the latest priced rate per name, as spelled there, sorted", () => {
    const draft = rateSheetFromTickets([
      {
        labor: [
          { trade: "Laborer ", workers: 1, hoursEach: 1, rateCents: 5000 },
          { trade: "Apprentice", workers: 1, hoursEach: 1, rateCents: null },
        ],
        material: [{ description: "Wire", quantity: 1, unit: " ft ", unitCostCents: 12 }],
        equipment: [],
        laborMarkupBps: 1500,
        materialMarkupBps: 1000,
        equipmentMarkupBps: 0,
      },
      {
        labor: [
          { trade: "laborer", workers: 1, hoursEach: 1, rateCents: 4500 },
          { trade: "Foreman", workers: 1, hoursEach: 1, rateCents: 8000 },
        ],
        material: [],
        equipment: [{ description: "Lift", hours: 1, rateCents: 3000 }],
        laborMarkupBps: 0,
        materialMarkupBps: 0,
        equipmentMarkupBps: 0,
      },
    ]);
    expect(draft.labor).toEqual([
      { name: "Foreman", rateCents: 8000, unit: null },
      { name: "Laborer", rateCents: 5000, unit: null },
    ]);
    expect(draft.material).toEqual([{ name: "Wire", rateCents: 12, unit: "ft" }]);
    expect(draft.equipment).toEqual([{ name: "Lift", rateCents: 3000, unit: null }]);
    expect(draft.laborMarkupBps).toBe(1500);
    expect(rateSheetFromTickets([]).laborMarkupBps).toBeNull();
  });
});

describe("rateSheetDifferences", () => {
  const t = {
    labor: [
      { trade: "journeyman electrician", workers: 2, hoursEach: 4, rateCents: 9850 },
      { trade: "Apprentice", workers: 1, hoursEach: 4, rateCents: 6000 },
    ],
    material: [{ description: "3/4 in EMT", quantity: 10, unit: "ft", unitCostCents: 87 }],
    equipment: [{ description: "Scissor lift", hours: 2, rateCents: null }],
    laborMarkupBps: 1000,
    materialMarkupBps: 1000,
    equipmentMarkupBps: 0,
  };

  it("names each rate and markup that is not the sheet's, and leaves the rest alone", () => {
    expect(rateSheetDifferences(t, sheet()).map((d) => d.text)).toEqual([
      "Labor: journeyman electrician $98.50 a man-hour; the rate sheet says $95.00.",
      "Labor markup: 10%; the rate sheet says 15%.",
    ]);
    expect(rateSheetDifferences(t, null)).toEqual([]);
  });
});

describe("ticketsToBill", () => {
  const input = (over: Partial<CompanyTmTicketInput>): CompanyTmTicketInput => ({
    projectId: "p1",
    projectName: "Mesa Clinic",
    projectNumber: "2207",
    gcName: "Copper State",
    number: 1,
    workDate: "2026-11-20",
    signed: true,
    onChangeOrder: false,
    labor: [{ trade: "Electrician", workers: 1, hoursEach: 2, rateCents: 10_000 }],
    material: [],
    equipment: [],
    laborMarkupBps: 1000,
    materialMarkupBps: 0,
    equipmentMarkupBps: 0,
    ...over,
  });

  it("groups signed tickets on no change order by job, oldest work first", () => {
    const jobs = ticketsToBill(
      [
        input({ number: 7, workDate: "2026-11-21" }),
        input({ number: 3, workDate: "2026-11-02" }),
        input({
          number: 9,
          labor: [{ trade: "Electrician", workers: 1, hoursEach: 2, rateCents: null }],
        }),
        input({ number: 4, signed: false }),
        input({ number: 5, onChangeOrder: true }),
        input({
          projectId: "p2",
          projectName: "Depot",
          projectNumber: null,
          number: 1,
          workDate: "2026-11-25",
        }),
      ],
      "2026-11-26",
    );
    expect(jobs.map((j) => j.projectId)).toEqual(["p1", "p2"]);
    expect(jobs[0]).toMatchObject({
      tickets: [3, 7, 9],
      pricedCents: 44_000,
      unpriced: 1,
      oldestWorkDate: "2026-11-02",
      daysOld: 24,
    });
    expect(jobs[0] && tmToBillText(jobs[0])).toBe(
      "Mesa Clinic (#2207, Copper State): T&M 3, 7 and 9 signed, not on a change order: $440.00 priced, 1 not priced yet. Oldest work 2026-11-02, 24 days ago.",
    );
    expect(jobs[1] && tmToBillText(jobs[1])).toBe(
      "Depot (Copper State): T&M 1 signed, not on a change order: $220.00 priced. Oldest work 2026-11-25, yesterday.",
    );
  });

  it("says when none is priced yet", () => {
    const [j] = ticketsToBill(
      [input({ labor: [{ trade: "E", workers: 1, hoursEach: 1, rateCents: null }] })],
      "2026-11-20",
    );
    expect(j && tmToBillText(j)).toMatch(/: not priced yet\. Oldest work 2026-11-20, today\.$/);
  });
});
