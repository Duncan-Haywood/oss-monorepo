import { describe, expect, it } from "vitest";
import type { CutSpeedDto, MachineDto, MaterialDto } from "./api";
import {
  CUT_SPEED_EXPORT_HEADERS,
  type CutSpeedCard,
  cutSpeedTemplateCsv,
  exportCutSpeedCsv,
  isCuttingMachine,
  planCutSpeedImport,
  readCutSpeedSheet,
} from "./cut-speed-import";
import { parseCsv } from "./sheet";

const machine = (over: Partial<MachineDto>): MachineDto => ({
  id: "mch_x",
  name: "x",
  kind: "laser",
  hourlyRateCents: 15_000,
  setupRateCents: null,
  defaultSetupMinutes: 15,
  removalRateIn3PerMin: null,
  cutSpeedInPerMin: 300,
  pierceSeconds: 1.5,
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
  densityLbPerIn3: 0.2836,
  sheetThicknessIn: 0.25,
  stockPriceCents: null,
  stockDescription: null,
  scrapBps: 0,
  minChargeCents: 0,
  active: true,
  ...over,
});

const laser = machine({ id: "mch_laser", name: "Fiber laser" });
const plasma = machine({ id: "mch_plasma", name: "Plasma table", kind: "plasma" });
const mill = machine({
  id: "mch_mill",
  name: "Haas VF-2",
  kind: "mill_3axis",
  cutSpeedInPerMin: null,
});
const oldLaser = machine({ id: "mch_old", name: "CO2 laser", active: false });
const quarter = material({ id: "mat_q", name: "A36 plate 0.25 in", sheetThicknessIn: 0.25 });
const half = material({ id: "mat_h", name: "A36 plate 0.5 in", sheetThicknessIn: 0.5 });
const alu = material({ id: "mat_a", name: "5052 aluminum 0.125", sheetThicknessIn: 0.125 });
const speed = (over: Partial<CutSpeedDto>): CutSpeedDto => ({
  id: "cut_x",
  machineId: laser.id,
  materialId: quarter.id,
  cutSpeedInPerMin: 110,
  pierceSeconds: null,
  ...over,
});

const card: CutSpeedCard = {
  machines: [laser, plasma, mill, oldLaser],
  materials: [quarter, half, alu],
  cutSpeeds: [
    speed({ id: "cut_1", cutSpeedInPerMin: 110, pierceSeconds: 1.2 }),
    speed({ id: "cut_2", machineId: oldLaser.id, materialId: half.id, cutSpeedInPerMin: 30 }),
  ],
};

const read = (csv: string) => readCutSpeedSheet(parseCsv(csv));

describe("isCuttingMachine", () => {
  it("is a laser, waterjet or plasma, or any machine with a default cut speed", () => {
    expect(isCuttingMachine(laser)).toBe(true);
    expect(isCuttingMachine(mill)).toBe(false);
    expect(isCuttingMachine({ kind: "other", cutSpeedInPerMin: 50 })).toBe(true);
  });
});

