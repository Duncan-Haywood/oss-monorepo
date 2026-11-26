import { describe, expect, it } from "vitest";
import type { DrillFeedDto, MachineDto, MaterialDto, RemovalRateDto } from "./api";
import {
  exportMaterialRateCsv,
  isDrillMachine,
  isRoughingMachine,
  type MaterialRateCard,
  materialRateExportHeaders,
  materialRateTemplateCsv,
  planMaterialRateImport,
  readMaterialRateSheet,
} from "./material-rate-import";
import { parseCsv } from "./sheet";

const machine = (over: Partial<MachineDto>): MachineDto => ({
  id: "mch_x",
  name: "x",
  kind: "mill_3axis",
  hourlyRateCents: 9_500,
  setupRateCents: null,
  defaultSetupMinutes: 15,
  removalRateIn3PerMin: null,
  cutSpeedInPerMin: null,
  pierceSeconds: null,
  secondsPerBend: null,
  secondsPerHole: null,
  drillFeedInPerMin: null,
  secondsPerTappedHole: null,
  peckDepthDiameters: null,
  secondsPerPeck: null,
  active: true,
  ...over,
});
const material = (over: Partial<MaterialDto>): MaterialDto => ({
  id: "mat_x",
  name: "x",
  pricingBasis: "per_lb",
  pricePerLbCents: 90,
  densityLbPerIn3: 0.098,
  sheetThicknessIn: null,
  stockPriceCents: null,
  stockDescription: null,
  scrapBps: 0,
  minChargeCents: 0,
  active: true,
  ...over,
});

const vf2 = machine({ id: "mch_vf2", name: "Haas VF-2", removalRateIn3PerMin: 3 });
const lathe = machine({ id: "mch_st10", name: "Haas ST-10", kind: "lathe" });
const press = machine({ id: "mch_press", name: "Drill press", kind: "other", secondsPerHole: 20 });
const laser = machine({
  id: "mch_laser",
  name: "Fiber laser",
  kind: "laser",
  cutSpeedInPerMin: 300,
});
const oldMill = machine({ id: "mch_old", name: "Bridgeport", active: false });
const alu = material({ id: "mat_alu", name: "6061-T6 plate" });
const ss = material({ id: "mat_ss", name: "304 stainless", densityLbPerIn3: 0.289 });
const brass = material({ id: "mat_br", name: "360 brass", active: false });

const mrr = (over: Partial<RemovalRateDto>): RemovalRateDto => ({
  id: "mrr_x",
  machineId: vf2.id,
  materialId: alu.id,
  removalRateIn3PerMin: 4.5,
  ...over,
});
const feed = (over: Partial<DrillFeedDto>): DrillFeedDto => ({
  id: "dfd_x",
  machineId: vf2.id,
  materialId: ss.id,
  drillFeedInPerMin: 3,
  ...over,
});

const card: MaterialRateCard = {
  machines: [vf2, lathe, press, laser, oldMill],
  materials: [alu, ss, brass],
  removalRates: [
    mrr({ id: "mrr_1" }),
    mrr({ id: "mrr_2", machineId: oldMill.id, materialId: ss.id, removalRateIn3PerMin: 0.6 }),
  ],
  drillFeeds: [feed({ id: "dfd_1" })],
};

const readMrr = (csv: string) => readMaterialRateSheet("removal-rates", parseCsv(csv));
const readFeed = (csv: string) => readMaterialRateSheet("drill-feeds", parseCsv(csv));

describe("machine sorts", () => {
  it("roughs on mills and lathes, drills on those and on a machine with a time per hole", () => {
    expect(isRoughingMachine(vf2)).toBe(true);
    expect(isRoughingMachine(lathe)).toBe(true);
    expect(isRoughingMachine(press)).toBe(false);
    expect(isRoughingMachine(laser)).toBe(false);
    expect(isDrillMachine(press)).toBe(true);
    expect(isDrillMachine(laser)).toBe(false);
  });
});

