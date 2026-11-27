import { describe, expect, it } from "vitest";
import type { FinishingOpDto, MachineDto, MaterialDto } from "./api";
import {
  csvField,
  EXPORT_HEADERS,
  exportRateCsv,
  type MaterialImportValues,
  normHeader,
  planRateImport,
  readMachineKind,
  readMoneyCell,
  readPercentCell,
  readRateSheet,
  TEMPLATE_HEADERS,
} from "./rate-card-import";
import { parseCsv } from "./sheet";

const mill: MachineDto = {
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
  secondsPerHole: null,
  drillFeedInPerMin: null,
  secondsPerTappedHole: null,
  peckDepthDiameters: null,
  secondsPerPeck: null,
  active: true,
};

describe("cells", () => {
  it("reads dollar amounts the way shops write them", () => {
    expect(readMoneyCell("$95")).toEqual({ ok: true, value: 9_500 });
    expect(readMoneyCell("95.00/hr")).toEqual({ ok: true, value: 9_500 });
    expect(readMoneyCell("$1,250.50")).toEqual({ ok: true, value: 125_050 });
    expect(readMoneyCell("4,50")).toEqual({ ok: true, value: 450 });
    expect(readMoneyCell("USD 12.5")).toEqual({ ok: true, value: 1_250 });
    expect(readMoneyCell("3.25 ea")).toEqual({ ok: true, value: 325 });
    const r = readMoneyCell("0.333");
    expect(r.ok && r.value).toBe(33);
    expect(r.ok && r.warning).toMatch(/rounded/);
  });
  it("refuses what is not a clear amount", () => {
    for (const s of ["-5", "(5)", "call", "#REF!", "95 per kg", "1.2.3"])
      expect(readMoneyCell(s).ok, s).toBe(false);
  });
  it("needs a % sign for a fraction, so 0.05 is never silently 0.05% or 5%", () => {
    expect(readPercentCell("5%")).toEqual({ ok: true, value: 500 });
    expect(readPercentCell("10")).toEqual({ ok: true, value: 1_000 });
    expect(readPercentCell("0")).toEqual({ ok: true, value: 0 });
    expect(readPercentCell("2,5 %")).toEqual({ ok: true, value: 250 });
    const r = readPercentCell("0.05");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/% sign/);
  });
  it("maps machine names to kinds, falling back to other with a warning", () => {
    expect(readMachineKind("5-axis mill").ok && readMachineKind("5-axis mill")).toMatchObject({
      value: "mill_5axis",
    });
    expect(readMachineKind("VMC")).toMatchObject({ value: "mill_3axis" });
    expect(readMachineKind("CNC Lathe")).toMatchObject({ value: "lathe" });
    expect(readMachineKind("Wire EDM")).toMatchObject({ value: "edm" });
    expect(readMachineKind("Mill-turn")).toMatchObject({ value: "mill_turn" });
    expect(readMachineKind("press_brake")).toMatchObject({ value: "press_brake" });
    expect(readMachineKind("CMM")).toMatchObject({ value: "inspection" });
    expect(readMachineKind("Gizmo")).toMatchObject({ value: "other", warning: /not recognised/ });
  });
  it("normalises headers", () => {
    expect(normHeader("  Rate ($/HR) ")).toBe("rate ($ per hr)");
    expect(normHeader("Density (lb/in³)")).toBe("density (lb per in3)");
  });
});

