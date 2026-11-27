import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkSuppliers,
  FLOWDOWN_RULE_QUOTES,
  meetsLevel,
  needsFlowdown,
  parseUids,
  SUPPLIER_QUOTES,
  SUPPLIER_RULE_VERIFICATION,
  type SupplierLike,
  suggestFlowdownLevel,
  supplierAttention,
  supplierCurrency,
  supplierDueDates,
  supplierIssues,
  suppliersCsv,
  validateSupplier,
} from "./suppliers";

const TODAY = "2026-11-26";

const s = (over: Partial<SupplierLike> = {}): SupplierLike => ({
  id: "sup_1",
  name: "Acme Anodizing",
  infoFlowed: "cui",
  cots: false,
  requiredLevel: "l2_self",
  status: "final_l2_self",
  statusDate: "2026-03-01",
  affirmedOn: "2026-03-01",
  cmmcUids: "AB12CD34EF",
  clauseFlowedDown: true,
  checkedOn: "2026-03-10",
  awardedOn: "2026-03-15",
  ...over,
});

const gaps = (x: SupplierLike) =>
  supplierIssues(x, TODAY)
    .filter((i) => i.kind === "gap")
    .map((i) => i.message);

describe("supplier quotes", () => {
  it("are pinned: changing one means re-reading DFARS 252.204-7021 and updating readOn", () => {
    // Each quote was checked by script as a verbatim substring of GSA's DITA source (sha256 in the
    // module header) on the readOn date. A new hash here needs that check again.
    const hash = createHash("sha256")
      .update(JSON.stringify(Object.values(SUPPLIER_QUOTES)))
      .digest("hex");
    expect(hash).toBe("24c14bb0574d6b204b76455331dbd5e4f204e3a69216cd307e6d6a4d0c972e33");
    expect(SUPPLIER_RULE_VERIFICATION).toMatchObject({
      readOn: "2026-11-26",
      checkedAgainstRule: true,
      levelRuleRead: true,
    });
  });
  it("pin 32 CFR 170.23: changing one means re-reading it on eCFR", () => {
    // Checked by script as verbatim substrings of eCFR's text (sha256 in the module header).
    const hash = createHash("sha256")
      .update(JSON.stringify(Object.values(FLOWDOWN_RULE_QUOTES)))
      .digest("hex");
    expect(hash).toBe("9e8abdff526beb524dc8867e7427a708c08ebd2479ff862e2755f0f0c0d562b0");
  });
});

describe("level suggestion (32 CFR 170.23(a))", () => {
  const g = (
    infoFlowed: "cui" | "fci" | "none",
    prime: Parameters<typeof suggestFlowdownLevel>[1],
    cots = false,
  ) => suggestFlowdownLevel({ infoFlowed, cots }, prime);
  it("gives Level 1 (Self) for FCI only, whatever the prime contract says", () => {
    for (const prime of [null, "l1_self", "l2_c3pao", "l3_dibcac"] as const)
      expect(g("fci", prime)).toMatchObject({
        level: "l1_self",
        cite: "32 CFR 170.23(a)(1)",
        ifPrimeC3pao: null,
      });
  });
  it("gives Level 2 (Self) for CUI, and says what a C3PAO prime changes when it is not known", () => {
    expect(g("cui", null)).toMatchObject({
      level: "l2_self",
      cite: "32 CFR 170.23(a)(2)",
      ifPrimeC3pao: "l2_c3pao",
    });
    expect(g("cui", "l2_self")).toMatchObject({ level: "l2_self", ifPrimeC3pao: null });
    expect(g("cui", "l1_self")).toMatchObject({ level: "l2_self", ifPrimeC3pao: null });
  });
  it("gives Level 2 (C3PAO) for CUI under a Level 2 (C3PAO) or Level 3 prime, never Level 3", () => {
    expect(g("cui", "l2_c3pao")).toMatchObject({ level: "l2_c3pao", cite: "32 CFR 170.23(a)(3)" });
    expect(g("cui", "l3_dibcac")).toMatchObject({ level: "l2_c3pao", cite: "32 CFR 170.23(a)(4)" });
  });
  it("asks for no level when nothing goes with the order or it is COTS", () => {
    expect(g("none", "l3_dibcac").level).toBeNull();
    expect(g("cui", "l2_c3pao", true)).toMatchObject({
      level: null,
      cite: "DFARS 252.204-7021(f)(1)",
    });
  });
  it("quotes the paragraph it applies", () => {
    expect(g("cui", "l3_dibcac").quote).toBe(FLOWDOWN_RULE_QUOTES.a4);
    expect(g("fci", null).quote).toBe(FLOWDOWN_RULE_QUOTES.a1);
  });
});

