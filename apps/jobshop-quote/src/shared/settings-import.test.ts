import { describe, expect, it } from "vitest";
import type { ShopSettingsDto } from "./api";
import { readRateSheet } from "./rate-card-import";
import {
  exportSettingsCsv,
  matchSettingLabel,
  planSettingsImport,
  readDaysCell,
  readQuantitiesCell,
  readSettingsSheet,
  settingsTemplateCsv,
} from "./settings-import";
import { parseCsv } from "./sheet";

const current: ShopSettingsDto = {
  displayName: "Acme Machine",
  addressLines: [],
  phone: null,
  email: null,
  laborMarkupBps: 1500,
  materialMarkupBps: 1000,
  outsideServiceMarkupBps: 1000,
  minimumLineCents: 15000,
  defaultQuantities: [1, 5, 10, 25],
  quoteValidDays: 30,
  defaultLeadTimeText: null,
  quoteTerms: null,
  emailSignature: null,
  prefillRepeatParts: true,
  timeZone: null,
};

describe("matchSettingLabel", () => {
  it.each([
    ["Labor markup", "laborMarkupBps"],
    ["Shop rate mark-up %", "laborMarkupBps"],
    ["Material Markup:", "materialMarkupBps"],
    ["Markup on stock", "materialMarkupBps"],
    ["Outside services markup", "outsideServiceMarkupBps"],
    ["Mark up - vendor / OSP", "outsideServiceMarkupBps"],
    ["Minimum line charge", "minimumLineCents"],
    ["Min per line ($)", "minimumLineCents"],
    ["Quote valid (days)", "quoteValidDays"],
    ["Quotes good for", "quoteValidDays"],
    ["Validity", "quoteValidDays"],
    ["Default quantities", "defaultQuantities"],
    ["Qty breaks", "defaultQuantities"],
  ])("%s -> %s", (label, field) => {
    expect(matchSettingLabel(label)).toEqual({ field });
  });

  it("refuses labels that could mean two things, and says why", () => {
    expect(matchSettingLabel("Markup")).toHaveProperty("refuse");
    expect(matchSettingLabel("Margin")).toHaveProperty("refuse");
    expect(matchSettingLabel("Target margin %")).toHaveProperty("refuse");
    expect(matchSettingLabel("Minimum order")).toHaveProperty("refuse");
    expect(matchSettingLabel("Minimum charge")).toHaveProperty("refuse");
  });

  it("leaves rate-table cells alone", () => {
    for (const s of ["Machine", "Haas VF-2", "Material", "Quantity", "Setup minutes", "Min"])
      expect(matchSettingLabel(s)).toBeNull();
  });
});

describe("cells", () => {
  it("reads days and weeks, refuses months", () => {
    expect(readDaysCell("30")).toEqual({ ok: true, value: 30 });
    expect(readDaysCell("2 weeks")).toEqual({ ok: true, value: 14 });
    expect(readDaysCell("4", "weeks")).toEqual({ ok: true, value: 28 });
    expect(readDaysCell("10 days", "weeks")).toEqual({ ok: true, value: 10 });
    expect(readDaysCell("1 month").ok).toBe(false);
    expect(readDaysCell("1.5").ok).toBe(false);
    expect(readDaysCell("0").ok).toBe(false);
  });

  it("reads quantity lists in the separators shops use", () => {
    for (const s of ["1, 5, 10, 25", "1;5;10;25", "1 5 10 25", "1/5/10/25", "1,5,10,25"])
      expect(readQuantitiesCell(s)).toEqual({ ok: true, value: [1, 5, 10, 25] });
    expect(readQuantitiesCell("100, 1,000")).toEqual({ ok: true, value: [100, 1000] });
  });

  it("refuses a comma that could be thousands or a list", () => {
    const r = readQuantitiesCell("5,100");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("5100");
  });

  it("sorts and drops repeats with a note, and bounds the list", () => {
    expect(readQuantitiesCell("10, 1, 10")).toMatchObject({ ok: true, value: [1, 10] });
    expect(readQuantitiesCell("10, 1").ok && readQuantitiesCell("10, 1")).toHaveProperty("warning");
    expect(readQuantitiesCell("1 2 3 4 5 6 7 8 9").ok).toBe(false);
    expect(readQuantitiesCell("0, 5").ok).toBe(false);
    expect(readQuantitiesCell("5 pcs").ok).toBe(false);
  });
});