describe("readRateSheet", () => {
  it("finds the header under a title block and reads a machine list", () => {
    const sheet = readRateSheet(
      "machines",
      parseCsv(
        [
          "Acme Machine — 2026 shop rates,,,,",
          ",,,,",
          "Machine,Type,Shop rate ($/hr),Setup rate,Setup (hrs),Notes",
          "Haas VF-2,VMC,$95.00,$75,0.75,bought 2019",
          "Okuma LB3000,CNC lathe,110,,1.5 hr,",
          ",,,,,",
          "Total,,,,,",
          "Brother S700,,85,,30 min,",
        ].join("\n"),
      ),
    );
    expect(sheet.fatal).toBeNull();
    expect(sheet.headerRow).toBe(3);
    expect(sheet.ignored).toEqual([{ header: "Notes", reason: "not a column the rate card has" }]);
    expect(sheet.errors).toEqual([]);
    expect(sheet.skipped).toEqual([{ row: 7, message: '"Total" looks like a total row' }]);
    expect(sheet.rows.map((r) => r.values)).toEqual([
      {
        name: "Haas VF-2",
        kind: "mill_3axis",
        hourlyRateCents: 9_500,
        setupRateCents: 7_500,
        defaultSetupMinutes: 45,
      },
      { name: "Okuma LB3000", kind: "lathe", hourlyRateCents: 11_000, defaultSetupMinutes: 90 },
      { name: "Brother S700", hourlyRateCents: 8_500, defaultSetupMinutes: 30 },
    ]);
  });

  it("reads a tab-separated paste and the template headers of every kind", () => {
    for (const kind of ["machines", "materials", "finishing-ops"] as const) {
      const sheet = readRateSheet(kind, parseCsv(`${TEMPLATE_HEADERS[kind].join("\t")}\n`));
      expect(
        sheet.columns.map((c) => c.header),
        kind,
      ).toEqual(TEMPLATE_HEADERS[kind]);
      expect(sheet.fatal, kind).toMatch(/no rows/);
    }
  });

  it("infers a material's basis from the one price it has, and refuses both without a basis", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv(
        [
          "Material\tPrice per lb\tDensity (lb/in3)\tStock price\tStock size\tScrap %\tMin charge",
          "6061-T6 plate\t$4.50\t0.0975\t\t\t10%\t$25",
          "303 SS bar\t\t\t$120\t0.75 rd x 12 ft\t\t",
          "4140 HT\t3.10\t0.284\t95\t\t\t",
          "Delrin\t\t\t\t\t0.1\t",
        ].join("\n"),
      ),
    );
    const values = sheet.rows.map((r) => r.values as MaterialImportValues);
    expect(values).toEqual([
      {
        name: "6061-T6 plate",
        pricePerLbCents: 450,
        densityLbPerIn3: 0.0975,
        scrapBps: 1_000,
        minChargeCents: 2_500,
        pricingBasis: "per_lb",
      },
      {
        name: "303 SS bar",
        stockPriceCents: 12_000,
        stockDescription: "0.75 rd x 12 ft",
        pricingBasis: "per_stock",
      },
    ]);
    expect(sheet.errors.map((e) => e.row)).toEqual([4, 5]);
    expect(sheet.errors[0]?.message).toMatch(/Pricing basis/);
    expect(sheet.errors[1]?.message).toMatch(/% sign/);
  });

  it("leaves out a material price column that does not say per lb or per piece, or is per kg", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv("Material,Price,$/kg,Price per lb\nBrass 360,9,20,5.25\n"),
    );
    expect(sheet.ignored.map((i) => i.header)).toEqual(["Price", "$/kg"]);
    expect(sheet.ignored[1]?.reason).toMatch(/per lb/);
    expect(sheet.rows[0]?.values).toEqual({
      name: "Brass 360",
      pricePerLbCents: 525,
      pricingBasis: "per_lb",
    });
  });

  it("reads finishing vendors with in-house flags and lead times in weeks", () => {
    const sheet = readRateSheet(
      "finishing-ops",
      parseCsv(
        [
          "Finish,Price each,Lot minimum,In-house?,Lead time (weeks)",
          "Anodize Type II,$3.00,$150,no,2",
          "Deburr & tumble,0.40,,yes,3 days",
          "Passivate,0.50,75,maybe,1",
        ].join("\n"),
      ),
    );
    expect(sheet.rows.map((r) => r.values)).toEqual([
      {
        name: "Anodize Type II",
        perPartCents: 300,
        lotChargeCents: 15_000,
        outsideService: true,
        leadDays: 14,
      },
      { name: "Deburr & tumble", perPartCents: 40, outsideService: false, leadDays: 3 },
    ]);
    expect(sheet.errors).toEqual([
      { row: 4, message: 'Outside service (from in-house): is not yes or no ("maybe")' },
    ]);
  });

  it("flags duplicate names and says when no header is found", () => {
    const dup = readRateSheet("machines", parseCsv("Machine,Rate\nVF2,90\nvf2 ,95\n"));
    expect(dup.errors).toEqual([{ row: 3, message: '"vf2" is already on row 2' }]);
    const none = readRateSheet("machines", parseCsv("Part,Qty\nA,1\n"));
    expect(none.fatal).toMatch(/No header row/);
  });

  it("refuses a setup column with no unit", () => {
    const s = readRateSheet("machines", parseCsv("Machine,Rate,Setup\nVF2,90,30\n"));
    expect(s.ignored[0]).toMatchObject({ header: "Setup" });
    expect(s.rows[0]?.values).toEqual({ name: "VF2", hourlyRateCents: 9_000 });
  });
});

