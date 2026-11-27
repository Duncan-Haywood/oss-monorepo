import { describe, expect, it } from "vitest";
import type { FinishingOpDto, MachineDto, MaterialDto, RateCardDto } from "./api";
import { planCutSpeedImport, readCutSpeedSheet } from "./cut-speed-import";
import { planMaterialRateImport, readMaterialRateSheet } from "./material-rate-import";
import { planRateImport, readRateSheet } from "./rate-card-import";
import {
  rateCardWorkbook,
  rateCardWorkbookSheets,
  sheetKindFor,
  WORKBOOK_TABS,
  workbookGrid,
} from "./rate-card-workbook";
import { planSettingsImport, readSettingsSheet } from "./settings-import";
import { readXlsx } from "./sheet/xlsx";

const machine = (over: Partial<MachineDto>): MachineDto => ({
  id: "mch_1",
  name: "Haas VF-2",
  kind: "mill_3axis",
  hourlyRateCents: 9_500,
  setupRateCents: null,
  defaultSetupMinutes: 45,
  removalRateIn3PerMin: 2.5,
  cutSpeedInPerMin: null,
  pierceSeconds: null,
  secondsPerBend: null,
  secondsPerHole: 4,
  drillFeedInPerMin: 6,
  secondsPerTappedHole: null,
  peckDepthDiameters: null,
  secondsPerPeck: null,
  active: true,
  ...over,
});
const material = (over: Partial<MaterialDto>): MaterialDto => ({
  id: "mat_1",
  name: "6061-T6 plate",
  pricingBasis: "per_lb",
  pricePerLbCents: 425,
  densityLbPerIn3: 0.0975,
  sheetThicknessIn: null,
  sheetWidthIn: null,
  sheetLengthIn: null,
  nestGapIn: null,
  stockPriceCents: null,
  stockDescription: null,
  pricePerFootCents: null,
  pricePerCwtCents: null,
  pricePerMetreCents: null,
  cutAllowanceIn: null,
  barLengthIn: null,
  barRemnantIn: null,
  scrapBps: 1_250,
  minChargeCents: 2_500,
  active: true,
  priceSetAt: "2031-01-01T00:00:00.000Z",
  ...over,
});
const finishing: FinishingOpDto[] = [
  {
    id: "fin_1",
    name: "Type II anodize, black",
    perPartCents: 350,
    lotChargeCents: 15_000,
    outsideService: true,
    leadDays: 7,
    active: true,
  },
];

const card: RateCardDto = {
  settings: {
    displayName: "Acme Machine",
    addressLines: [],
    phone: null,
    email: null,
    laborMarkupBps: 1500,
    materialMarkupBps: 1250,
    outsideServiceMarkupBps: 1000,
    minimumLineCents: 15000,
    defaultQuantities: [1, 5, 10, 25],
    quoteValidDays: 30,
    defaultLeadTimeText: null,
    quoteTerms: null,
    emailSignature: null,
    prefillRepeatParts: true,
    defaultFalloutBps: null,
    timeZone: null,
    currency: null,
    hasLogo: false,
    materialPriceMaxAgeDays: 90,
  },
  machines: [
    machine({}),
    machine({
      id: "mch_2",
      name: "Fiber laser 3kW",
      kind: "laser",
      hourlyRateCents: 18_000,
      removalRateIn3PerMin: null,
      cutSpeedInPerMin: 120,
      pierceSeconds: 0.8,
      secondsPerHole: null,
      drillFeedInPerMin: null,
    }),
    machine({ id: "mch_3", name: "=HYPERLINK(1)", active: false, removalRateIn3PerMin: 0.000001 }),
  ],
  materials: [
    material({}),
    material({
      id: "mat_2",
      name: "A36 sheet",
      sheetThicknessIn: 0.25,
      densityLbPerIn3: 0.2836,
    }),
    material({
      id: "mat_3",
      name: "304 SS tube",
      pricingBasis: "per_stock",
      stockPriceCents: 18_999,
      // A description that looks like a number must come back as typed.
      stockDescription: "1.50",
      scrapBps: 0,
      minChargeCents: 0,
    }),
  ],
  finishingOps: finishing,
  cutSpeeds: [
    {
      id: "cs_1",
      machineId: "mch_2",
      materialId: "mat_2",
      cutSpeedInPerMin: 95.5,
      pierceSeconds: 1.2,
    },
  ],
  removalRates: [
    { id: "rr_1", machineId: "mch_1", materialId: "mat_1", removalRateIn3PerMin: 4.5 },
  ],
  drillFeeds: [{ id: "df_1", machineId: "mch_1", materialId: "mat_3", drillFeedInPerMin: 3 }],
};

const tabGrid = async (tab: string) => {
  const sheets = await readXlsx(await rateCardWorkbook(card));
  const s = sheets.find((x) => x.name === tab);
  if (!s) throw new Error(`no tab ${tab}`);
  return s.grid;
};

