import { describe, expect, it } from "vitest";
import type { CostBreak, RateSnapshot } from "./costing";
import {
  bandLabel,
  DELETED_ROUTING_KEY,
  DELETED_ROUTING_LABEL,
  type DecidedLine,
  type DecidedQuote,
  MAX_MONTHS,
  monthKey,
  monthLabel,
  monthRange,
  NO_ROUTING_KEY,
  quoteMarkup,
  quoteRoutings,
  WIN_LOSS_CSV_HEADER,
  type WinLossRouting,
  winLossCsv,
  winLossReport,
} from "./win-loss";

const snapshot: RateSnapshot = {
  laborMarkupBps: 2_500,
  materialMarkupBps: 2_000,
  outsideServiceMarkupBps: 1_500,
  minimumLineCents: 0,
  machines: [
    { id: "m1", name: "Haas VF-2", hourlyRateCents: 9_500, setupRateCents: null },
    { id: "m2", name: "Okuma lathe", hourlyRateCents: 8_500, setupRateCents: null },
  ],
  materials: [
    {
      id: "al",
      name: "6061-T6 plate",
      pricingBasis: "per_lb",
      pricePerLbCents: 450,
      densityLbPerIn3: 0.0975,
      stockPriceCents: null,
      stockDescription: null,
      scrapBps: 0,
      minChargeCents: 0,
    },
  ],
  finishingOps: [],
};

function brk(quantity: number, costCents: number, markupCents: number, minAdj = 0): CostBreak {
  const totalCents = costCents + markupCents + minAdj;
  return {
    quantity,
    materialCents: 0,
    setupCents: 0,
    runCents: costCents,
    finishingCents: 0,
    extrasCents: 0,
    costCents,
    markupCents,
    minimumAdjustmentCents: minAdj,
    unitPriceCents: Math.ceil(totalCents / quantity),
    totalCents,
  };
}

function line(over: Partial<DecidedLine> & { machine?: string; material?: string | null } = {}) {
  const { machine = "m1", material = "al", ...rest } = over;
  const l: DecidedLine = {
    partNumber: "BRK-1001",
    revision: "A",
    inputs: {
      quantities: [10],
      customerSuppliedMaterial: material === null,
      material:
        material === null ? null : { materialId: material, blank: null, partsPerStock: null },
      operations: [{ machineId: machine, label: "", setupMinutes: 30, cycleMinutesPerPart: 5 }],
      finishing: [],
      extras: [],
    },
    breaks: [brk(10, 10_000, 2_000)],
    snapshot,
    ...rest,
  };
  return l;
}