describe("readCutSpeedSheet", () => {
  it("reads the template's columns and finds the header under a title row", () => {
    const s = read(
      "Shop cut chart 2026,,,\nMachine,Material,Cut speed (in/min),Pierce (s)\nFiber laser,A36 plate 0.25 in,110,1.2\nPlasma table,A36 plate 0.5 in,80,\n",
    );
    expect(s.fatal).toBeNull();
    expect(s.headerRow).toBe(2);
    expect(s.rows).toEqual([
      {
        row: 3,
        values: {
          machine: "Fiber laser",
          material: "A36 plate 0.25 in",
          cutSpeedInPerMin: 110,
          pierceSeconds: 1.2,
        },
        warnings: [],
      },
      {
        row: 4,
        values: { machine: "Plasma table", material: "A36 plate 0.5 in", cutSpeedInPerMin: 80 },
        warnings: [],
      },
    ]);
  });

  it("converts metric and feet by exact factors only, and says so", () => {
    const s = read(
      "Machine,Material,Speed (mm/min),Pierce (ms)\nFiber laser,5052 aluminum 0.125,1000,800\n",
    );
    expect(s.rows[0]?.values).toMatchObject({ cutSpeedInPerMin: 39.3701, pierceSeconds: 0.8 });
    expect(s.rows[0]?.warnings.join("; ")).toMatch(/1000 read as 39.3701 in\/min/);
    const m = read("Machine,Material,Feed (m/min)\nFiber laser,5052 aluminum 0.125,2.54\n");
    expect(m.rows[0]?.values.cutSpeedInPerMin).toBe(100);
    const ft = read("Machine,Material,Speed (ft/min)\nFiber laser,5052 aluminum 0.125,10\n");
    expect(ft.rows[0]?.values.cutSpeedInPerMin).toBe(120);
    const ipm = read('Machine,Material,IPM\nFiber laser,5052 aluminum 0.125,"1,250"\n');
    expect(ipm.rows[0]?.values.cutSpeedInPerMin).toBe(1250);
  });

  it("leaves out thickness, per-second speeds and unknown columns, with why", () => {
    const s = read(
      "Machine,Material,Thickness (in),Cut speed (in/min),Notes,Gas\nFiber laser,A36 plate 0.25 in,0.25,110,N2 assist,N2\n",
    );
    expect(s.ignored.map((i) => i.header)).toEqual(["Thickness (in)", "Notes", "Gas"]);
    expect(s.ignored[0]?.reason).toMatch(/material row/);
    const sec = read("Machine,Material,Speed (in/sec)\nFiber laser,x,2\n");
    expect(sec.fatal).toMatch(/No header row/);
    expect(sec.ignored).toEqual([]);
  });

  it("names each bad cell by row and never guesses", () => {
    const s = read(
      "Machine,Material,Cut speed (in/min),Pierce (s)\nFiber laser,A36 plate 0.25 in,fast,\n,A36 plate 0.5 in,80,\nFiber laser,A36 plate 0.5 in,0,\nFiber laser,A36 plate 0.5 in,60,0\nTotal,,,\n",
    );
    expect(s.rows).toEqual([]);
    expect(s.errors).toEqual([
      { row: 2, message: 'Cut speed (in/min): "fast" is not a number' },
      { row: 3, message: expect.stringMatching(/no machine name/) },
      { row: 4, message: "Cut speed (in/min): 0 is not a cut speed" },
      { row: 5, message: expect.stringMatching(/0 is not a pierce time/) },
    ]);
    expect(s.skipped).toEqual([{ row: 6, message: "looks like a total row" }]);
  });

  it("needs machine, material and speed columns", () => {
    expect(read("Machine,Cut speed\nFiber laser,100\n").fatal).toMatch(/No header row/);
    expect(read("Machine,Material,Cut speed\n").fatal).toMatch(/no rows/);
  });
});

