import { describe, expect, it } from "vitest";
import {
  checkDocuments,
  type DocumentLike,
  docReviewState,
  documentIssues,
  documentReviewDates,
  documentsNeedingReview,
  masterListCsv,
  nextRevision,
  reviewDueFrom,
  validateDocumentFields,
  validateRelease,
} from "./document-control";

const doc = (over: Partial<DocumentLike> = {}): DocumentLike => ({
  id: "doc_1",
  docNumber: "QP-7.5-01",
  title: "Control of documents",
  kind: "procedure",
  origin: "internal",
  revision: "B",
  status: "released",
  releasedRevision: "B",
  issuer: "",
  location: "Shared drive /Quality/Procedures",
  ownerUserId: "usr_q",
  approvedBy: "usr_q",
  approvedOn: "2026-03-01",
  effectiveOn: "2026-03-01",
  reviewMonths: 12,
  reviewDue: "2027-03-01",
  ...over,
});

describe("nextRevision", () => {
  it("counts letters spreadsheet style", () => {
    expect(nextRevision("")).toBe("A");
    expect(nextRevision("A")).toBe("B");
    expect(nextRevision("Z")).toBe("AA");
    expect(nextRevision("AZ")).toBe("BA");
    expect(nextRevision("ZZ")).toBe("AAA");
    expect(nextRevision("c")).toBe("d");
  });
  it("counts numbers keeping their width, and keeps a prefix", () => {
    expect(nextRevision("1")).toBe("2");
    expect(nextRevision("9")).toBe("10");
    expect(nextRevision("01")).toBe("02");
    expect(nextRevision("09")).toBe("10");
    expect(nextRevision("Rev C")).toBe("Rev D");
    expect(nextRevision("1.4")).toBe("1.5");
    expect(nextRevision("Rev-03")).toBe("Rev-04");
  });
  it("gives up on a mixed-case run or nothing to count", () => {
    expect(nextRevision("Rev")).toBeNull();
    expect(nextRevision("B-")).toBeNull();
    expect(nextRevision("NC*")).toBeNull();
  });
});

describe("validateDocumentFields", () => {
  const base = {
    docNumber: "WI-101",
    title: "Deburr sheet parts",
    kind: "work_instruction" as const,
    origin: "internal" as const,
    revision: "A",
    issuer: "",
    location: "",
    reviewMonths: 24,
  };
  it("accepts a plain internal document", () => {
    expect(validateDocumentFields(base)).toEqual([]);
  });
  it("needs a number and title, printable, without edge spaces", () => {
    expect(validateDocumentFields({ ...base, docNumber: "" }).join()).toContain("number");
    expect(validateDocumentFields({ ...base, docNumber: "WI-101\u0007" }).join()).toContain(
      "printable",
    );
    expect(validateDocumentFields({ ...base, revision: " A" }).join()).toContain("revision");
    expect(validateDocumentFields({ ...base, title: "  " }).join()).toContain("title");
  });
  it("needs an issuer for external documents and a listed interval", () => {
    expect(validateDocumentFields({ ...base, origin: "external" }).join()).toContain("who issues");
    expect(validateDocumentFields({ ...base, reviewMonths: 7 }).join()).toContain("12, 24, 36");
    expect(validateDocumentFields({ ...base, reviewMonths: null })).toEqual([]);
  });
});

describe("validateRelease", () => {
  it("refuses future approvals, effect before approval and a missing revision", () => {
    const today = "2026-11-26";
    expect(validateRelease({ revision: "A", approvedOn: today, effectiveOn: null }, today)).toEqual(
      [],
    );
    expect(
      validateRelease({ revision: "A", approvedOn: "2026-11-27", effectiveOn: null }, today).join(),
    ).toContain("future");
    expect(
      validateRelease(
        { revision: "A", approvedOn: "2026-11-20", effectiveOn: "2026-11-19" },
        today,
      ).join(),
    ).toContain("before it is approved");
    expect(
      validateRelease({ revision: "", approvedOn: today, effectiveOn: null }, today).join(),
    ).toContain("revision");
    expect(
      validateRelease({ revision: "A", approvedOn: "2026-02-30", effectiveOn: null }, today).join(),
    ).toContain("must be a date");
  });
});