describe("currency (252.204-7021(a), 'Current')", () => {
  it("gives a Conditional status 180 days", () => {
    const c = supplierCurrency(
      { status: "conditional_l2_c3pao", statusDate: "2026-06-01", affirmedOn: "2026-06-01" },
      TODAY,
    );
    expect(c.statusThrough).toBe("2026-11-28");
    expect(c.state).toBe("due_soon");
    expect(c.daysLeft).toBe(2);
  });
  it("gives Final Level 1 one year and Final Level 2 or 3 three years", () => {
    expect(supplierCurrency(s({ status: "final_l1_self" }), TODAY).statusThrough).toBe(
      "2027-03-01",
    );
    expect(supplierCurrency(s(), TODAY).statusThrough).toBe("2029-03-01");
    expect(supplierCurrency(s({ status: "final_l3_dibcac" }), TODAY).statusThrough).toBe(
      "2029-03-01",
    );
  });
  it("is limited by the affirmation's one year", () => {
    const c = supplierCurrency(s({ statusDate: "2025-01-10", affirmedOn: "2025-02-01" }), TODAY);
    expect(c.through).toBe("2026-02-01");
    expect(c.state).toBe("not_current");
  });
  it("moves February 29 to February 28, never a day late", () => {
    expect(
      supplierCurrency(
        { status: "final_l1_self", statusDate: "2028-02-29", affirmedOn: null },
        "2028-03-01",
      ).statusThrough,
    ).toBe("2029-02-28");
  });
  it("is unknown without both dates", () => {
    expect(supplierCurrency(s({ affirmedOn: null }), TODAY).state).toBe("unknown");
  });
  it("is current on its last day and not the day after", () => {
    const x = {
      status: "conditional_l2_self" as const,
      statusDate: "2026-01-01",
      affirmedOn: "2026-01-01",
    };
    expect(supplierCurrency(x, "2026-06-30").state).toBe("due_soon");
    expect(supplierCurrency(x, "2026-07-01").state).toBe("not_current");
  });
});

describe("level", () => {
  it("accepts the level flowed down or higher", () => {
    expect(meetsLevel("final_l2_c3pao", "l2_self")).toBe(true);
    expect(meetsLevel("final_l2_self", "l2_c3pao")).toBe(false);
    expect(meetsLevel("final_l1_self", "l2_self")).toBe(false);
    expect(meetsLevel("conditional_l3_dibcac", "l2_c3pao")).toBe(true);
  });
});