describe("rate card workbook", () => {
  it("has one tab per import kind, in the import page's order", async () => {
    const sheets = await readXlsx(await rateCardWorkbook(card));
    expect(sheets.map((s) => s.name)).toEqual(WORKBOOK_TABS.map((t) => t.tab));
    for (const t of WORKBOOK_TABS) expect(sheetKindFor(t.tab)).toBe(t.kind);
  });

  it("each tab holds the CSV export's cells (numbers in Excel's own form)", async () => {
    const want = workbookGrid(card, "materials");
    const got = await tabGrid("Materials");
    expect(got[0]).toEqual(want[0]);
    expect(got.map((r) => r[0])).toEqual(want.map((r) => r[0]));
    expect(got[3]?.[want[0]?.indexOf("Stock description") ?? -1]).toBe("1.50");
    // The formula-looking name comes back without the CSV's protective apostrophe, as typed.
    expect((await tabGrid("Machines")).map((r) => r[0])).toContain("=HYPERLINK(1)");
  });

  it.each(["machines", "materials", "finishing-ops"] as const)(
    "%s: an unedited tab imports as no change",
    async (kind) => {
      const tab = WORKBOOK_TABS.find((t) => t.kind === kind)?.tab ?? "";
      const sheet = readRateSheet(kind, await tabGrid(tab));
      expect(sheet.fatal).toBeNull();
      expect(sheet.errors).toEqual([]);
      expect(sheet.ignored).toEqual([]);
      const existing =
        kind === "machines"
          ? card.machines
          : kind === "materials"
            ? card.materials
            : card.finishingOps;
      const plan = planRateImport(kind, sheet.rows, existing);
      expect(plan.errors).toEqual([]);
      expect(plan.rows.map((r) => [r.name, r.action, r.changes])).toEqual(
        existing.map((r) => [r.name, "update", []]),
      );
    },
  );

  it("cut speeds, removal rates and drill feeds import as no change", async () => {
    const cs = readCutSpeedSheet(await tabGrid("Cut speeds"));
    expect(cs.fatal).toBeNull();
    const csPlan = planCutSpeedImport(cs.rows, card);
    expect(csPlan.errors).toEqual([]);
    expect(csPlan.rows.map((r) => [r.action, r.changes])).toEqual([["update", []]]);
    for (const [kind, tab] of [
      ["removal-rates", "Removal rates"],
      ["drill-feeds", "Drill feeds"],
    ] as const) {
      const s = readMaterialRateSheet(kind, await tabGrid(tab));
      expect(s.fatal).toBeNull();
      const p = planMaterialRateImport(kind, s.rows, card);
      expect(p.errors).toEqual([]);
      expect(p.rows.map((r) => [r.action, r.changes])).toEqual([["update", []]]);
    }
  });

  it("shop settings import as no change", async () => {
    const s = readSettingsSheet(await tabGrid("Shop settings"));
    expect(s.fatal).toBeNull();
    expect(s.errors).toEqual([]);
    const plan = planSettingsImport(s.rows, card.settings);
    expect(plan.errors).toEqual([]);
    expect(plan.patch).toEqual({});
  });

  it("an edited cell in Excel comes back as that one change", async () => {
    const sheets = rateCardWorkbookSheets(card);
    const m = sheets.find((s) => s.name === "Machines");
    if (!m?.grid[1]) throw new Error("no machines");
    m.grid[1][2] = "102.50";
    const { writeXlsx } = await import("./sheet/xlsx-write");
    const back = await readXlsx(await writeXlsx(sheets));
    const sheet = readRateSheet("machines", back.find((s) => s.name === "Machines")?.grid ?? []);
    const plan = planRateImport("machines", sheet.rows, card.machines);
    expect(plan.rows.map((r) => r.changes)).toEqual([["Hourly rate"], [], []]);
    expect(plan.rows[0]?.values.hourlyRateCents).toBe(10_250);
  });

  it("an empty card still gives every tab its header row", async () => {
    const empty = {
      ...card,
      machines: [],
      materials: [],
      finishingOps: [],
      cutSpeeds: [],
      removalRates: [],
      drillFeeds: [],
    };
    const sheets = await readXlsx(await rateCardWorkbook(empty));
    expect(sheets).toHaveLength(WORKBOOK_TABS.length);
    for (const s of sheets) expect(s.grid[0]?.length).toBeGreaterThan(1);
  });

  it("knows the tab names shops give by hand", () => {
    expect(sheetKindFor("Cut chart")).toBe("cut-speeds");
    expect(sheetKindFor(" machines ")).toBe("machines");
    expect(sheetKindFor("Outside services")).toBe("finishing-ops");
    expect(sheetKindFor("Sheet1")).toBeNull();
  });
});
