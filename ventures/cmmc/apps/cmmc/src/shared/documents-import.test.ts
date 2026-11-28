import { describe, expect, it } from "vitest";
import { masterListCsv } from "./document-control";
import {
  kindFromTitle,
  parseDocKind,
  parseDocOrigin,
  parseDocStatus,
  parseReviewMonths,
  planDocumentImport,
} from "./documents-import";

const TODAY = "2026-11-28";

// A master list as a small shop keeps it in Excel: a title block, its own header words, US dates.
const SHOP_LIST = [
  "Acme Precision - Master Document List,,,,,,,,",
  "Controlled copy: Quality office,,,,,,,,",
  ",,,,,,,,",
  "Doc No,Document Title,Type,Rev,Status,Approved By,Rev Date,Review Frequency,Location",
  "QM-001,Quality Manual,Manual,C,Active,Pat Lee,03/14/2025,Annual,Q:/Quality/QM-001.pdf",
  "QP-7.5-01,Control of Documented Information,Procedure,B,Active,Pat Lee,1/9/2024,2 years,Q:/Quality/QP",
  "WI-210,Deburr Work Instruction,,A,Draft,,,,Shop binder",
  "F-820,Receiving Inspection Checklist,,D,Active,Sam Ortiz,7/2/2023,As needed,Receiving bench",
  "QP-8.7-01,Nonconforming Product,Procedure,A,Obsolete,Pat Lee,2/1/2020,,Archive",
  "QP-9.9,Process Without Date,Procedure,A,Active,,,,",
].join("\n");

describe("cells", () => {
  it("reads types from the words shops use", () => {
    expect(parseDocKind("Manual")).toBe("quality_manual");
    expect(parseDocKind("SOP")).toBe("procedure");
    expect(parseDocKind("WI")).toBe("work_instruction");
    expect(parseDocKind("Work Instruction")).toBe("work_instruction");
    expect(parseDocKind("Form / Checklist")).toBe("form");
    expect(parseDocKind("Customer spec")).toBe("specification");
    expect(parseDocKind("Drawing")).toBe("drawing");
    expect(parseDocKind("Record template")).toBe("record_template");
    expect(parseDocKind("Policy")).toBeNull();
  });
  it("reads a type from a title only when the title names it", () => {
    expect(kindFromTitle("Receiving Inspection Checklist")).toBe("form");
    expect(kindFromTitle("Quality Manual")).toBe("quality_manual");
    expect(kindFromTitle("Manual deburring")).toBeNull();
    expect(kindFromTitle("Control of Documented Information")).toBeNull();
  });
  it("reads statuses, origins and review intervals, and nothing else", () => {
    expect(parseDocStatus("Active")).toBe("released");
    expect(parseDocStatus("In Review")).toBe("draft");
    expect(parseDocStatus("Superseded by rev C")).toBe("obsolete");
    expect(parseDocStatus("Maybe")).toBeNull();
    expect(parseDocOrigin("External")).toBe("external");
    expect(parseDocOrigin("Customer")).toBe("external");
    expect(parseDocOrigin("In-house")).toBe("internal");
    expect(parseDocOrigin("Both")).toBeNull();
    expect(parseReviewMonths("Annual")).toBe(12);
    expect(parseReviewMonths("Every 2 years")).toBe(24);
    expect(parseReviewMonths("36 months")).toBe(36);
    expect(parseReviewMonths("As needed")).toBe("none");
    expect(parseReviewMonths("18 months")).toBeNull();
  });
});