describe("planCutSpeedImport", () => {
  const plan = (csv: string, c: CutSpeedCard = card) => planCutSpeedImport(read(csv).rows, c);

  it("updates a pair that has a speed, adds a new pair, matching names loosely", () => {
    const p = plan(
      "Machine,Material,Cut speed (in/min),Pierce (s)\nfiber  LASER,a36 plate 0.25 in,120,\nPlasma table,A36 plate 0.5 in,80,3\n",
    );
    expect(p.errors).toEqual([]);
    expect(p.rows).toEqual([
      {
        row: 2,
        name: "Fiber laser · A36 plate 0.25 in",
        action: "update",
        id: "cut_1",
        changes: ["cut speed"],
        // A blank pierce keeps the 1.2 s already set.
        values: {
          machineId: laser.id,
          materialId: quarter.id,
          cutSpeedInPerMin: 120,
          pierceSeconds: 1.2,
        },
        warnings: [],
      },
      {
        row: 3,
        name: "Plasma table · A36 plate 0.5 in",
        action: "create",
        changes: [],
        values: {
          machineId: plasma.id,
          materialId: half.id,
          cutSpeedInPerMin: 80,
          pierceSeconds: 3,
        },
        warnings: [],
      },
    ]);
  });

  it("refuses unknown, non-cutting and retired rows, duplicates and a new pair with no speed", () => {
    const p = plan(
      [
        "Machine,Material,Cut speed (in/min),Pierce (s)",
        "Waterjet,A36 plate 0.25 in,20,",
        "Fiber laser,Titanium,20,",
        "Haas VF-2,A36 plate 0.25 in,20,",
        "CO2 laser,A36 plate 0.25 in,20,",
        "Plasma table,A36 plate 0.25 in,90,",
        "plasma table,A36 PLATE 0.25 IN,95,",
        "Plasma table,5052 aluminum 0.125,,2",
        "Fiber laser,A36 plate 0.25 in,100000.5,",
      ].join("\n"),
    );
    expect(p.rows.map((r) => r.row)).toEqual([6]);
    expect(p.errors.map((e) => [e.row, e.message])).toEqual([
      [2, expect.stringMatching(/no machine named "Waterjet"/)],
      [3, expect.stringMatching(/no material named "Titanium"/)],
      [4, expect.stringMatching(/"Haas VF-2" is not a cutting machine/)],
      [5, expect.stringMatching(/"CO2 laser" is retired/)],
      [7, expect.stringMatching(/already on row 6/)],
      [8, expect.stringMatching(/needs a cut speed/)],
      [9, "Cut speed: too large to be right"],
    ]);
  });

  it("refuses a name two active rows share", () => {
    const twin = machine({ id: "mch_twin", name: "Fiber Laser" });
    const p = plan("Machine,Material,Cut speed\nFiber laser,A36 plate 0.5 in,50\n", {
      ...card,
      machines: [...card.machines, twin],
    });
    expect(p.errors[0]?.message).toMatch(/more than one machine/);
  });
});

describe("export", () => {
  it("has a blank template with the importer's own headers", () => {
    expect(read(cutSpeedTemplateCsv()).fatal).toMatch(/no rows/);
  });

  it("writes every speed sorted by machine and thickness, and reads back as no change", () => {
    const full: CutSpeedCard = {
      ...card,
      cutSpeeds: [
        ...card.cutSpeeds,
        speed({ id: "cut_3", materialId: alu.id, cutSpeedInPerMin: 1.5e-7, pierceSeconds: 0.5 }),
        speed({ id: "cut_4", machineId: plasma.id, materialId: half.id, cutSpeedInPerMin: 80 }),
      ],
    };
    const csv = exportCutSpeedCsv(full);
    expect(csv.startsWith("﻿")).toBe(true);
    const grid = parseCsv(csv.slice(1));
    expect(grid[0]).toEqual(CUT_SPEED_EXPORT_HEADERS);
    expect(grid.slice(1, 5)).toEqual([
      ["CO2 laser", "A36 plate 0.5 in", "0.5", "30", ""],
      ["Fiber laser", "5052 aluminum 0.125", "0.125", "0.00000015", "0.5"],
      ["Fiber laser", "A36 plate 0.25 in", "0.25", "110", "1.2"],
      ["Plasma table", "A36 plate 0.5 in", "0.5", "80", ""],
    ]);
    const sheet = readCutSpeedSheet(grid);
    expect(sheet.errors).toEqual([]);
    const p = planCutSpeedImport(sheet.rows, full);
    expect(p.errors).toEqual([]);
    // The retired CO2 laser's speed is listed, unchanged, so the sheet imports back as is.
    expect(p.rows.map((r) => [r.action, r.changes])).toEqual([
      ["update", []],
      ["update", []],
      ["update", []],
      ["update", []],
    ]);
  });

  it("guards names a spreadsheet would run as a formula", () => {
    const evil = machine({ id: "mch_evil", name: "=HYPERLINK(1)" });
    const csv = exportCutSpeedCsv({
      machines: [evil],
      materials: [quarter],
      cutSpeeds: [speed({ machineId: evil.id })],
    });
    expect(csv).toContain("'=HYPERLINK(1)");
    const sheet = readCutSpeedSheet(parseCsv(csv.slice(1)));
    expect(sheet.rows[0]?.values.machine).toBe("=HYPERLINK(1)");
  });
});
