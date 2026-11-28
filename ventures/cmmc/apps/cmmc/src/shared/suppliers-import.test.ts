import { describe, expect, it } from "vitest";
import { suppliersCsv } from "./suppliers";
import {
  parseInfoFlowed,
  parseSupplierLevel,
  parseSupplierStatus,
  parseYesNo,
  planSupplierImport,
} from "./suppliers-import";

const TODAY = "2026-11-28";

describe("cell readers", () => {
  it("reads what the order sends only from words that say it", () => {
    expect(parseInfoFlowed("CUI")).toBe("cui");
    expect(parseInfoFlowed("FCI only (contract information, no CUI)")).toBe("fci");
    expect(parseInfoFlowed("NONE")).toBe("none");
    expect(parseInfoFlowed("Neither")).toBe("none");
    expect(parseInfoFlowed("Controlled Unclassified Information")).toBe("cui");
    expect(parseInfoFlowed("drawings")).toBeNull();
    expect(parseInfoFlowed("")).toBeNull();
  });

  it("reads yes and no", () => {
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo("x")).toBe(true);
    expect(parseYesNo("✓")).toBe(true);
    expect(parseYesNo("no")).toBe(false);
    expect(parseYesNo("maybe")).toBeNull();
  });

  it("reads levels, and never picks Level 2's assessor", () => {
    expect(parseSupplierLevel("CMMC Level 2 (Self)")).toBe("l2_self");
    expect(parseSupplierLevel("L2 C3PAO")).toBe("l2_c3pao");
    expect(parseSupplierLevel("Level 1")).toBe("l1_self");
    expect(parseSupplierLevel("CMMC Level 3 (DIBCAC)")).toBe("l3_dibcac");
    expect(parseSupplierLevel("Level 2")).toBeNull();
    expect(parseSupplierLevel("Level 1 (C3PAO)")).toBeNull();
  });

  it("reads the seven statuses and refuses an ASL's approval words", () => {
    expect(parseSupplierStatus("Final Level 2 (C3PAO)")).toBe("final_l2_c3pao");
    expect(parseSupplierStatus("Conditional L2 Self")).toBe("conditional_l2_self");
    expect(parseSupplierStatus("Level 1 self")).toBe("final_l1_self");
    expect(parseSupplierStatus("Conditional Level 1")).toBeNull();
    expect(parseSupplierStatus("Final Level 3 (DIBCAC)")).toBe("final_l3_dibcac");
    expect(parseSupplierStatus("Level 2 (Self)")).toBeNull();
    expect(parseSupplierStatus("Approved")).toBeNull();
    expect(parseSupplierStatus("Conditional")).toBeNull();
  });
});