let n = 1000;
function quote(over: Partial<DecidedQuote> = {}): DecidedQuote {
  n += 1;
  return {
    id: `q${n}`,
    label: `Q-${n}`,
    customerCompany: "Example Robotics LLC",
    outcome: "won",
    decidedAt: `2026-11-${String((n % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
    headlineTotalCents: 12_000,
    wonAmountCents: null,
    lostReason: null,
    estimatorId: "u1",
    estimatorName: "Pat Estimator",
    lines: [line()],
    ...over,
  };
}

describe("win/loss report", () => {
  it("is empty and honest with no decided quotes", () => {
    const r = winLossReport([]);
    expect(r.quoteCount).toBe(0);
    expect(r.totals).toMatchObject({ won: 0, lost: 0, decided: 0, winRate: null, lowSample: true });
    expect(r.byCustomer).toEqual([]);
    expect(r.markupWonBps).toBeNull();
    expect(r.prices).toEqual([]);
  });

  it("counts win rate as won / (won + lost), with expired shown but not counted", () => {
    const r = winLossReport([
      quote({ outcome: "won", wonAmountCents: 11_000 }),
      quote({ outcome: "lost", lostReason: "Price" }),
      quote({ outcome: "lost", lostReason: " price " }),
      quote({ outcome: "expired" }),
    ]);
    expect(r.totals).toMatchObject({ won: 1, lost: 2, expired: 1, decided: 3 });
    expect(r.totals.winRate).toBeCloseTo(1 / 3);
    expect(r.totals.wonCents).toBe(11_000); // the awarded amount, not the headline
    expect(r.totals.lostCents).toBe(24_000);
    // Reasons grouped by case and spacing.
    expect(r.lostReasons).toEqual([{ reason: "price", count: 2 }]);
  });

  it("groups customers by name regardless of case and spacing", () => {
    const r = winLossReport([
      // The newest decision's spelling names the row.
      quote({ customerCompany: "Example Robotics LLC", decidedAt: "2026-11-20T00:00:00.000Z" }),
      quote({
        customerCompany: "example  robotics llc",
        outcome: "lost",
        decidedAt: "2026-10-20T00:00:00.000Z",
      }),
      quote({ customerCompany: "Sample Aero Inc" }),
    ]);
    expect(r.byCustomer.map((c) => [c.label, c.won, c.lost])).toEqual([
      ["Example Robotics LLC", 1, 1],
      ["Sample Aero Inc", 1, 0],
    ]);
  });

  it("counts a quote once per material and machine, with customer-supplied as its own row", () => {
    const r = winLossReport([
      quote({ lines: [line(), line({ partNumber: "BRK-1002" }), line({ machine: "m2" })] }),
      quote({ outcome: "lost", lines: [line({ material: null, machine: "m2" })] }),
      quote({ outcome: "lost", lines: [line({ material: "gone", machine: "gone" })] }),
    ]);
    const mat = Object.fromEntries(r.byMaterial.map((m) => [m.label, [m.won, m.lost]]));
    expect(mat).toEqual({
      "6061-T6 plate": [1, 0],
      "Customer-supplied": [0, 1],
      "Material no longer on the card": [0, 1],
    });
    const mach = Object.fromEntries(r.byMachine.map((m) => [m.label, [m.won, m.lost]]));
    expect(mach).toEqual({
      "Haas VF-2": [1, 0],
      "Okuma lathe": [1, 1],
      "Machine no longer on the card": [0, 1],
    });
  });

  it("bands quotes by cost-weighted markup on the first break, including the minimum top-up", () => {
    expect(quoteMarkup({ lines: [line({ breaks: [brk(10, 10_000, 1_000, 1_000)] })] })).toEqual({
      costCents: 10_000,
      markupCents: 2_000,
    });
    const r = winLossReport([
      quote({ lines: [line({ breaks: [brk(10, 10_000, 1_000)] })] }), // 10%
      quote({ lines: [line({ breaks: [brk(10, 10_000, 2_000), brk(50, 40_000, 99_000)] })] }), // 20%
      quote({ outcome: "lost", lines: [line({ breaks: [brk(10, 10_000, 4_000)] })] }), // 40%
      quote({ outcome: "lost", lines: [line({ breaks: null })] }), // unpriced: no band
    ]);
    const bands = Object.fromEntries(r.byMarkup.map((b) => [b.label, [b.won, b.lost]]));
    expect(bands).toEqual({
      "Under 15%": [1, 0],
      "15% to 25%": [1, 0],
      "25% to 35%": [0, 0],
      "35% to 50%": [0, 1],
      "50% and over": [0, 0],
    });
    expect(r.markupWonBps).toBe(1_500); // (1,000 + 2,000) / 20,000
    expect(r.markupLostBps).toBe(4_000);
    expect(bandLabel(5_000, null)).toBe("50% and over");
  });

  it("lists what each part was won and lost at, newest decision first", () => {
    const r = winLossReport([
      quote({
        decidedAt: "2026-10-01T00:00:00.000Z",
        lines: [line({ breaks: [brk(10, 30_000, 6_000), brk(50, 100_000, 20_000)] })],
      }),
      quote({
        decidedAt: "2026-11-01T00:00:00.000Z",
        outcome: "lost",
        lines: [
          line({ partNumber: " brk-1001", revision: "B", breaks: [brk(10, 40_000, 10_000)] }),
        ],
      }),
      quote({ outcome: "expired", lines: [line({ partNumber: "ONLY-EXPIRED" })] }),
      quote({ lines: [line({ partNumber: "New part" })] }),
    ]);
    expect(r.prices).toHaveLength(1);
    const [p] = r.prices;
    expect(p).toMatchObject({ won: 1, lost: 1 });
    expect(p?.entries.map((e) => [e.outcome, e.revision, e.breaks])).toEqual([
      ["lost", "B", [{ quantity: 10, unitPriceCents: 5_000 }]],
      [
        "won",
        "A",
        [
          { quantity: 10, unitPriceCents: 3_600 },
          { quantity: 50, unitPriceCents: 2_400 },
        ],
      ],
    ]);
  });

  it("flags rows with fewer than five decided quotes as a low sample", () => {
    const many = Array.from({ length: 5 }, () => quote({ customerCompany: "Big Customer" }));
    const r = winLossReport([...many, quote({ customerCompany: "Small Customer" })]);
    expect(r.byCustomer.map((c) => [c.label, c.lowSample])).toEqual([
      ["Big Customer", false],
      ["Small Customer", true],
    ]);
  });
});

describe("win/loss part 2: by estimator, by month, CSV", () => {
  it("counts each quote under the member who created it; a deleted account is a former member", () => {
    const r = winLossReport([
      quote({ estimatorId: "u1", estimatorName: "Pat Estimator", outcome: "won" }),
      quote({ estimatorId: "u1", estimatorName: "Pat Estimator", outcome: "lost" }),
      quote({ estimatorId: "u2", estimatorName: "Sam Quoter", outcome: "won" }),
      quote({ estimatorId: null, estimatorName: null, outcome: "lost" }),
      quote({ estimatorId: "u3", estimatorName: "  ", outcome: "expired" }),
    ]);
    expect(r.byEstimator.map((e) => [e.key, e.label, e.won, e.lost, e.expired])).toEqual([
      ["u1", "Pat Estimator", 1, 1, 0],
      ["u2", "Sam Quoter", 1, 0, 0],
      ["former", "Former member", 0, 1, 0],
      ["u3", "Unnamed member", 0, 0, 1],
    ]);
    expect(r.byEstimator.reduce((s, e) => s + e.decided, 0)).toBe(r.totals.decided);
  });

  it("buckets by UTC calendar month, oldest first, with empty months between as zero rows", () => {
    const r = winLossReport([
      quote({ decidedAt: "2026-11-30T23:30:00.000Z", outcome: "won", wonAmountCents: 5_000 }),
      // 23:30 on 31 Dec is still December in UTC, whatever the reader's clock says.
      quote({ decidedAt: "2025-12-31T23:30:00.000Z", outcome: "lost" }),
      quote({ decidedAt: "2026-02-01T00:00:00.000Z", outcome: "won", wonAmountCents: 7_000 }),
      quote({ decidedAt: "2026-02-14T00:00:00.000Z", outcome: "lost" }),
      quote({ decidedAt: null, outcome: "won" }),
    ]);
    expect(r.byMonth.map((m) => m.key)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(r.byMonth[0]).toMatchObject({ label: "Dec 2025", won: 0, lost: 1, winRate: 0 });
    expect(r.byMonth[1]).toMatchObject({ label: "Jan 2026", decided: 0, winRate: null });
    expect(r.byMonth[2]).toMatchObject({ won: 1, lost: 1, winRate: 0.5, wonCents: 7_000 });
    expect(r.byMonth[11]).toMatchObject({ label: "Nov 2026", won: 1, wonCents: 5_000 });
    // The undated quote is in the totals but in no month.
    expect(r.totals.won).toBe(3);
    expect(r.byMonth.reduce((s, m) => s + m.won, 0)).toBe(2);
  });

  it("reads months in the shop's time zone when it has one", () => {
    const quotes = [
      // 7 pm on 31 Oct in Chicago (CDT, UTC-5) is 00:00 on 1 Nov in UTC.
      quote({ decidedAt: "2026-11-01T00:00:00.000Z", outcome: "won", wonAmountCents: 5_000 }),
      // 23:30 on 30 Nov in UTC is still November in Chicago (CST, UTC-6).
      quote({ decidedAt: "2026-11-30T23:30:00.000Z", outcome: "lost" }),
      // 00:30 on 1 Dec in UTC is 18:30 on 30 Nov in Chicago.
      quote({ decidedAt: "2026-12-01T00:30:00.000Z", outcome: "lost" }),
    ];
    const utc = winLossReport(quotes);
    expect(utc.timeZone).toBe("UTC");
    expect(utc.byMonth.map((m) => [m.key, m.won, m.lost])).toEqual([
      ["2026-11", 1, 1],
      ["2026-12", 0, 1],
    ]);
    const chicago = winLossReport(quotes, [], "America/Chicago");
    expect(chicago.timeZone).toBe("America/Chicago");
    expect(chicago.byMonth.map((m) => [m.key, m.won, m.lost])).toEqual([
      ["2026-10", 1, 0],
      ["2026-11", 0, 2],
    ]);
    // East of UTC moves the other way: 23:30 UTC on 31 Dec is 00:30 on 1 Jan in Berlin (CET, UTC+1).
    const berlin = winLossReport(
      [quote({ decidedAt: "2025-12-31T23:30:00.000Z", outcome: "won" })],
      [],
      "Europe/Berlin",
    );
    expect(berlin.byMonth.map((m) => m.label)).toEqual(["Jan 2026"]);
    // An unknown zone (a row written before validation, a runtime without it) falls back to UTC.
    expect(winLossReport(quotes, [], "Mars/Olympus").timeZone).toBe("UTC");
    // Totals do not depend on the zone.
    expect(chicago.totals).toEqual(utc.totals);
  });

  it("dates the CSV rows on the same calendar as the month rows", () => {
    const csv = winLossCsv(
      [quote({ label: "Q-9", decidedAt: "2026-11-01T00:00:00.000Z", lines: [] })],
      [],
      "America/Chicago",
    );
    const [head, row] = csv.split("\r\n");
    expect(head).toContain(",Decided (America/Chicago),");
    expect(row).toContain(",2026-10-31,");
    expect(winLossCsv([quote({ decidedAt: "2026-11-01T00:00:00.000Z", lines: [] })])).toContain(
      ",2026-11-01,",
    );
  });

  it("month helpers", () => {
    expect(monthKey("2026-11-01T03:00:00.000Z", "America/Los_Angeles")).toBe("2026-10");
    expect(monthKey("2026-11-01T03:00:00.000Z", "UTC")).toBe("2026-11");
    expect(monthKey("2026-01-05T10:00:00.000Z")).toBe("2026-01");
    expect(monthKey(null)).toBeNull();
    expect(monthKey("not a date")).toBeNull();
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(monthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthRange("2026-11", "2026-11")).toEqual(["2026-11"]);
    expect(winLossReport([]).byMonth).toEqual([]);
    const long = winLossReport([
      quote({ decidedAt: "2000-01-15T00:00:00.000Z" }),
      quote({ decidedAt: "2026-11-15T00:00:00.000Z" }),
    ]).byMonth;
    expect(long).toHaveLength(MAX_MONTHS);
    expect(long[long.length - 1]?.key).toBe("2026-11");
  });

  it("exports one CSV row per decided quote, newest first, formulas defused", () => {
    const csv = winLossCsv([
      quote({
        label: "Q-1",
        decidedAt: "2026-10-01T09:00:00.000Z",
        outcome: "lost",
        lostReason: "=HYPERLINK(1)",
        customerCompany: 'Acme, "West" Inc',
        headlineTotalCents: 123_456,
      }),
      quote({
        label: "Q-2 Rev 2",
        decidedAt: "2026-11-02T09:00:00.000Z",
        outcome: "won",
        wonAmountCents: 99_900,
        estimatorId: null,
        estimatorName: null,
        lines: [
          line({ partNumber: "BRK-1" }),
          line({ partNumber: "brk-1 " }),
          line({ partNumber: "SPC-9" }),
        ],
      }),
      quote({ label: "Q-3", outcome: "expired", decidedAt: "2026-09-01T00:00:00.000Z", lines: [] }),
    ]);
    const rows = csv.split("\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(rows[0]).toBe(
      WIN_LOSS_CSV_HEADER.map((h) => (h === "Decided" ? "Decided (UTC)" : h)).join(","),
    );
    // Newest decision first; part numbers once each by their matching key; markup 2,000 / 10,000.
    expect(rows[1]).toBe(
      "Q-2 Rev 2,Example Robotics LLC,Former member,won,2026-11-02,120.00,999.00,20.0,,BRK-1; SPC-9,",
    );
    expect(rows[2]).toBe(
      `Q-1,"Acme, ""West"" Inc",Pat Estimator,lost,2026-10-01,1234.56,,20.0,'=HYPERLINK(1),BRK-1001,`,
    );
    // No priced line: markup blank.
    expect(rows[3]).toBe("Q-3,Example Robotics LLC,Pat Estimator,expired,2026-09-01,120.00,,,,,");
    expect(rows).toHaveLength(5);
  });
});

