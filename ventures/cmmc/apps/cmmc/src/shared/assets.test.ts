import { describe, expect, it } from "vitest";
import {
  ASSET_CATEGORIES,
  ASSET_RULE_VERIFICATION,
  type AssetCsvRow,
  assetsCsv,
  CATEGORY_INFO,
  categoryProblem,
  checkInventory,
  DIAGRAM_CATEGORIES,
  NETWORK_DIAGRAM_QUOTE,
  SPECIALIZED_LABEL,
} from "./assets";

const a = (over: Partial<AssetCsvRow>): AssetCsvRow => ({
  id: "ast_1",
  name: "Asset",
  category: "cui",
  specializedType: null,
  assetType: "",
  location: "",
  provider: "",
  owner: "",
  notes: "",
  ...over,
});

describe("asset categories", () => {
  it("has the five Level 2 categories with the rule's names", () => {
    expect(ASSET_CATEGORIES.map((k) => CATEGORY_INFO[k].label)).toEqual([
      "CUI Assets",
      "Security Protection Assets",
      "Contractor Risk Managed Assets",
      "Specialized Assets",
      "Out-of-Scope Assets",
    ]);
  });

  it("quotes the rule verbatim, as pinned in the public scoping worksheet", () => {
    // Same strings as ventures/machine-shop-guides/scope.mjs QUOTES (public repo), whose test pins
    // them to the eCFR text of 32 CFR 170.19 read on 2026-11-25.
    expect(CATEGORY_INFO.cui.rule).toBe("Assets that process, store, or transmit CUI");
    expect(CATEGORY_INFO.contractor_risk_managed.rule).toBe(
      "Assets that can, but are not intended to, process, store, or transmit CUI because of security policy, procedures, and practices in place",
    );
    expect(CATEGORY_INFO.out_of_scope.rule).toBe(
      "Assets that cannot process, store, or transmit CUI; and do not provide security protections for CUI Assets",
    );
    // Every specialized kind's label appears in the rule's list, in the rule's order.
    const rule = CATEGORY_INFO.specialized.rule;
    const positions = Object.values(SPECIALIZED_LABEL).map((l) =>
      rule.indexOf(l.replace(/ device$/, "")),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(ASSET_RULE_VERIFICATION.readOn).toBe("2026-11-25");
  });

  it("requires a specialized type exactly when the category is specialized", () => {
    expect(categoryProblem("specialized", null)).toMatch(/Choose which kind/);
    expect(categoryProblem("specialized", "test_equipment")).toBeNull();
    expect(categoryProblem("cui", "iot")).toMatch(/Only specialized/);
    expect(categoryProblem("cui", undefined)).toBeNull();
  });
});

describe("checkInventory", () => {
  it("says nothing about an empty inventory beyond the counts", () => {
    const r = checkInventory([]);
    expect(r.total).toBe(0);
    expect(r.issues).toEqual([]);
  });

  it("flags missing CUI and security protection assets and missing notes", () => {
    const r = checkInventory([
      a({ id: "1", name: "Shop PC", category: "contractor_risk_managed" }),
      a({ id: "2", name: "TV", category: "out_of_scope", notes: "No network connection" }),
      a({
        id: "3",
        name: "PLC",
        category: "specialized",
        specializedType: "ot",
      }),
    ]);
    expect(r.counts).toMatchObject({ cui: 0, contractor_risk_managed: 1, out_of_scope: 1 });
    expect(r.issues.map((i) => i.message)).toEqual([
      expect.stringContaining("No CUI asset is listed"),
      expect.stringContaining("No Security Protection Asset"),
      "Shop PC: add a note saying which policies and practices keep CUI off it.",
      "PLC: add a note saying how risk-based practices manage it.",
    ]);
  });

  it("is clean for a complete inventory", () => {
    const r = checkInventory([
      a({ id: "1", name: "Laptop" }),
      a({ id: "2", name: "Firewall", category: "security_protection" }),
    ]);
    expect(r.issues).toEqual([]);
  });

  it("asks for the network diagram only when told none is linked and in-scope assets exist", () => {
    const inScope = [
      a({ id: "1", name: "Laptop" }),
      a({ id: "2", name: "Firewall", category: "security_protection" }),
    ];
    expect(checkInventory(inScope, { hasNetworkDiagram: false }).issues).toEqual([
      {
        assetId: null,
        message: `No network diagram is linked. For every in-scope category the rule says: "${NETWORK_DIAGRAM_QUOTE}" Link the diagram file under Network diagram.`,
      },
    ]);
    expect(checkInventory(inScope, { hasNetworkDiagram: true }).issues).toEqual([]);
    // Not checked when the caller does not say, and never for out-of-scope assets alone.
    expect(checkInventory(inScope).issues).toEqual([]);
    const outOnly = [a({ id: "3", name: "TV", category: "out_of_scope", notes: "Offline" })];
    expect(
      checkInventory(outOnly, { hasNetworkDiagram: false }).issues.map((i) => i.message),
    ).not.toContainEqual(expect.stringContaining("network diagram"));
  });

  it("quotes table 3 for the diagram in every in-scope category", () => {
    expect(NETWORK_DIAGRAM_QUOTE).toBe(
      "Document in the network diagram of the CMMC Assessment Scope.",
    );
    expect([...DIAGRAM_CATEGORIES].sort()).toEqual(
      ASSET_CATEGORIES.filter((k) => k !== "out_of_scope").sort(),
    );
  });
});

describe("assetsCsv", () => {
  it("writes labels, quotes commas and guards formulas", () => {
    const csv = assetsCsv([
      a({
        name: '=HYPERLINK("x")',
        category: "specialized",
        specializedType: "test_equipment",
        notes: "CMM, offline",
      }),
    ]);
    const [header, row] = csv.trimEnd().split("\r\n");
    expect(header).toBe(
      "Asset,Category (32 CFR 170.19(c)),Specialized asset type,Type,Location,Provided by,Owner,Notes",
    );
    expect(row).toBe(`"'=HYPERLINK(""x"")",Specialized Assets,Test Equipment,,,,,"CMM, offline"`);
  });
});