describe("drilling column", () => {
  it("reads seconds per hole and round-trips it", () => {
    const s = readRateSheet(
      "machines",
      parseCsv("Machine,Rate,Seconds per hole\nVF2,90,6\nLathe,80,\n"),
    );
    expect(s.errors).toEqual([]);
    expect(s.rows.map((r) => r.values)).toEqual([
      { name: "VF2", hourlyRateCents: 9_000, secondsPerHole: 6 },
      { name: "Lathe", hourlyRateCents: 8_000 },
    ]);
    const back = readRateSheet(
      "machines",
      parseCsv(exportRateCsv("machines", [{ ...mill, secondsPerHole: 6 }])),
    );
    expect(back.errors).toEqual([]);
    expect(back.rows[0]?.values).toMatchObject({ secondsPerHole: 6 });
  });

  it("reads a drill feed in in/min and round-trips it", () => {
    const s = readRateSheet(
      "machines",
      parseCsv(
        "Machine,Rate,Seconds per hole,Drill feed (in/min),Cut speed (in/min)\nVF2,90,4,8,\n",
      ),
    );
    expect(s.errors).toEqual([]);
    expect(s.rows[0]?.values).toEqual({
      name: "VF2",
      hourlyRateCents: 9_000,
      secondsPerHole: 4,
      drillFeedInPerMin: 8,
    });
    expect(
      readRateSheet("machines", parseCsv("Machine,Rate,Drill IPM\nVF2,90,12\n")).rows[0]?.values,
    ).toEqual({ name: "VF2", hourlyRateCents: 9_000, drillFeedInPerMin: 12 });
    const back = readRateSheet(
      "machines",
      parseCsv(exportRateCsv("machines", [{ ...mill, secondsPerHole: 4, drillFeedInPerMin: 8 }])),
    );
    expect(back.errors).toEqual([]);
    expect(back.rows[0]?.values).toMatchObject({ secondsPerHole: 4, drillFeedInPerMin: 8 });
  });

  it("refuses a hole time given in minutes", () => {
    const s = readRateSheet("machines", parseCsv("Machine,Rate,Drill min per hole\nVF2,90,0.1\n"));
    expect(s.ignored[0]).toMatchObject({ header: "Drill min per hole" });
    expect(s.rows[0]?.values).toEqual({ name: "VF2", hourlyRateCents: 9_000 });
  });

  it("reads seconds per tapped hole apart from seconds per hole, and round-trips it", () => {
    const s = readRateSheet(
      "machines",
      parseCsv("Machine,Rate,Seconds per hole,Seconds per tapped hole\nVF2,90,4,7\n"),
    );
    expect(s.errors).toEqual([]);
    expect(s.rows[0]?.values).toEqual({
      name: "VF2",
      hourlyRateCents: 9_000,
      secondsPerHole: 4,
      secondsPerTappedHole: 7,
    });
    const back = readRateSheet(
      "machines",
      parseCsv(exportRateCsv("machines", [{ ...mill, secondsPerTappedHole: 7 }])),
    );
    expect(back.errors).toEqual([]);
    expect(back.rows[0]?.values).toMatchObject({ secondsPerTappedHole: 7 });
    const minutes = readRateSheet("machines", parseCsv("Machine,Rate,Tapping minutes\nVF2,90,1\n"));
    expect(minutes.ignored[0]).toMatchObject({ header: "Tapping minutes" });
    expect(minutes.rows[0]?.values).not.toHaveProperty("secondsPerTappedHole");
  });
});