describe("readMaterialRateSheet", () => {
  it("reads the template's own header and rows", () => {
    const s = readMrr("Machine,Material,Removal rate (in3/min)\nHaas VF-2,6061-T6 plate,5\n");
    expect(s.fatal).toBeNull();
    expect(s.headerRow).toBe(1);
    expect(s.rows).toEqual([
      {
        row: 2,
        values: { machine: "Haas VF-2", material: "6061-T6 plate", value: 5 },
        warnings: [],
      },
    ]);
  });

  it("finds a header under a title row and reads 'Material removal rate' as the value", () => {
    const s = readMrr(
      "Roughing rates from our Fusion posts,,\nWork center,Alloy,Material removal rate (in³/min)\nHaas VF-2,304 stainless,1.2 in3/min\n",
    );
    expect(s.headerRow).toBe(2);
    expect(s.columns.map((c) => c.field)).toEqual(["machine", "material", "value"]);
    expect(s.rows[0]?.values).toEqual({
      machine: "Haas VF-2",
      material: "304 stainless",
      value: 1.2,
    });
  });

  it("converts cm³/min and mm³/min by the exact inch, and says so", () => {
    const cm = readMrr("Machine,Material,MRR (cm3/min)\nHaas VF-2,6061-T6 plate,100\n");
    expect(cm.rows[0]?.values.value).toBe(6.1024); // 100 / 16.387064
    expect(cm.rows[0]?.warnings[0]).toBe("Removal rate 100 read as 6.1024 in³/min");
    const mm = readMrr(
      "Machine,Material,Removal rate mm³/min\nHaas VF-2,6061-T6 plate,16387.064\n",
    );
    expect(mm.rows[0]?.values.value).toBe(1);
  });

  it("reads drill feeds in in/min and mm/min, and refuses a feed per revolution", () => {
    const s = readFeed("Machine,Material,Drill feed (mm/min)\nHaas VF-2,304 stainless,76.2\n");
    expect(s.rows[0]?.values.value).toBe(3);
    const ipr = readFeed("Machine,Material,Feed (in/rev)\nHaas VF-2,304 stainless,0.004\n");
    expect(ipr.fatal).toMatch(/No header row found/);
    const both = readFeed(
      "Machine,Material,Feed (IPR),Drill feed (in/min)\nHaas VF-2,304 stainless,0.004,3\n",
    );
    expect(both.ignored[0]).toMatchObject({ header: "Feed (IPR)" });
    expect(both.ignored[0]?.reason).toMatch(/spindle speed/);
    expect(both.rows[0]?.values.value).toBe(3);
  });

  it("leaves out the export's machine-default column and unknown columns, naming why", () => {
    const s = readMrr(
      "Machine,Material,Removal rate (in3/min),Machine default in3/min (not imported),Notes\nHaas VF-2,6061-T6 plate,5,3,ok\n",
    );
    expect(s.ignored.map((i) => i.header)).toEqual([
      "Machine default in3/min (not imported)",
      "Notes",
    ]);
    expect(s.rows[0]?.values.value).toBe(5);
  });

  it("names bad rows, keeps a blank value as absent, and skips totals", () => {
    const s = readMrr(
      "Machine,Material,Removal rate (in3/min)\n,6061-T6 plate,5\nHaas VF-2,6061-T6 plate,fast\nHaas VF-2,304 stainless,0\nHaas VF-2,304 stainless,\nTotal,,9\n",
    );
    expect(s.errors).toEqual([
      { row: 2, message: "no machine name (each row names its machine, even under a heading)" },
      { row: 3, message: 'Removal rate (in³/min): "fast" is not a number' },
      { row: 4, message: "Removal rate (in³/min): 0 is not a removal rate" },
    ]);
    expect(s.rows).toEqual([
      { row: 5, values: { machine: "Haas VF-2", material: "304 stainless" }, warnings: [] },
    ]);
    expect(s.skipped).toEqual([{ row: 6, message: "looks like a total row" }]);
  });

  it("has no header without a value column", () => {
    expect(readMrr("Machine,Material\nHaas VF-2,6061-T6 plate\n").fatal).toMatch(
      /machine, a material and a removal rate column/,
    );
  });
});

