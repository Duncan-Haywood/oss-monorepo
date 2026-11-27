import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assetsCsv } from "./assets";
import {
  assetKey,
  parseAssetCategory,
  parseSpecializedType,
  planAssetImport,
  planWorksheetJson,
} from "./assets-import";

const worksheet = readFileSync(
  new URL("../../test/fixtures/scoping-worksheet-example.csv", import.meta.url),
  "utf8",
);

describe("parseAssetCategory", () => {
  it("reads this app's labels, the worksheet's and short forms", () => {
    expect(parseAssetCategory("CUI Assets")).toBe("cui");
    expect(parseAssetCategory("cui asset")).toBe("cui");
    expect(parseAssetCategory("Security Protection Asset")).toBe("security_protection");
    expect(parseAssetCategory("SPA")).toBe("security_protection");
    expect(parseAssetCategory("Contractor Risk Managed Assets")).toBe("contractor_risk_managed");
    expect(parseAssetCategory("crma")).toBe("contractor_risk_managed");
    expect(parseAssetCategory("Specialised asset")).toBe("specialized");
    expect(parseAssetCategory("Out-of-Scope Asset")).toBe("out_of_scope");
    expect(parseAssetCategory("out of scope")).toBe("out_of_scope");
    expect(parseAssetCategory("Not resolved")).toBe("unresolved");
  });
  it("never guesses from anything else", () => {
    expect(parseAssetCategory("Laptop")).toBeNull();
    expect(parseAssetCategory("In scope (FCI)")).toBeNull();
    expect(parseAssetCategory("")).toBeNull();
  });
});

describe("parseSpecializedType", () => {
  it("reads one kind, never a pair", () => {
    expect(parseSpecializedType("OT")).toBe("ot");
    expect(parseSpecializedType("Operational Technology (OT)")).toBe("ot");
    expect(parseSpecializedType("Test Equipment")).toBe("test_equipment");
    expect(parseSpecializedType("CMM or other inspection / test equipment")).toBe("test_equipment");
    expect(parseSpecializedType("Industrial Internet of Things (IIoT) device")).toBe("iiot");
    expect(
      parseSpecializedType("IoT / IIoT device (machine monitoring, cameras, badge readers)"),
    ).toBeNull();
  });
});

describe("planAssetImport", () => {
  it("round-trips this app's own CSV export, formula guard included", () => {
    const csv = assetsCsv([
      {
        id: "a",
        name: "=Mill 1",
        category: "specialized",
        specializedType: "ot",
        assetType: "CNC controller",
        location: "Cell 1",
        provider: "",
        owner: "Shop lead",
        notes: "Air-gapped; DNC over a\nseparate VLAN",
      },
      {
        id: "b",
        name: "Office 365, GCC High",
        category: "cui",
        specializedType: null,
        assetType: "Cloud",
        location: "",
        provider: "Microsoft",
        owner: "Owner",
        notes: "",
      },
    ]);
    const plan = planAssetImport(csv);
    expect(plan.issues).toEqual([]);
    expect(plan.columns).toMatchObject({
      name: "Asset",
      category: "Category (32 CFR 170.19(c))",
      specializedType: "Specialized asset type",
      assetType: "Type",
      provider: "Provided by",
    });
    expect(plan.rows).toEqual([
      {
        line: 2,
        name: "=Mill 1",
        category: "specialized",
        specializedType: "ot",
        assetType: "CNC controller",
        location: "Cell 1",
        owner: "Shop lead",
        notes: "Air-gapped; DNC over a\nseparate VLAN",
      },
      {
        line: 3,
        name: "Office 365, GCC High",
        category: "cui",
        specializedType: null,
        assetType: "Cloud",
        provider: "Microsoft",
        owner: "Owner",
      },
    ]);
  });

  it("reads the public scoping worksheet's CSV export", () => {
    const plan = planAssetImport(worksheet);
    const byName = new Map(plan.rows.map((r) => [r.name, r]));
    expect(plan.rows).toHaveLength(11);
    expect(byName.get("Mill 1 controller")).toMatchObject({
      category: "specialized",
      specializedType: "ot",
      assetType: "CNC machine controller or DNC system",
    });
    expect(byName.get("CMM")).toMatchObject({ specializedType: "test_equipment" });
    expect(byName.get("Firewall")?.category).toBe("security_protection");
    expect(byName.get("Office printer")).toMatchObject({
      category: "contractor_risk_managed",
      notes: expect.stringMatching(/^Policy: CUI prints only/),
    });
    expect(byName.get("Front office PC")).toMatchObject({
      category: "out_of_scope",
      notes: expect.stringMatching(/^Separation: On the guest/),
    });
    expect(plan.issues).toEqual([
      { line: 13, message: expect.stringContaining('Owner\'s phone is "Not resolved"') },
    ]);
  });

  it("lists rows it cannot read instead of guessing", () => {
    const plan = planAssetImport(
      [
        "Inventory for Acme (invented)",
        "",
        "Hostname,Category,Device type,Notes",
        "CAD-1,CUI,Workstation,",
        "Badge reader,Specialized,IoT / IIoT device,",
        "Camera,Specialized,,",
        "Front PC,,Workstation,",
        "Kiosk,Public,Workstation,",
        ",CUI,,",
        "cad-1,Out of scope,Workstation,dupe",
        "NAS,CUI,=SUM(A1),",
        "Haas,Specialized,OT,",
        "FW,SPA,Firewall,#UNCALCULATED",
      ].join("\n"),
    );
    expect(plan.rows.map((r) => [r.line, r.name, r.category, r.specializedType])).toEqual([
      [4, "CAD-1", "cui", null],
      [11, "NAS", "cui", null],
      [12, "Haas", "specialized", "ot"],
    ]);
    const lines = plan.issues.map((i) => i.line);
    expect(lines).toEqual([5, 6, 7, 8, 9, 10, 13]);
    expect(plan.issues[0]?.message).toContain('"IoT / IIoT device" does not name one');
    expect(plan.issues[2]?.message).toContain("never guesses");
    expect(plan.issues[5]?.message).toContain("Same asset name as line 4");
  });

  it("drops a specialized type on another category, and says so", () => {
    const plan = planAssetImport("Asset,Category,Specialized asset type\nPC,CUI,OT\n");
    expect(plan.rows[0]).toMatchObject({ category: "cui", specializedType: null });
    expect(plan.issues[0]?.message).toContain("only kept for specialized assets");
  });

  it("needs a name and a category header", () => {
    const plan = planAssetImport("Device,Owner\nPC,Bob\n");
    expect(plan.rows).toEqual([]);
    expect(plan.issues[0]?.message).toContain('"Asset" and "Category"');
  });

  it("matches names ignoring case and punctuation", () => {
    expect(assetKey("CAM-01")).toBe(assetKey("cam 01"));
  });
});