describe("peck columns on machines", () => {
  it("reads peck depth in diameters and seconds per peck, and round-trips them", () => {
    const s = readRateSheet(
      "machines",
      parseCsv("Machine,Rate,Seconds per hole,Peck depth (xD),Seconds per peck\nVF2,90,4,1.5,2\n"),
    );
    expect(s.errors).toEqual([]);
    expect(s.rows[0]?.values).toEqual({
      name: "VF2",
      hourlyRateCents: 9_000,
      secondsPerHole: 4,
      peckDepthDiameters: 1.5,
      secondsPerPeck: 2,
    });
    const back = readRateSheet(
      "machines",
      parseCsv(
        exportRateCsv("machines", [{ ...mill, peckDepthDiameters: 1.5, secondsPerPeck: 2 }]),
      ),
    );
    expect(back.errors).toEqual([]);
    expect(back.rows[0]?.values).toMatchObject({ peckDepthDiameters: 1.5, secondsPerPeck: 2 });
  });

  it("reads other ways shops write the peck headers", () => {
    const s = readRateSheet(
      "machines",
      parseCsv("Machine,Rate,Peck (×D),Peck time (s)\nVF2,90,1,1.2\n"),
    );
    expect(s.rows[0]?.values).toMatchObject({ peckDepthDiameters: 1, secondsPerPeck: 1.2 });
  });

  it("refuses a peck depth in inches and a peck time in minutes rather than guess", () => {
    const s = readRateSheet(
      "machines",
      parseCsv("Machine,Rate,Peck depth (in),Peck minutes\nVF2,90,0.25,0.1\n"),
    );
    expect(s.ignored.map((i) => i.header)).toEqual(["Peck depth (in)", "Peck minutes"]);
    expect(s.rows[0]?.values).not.toHaveProperty("peckDepthDiameters");
    expect(s.rows[0]?.values).not.toHaveProperty("secondsPerPeck");
  });
});

describe("sheet thickness on materials", () => {
  it("reads a thickness in inches and exports it back", () => {
    const s = readRateSheet(
      "materials",
      parseCsv(
        "Material,Price per lb,Sheet thickness (in)\n304 SS 14 ga sheet,2.10,0.0751\nBar,3,\n",
      ),
    );
    expect(s.errors).toEqual([]);
    expect(s.rows.map((r) => (r.values as MaterialImportValues).sheetThicknessIn)).toEqual([
      0.0751,
      undefined,
    ]);
    const sheet: MaterialDto = {
      id: "mat_9",
      name: "5052-H32 sheet, 0.090",
      pricingBasis: "per_lb",
      pricePerLbCents: 450,
      densityLbPerIn3: 0.0968,
      sheetThicknessIn: 0.09,
      stockPriceCents: null,
      stockDescription: null,
      scrapBps: 2_000,
      minChargeCents: 0,
      active: true,
    };
    const back = readRateSheet("materials", parseCsv(exportRateCsv("materials", [sheet])));
    expect(back.errors).toEqual([]);
    expect(back.rows[0]?.values).toMatchObject({ sheetThicknessIn: 0.09 });
  });

  it("refuses a thickness given in mm or as a gauge number", () => {
    for (const header of ["Thickness (mm)", "Thickness ga", "Gauge thickness"]) {
      const s = readRateSheet(
        "materials",
        parseCsv(`Material,Price per lb,${header}\nCRS,1.2,16\n`),
      );
      expect(s.ignored[0]).toMatchObject({ header });
      expect(
        (s.rows[0]?.values as MaterialImportValues | undefined)?.sheetThicknessIn,
      ).toBeUndefined();
    }
  });
});