describe("issues", () => {
  it("finds none for a ready supplier", () => {
    expect(supplierIssues(s(), TODAY)).toEqual([]);
    expect(checkSuppliers([s()], TODAY)).toMatchObject({ total: 1, flowdown: 1, ready: 1 });
  });
  it("skips suppliers that get neither FCI nor CUI", () => {
    const x = s({ infoFlowed: "none", status: null, clauseFlowedDown: false, checkedOn: null });
    expect(supplierIssues(x, TODAY)).toEqual([]);
    expect(needsFlowdown(x)).toBe(false);
    expect(checkSuppliers([x], TODAY)).toMatchObject({ flowdown: 0, ready: 0 });
  });
  it("leaves COTS out of the clause with one note", () => {
    const x = s({ cots: true, status: null, clauseFlowedDown: false });
    const issues = supplierIssues(x, TODAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("note");
    expect(issues[0]?.message).toContain("(f)(1)");
  });
  it("refuses Level 1 for CUI", () => {
    expect(gaps(s({ requiredLevel: "l1_self" }))[0]).toContain("Level 1 covers FCI only");
  });
  it("asks for the level when none is chosen, naming the minimum 32 CFR 170.23 sets", () => {
    expect(gaps(s({ requiredLevel: null }))[0]).toBe(
      "Acme Anodizing: choose the CMMC level you flow down. 32 CFR 170.23(a)(2) makes it at least CMMC Level 2 (Self), or CMMC Level 2 (C3PAO) if your prime contract requires Level 2 (C3PAO) or Level 3 (DIBCAC).",
    );
    expect(gaps(s({ infoFlowed: "fci", requiredLevel: null, status: "final_l1_self" }))[0]).toBe(
      "Acme Anodizing: choose the CMMC level you flow down. 32 CFR 170.23(a)(1) makes it CMMC Level 1 (Self).",
    );
  });
  it("notes a level above Level 1 for FCI only, without calling it a gap", () => {
    const issues = supplierIssues(s({ infoFlowed: "fci" }), TODAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "note" });
    expect(issues[0]?.message).toContain("170.23(a)(1)");
  });
  it("names a status below the level flowed down", () => {
    expect(gaps(s({ status: "final_l1_self" }))[0]).toBe(
      "Acme Anodizing: Final Level 1 (Self) is below the CMMC Level 2 (Self) you flow down.",
    );
  });
  it("names a Conditional status that ran out and says what it needs", () => {
    const g = gaps(
      s({ status: "conditional_l2_self", statusDate: "2026-01-01", affirmedOn: "2026-01-01" }),
    );
    expect(g).toContain(
      "Acme Anodizing: not current since 2026-07-01: its Conditional status is over 180 days old; it needs a POA&M closeout to reach Final.",
    );
  });
  it("names an old affirmation", () => {
    const g = gaps(s({ statusDate: "2025-01-01", affirmedOn: "2025-01-01" }));
    expect(g.join(" ")).toContain("latest affirmation is over a year old");
  });
  it("warns 60 days ahead", () => {
    const x = s({ affirmedOn: "2026-01-10", statusDate: "2026-01-10" });
    const soon = supplierIssues(x, TODAY).filter((i) => i.kind === "soon");
    expect(soon[0]?.message).toContain("through 2027-01-10 (45 days)");
    expect(soon[0]?.message).toContain("new affirmation");
    expect(checkSuppliers([x], TODAY).ready).toBe(1);
  });
  it("asks for the clause, the check, and a check before award", () => {
    expect(gaps(s({ clauseFlowedDown: false })).join(" ")).toContain("(f)(1)");
    expect(gaps(s({ checkedOn: null })).join(" ")).toContain("(f)(2)");
    expect(gaps(s({ checkedOn: "2026-04-01" })).join(" ")).toContain(
      "after the award on 2026-03-15",
    );
  });
  it("notes that Level 1 needs a Final status for award", () => {
    const x = s({
      infoFlowed: "fci",
      requiredLevel: "l1_self",
      status: "conditional_l2_self",
      statusDate: "2026-10-01",
      affirmedOn: "2026-10-01",
    });
    const notes = supplierIssues(x, TODAY).filter((i) => i.kind === "note");
    expect(notes[0]?.message).toContain("204.7502(b)(2)");
  });
  it("puts gaps first", () => {
    const list = [s({ id: "a", name: "A", cots: true }), s({ id: "b", name: "B", status: null })];
    const kinds = checkSuppliers(list, TODAY).issues.map((i) => i.kind);
    expect(kinds).toEqual(["gap", "note"]);
  });
});