describe("the scoping worksheet's saved file (JSON)", () => {
  const json = readFileSync(
    new URL("../../test/fixtures/scoping-worksheet-example.json", import.meta.url),
    "utf8",
  );

  it("classifies each asset as the worksheet does and agrees with its CSV export", () => {
    const plan = planAssetImport(json);
    expect(plan.format).toBe("worksheet-json");
    const got = Object.fromEntries(plan.rows.map((r) => [r.name, [r.category, r.specializedType]]));
    expect(got).toEqual({
      "M365 GCC High (CUI mail and files)": ["cui", null],
      "CAM-01": ["cui", null],
      "CAM-02": ["cui", null],
      "DNC server": ["cui", null],
      "Mill 1 controller": ["specialized", "ot"],
      CMM: ["specialized", "test_equipment"],
      Firewall: ["security_protection", null],
      "MFA and endpoint protection": ["security_protection", null],
      "MSP remote monitoring (logs, config)": ["security_protection", null],
      "Office printer": ["contractor_risk_managed", null],
      "Front office PC": ["out_of_scope", null],
    });
    // The CSV the worksheet exports for the same example shop imports the same twelve-minus-one.
    const fromCsv = planAssetImport(worksheet);
    for (const r of fromCsv.rows) expect(got[r.name]).toEqual([r.category, r.specializedType]);
    expect(fromCsv.rows).toHaveLength(plan.rows.length);
  });

  it("keeps the worksheet's fields and puts policy and separation in the notes", () => {
    const plan = planAssetImport(json);
    const printer = plan.rows.find((r) => r.name === "Office printer");
    expect(printer).toMatchObject({
      line: 10,
      assetType: "Printer, scanner or copier",
      owner: "Office",
      notes:
        "Policy: CUI prints only on the shop-floor printer in the enclave; office printer blocked from the CUI VLAN.",
    });
    expect(plan.rows.find((r) => r.name === "Front office PC")?.notes).toMatch(/^Separation: /);
    expect(plan.rows.find((r) => r.name === "Mill 1 controller")?.location).toBe("Cell 1");
  });

  it("lists unresolved assets with the worksheet's open question, and an IoT/IIoT kind, never guessed", () => {
    const plan = planAssetImport(json);
    const msgs = plan.issues.map((i) => `${i.line}: ${i.message}`);
    expect(msgs).toContainEqual(
      expect.stringMatching(/^12: Owner's phone is "Not resolved".*policy/),
    );
    expect(msgs).toContainEqual(expect.stringMatching(/^13: Spindle monitor .*IoT and IIoT/));
    expect(msgs).toContainEqual(expect.stringMatching(/^14: USB stick .*handles CUI/));
  });

  it("refuses other JSON and broken JSON with a reason", () => {
    expect(planAssetImport('{"assets": []}').issues[0]?.message).toMatch(
      /not one the CMMC scoping worksheet saved/,
    );
    expect(planAssetImport('{"format": ').issues[0]?.message).toMatch(/could not be read/);
    expect(planAssetImport('{"format": ').rows).toEqual([]);
  });

  it("notes a Level 1 file, a newer version, unnamed and duplicate assets", () => {
    const plan = planWorksheetJson(
      JSON.stringify({
        format: "machine-shop-guides/cmmc-scope",
        version: 2,
        level: "1",
        assets: [
          { name: "PC", kind: "workstation", cui: "yes" },
          { name: "", kind: "workstation", cui: "yes" },
          { name: " pc ", kind: "workstation", cui: "cannot" },
        ],
      }),
    );
    expect(plan.rows.map((r) => [r.line, r.name, r.category])).toEqual([[1, "PC", "cui"]]);
    const text = plan.issues.map((i) => i.message).join("\n");
    expect(text).toMatch(/newer version/);
    expect(text).toMatch(/saved at Level 1/);
    expect(text).toMatch(/no name/);
    expect(text).toMatch(/Same asset name as asset 1/);
  });

  it("starts with a byte-order mark or whitespace and still reads", () => {
    expect(planAssetImport(`\uFEFF  ${json}`).rows).toHaveLength(11);
  });
});
