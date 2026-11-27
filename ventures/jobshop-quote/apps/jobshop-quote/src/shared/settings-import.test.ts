import { describe, expect, it } from "vitest";
import type { ShopSettingsDto } from "./api";
import { readRateSheet } from "./rate-card-import";
import {
  exportSettingsCsv,
  matchSettingLabel,
  planSettingsImport,
  readDaysCell,
  readFalloutCell,
  readQuantitiesCell,
  readSettingsSheet,
  readTextCell,
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
  defaultFalloutBps: null,
  timeZone: null,
  currency: null,
  hasLogo: false,
  materialPriceMaxAgeDays: 90,
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
    expect(s.rows).toHaveLength(9);
    const plan = planSettingsImport(s.rows, odd);
    expect(plan.patch).toEqual({});
    expect(plan.rows.every((r) => r.changes.length === 0)).toBe(true);
  });
});

describe("lead time and terms", () => {
  it.each([
    ["Default lead time", "defaultLeadTimeText"],
    ["Lead time:", "defaultLeadTimeText"],
    ["Standard leadtime", "defaultLeadTimeText"],
    ["Quote terms", "quoteTerms"],
    ["Terms", "quoteTerms"],
    ["Terms & Conditions", "quoteTerms"],
    ["T&Cs", "quoteTerms"],
  ])("reads %s as %s", (label, field) => {
    expect(matchSettingLabel(label)).toEqual({ field });
  });

  it("refuses a lead time in days and payment terms alone, and says why", () => {
    for (const l of ["Lead time (days)", "Lead time per part", "Payment terms", "Terms of payment"])
      expect(matchSettingLabel(l)).toHaveProperty("refuse");
    expect(matchSettingLabel("Terms apply to all lines")).toBeNull();
  });

  it("keeps line breaks inside a terms cell and bounds the length", () => {
    expect(readTextCell("  Net 30\r\n  FOB our dock \n\n", 4000)).toEqual({
      ok: true,
      value: "Net 30\nFOB our dock",
    });
    expect(readTextCell("'=1+1 is not a formula", 200)).toEqual({
      ok: true,
      value: "=1+1 is not a formula",
    });
    expect(readTextCell("x".repeat(201), 200).ok).toBe(false);
  });

  it("reads quoted CSV text with commas, and refuses text an unquoted comma split", () => {
    const s = readSettingsSheet(
      parseCsv(
        [
          'Default lead time,"3-4 weeks ARO, rush on request"',
          "Quote terms,Net 30, FOB our dock",
        ].join("\n"),
      ),
    );
    expect(s.rows.map((r) => [r.field, r.value])).toEqual([
      ["defaultLeadTimeText", "3-4 weeks ARO, rush on request"],
    ]);
    expect(s.errors).toEqual([expect.objectContaining({ row: 2 })]);
    expect(s.errors[0]?.message).toContain("one cell");
  });

  it("(none) clears a text setting and is refused, with what to write, on a number", () => {
    const s = readSettingsSheet([
      ["Default lead time", "(none)"],
      ["Quote terms", "(Clear)"],
      ["Labor markup", "(none)"],
      ["Default quantities", "(none)"],
    ]);
    expect(s.rows.map((r) => [r.field, r.value])).toEqual([
      ["defaultLeadTimeText", null],
      ["quoteTerms", null],
    ]);
    expect(s.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(s.errors[0]?.message).toContain('"0%"');
    const plan = planSettingsImport(s.rows, {
      ...current,
      defaultLeadTimeText: "2 weeks",
      quoteTerms: null,
    });
    expect(plan.errors).toEqual([]);
    expect(plan.patch).toEqual({ defaultLeadTimeText: null });
    expect(plan.rows.map((r) => r.changes)).toEqual([['"2 weeks" → (none)'], []]);
  });

  it("describes a text change on one line, cut short", () => {
    const s = readSettingsSheet([["Quote terms", `Net 30.\n${"All parts inspected. ".repeat(5)}`]]);
    const plan = planSettingsImport(s.rows, current);
    expect(plan.patch.quoteTerms?.startsWith("Net 30.\nAll parts")).toBe(true);
    const change = plan.rows[0]?.changes[0] ?? "";
    expect(change.startsWith('(none) → "Net 30. All parts inspected.')).toBe(true);
    expect(change.endsWith('…"')).toBe(true);
  });

  it("exports lead time and terms, multi-line and empty, and reads them back unchanged", () => {
    for (const odd of [
      {
        ...current,
        defaultLeadTimeText: "3-4 weeks ARO",
        quoteTerms: 'Net 30\nFOB our dock, "as is"',
      },
      { ...current, defaultLeadTimeText: "-2 days from PO", quoteTerms: null },
      { ...current, defaultLeadTimeText: null, quoteTerms: "=Net 30" },
    ]) {
      const csv = exportSettingsCsv(odd);
      const s = readSettingsSheet(parseCsv(csv.replace(/^\uFEFF/, "")));
      expect(s.errors).toEqual([]);
      expect(s.rows).toHaveLength(9);
      expect(planSettingsImport(s.rows, odd).patch).toEqual({});
    }
    expect(exportSettingsCsv(current)).toContain("Quote terms,(none)");
  });
});

describe("settings in the shop's currency", () => {
  it("reads a minimum line charge marked in the shop's currency", () => {
    const s = readSettingsSheet([["Minimum line charge (€)", "150,00 €"]], "EUR");
    expect(s.errors).toEqual([]);
    expect(s.rows[0]).toMatchObject({ field: "minimumLineCents", value: 15_000 });
  });
  it("refuses one marked in another currency, by its label or its value", () => {
    const byValue = readSettingsSheet([["Minimum line charge", "$150"]], "EUR");
    expect(byValue.rows).toEqual([]);
    expect(byValue.errors[0]?.message).toMatch(/but the rate card is in EUR/);
    const byLabel = readSettingsSheet([["Minimum line charge (USD)", "150"]], "GBP");
    expect(byLabel.rows).toEqual([]);
    expect(byLabel.errors[0]?.message).toMatch(/USD but the rate card is in GBP/);
  });
});

describe("default fallout", () => {
  it.each([
    ["Default fallout", "defaultFalloutBps"],
    ["Fallout %", "defaultFalloutBps"],
    ["Reject rate", "defaultFalloutBps"],
    ["Expected yield loss", "defaultFalloutBps"],
  ])("maps %s", (label, field) => {
    expect(matchSettingLabel(label)).toEqual({ field });
  });

  it.each([
    ["Yield", /97% yield is 3% fallout/],
    ["Scrap %", /kerf and drop/],
    ["Scrap", /kerf and drop/],
  ])("refuses %s with what to write", (label, reason) => {
    const m = matchSettingLabel(label);
    expect(m && "refuse" in m && m.refuse).toMatch(reason);
  });

  it("reads a percentage, 0 and (none) as no default, and refuses over 50%", () => {
    expect(readFalloutCell("3%")).toEqual({ ok: true, value: 300 });
    expect(readFalloutCell("2.5")).toEqual({ ok: true, value: 250 });
    expect(readFalloutCell("0")).toEqual({ ok: true, value: null });
    expect(readFalloutCell("60%")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/over 50%/),
    });
    expect(readFalloutCell("0.03")).toMatchObject({ ok: false });
    const s = readSettingsSheet([
      ["Default fallout", "(none)"],
      ["Labor markup", "15%"],
    ]);
    expect(s.errors).toEqual([]);
    expect(s.rows.find((r) => r.field === "defaultFalloutBps")?.value).toBeNull();
  });

  it("plans the change and exports it so it reads back unchanged", () => {
    const s = readSettingsSheet([["Default fallout", "3%"]]);
    const plan = planSettingsImport(s.rows, current);
    expect(plan.patch).toEqual({ defaultFalloutBps: 300 });
    expect(plan.rows[0]?.changes).toEqual(["(none) → 3%"]);
    const withFallout = { ...current, defaultFalloutBps: 250 };
    const csv = exportSettingsCsv(withFallout);
    expect(csv).toContain("Default fallout,2.5%");
    const back = readSettingsSheet(parseCsv(csv.replace(/^\uFEFF/, "")));
    expect(planSettingsImport(back.rows, withFallout).patch).toEqual({});
  });
});