describe("sheet-metal machine columns", () => {
  it("reads cut speed, pierce time and seconds per bend", () => {
    const s = readRateSheet(
      "machines",
      parseCsv(
        "Machine,Kind,Rate,Cut speed (in/min),Pierce seconds,Seconds per bend\n" +
          "Fiber laser,laser,150,300,1.5,\nPress brake,press_brake,85,,,8\n",
      ),
    );
    expect(s.errors).toEqual([]);
    expect(s.rows.map((r) => r.values)).toEqual([
      {
        name: "Fiber laser",
        kind: "laser",
        hourlyRateCents: 15_000,
        cutSpeedInPerMin: 300,
        pierceSeconds: 1.5,
      },
      { name: "Press brake", kind: "press_brake", hourlyRateCents: 8_500, secondsPerBend: 8 },
    ]);
  });

  it("reads IPM and feed rate as cut speed, not as the hourly rate", () => {
    const s = readRateSheet("machines", parseCsv("Machine,Shop rate,IPM\nPlasma,95,120\n"));
    expect(s.rows[0]?.values).toEqual({
      name: "Plasma",
      hourlyRateCents: 9_500,
      cutSpeedInPerMin: 120,
    });
    const f = readRateSheet("machines", parseCsv("Machine,Rate,Feed rate\nWJ,90,40\n"));
    expect(f.rows[0]?.values).toMatchObject({ hourlyRateCents: 9_000, cutSpeedInPerMin: 40 });
  });

  it("refuses a pierce or bend time given in minutes", () => {
    const s = readRateSheet("machines", parseCsv("Machine,Rate,Pierce (min)\nLaser,150,0.03\n"));
    expect(s.ignored[0]).toMatchObject({ header: "Pierce (min)" });
    expect(s.rows[0]?.values).toEqual({ name: "Laser", hourlyRateCents: 15_000 });
  });

  it("exports the three columns so the sheet round-trips", () => {
    const laser: MachineDto = {
      ...mill,
      name: "Fiber laser",
      kind: "laser",
      cutSpeedInPerMin: 300,
      pierceSeconds: 1.5,
      secondsPerBend: null,
      secondsPerHole: null,
      drillFeedInPerMin: null,
      secondsPerTappedHole: null,
      peckDepthDiameters: null,
      secondsPerPeck: null,
    };
    const csv = exportRateCsv("machines", [laser]);
    const back = readRateSheet("machines", parseCsv(csv));
    expect(back.errors).toEqual([]);
    expect(back.rows[0]?.values).toMatchObject({ cutSpeedInPerMin: 300, pierceSeconds: 1.5 });
    expect(back.rows[0]?.values).not.toHaveProperty("secondsPerBend");
  });
});

