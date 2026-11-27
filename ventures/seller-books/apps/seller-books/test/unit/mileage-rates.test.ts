// Line 9 at the IRS standard mileage rate in force on each trip's date: the rate table, the pricing, and the
// worksheet and mileage log agreeing to the cent.
import { parseCsv, toCsv } from "@shared/csv";
import {
  IRS_BUSINESS_MILEAGE_RATES,
  irsBusinessRateOn,
  priceMileage,
} from "@shared/reference/mileage-rates";
import { buildScheduleC, type ScInput } from "@worker/services/books/schedule-c";
import { mileageLog } from "@worker/services/books/year-end";
import { describe, expect, it } from "vitest";

const nextDay = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

const sc = (over: Partial<ScInput>) =>
  buildScheduleC({
    year: 2026,
    sales: [],
    charges: [],
    expenses: [],
    items: [],
    unallocatedLots: [],
    businessMiles: 0,
    mileageRateCents: null,
    ...over,
  });
const line9 = (ws: ReturnType<typeof buildScheduleC>) => ws.lines.find((l) => l.line === "9");

describe("IRS business mileage rates", () => {
  it("covers each day once from 2019 on, with no gaps or overlaps", () => {
    const list = IRS_BUSINESS_MILEAGE_RATES;
    expect(list[0]?.from).toBe("2019-01-01");
    for (let i = 1; i < list.length; i++) {
      expect(list[i]?.from, list[i]?.source).toBe(nextDay(list[i - 1]?.to ?? ""));
    }
    for (const p of list) expect(p.from <= p.to).toBe(true);
  });

  it("gives the rate in force on the day, with both mid-year changes", () => {
    // As listed on irs.gov's "Standard mileage rates" table, read 2026-11-26.
    expect(irsBusinessRateOn("2022-06-30")?.cents).toBe(58.5);
    expect(irsBusinessRateOn("2022-07-01")?.cents).toBe(62.5);
    expect(irsBusinessRateOn("2023-08-15")?.cents).toBe(65.5);
    expect(irsBusinessRateOn("2024-12-31")?.cents).toBe(67);
    expect(irsBusinessRateOn("2025-01-01")?.cents).toBe(70);
    expect(irsBusinessRateOn("2026-06-30")?.cents).toBe(72.5);
    expect(irsBusinessRateOn("2026-07-01")).toMatchObject({ cents: 76, source: "IR-2026-29" });
    expect(irsBusinessRateOn("2018-12-31")).toBeNull();
    expect(irsBusinessRateOn("2027-01-01")).toBeNull();
  });
});

describe("priceMileage", () => {
  it("prices each trip at its date's rate and rounds once, on the total", () => {
    const p = priceMileage(
      [
        { date: "2026-07-02", miles: 10.1 },
        { date: "2026-03-01", miles: 25 },
        { date: "2026-06-30", miles: 0.3 },
      ],
      null,
    );
    // 25.3 × 72.5 = 1834.25, 10.1 × 76 = 767.6: 2601.85 rounds to 2602.
    expect(p.cents).toBe(2602);
    expect(p.byRate.map((g) => [g.from, g.miles, g.cents, g.amountCents])).toEqual([
      ["2026-01-01", 25.3, 72.5, 1834],
      ["2026-07-01", 10.1, 76, 768],
    ]);
    expect(p.unpricedMiles).toBe(0);
  });

  it("uses the seller's own rate for every trip when one is typed in", () => {
    const p = priceMileage(
      [
        { date: "2026-02-01", miles: 10 },
        { date: "2026-09-01", miles: 10 },
      ],
      70,
    );
    expect(p.cents).toBe(1400);
    expect(p.byRate).toEqual([
      {
        from: "2026-02-01",
        to: "2026-09-01",
        cents: 70,
        source: null,
        miles: 20,
        amountCents: 1400,
      },
    ]);
  });

  it("leaves dates without a rate out and says which", () => {
    const p = priceMileage(
      [
        { date: "2027-01-05", miles: 4 },
        { date: "2027-02-01", miles: 6 },
      ],
      null,
    );
    expect(p.cents).toBeNull();
    expect(p.unpricedMiles).toBe(10);
    expect(p.unpricedRange).toEqual({ from: "2027-01-05", to: "2027-02-01" });
  });
});

describe("worksheet line 9 by trip date", () => {
  const trips = [
    { date: "2026-05-06", miles: 25 },
    { date: "2026-08-10", miles: 100 },
  ];

  it("splits 2026 at July 1 when no rate is typed in", () => {
    const ws = sc({ businessMiles: 125, mileage: trips });
    // 25 × 72.5 = 1812.5, 100 × 76 = 7600: 9412.5 rounds to 9413.
    expect(line9(ws)?.amountCents).toBe(9413);
    expect(line9(ws)?.note).toMatch(/25 mi at 72\.5¢ .*IR-2025-128.*100 mi at 76¢ .*IR-2026-29/);
    expect(ws.warnings.join(" ")).not.toMatch(/mileage/i);
    expect(ws.mileagePricing?.byRate).toHaveLength(2);
  });

  it("a typed-in rate still applies to every trip", () => {
    expect(
      line9(sc({ businessMiles: 125, mileage: trips, mileageRateCents: 70 }))?.amountCents,
    ).toBe(8750);
  });

  it("counts only the trips up to `through` (quarterly estimates)", () => {
    const ws = sc({ businessMiles: 25, mileage: trips, through: "2026-05-31" });
    expect(line9(ws)?.amountCents).toBe(1813);
  });

  it("warns and leaves line 9 blank for a year the IRS rate is not in the table", () => {
    const ws = sc({ year: 2027, businessMiles: 10, mileage: [{ date: "2027-03-01", miles: 10 }] });
    expect(line9(ws)?.amountCents).toBeNull();
    expect(ws.warnings.join(" ")).toMatch(/10\.0 business miles driven on 2027-03-01 have no IRS/);
  });

  it("the mileage log's rows carry each rate and its total is line 9", () => {
    const log = mileageLog(
      2026,
      [
        {
          date: "2026-08-10",
          purpose: "Flea market",
          startPlace: null,
          endPlace: null,
          milesTenths: 500,
          roundTrip: true,
        },
        {
          date: "2026-05-06",
          purpose: "Estate sale pickup",
          startPlace: "Home",
          endPlace: "Elm St",
          milesTenths: 250,
          roundTrip: false,
        },
      ],
      null,
    );
    expect(log.line9Cents).toBe(line9(sc({ businessMiles: 125, mileage: trips }))?.amountCents);
    const rows = parseCsv(toCsv(log.rows));
    const header = rows.findIndex((r) => r[0] === "Date");
    expect(rows[header]?.slice(7)).toEqual(["Rate (cents/mile)", "Amount (USD)"]);
    expect(rows[header + 1]?.slice(6)).toEqual(["25.0", "72.5", "18.13"]);
    expect(rows[header + 2]?.slice(6)).toEqual(["100.0", "76", "76.00"]);
    expect(rows.find((r) => r[0] === "Total")?.slice(6)).toEqual(["125.0", "", "94.13"]);
  });
});