describe("reviews", () => {
  it("computes the next review date, or none", () => {
    expect(reviewDueFrom("2026-08-31", 12)).toBe("2027-08-31");
    expect(reviewDueFrom("2028-02-29", 12)).toBe("2029-02-28");
    expect(reviewDueFrom("2026-01-01", null)).toBeNull();
  });
  it("reads the review state; obsolete and no-interval documents have none", () => {
    expect(docReviewState(doc(), "2026-11-26")).toBe("current");
    expect(docReviewState(doc(), "2027-01-15")).toBe("due_soon");
    expect(docReviewState(doc(), "2027-03-02")).toBe("overdue");
    expect(docReviewState(doc({ status: "obsolete" }), "2028-01-01")).toBe("none");
    expect(docReviewState(doc({ reviewDue: null }), "2028-01-01")).toBe("none");
  });
});

describe("documentIssues and checkDocuments", () => {
  it("finds nothing wrong with a released, owned, located document", () => {
    expect(documentIssues(doc(), "2026-11-26")).toEqual([]);
  });
  it("flags a never-released internal document as a gap, an external one as a note", () => {
    const draft = doc({
      status: "draft",
      releasedRevision: null,
      approvedBy: null,
      approvedOn: null,
    });
    expect(documentIssues(draft, "2026-11-26").map((i) => i.kind)).toEqual(["gap"]);
    const ext = { ...draft, origin: "external" as const, issuer: "Customer" };
    expect(documentIssues(ext, "2026-11-26").map((i) => i.kind)).toEqual(["note"]);
  });
  it("notes the draft of the next revision while the last stays in force", () => {
    const i = documentIssues(doc({ status: "draft", revision: "C" }), "2026-11-26");
    expect(i).toHaveLength(1);
    expect(i[0]?.message).toContain("revision C in draft; B stays in force");
  });
  it("counts overdue reviews and orders gaps first", () => {
    const list = [
      doc({ id: "a", location: "" }),
      doc({ id: "b", reviewDue: "2026-10-01" }),
      doc({ id: "c", status: "obsolete" }),
      doc({ id: "d", reviewDue: "2026-12-15" }),
    ];
    const c = checkDocuments(list, "2026-11-26");
    expect(c).toMatchObject({
      total: 4,
      active: 3,
      released: 3,
      obsolete: 1,
      reviewOverdue: 1,
      reviewDueSoon: 1,
    });
    expect(c.issues.map((i) => i.kind)).toEqual(["gap", "soon", "note"]);
    expect(c.issues[0]?.message).toBe("QP-7.5-01 Control of documents: review was due 2026-10-01.");
  });
});

describe("review dates and the dashboard list", () => {
  it("counts per date with no titles, skipping obsolete documents", () => {
    const list = [
      doc({ reviewDue: "2027-03-01" }),
      doc({ reviewDue: "2027-03-01" }),
      doc({ reviewDue: "2027-01-01" }),
      doc({ reviewDue: "2026-01-01", status: "obsolete" }),
      doc({ reviewDue: null }),
    ];
    expect(documentReviewDates(list)).toEqual([
      { due: "2027-01-01", documents: 1 },
      { due: "2027-03-01", documents: 2 },
    ]);
  });
  it("lists documents due within the window, overdue first", () => {
    const list = [
      doc({ id: "late", docNumber: "QP-2", reviewDue: "2026-11-01" }),
      doc({ id: "soon", docNumber: "QP-1", reviewDue: "2026-12-20" }),
      doc({ id: "later", reviewDue: "2027-06-01" }),
    ];
    expect(documentsNeedingReview(list, "2026-11-26").map((d) => d.documentId)).toEqual([
      "late",
      "soon",
    ]);
  });
});

describe("masterListCsv", () => {
  it("writes the master list sorted by number, with names and formula guards", () => {
    const csv = masterListCsv(
      [
        {
          ...doc({ docNumber: "WI-2", title: "=HYPERLINK(1)", status: "draft", revision: "C" }),
          notes: "a, b",
        },
        {
          ...doc({ docNumber: "DWG-1", origin: "external", issuer: "Customer", ownerUserId: null }),
          notes: "",
        },
      ],
      (id) => (id === "usr_q" ? "Pat Quality" : ""),
      "2026-11-26",
    );
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Document number,Title,Type,Origin");
    expect(lines[1]).toMatch(
      /^DWG-1,Control of documents,Procedure,External,Customer,B,Released,,Pat Quality/,
    );
    expect(lines[2]).toContain("WI-2,'=HYPERLINK(1),Procedure,Internal,,B,Draft,C,Pat Quality");
    expect(lines[2]).toContain('"a, b"');
  });
});