describe("planMaterialRateImport", () => {
  const rows = (...vs: { machine: string; material: string; value?: number }[]) =>
    vs.map((values, i) => ({ row: i + 2, values }));

  it("updates a pair by name (case and spacing ignored) and adds a new one", () => {
    const plan = planMaterialRateImport(
      "removal-rates",
      rows(
        { machine: "haas  vf-2", material: "6061-t6 PLATE", value: 5 },
        { machine: "Haas ST-10", material: "304 stainless", value: 0.8 },
      ),
      card,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.rows).toEqual([
      {
        row: 2,
        name: "Haas VF-2 · 6061-T6 plate",
        action: "update",
        id: "mrr_1",
        changes: ["removal rate"],
        values: { machineId: vf2.id, materialId: alu.id, removalRateIn3PerMin: 5 },
        warnings: [],
      },
      {
        row: 3,
        name: "Haas ST-10 · 304 stainless",
        action: "create",
        changes: [],
        values: { machineId: lathe.id, materialId: ss.id, removalRateIn3PerMin: 0.8 },
        warnings: [],
      },
    ]);
  });

  it("keeps the saved value for a blank cell and needs one for a new pair", () => {
    const plan = planMaterialRateImport(
      "drill-feeds",
      rows(
        { machine: "Haas VF-2", material: "304 stainless" },
        { machine: "Drill press", material: "304 stainless" },
      ),
      card,
    );
    expect(plan.rows[0]).toMatchObject({
      action: "update",
      changes: [],
      values: { drillFeedInPerMin: 3 },
    });
    expect(plan.errors).toEqual([
      { row: 3, message: 'a new drill feed for "Drill press" in "304 stainless" needs a value' },
    ]);
  });

  it("refuses the wrong sort of machine, unknown names, duplicates, retired rows and huge values", () => {
    const plan = planMaterialRateImport(
      "removal-rates",
      rows(
        { machine: "Fiber laser", material: "6061-T6 plate", value: 5 },
        { machine: "Drill press", material: "6061-T6 plate", value: 5 },
        { machine: "Okuma", material: "6061-T6 plate", value: 5 },
        { machine: "Haas VF-2", material: "Inconel 718", value: 5 },
        { machine: "Haas VF-2", material: "304 stainless", value: 1 },
        { machine: "Haas VF-2", material: "304 Stainless", value: 1.1 },
        { machine: "Haas VF-2", material: "360 brass", value: 9 },
        { machine: "Haas ST-10", material: "6061-T6 plate", value: 5000 },
      ),
      card,
    );
    expect(plan.errors.map((e) => [e.row, e.message])).toEqual([
      [2, '"Fiber laser" is not a roughing machine (mill or lathe)'],
      [3, '"Drill press" is not a roughing machine (mill or lathe)'],
      [4, 'no machine named "Okuma" on the card (add it under Machines first)'],
      [5, 'no material named "Inconel 718" on the card (add it under Materials first)'],
      [7, '"Haas VF-2" in "304 stainless" is already on row 6'],
      [8, '"360 brass" is retired: retired machines and materials take no new removal rates'],
      [9, "Removal rate: too large to be right"],
    ]);
    expect(plan.rows.map((r) => r.row)).toEqual([6]);
  });

  it("lets a drill press take feeds but not a laser", () => {
    const plan = planMaterialRateImport(
      "drill-feeds",
      rows(
        { machine: "Drill press", material: "304 stainless", value: 1.5 },
        { machine: "Fiber laser", material: "304 stainless", value: 1.5 },
      ),
      card,
    );
    expect(plan.rows.map((r) => r.name)).toEqual(["Drill press · 304 stainless"]);
    expect(plan.errors[0]?.message).toMatch(/is not a machine that drills/);
  });

  it("passes a retired pair left as it is, so an export imports back", () => {
    const plan = planMaterialRateImport(
      "removal-rates",
      rows({ machine: "Bridgeport", material: "304 stainless", value: 0.6 }),
      card,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.rows[0]).toMatchObject({ action: "update", changes: [] });
  });
});

describe("export", () => {
  it("has a blank template with the importer's own headers", () => {
    expect(materialRateTemplateCsv("removal-rates")).toBe(
      "Machine,Material,Removal rate (in3/min)\r\n",
    );
    expect(materialRateTemplateCsv("drill-feeds")).toBe("Machine,Material,Drill feed (in/min)\r\n");
    const t = readMrr(materialRateTemplateCsv("removal-rates"));
    expect(t.columns.map((c) => c.field)).toEqual(["machine", "material", "value"]);
  });

  it("lists every pair with the machine's default, and reads back as no change", () => {
    const csv = exportMaterialRateCsv("removal-rates", card);
    expect(csv.startsWith("﻿")).toBe(true);
    const grid = parseCsv(csv.slice(1));
    expect(grid[0]).toEqual(materialRateExportHeaders("removal-rates"));
    expect(grid.slice(1).filter((r) => r.some((c) => c))).toEqual([
      ["Bridgeport", "304 stainless", "0.6", ""],
      ["Haas VF-2", "6061-T6 plate", "4.5", "3"],
    ]);
    const sheet = readMaterialRateSheet("removal-rates", grid);
    expect(sheet.errors).toEqual([]);
    const plan = planMaterialRateImport("removal-rates", sheet.rows, card);
    expect(plan.errors).toEqual([]);
    expect(plan.rows.every((r) => r.action === "update" && r.changes.length === 0)).toBe(true);

    const feeds = readMaterialRateSheet(
      "drill-feeds",
      parseCsv(exportMaterialRateCsv("drill-feeds", card).slice(1)),
    );
    const fp = planMaterialRateImport("drill-feeds", feeds.rows, card);
    expect(fp.errors).toEqual([]);
    expect(fp.rows).toHaveLength(1);
    expect(fp.rows[0]?.changes).toEqual([]);
  });
});