describe("planSupplierImport", () => {
  it("reads a typical approved-supplier list under a title block", () => {
    const csv = [
      "Approved Supplier List,,,,",
      "Rev C,,,,",
      "Supplier Name,Process,Status,CUI?,CMMC Status,PO Number",
      "Acme Anodizing,Type II anodize,Approved,Yes,Final Level 2 (Self),PO 1042",
      "Bob's Bead Blast,Bead blast,Conditional,No,,",
      "Steel Depot,Bar stock,Approved,,,",
    ].join("\n");
    const p = planSupplierImport(csv, TODAY);
    expect(p.columns.name).toBe("Supplier Name");
    expect(p.columns.supplies).toBe("Process");
    expect(p.columns.infoFlowed).toBe("CUI?");
    expect(p.columns.status).toBe("CMMC Status");
    expect(p.columns.subcontractRef).toBe("PO Number");
    expect(p.rows.map((r) => [r.line, r.name, r.infoFromFile])).toEqual([
      [4, "Acme Anodizing", "cui"],
      [5, "Bob's Bead Blast", null],
      [6, "Steel Depot", null],
    ]);
    expect(p.rows[0]?.fields).toMatchObject({
      supplies: "Type II anodize",
      status: "final_l2_self",
      subcontractRef: "PO 1042",
    });
    // The approval column ("Status") is not the CMMC status.
    expect(p.rows[1]?.fields.status).toBeUndefined();
    expect(p.issues).toEqual([]);
  });

  it("reads this register's own export back unchanged", () => {
    const item = {
      id: "sup_1",
      name: "Acme Anodizing",
      supplies: 'Type II anodize, with "quotes"',
      infoFlowed: "cui" as const,
      cots: false,
      requiredLevel: "l2_c3pao" as const,
      status: "conditional_l2_c3pao" as const,
      statusDate: "2026-10-01",
      affirmedOn: "2026-10-02",
      cmmcUids: "AB12CD34EF ZZ99YY88XX",
      clauseFlowedDown: true,
      subcontractRef: "PO 1042",
      checkedOn: "2026-10-03",
      awardedOn: "2026-10-04",
      notes: "=SUM(A1)\nsecond line",
    };
    const p = planSupplierImport(suppliersCsv([item], TODAY), TODAY);
    expect(p.issues).toEqual([]);
    expect(p.rows).toHaveLength(1);
    const r = p.rows[0];
    expect(r?.infoFromFile).toBe("cui");
    expect(r?.fields).toEqual({
      supplies: item.supplies,
      infoFlowed: "cui",
      cots: false,
      requiredLevel: "l2_c3pao",
      status: "conditional_l2_c3pao",
      statusDate: "2026-10-01",
      affirmedOn: "2026-10-02",
      cmmcUids: "AB12CD34EF ZZ99YY88XX",
      clauseFlowedDown: true,
      subcontractRef: "PO 1042",
      checkedOn: "2026-10-03",
      awardedOn: "2026-10-04",
      notes: "=SUM(A1)\nsecond line",
    });
  });

  it("leaves out unreadable cells one field at a time, never the row", () => {
    const csv = [
      "Vendor,Information flowed,Level flowed down,CMMC Status Date,Checked on,CMMC UIDs,COTS",
      "Acme,CUI,Level 2,soon,2027-01-01,SHORT,perhaps",
    ].join("\n");
    const p = planSupplierImport(csv, TODAY);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]?.fields).toEqual({ infoFlowed: "cui" });
    const text = p.issues.map((i) => i.message).join(" | ");
    expect(text).toContain('"Level 2" is not a level');
    expect(text).toContain('"soon" in CMMC Status Date is not a date');
    expect(text).toContain("checked on 2027-01-01 is in the future");
    expect(text).toContain('"SHORT" is not a CMMC UID');
    expect(text).toContain('"perhaps" in COTS is not yes or no');
    expect(p.issues.every((i) => i.line === 2)).toBe(true);
  });

  it("reads numeric dates day first when the file shows it, and as chosen", () => {
    const csv = ["Supplier,Checked on,Awarded on", "A,31/10/2026,03/11/2026"].join("\n");
    const p = planSupplierImport(csv, TODAY);
    expect(p.dates).toMatchObject({ order: "dmy", source: "detected" });
    expect(p.rows[0]?.fields).toMatchObject({ checkedOn: "2026-10-31", awardedOn: "2026-11-03" });
    const q = planSupplierImport(["Supplier,Checked on", "A,03/11/2026"].join("\n"), TODAY);
    expect(q.rows[0]?.fields.checkedOn).toBe("2026-03-11");
    const r = planSupplierImport(["Supplier,Checked on", "A,03/11/2026"].join("\n"), TODAY, "dmy");
    expect(r.rows[0]?.fields.checkedOn).toBe("2026-11-03");
  });

  it("keeps the first of two rows with the same name and refuses a file with no name column", () => {
    const p = planSupplierImport(["Supplier", "Acme Inc.", "ACME inc", ""].join("\n"), TODAY);
    expect(p.rows.map((r) => r.name)).toEqual(["Acme Inc."]);
    expect(p.issues[0]?.message).toContain("same supplier name as line 2");
    const q = planSupplierImport("Part,Qty\nA,1\n", TODAY);
    expect(q.rows).toEqual([]);
    expect(q.issues[0]?.message).toContain("No header row with a supplier name");
  });

  it("leaves out a row whose cell is a formula saved without its result", () => {
    const p = planSupplierImport(["Supplier,Notes", "A,#UNCALCULATED"].join("\n"), TODAY);
    expect(p.rows).toEqual([]);
    expect(p.issues[0]?.message).toContain("formula saved without its result");
  });
});