describe("planRateImport", () => {
  it("updates by name keeping columns the sheet lacks, creates new names, un-retires", () => {
    const retired: MachineDto = {
      ...mill,
      id: "mch_2",
      name: "Old Lathe",
      kind: "lathe",
      active: false,
    };
    const plan = planRateImport(
      "machines",
      [
        { row: 2, values: { name: "haas  vf-2", hourlyRateCents: 10_000 } },
        { row: 3, values: { name: "New Swiss", kind: "swiss", hourlyRateCents: 12_500 } },
        { row: 4, values: { name: "Old Lathe", hourlyRateCents: 8_000 } },
      ],
      [mill, retired],
    );
    expect(plan.errors).toEqual([]);
    const [up, create, back] = plan.rows;
    expect(up).toMatchObject({
      action: "update",
      id: "mch_1",
      name: "Haas VF-2",
      changes: ["Hourly rate"],
    });
    expect(up?.values).toMatchObject({
      defaultSetupMinutes: 45,
      removalRateIn3PerMin: 2.5,
      hourlyRateCents: 10_000,
      active: true,
    });
    expect(create).toMatchObject({
      action: "create",
      values: { kind: "swiss", setupRateCents: null },
    });
    expect(back).toMatchObject({ action: "update", reactivates: true });
  });

  it("refuses a new row without its price and a name the card has twice", () => {
    const plan = planRateImport(
      "machines",
      [
        { row: 2, values: { name: "Saw", kind: "saw" } },
        { row: 3, values: { name: "Haas VF-2", hourlyRateCents: 1 } },
      ],
      [mill, { ...mill, id: "mch_9" }],
    );
    expect(plan.rows).toEqual([]);
    expect(plan.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(plan.errors[0]?.message).toMatch(/hourly rate/);
    expect(plan.errors[1]?.message).toMatch(/2 rates named/);
  });

  it("saves a new machine with no kind as other, with a warning", () => {
    const plan = planRateImport(
      "machines",
      [{ row: 2, values: { name: "Saw", hourlyRateCents: 4_000 } }],
      [],
    );
    expect(plan.rows[0]).toMatchObject({ action: "create", values: { kind: "other" } });
    expect(plan.rows[0]?.warnings[0]).toMatch(/other/);
  });

  it("checks the merged material with the editor's per-basis rule", () => {
    const steel: MaterialDto = {
      id: "mat_1",
      name: "1018",
      pricingBasis: "per_lb",
      pricePerLbCents: 150,
      densityLbPerIn3: 0.284,
      sheetThicknessIn: null,
      stockPriceCents: null,
      stockDescription: null,
      scrapBps: 0,
      minChargeCents: 0,
      active: true,
    };
    const ok = planRateImport(
      "materials",
      [{ row: 2, values: { name: "1018", scrapBps: 500 } }],
      [steel],
    );
    expect(ok.rows[0]?.values).toMatchObject({
      pricePerLbCents: 150,
      scrapBps: 500,
      pricingBasis: "per_lb",
    });
    const bad = planRateImport(
      "materials",
      [{ row: 2, values: { name: "1018", pricingBasis: "per_stock" } }],
      [steel],
    );
    expect(bad.errors[0]?.message).toMatch(/stock price/);
  });

  it("keeps a finishing op's flags when the sheet has only prices", () => {
    const fin: FinishingOpDto = {
      id: "fin_1",
      name: "Anodize",
      perPartCents: 300,
      lotChargeCents: 15_000,
      outsideService: true,
      leadDays: 10,
      active: true,
    };
    const plan = planRateImport(
      "finishing-ops",
      [{ row: 2, values: { name: "anodize", perPartCents: 350 } }],
      [fin],
    );
    expect(plan.rows[0]?.values).toMatchObject({
      outsideService: true,
      leadDays: 10,
      perPartCents: 350,
    });
    expect(plan.rows[0]?.changes).toEqual(["Per part"]);
  });
});

describe("parseCsv delimiter", () => {
  it("finds tabs under a title line that has none (a paste from a sheet with a title block)", () => {
    const grid = parseCsv(
      "Acme Machine 2026 rates\n\nMachine\tShop rate ($/hr)\nHaas VF-2, left bay\t$1,095.00\n",
    );
    expect(grid[2]).toEqual(["Machine", "Shop rate ($/hr)"]);
    expect(grid[3]).toEqual(["Haas VF-2, left bay", "$1,095.00"]);
  });

  it("prefers tab on a tie with comma, and keeps plain CSV and semicolon files", () => {
    expect(parseCsv("Machine\tRate\nVF-2, left\t1,095\n")[1]).toEqual(["VF-2, left", "1,095"]);
    expect(parseCsv('Machine,Rate\n"VF-2, left",95\n')[1]).toEqual(["VF-2, left", "95"]);
    expect(parseCsv("Material;Price per lb\n6061;4,50\n")[1]).toEqual(["6061", "4,50"]);
  });
});

describe("export for the round trip", () => {
  const machines: MachineDto[] = [
    mill,
    {
      id: "mch_2",
      name: 'Okuma LB3000, 10" chuck',
      kind: "lathe",
      hourlyRateCents: 11_050,
      setupRateCents: 8_000,
      defaultSetupMinutes: 90,
      removalRateIn3PerMin: null,
      cutSpeedInPerMin: null,
      pierceSeconds: null,
      secondsPerBend: null,
      secondsPerHole: null,
      drillFeedInPerMin: null,
      secondsPerTappedHole: null,
      peckDepthDiameters: null,
      secondsPerPeck: null,
      active: false,
    },
    {
      id: "mch_3",
      name: "=HYPERLINK(1)",
      kind: "mill_5axis",
      hourlyRateCents: 17_500,
      setupRateCents: null,
      defaultSetupMinutes: 0,
      removalRateIn3PerMin: 0.000001,
      cutSpeedInPerMin: null,
      pierceSeconds: null,
      secondsPerBend: null,
      secondsPerHole: null,
      drillFeedInPerMin: null,
      secondsPerTappedHole: null,
      peckDepthDiameters: null,
      secondsPerPeck: null,
      active: true,
    },
  ];
  const materials: MaterialDto[] = [
    {
      id: "mat_1",
      name: "6061-T6 Aluminum",
      pricingBasis: "per_lb",
      pricePerLbCents: 425,
      densityLbPerIn3: 0.0975,
      sheetThicknessIn: null,
      stockPriceCents: null,
      stockDescription: null,
      scrapBps: 1_250,
      minChargeCents: 2_500,
      active: true,
    },
    {
      id: "mat_2",
      name: "304 SS tube",
      pricingBasis: "per_stock",
      pricePerLbCents: 610,
      densityLbPerIn3: 0.289,
      sheetThicknessIn: null,
      stockPriceCents: 18_999,
      stockDescription: "2\" OD x 0.065 wall, 20' stick",
      scrapBps: 0,
      minChargeCents: 0,
      active: false,
    },
  ];
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
    {
      id: "fin_2",
      name: "Tumble deburr",
      perPartCents: 25,
      lotChargeCents: 0,
      outsideService: false,
      leadDays: null,
      active: true,
    },
  ];
  const cases = [
    ["machines", machines],
    ["materials", materials],
    ["finishing-ops", finishing],
  ] as const;

  it.each(cases)("%s: an unedited export imports as no change", (kind, rows) => {
    const csv = exportRateCsv(kind, rows);
    const sheet = readRateSheet(kind, parseCsv(csv));
    expect(sheet.fatal).toBeNull();
    expect(sheet.ignored).toEqual([]);
    expect(sheet.errors).toEqual([]);
    expect(sheet.columns.map((c) => c.header)).toEqual(EXPORT_HEADERS[kind]);
    expect(new Set(sheet.columns.map((c) => c.field)).size).toBe(EXPORT_HEADERS[kind].length);
    const plan = planRateImport(kind, sheet.rows, rows);
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => [r.name, r.action, r.changes, r.reactivates])).toEqual(
      rows.map((r) => [r.name, "update", [], undefined]),
    );
  });

  it("an edited price comes back as that one change", () => {
    const csv = exportRateCsv("machines", machines).replace("95.00", "102.50");
    const sheet = readRateSheet("machines", parseCsv(csv));
    const plan = planRateImport("machines", sheet.rows, machines);
    expect(plan.rows[0]?.changes).toEqual(["Hourly rate"]);
    expect(plan.rows[0]?.values.hourlyRateCents).toBe(10_250);
    expect(plan.rows.slice(1).every((r) => r.changes.length === 0)).toBe(true);
  });

  it("the same export loads into an empty card as new rates", () => {
    const sheet = readRateSheet("materials", parseCsv(exportRateCsv("materials", materials)));
    const plan = planRateImport("materials", sheet.rows, []);
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create"]);
    const { id: _id, ...want } = materials[1] as MaterialDto;
    expect(plan.rows[1]?.values).toEqual(want);
  });

  it("writes text a spreadsheet would run as a formula as text", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-40 bar")).toBe("'-40 bar");
    expect(csvField("@x")).toBe("'@x");
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField("plain")).toBe("plain");
    const csv = exportRateCsv("machines", machines);
    expect(csv.startsWith("\ufeffMachine,Kind,")).toBe(true);
    expect(csv).toContain("\r\n'=HYPERLINK(1),mill_5axis,175.00,");
    expect(csv).not.toMatch(/\r\n=/);
  });
});