describe("readSettingsSheet", () => {
  it("reads a settings block above the shop's rate table, and the rate import still reads the table", () => {
    const grid = parseCsv(
      [
        "Acme Machine price list 2026,,",
        "Labor markup,15%,",
        "Material markup,20%,per PO",
        "Minimum line charge,$175,",
        ",,",
        "Machine,Kind,Hourly rate",
        "Haas VF-2,3-axis mill,$95",
        "Okuma lathe,lathe,$85",
      ].join("\n"),
    );
    const s = readSettingsSheet(grid);
    expect(s.errors).toEqual([]);
    expect(s.rows.map((r) => [r.row, r.field, r.value])).toEqual([
      [2, "laborMarkupBps", 1500],
      [3, "materialMarkupBps", 2000],
      [4, "minimumLineCents", 17500],
    ]);
    const rates = readRateSheet("machines", grid);
    expect(rates.headerRow).toBe(6);
    expect(rates.rows.map((r) => r.values.name)).toEqual(["Haas VF-2", "Okuma lathe"]);
  });

  it("names the row of a value it cannot read, and lists refused labels", () => {
    const s = readSettingsSheet([
      ["Labor markup", "0.15"],
      ["Markup", "10%"],
      ["Quote valid (days)", "a month"],
    ]);
    expect(s.errors.map((e) => e.row)).toEqual([1, 3]);
    expect(s.errors[0]?.message).toContain("% sign");
    expect(s.ignored).toEqual([expect.objectContaining({ row: 2, label: "Markup" })]);
  });

  it("refuses the same setting twice with different values", () => {
    const s = readSettingsSheet([
      ["Labor markup", "15%"],
      ["Shop markup", "18%"],
    ]);
    expect(s.errors).toEqual([expect.objectContaining({ row: 2 })]);
  });

  it("treats a blank value as leave-as-is, and says when nothing is a setting", () => {
    const blank = readSettingsSheet(parseCsv(settingsTemplateCsv()));
    expect(blank.rows).toEqual([]);
    expect(blank.errors).toEqual([]);
    expect(blank.fatal).toContain("No settings found");
    expect(readSettingsSheet([["Machine", "Hourly rate"]]).fatal).not.toBeNull();
  });
});

describe("planSettingsImport", () => {
  it("patches only what changes and describes each change", () => {
    const s = readSettingsSheet([
      ["Labor markup", "15%"],
      ["Material markup", "12.5%"],
      ["Default quantities", "1; 10; 100"],
      ["Quote valid (weeks)", "6"],
    ]);
    const plan = planSettingsImport(s.rows, current);
    expect(plan.errors).toEqual([]);
    expect(plan.patch).toEqual({
      materialMarkupBps: 1250,
      defaultQuantities: [1, 10, 100],
      quoteValidDays: 42,
    });
    expect(plan.rows.map((r) => r.changes)).toEqual([
      [],
      ["10% → 12.5%"],
      ["1, 5, 10, 25 → 1, 10, 100"],
      ["30 days → 42 days"],
    ]);
  });

  it("refuses a value the settings editor would refuse", () => {
    const plan = planSettingsImport(
      [{ row: 3, field: "laborMarkupBps", label: "Labor markup", value: 200_000, warnings: [] }],
      current,
    );
    expect(plan.errors).toEqual([expect.objectContaining({ row: 3 })]);
    expect(plan.patch).toEqual({});
  });
});

describe("exportSettingsCsv", () => {
  it("reads back unchanged", () => {
    const odd: ShopSettingsDto = {
      ...current,
      laborMarkupBps: 1275,
      minimumLineCents: 9999,
      defaultQuantities: [1, 1000, 5000],
      quoteValidDays: 45,
    };
    const csv = exportSettingsCsv(odd);
    expect(csv.startsWith("\uFEFFSetting,Value\r\n")).toBe(true);
    const s = readSettingsSheet(parseCsv(csv.replace(/^\uFEFF/, "")));
    expect(s.errors).toEqual([]);
    expect(s.rows).toHaveLength(6);
    const plan = planSettingsImport(s.rows, odd);
    expect(plan.patch).toEqual({});
    expect(plan.rows.every((r) => r.changes.length === 0)).toBe(true);
  });
});