describe("planDocumentImport", () => {
  const plan = planDocumentImport(SHOP_LIST, TODAY);
  const row = (n: string) => plan.rows.find((r) => r.docNumber === n);

  it("finds the header under a title block and maps the shop's own words", () => {
    expect(plan.columns).toMatchObject({
      docNumber: "Doc No",
      title: "Document Title",
      kind: "Type",
      revision: "Rev",
      status: "Status",
      approvedBy: "Approved By",
      approvedOn: "Rev Date",
      reviewMonths: "Review Frequency",
      location: "Location",
    });
    expect(plan.rows.map((r) => r.line)).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it("releases a revision only with its approval date", () => {
    expect(row("QM-001")).toMatchObject({
      kind: "quality_manual",
      kindSource: "file",
      status: "released",
      revision: "C",
      approvedOn: "2025-03-14",
      approvedByName: "Pat Lee",
      reviewMonths: 12,
    });
    expect(row("QP-7.5-01")).toMatchObject({ approvedOn: "2024-01-09", reviewMonths: 24 });
    expect(row("QP-9.9")).toMatchObject({ status: "draft", approvedOn: null });
    expect(plan.issues.map((i) => i.message)).toContain(
      "QP-9.9: revision A and no approval date, so it comes in as a draft; release it with its approval date.",
    );
  });

  it("keeps drafts as drafts, obsolete as obsolete, and takes the type from the title", () => {
    expect(row("WI-210")).toMatchObject({
      status: "draft",
      kind: "work_instruction",
      kindSource: "title",
      approvedByName: "",
    });
    expect(row("F-820")).toMatchObject({ kind: "form", kindSource: "title", reviewMonths: null });
    expect(row("QP-8.7-01")).toMatchObject({ status: "obsolete", withdrawnOn: null });
  });

  it("refuses future dates, unknown intervals and duplicate numbers with a note each", () => {
    const p = planDocumentImport(
      [
        "Document number,Title,Revision,Approved on,Review every,Effective on",
        "QP-1,One,A,2027-01-01,12,",
        "QP-2,Two,B,2026-01-05,18 months,2026-01-01",
        "qp-1,Duplicate,A,2026-01-01,,",
        "QP-3,,A,2026-01-01,,",
      ].join("\n"),
      TODAY,
    );
    expect(p.rows.map((r) => [r.docNumber, r.status, r.reviewMonths, r.effectiveOn])).toEqual([
      ["QP-1", "draft", 12, null],
      ["QP-2", "released", null, null],
    ]);
    const text = p.issues.map((i) => i.message).join("\n");
    expect(text).toContain("approved on 2027-01-01 is in the future");
    expect(text).toContain('"18 months" is not a review interval');
    expect(text).toContain("effective on 2026-01-01 is before approved on 2026-01-05");
    expect(text).toContain("same document number as line 2");
    expect(text).toContain("The row has no title");
  });

  it("reads an external document's issuer and leaves out one with no issuer", () => {
    const p = planDocumentImport(
      [
        "Doc No,Title,Origin,Issued by,Rev,Release date",
        "DWG-4471,Bracket,External,Boeing,F,2026-02-02",
        "SPEC-1,Anodize spec,Customer,,C,2026-02-02",
      ].join("\n"),
      TODAY,
    );
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ origin: "external", issuer: "Boeing", status: "released" });
    expect(p.issues.map((i) => i.message).join(" ")).toContain("SPEC-1: Say who issues");
  });

  it("asks for a header it can find", () => {
    const p = planDocumentImport("Name,Thing\nA,B", TODAY);
    expect(p.rows).toEqual([]);
    expect(p.issues[0]?.message).toContain("No header row with a document number and a title");
  });

  it("reads this register's own export back, a draft over a release included", () => {
    const docs = [
      {
        id: "d1",
        docNumber: "QP-7.5-01",
        title: "Control of documented information",
        kind: "procedure" as const,
        origin: "internal" as const,
        revision: "C",
        status: "draft" as const,
        releasedRevision: "B",
        issuer: "",
        location: "Q drive",
        ownerUserId: "u1",
        approvedBy: "u1",
        approvedOn: "2026-03-01",
        effectiveOn: "2026-03-05",
        reviewMonths: 12,
        reviewDue: "2027-03-01",
        notes: "=not a formula",
      },
      {
        id: "d2",
        docNumber: "DWG-9",
        title: "Customer drawing",
        kind: "drawing" as const,
        origin: "external" as const,
        revision: "A",
        status: "obsolete" as const,
        releasedRevision: "A",
        issuer: "Prime Co",
        location: "",
        ownerUserId: null,
        approvedBy: null,
        approvedOn: "2025-01-01",
        effectiveOn: "2025-01-01",
        reviewMonths: null,
        reviewDue: null,
        notes: "",
      },
    ];
    const csv = masterListCsv(docs, (id) => (id ? "Pat Lee" : ""), TODAY);
    const p = planDocumentImport(csv, TODAY);
    expect(p.rows.map((r) => [r.docNumber, r.status, r.revision, r.approvedOn])).toEqual([
      ["DWG-9", "obsolete", "A", "2025-01-01"],
      ["QP-7.5-01", "released", "B", "2026-03-01"],
    ]);
    const qp = p.rows.find((r) => r.docNumber === "QP-7.5-01");
    expect(qp).toMatchObject({
      kind: "procedure",
      kindSource: "file",
      approvedByName: "Pat Lee",
      ownerName: "Pat Lee",
      effectiveOn: "2026-03-05",
      reviewDue: "2027-03-01",
      reviewMonths: 12,
      location: "Q drive",
      notes: "=not a formula",
    });
    expect(p.rows.find((r) => r.docNumber === "DWG-9")).toMatchObject({
      origin: "external",
      issuer: "Prime Co",
    });
    expect(p.issues.map((i) => i.message)).toContain(
      'QP-7.5-01: revision C in draft is not imported; start it again with "Start rev" on the document.',
    );
  });
});