describe("win/loss by routing and part family", () => {
  const op = (machineId: string, label: string) => ({
    machineId,
    label,
    setupMinutes: 30,
    cycleMinutesPerPart: 5,
  });
  const ops = (...o: ReturnType<typeof op>[]) => {
    const l = line();
    return line({ inputs: { ...l.inputs, operations: o } });
  };
  const bracket: WinLossRouting = {
    id: "r_bracket",
    name: "6061 bracket",
    partFamily: "Brackets",
    operations: [op("m1", "Op 10 mill")],
  };
  const plate: WinLossRouting = {
    id: "r_plate",
    name: "Mounting plate",
    partFamily: " brackets ",
    operations: [op("m1", "Op 10 mill"), op("m1", "Op 20 flip")],
  };
  const shaft: WinLossRouting = {
    id: "r_shaft",
    name: "Turned shaft",
    partFamily: null,
    operations: [op("m2", "Op 10 turn")],
  };
  const routings = [bracket, plate, shaft];

  it("finds the routings a quote's lines used, once each, and lines that used none", () => {
    const q = quote({
      lines: [
        // A tuned cycle time and other spacing/case still match (machine and label only).
        ops(op("m1", " op 10  MILL"), op("m1", "Op 20 flip")),
        ops(op("m1", "Op 10 mill")),
        ops(op("m2", "Op 05 saw")),
        ops(),
      ],
    });
    const r = quoteRoutings(q, routings);
    expect(r.used.map((x) => x.id)).toEqual(["r_bracket", "r_plate"]);
    expect(r.unmatched).toBe(true);
    // A line with no operations is neither a routing's nor "no routing".
    expect(quoteRoutings(quote({ lines: [ops()] }), routings)).toEqual({
      used: [],
      unmatched: false,
      deleted: false,
    });
  });

  it("counts each quote once per routing and per family it touched", () => {
    const rep = winLossReport(
      [
        quote({ outcome: "won", wonAmountCents: 50_000, lines: [ops(op("m1", "Op 10 mill"))] }),
        quote({
          outcome: "lost",
          lines: [ops(op("m1", "Op 10 mill"), op("m1", "Op 20 flip")), ops(op("m1", "Op 10 mill"))],
        }),
        quote({ outcome: "won", lines: [ops(op("m2", "Op 10 turn"))] }),
        quote({ outcome: "expired", lines: [ops(op("m9", "EDM"))] }),
      ],
      routings,
    );
    const by = Object.fromEntries(rep.byRouting.map((x) => [x.key, x]));
    expect(by.r_bracket).toMatchObject({ won: 1, lost: 1, decided: 2, wonCents: 50_000 });
    expect(by.r_plate).toMatchObject({ won: 0, lost: 1 });
    expect(by.r_shaft).toMatchObject({ won: 1, lost: 0, label: "Turned shaft" });
    expect(by[NO_ROUTING_KEY]).toMatchObject({ expired: 1, decided: 0, label: "No saved routing" });
    // "Brackets" and " brackets " are one family; the lost quote used both routings but counts once.
    expect(rep.byPartFamily).toHaveLength(1);
    expect(rep.byPartFamily[0]).toMatchObject({ key: "brackets", won: 1, lost: 1 });
  });

  it("adds no routing rows when the shop has no saved routings", () => {
    const rep = winLossReport([quote()]);
    expect(rep.byRouting).toEqual([]);
    expect(rep.byPartFamily).toEqual([]);
  });

  it("names the routings in the CSV", () => {
    const csv = winLossCsv(
      [
        quote({
          label: "Q-9",
          decidedAt: "2026-11-03T00:00:00.000Z",
          lines: [ops(op("m2", "Op 10 turn")), ops(op("m9", "EDM"))],
        }),
      ],
      routings,
    );
    expect(csv.split("\r\n")[1]?.endsWith(",BRK-1001,Turned shaft; No saved routing")).toBe(true);
  });

  describe("lines that record the routing they were built from", () => {
    const built = (ids: string[] | null, ...o: ReturnType<typeof op>[]) => ({
      ...ops(...o),
      routingIds: ids,
    });

    it("counts the recorded routing, not the ones the operations happen to match", () => {
      // Built from the plate routing and tuned down to one op: still the plate, not the bracket.
      const tuned = quoteRoutings(
        quote({ lines: [built(["r_plate"], op("m1", "Op 10 mill"))] }),
        routings,
      );
      expect(tuned.used.map((x) => x.id)).toEqual(["r_plate"]);
      expect(tuned.unmatched).toBe(false);
      // Operations typed by hand after a routing was applied elsewhere: an empty record is
      // "no routing" even though the ops look like the bracket routing.
      const none = quoteRoutings(quote({ lines: [built([], op("m1", "Op 10 mill"))] }), routings);
      expect(none).toEqual({ used: [], unmatched: true, deleted: false });
      // Two routings stacked with "Add after": both count, in the shop's order.
      const stacked = quoteRoutings(
        quote({ lines: [built(["r_shaft", "r_bracket"], op("m2", "Op 10 turn"), op("m1", "x"))] }),
        routings,
      );
      expect(stacked.used.map((x) => x.id)).toEqual(["r_bracket", "r_shaft"]);
    });

    it("falls back to matching operations on lines with no record, in the same quote", () => {
      const r = quoteRoutings(
        quote({
          lines: [built(["r_shaft"], op("m2", "Op 10 turn")), built(null, op("m1", "Op 10 mill"))],
        }),
        routings,
      );
      expect(r.used.map((x) => x.id)).toEqual(["r_bracket", "r_shaft"]);
    });

    it("counts a routing deleted since under its own row, also when none are saved now", () => {
      const q = quote({ outcome: "won", lines: [built(["r_gone"], op("m1", "Op 10 mill"))] });
      expect(quoteRoutings(q, routings)).toEqual({ used: [], unmatched: false, deleted: true });
      const rep = winLossReport([
        q,
        quote({ outcome: "lost", lines: [built([], op("m9", "EDM"))] }),
      ]);
      expect(rep.byRouting.map((x) => [x.key, x.label, x.won, x.lost])).toEqual([
        [DELETED_ROUTING_KEY, DELETED_ROUTING_LABEL, 1, 0],
        [NO_ROUTING_KEY, "No saved routing", 0, 1],
      ]);
      const csv = winLossCsv([q], []);
      expect(csv.split("\r\n")[1]?.endsWith(",BRK-1001,Routing since deleted")).toBe(true);
    });

    it("gives a recorded routing's family to the quote", () => {
      const rep = winLossReport(
        [quote({ outcome: "won", lines: [built(["r_plate"], op("m7", "Laser"))] })],
        routings,
      );
      expect(rep.byRouting.map((x) => x.key)).toEqual(["r_plate"]);
      expect(rep.byPartFamily[0]).toMatchObject({ key: "brackets", won: 1 });
    });
  });
});