describe("validation", () => {
  const base = {
    infoFlowed: "cui" as const,
    requiredLevel: "l2_self" as const,
    status: "final_l2_self" as const,
    statusDate: "2026-03-01",
    affirmedOn: "2026-03-01",
    cmmcUids: "AB12CD34EF, ZZ00YY11XX",
    checkedOn: "2026-03-10",
    awardedOn: null,
  };
  it("accepts a good record", () => {
    expect(validateSupplier(base, TODAY)).toEqual([]);
  });
  it("refuses future and impossible dates", () => {
    expect(validateSupplier({ ...base, checkedOn: "2026-12-01" }, TODAY)).toEqual([
      "Date you checked the status cannot be in the future.",
    ]);
    expect(validateSupplier({ ...base, awardedOn: "2026-02-30" }, TODAY)).toEqual([
      "Award date must be a date (YYYY-MM-DD).",
    ]);
  });
  it("refuses an affirmation before the status date", () => {
    expect(validateSupplier({ ...base, affirmedOn: "2026-02-01" }, TODAY)[0]).toContain(
      "cannot be before the CMMC Status Date",
    );
  });
  it("refuses a date with no status", () => {
    expect(validateSupplier({ ...base, status: null }, TODAY)).toEqual([
      "Choose the status that CMMC Status Date belongs to.",
    ]);
  });
  it("checks each UID is 10 letters and digits", () => {
    expect(parseUids(" AB12CD34EF;ZZ00YY11XX ,")).toEqual(["AB12CD34EF", "ZZ00YY11XX"]);
    expect(validateSupplier({ ...base, cmmcUids: "AB12-CD34" }, TODAY)[0]).toContain(
      "is not a CMMC UID",
    );
  });
});

describe("CSV", () => {
  it("writes one row per supplier with its current-through date and guards formulas", () => {
    const csv = suppliersCsv(
      [
        {
          ...s(),
          name: "=HYPERLINK(1)",
          supplies: "Type II anodize, black",
          subcontractRef: "PO 1042",
          notes: "",
        },
      ],
      TODAY,
    );
    const [head, row] = csv.trim().split("\r\n");
    expect(head?.split(",")[8]).toBe("Current through");
    expect(row).toContain("'=HYPERLINK(1)");
    expect(row).toContain('"Type II anodize, black"');
    expect(row).toContain("2027-03-01");
  });
});

describe("current-through dates for the calendar", () => {
  it("groups by date and part, counts only suppliers the clause applies to, never names", () => {
    const due = supplierDueDates(
      [
        s({ id: "a", name: "A" }),
        s({ id: "b", name: "B" }),
        s({
          id: "c",
          name: "C",
          status: "conditional_l2_self",
          statusDate: "2026-10-01",
          affirmedOn: "2026-10-02",
        }),
        s({ id: "d", name: "D", cots: true }),
        s({ id: "e", name: "E", infoFlowed: "none" }),
        s({ id: "f", name: "F", status: null, statusDate: null, affirmedOn: null }),
      ],
      TODAY,
    );
    expect(due).toEqual(
      [
        { part: "status", through: "2027-03-30", suppliers: 1 },
        { part: "affirmation", through: "2027-03-01", suppliers: 2 },
        { part: "affirmation", through: "2027-10-02", suppliers: 1 },
        { part: "status", through: "2029-03-01", suppliers: 2 },
      ].sort((x, y) => x.through.localeCompare(y.through) || x.part.localeCompare(y.part)),
    );
    expect(JSON.stringify(due)).not.toContain('"A"');
  });

  it("keeps a date already passed, so an overdue renewal still shows", () => {
    const due = supplierDueDates(
      [s({ affirmedOn: "2025-06-01", statusDate: "2025-06-01" })],
      TODAY,
    );
    expect(due).toContainEqual({ part: "affirmation", through: "2026-06-01", suppliers: 1 });
  });
});

describe("dashboard attention list", () => {
  it("lists not current first, then due soon, then unknown, and skips current and out-of-scope", () => {
    const list = supplierAttention(
      [
        s({ id: "ok", name: "Current Co" }),
        s({ id: "soon", name: "Soon Co", affirmedOn: "2025-12-20", statusDate: "2025-12-20" }),
        s({ id: "late", name: "Late Co", affirmedOn: "2025-01-01", statusDate: "2025-01-01" }),
        s({ id: "none", name: "Blank Co", status: null, statusDate: null, affirmedOn: null }),
        s({
          id: "cots",
          name: "Bolt Co",
          cots: true,
          affirmedOn: "2020-01-01",
          statusDate: "2020-01-01",
        }),
      ],
      TODAY,
    );
    expect(list.map((a) => [a.supplierId, a.state, a.through])).toEqual([
      ["late", "not_current", "2026-01-01"],
      ["soon", "due_soon", "2026-12-20"],
      ["none", "unknown", null],
    ]);
  });
});
