import { describe, expect, it } from "vitest";
import {
  type ExhibitReading,
  exhibitLinesFromPdf,
  linesFromPdfText,
  paragraphs,
  readInsuranceExhibit,
} from "./insurance-exhibit";

const M = 100_000_000; // $1,000,000 in cents

const req = (r: ExhibitReading, kind: string) =>
  r.found.find((f) => f.requirement.kind === kind)?.requirement;

// Written for these tests in the shapes GC insurance exhibits take; not copied from any GC's form.
const PROSE = `EXHIBIT C - INSURANCE REQUIREMENTS
Subcontractor shall procure and maintain, at its own expense, the following insurance with
carriers rated A- VII or better by A.M. Best:
1. Commercial General Liability insurance on an occurrence basis with limits of not less than
$1,000,000 per occurrence and $2,000,000 general aggregate, $2,000,000 products-completed
operations aggregate, and $1,000,000 personal and advertising injury.
2. Automobile Liability insurance covering all owned, hired and non-owned vehicles with a combined
single limit of not less than $1,000,000 each accident.
3. Workers' Compensation insurance with statutory limits and Employer's Liability with limits of
$1,000,000 each accident, $1,000,000 disease - each employee and $1,000,000 disease - policy limit.
4. Umbrella/Excess Liability with limits of not less than $5,000,000 each occurrence and aggregate,
following form over the General Liability, Automobile Liability and Employer's Liability policies.
The limits required above may be satisfied by a combination of primary and umbrella or excess policies.
All policies except Workers' Compensation shall name Contractor and Owner as additional insureds,
and such insurance shall be primary and non-contributory.
Subcontractor waives all rights of subrogation, and each policy, including Workers' Compensation, shall
include a waiver of subrogation in favor of Contractor and Owner.`;

describe("readInsuranceExhibit, prose exhibit", () => {
  const r = readInsuranceExhibit(PROSE);

  it("reads each coverage in the order named", () => {
    expect(r.found.map((f) => f.requirement.kind)).toEqual([
      "general_liability",
      "auto",
      "workers_comp",
      "umbrella",
    ]);
  });

  it("reads general liability's two limits and skips the products and personal injury limits", () => {
    expect(req(r, "general_liability")).toMatchObject({
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
    });
    expect(r.notes.join(" ")).not.toMatch(/General liability/);
  });

  it("reads auto's combined single limit", () => {
    expect(req(r, "auto")?.eachOccurrenceCents).toBe(M);
    expect(req(r, "auto")?.aggregateCents).toBeNull();
  });

  it("reads employer's liability each accident and disease policy limit, not each employee", () => {
    expect(req(r, "workers_comp")).toMatchObject({ eachOccurrenceCents: M, aggregateCents: M });
    const ev = r.found.find((f) => f.requirement.kind === "workers_comp")?.evidence ?? [];
    expect(ev.map((e) => e.what)).toContain("statutory limits");
  });

  it("reads 'each occurrence and aggregate' as both of the umbrella's limits", () => {
    expect(req(r, "umbrella")).toMatchObject({ eachOccurrenceCents: 5 * M, aggregateCents: 5 * M });
  });

  it("lets the umbrella count toward the other coverages", () => {
    expect(req(r, "general_liability")?.umbrellaCounts).toBe(true);
    expect(req(r, "auto")?.umbrellaCounts).toBe(true);
    expect(req(r, "umbrella")?.umbrellaCounts).toBe(false);
  });

  it("puts additional insured and primary on every liability policy but not workers' comp", () => {
    for (const k of ["general_liability", "auto", "umbrella"]) {
      expect(req(r, k)?.additionalInsured, k).toBe(true);
      expect(req(r, k)?.primaryNoncontributory, k).toBe(true);
    }
    expect(req(r, "workers_comp")?.additionalInsured).toBe(false);
    expect(req(r, "workers_comp")?.primaryNoncontributory).toBe(false);
  });

  it("puts the waiver on workers' comp when the sentence names it", () => {
    expect(req(r, "workers_comp")?.waiverOfSubrogation).toBe(true);
    expect(req(r, "general_liability")?.waiverOfSubrogation).toBe(true);
  });

  it("quotes the sentence each value came from", () => {
    const gl = r.found.find((f) => f.requirement.kind === "general_liability");
    const each = gl?.evidence.find((e) => e.what === "each occurrence $1,000,000");
    expect(each?.quote).toMatch(/\$1,000,000 per occurrence/);
    expect(r.unplaced).toEqual([]);
  });
});

const TABLE = `Insurance Requirements
Commercial General Liability
Each Occurrence $1,000,000
General Aggregate $2,000,000
Products-Completed Operations Aggregate $2,000,000
Personal & Advertising Injury $1,000,000
Medical Expense (any one person) $5,000
Additional Insured (CG 20 10 and CG 20 37) Required
Waiver of Subrogation Required
Business Automobile Liability
Combined Single Limit $1,000,000
Workers Compensation Statutory
Employers Liability
E.L. Each Accident $500,000
E.L. Disease - Each Employee $500,000
E.L. Disease - Policy Limit $500,000
Excess Liability $2,000,000
Professional Liability Not required`;

describe("readInsuranceExhibit, table exhibit", () => {
  const r = readInsuranceExhibit(TABLE);

  it("reads labels before amounts on table lines", () => {
    expect(req(r, "general_liability")).toMatchObject({
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
      additionalInsured: true,
      waiverOfSubrogation: true,
      primaryNoncontributory: false,
    });
    expect(req(r, "auto")?.eachOccurrenceCents).toBe(M);
    expect(req(r, "workers_comp")).toMatchObject({
      eachOccurrenceCents: 50_000_000,
      aggregateCents: 50_000_000,
    });
  });

  it("reads a single unlabelled amount as the umbrella's each-occurrence limit", () => {
    expect(req(r, "umbrella")?.eachOccurrenceCents).toBe(2 * M);
  });

  it("does not place the medical expense amount", () => {
    expect(r.unplaced).toEqual([]);
    expect(r.notes).toEqual([]);
  });
});

describe("readInsuranceExhibit, edge cases", () => {
  it("does not tick an endorsement that is not required", () => {
    const r = readInsuranceExhibit(
      "General Liability: $1,000,000 each occurrence. A waiver of subrogation is not required.",
    );
    expect(req(r, "general_liability")?.waiverOfSubrogation).toBe(false);
    expect(r.notes[0]).toMatch(/not required/);
  });

  it("keeps the first of two amounts for one limit and says so", () => {
    const r = readInsuranceExhibit(
      "Commercial General Liability $1,000,000 per occurrence. For this project, Commercial General Liability $2,000,000 per occurrence.",
    );
    expect(req(r, "general_liability")?.eachOccurrenceCents).toBe(M);
    expect(r.notes[0]).toMatch(/also gives \$2,000,000/);
  });

  it("skips a contract-size threshold", () => {
    const r = readInsuranceExhibit(
      "For subcontracts over $500,000, Umbrella Liability of $5,000,000 each occurrence is required.",
    );
    expect(req(r, "umbrella")?.eachOccurrenceCents).toBe(5 * M);
    expect(r.unplaced).toEqual([]);
  });

  it("lists an amount before any coverage is named for the person to place", () => {
    const r = readInsuranceExhibit("Limits of $3,000,000 apply.");
    expect(r.found).toEqual([]);
    expect(r.unplaced).toEqual([{ what: "$3,000,000", quote: "Limits of $3,000,000 apply." }]);
  });

  it("reads $1M and $2 million", () => {
    const r = readInsuranceExhibit(
      "CGL: $1M each occurrence / $2 million aggregate. Pollution Liability $3M per claim.",
    );
    expect(req(r, "general_liability")).toMatchObject({
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
    });
    expect(req(r, "pollution")?.eachOccurrenceCents).toBe(3 * M);
  });

  it("reads curly apostrophes in workers' compensation", () => {
    const r = readInsuranceExhibit(
      "Workers’ Compensation and Employer’s Liability $1,000,000 each accident",
    );
    expect(req(r, "workers_comp")?.eachOccurrenceCents).toBe(M);
  });

  it("does not open a coverage named only in an exception", () => {
    const r = readInsuranceExhibit(
      "General Liability $1,000,000 each occurrence. All policies other than Professional Liability shall name Contractor as additional insured.",
    );
    expect(r.found.map((f) => f.requirement.kind)).toEqual(["general_liability"]);
    expect(req(r, "general_liability")?.additionalInsured).toBe(true);
  });

  it("returns nothing for text with no coverages", () => {
    expect(readInsuranceExhibit("Payment terms: net 30.")).toEqual({
      found: [],
      unplaced: [],
      notes: [],
      tiers: [],
      jobTier: null,
    });
  });
});

// Written for these tests in the shapes GC exhibits use for limits by contract size; not any GC's form.
const HEADED = `EXHIBIT D - INSURANCE
Minimum limits depend on the subcontract amount.
Subcontracts up to $1,000,000:
Commercial General Liability: $1,000,000 each occurrence / $2,000,000 general aggregate
Umbrella Liability: $2,000,000
Subcontracts over $1,000,000 and up to $5,000,000:
Commercial General Liability: $1,000,000 each occurrence / $2,000,000 general aggregate
Umbrella Liability: $5,000,000
Subcontracts over $5,000,000:
Commercial General Liability: $2,000,000 each occurrence / $4,000,000 general aggregate
Umbrella Liability: $10,000,000
Regardless of contract amount, all policies shall name Contractor as additional insured.`;

describe("readInsuranceExhibit, limits by contract size", () => {
  it("reads the three tiers in words", () => {
    expect(readInsuranceExhibit(HEADED).tiers).toEqual([
      "subcontracts up to $1,000,000",
      "subcontracts over $1,000,000 and up to $5,000,000",
      "subcontracts over $5,000,000",
    ]);
  });

  it("picks the middle tier for a $2.4M subcontract and sets the others aside", () => {
    const r = readInsuranceExhibit(HEADED, { contractSumCents: (240 * M) / 100 });
    expect(r.jobTier).toBe("subcontracts over $1,000,000 and up to $5,000,000");
    expect(req(r, "general_liability")).toMatchObject({
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
    });
    expect(req(r, "umbrella")?.eachOccurrenceCents).toBe(5 * M);
    expect(req(r, "umbrella")?.additionalInsured).toBe(true);
    expect(r.unplaced).toEqual([]);
    const umb = r.found.find((f) => f.requirement.kind === "umbrella");
    expect(umb?.evidence[0]?.what).toBe(
      "each occurrence $5,000,000 (subcontracts over $1,000,000 and up to $5,000,000)",
    );
    expect(r.notes.join(" ")).toMatch(/set aside \$10,000,000/);
    expect(r.notes.join(" ")).not.toMatch(/also gives/);
  });

  it("picks the top tier for a $6M subcontract", () => {
    const r = readInsuranceExhibit(HEADED, { contractSumCents: 6 * M });
    expect(req(r, "general_liability")).toMatchObject({
      eachOccurrenceCents: 2 * M,
      aggregateCents: 4 * M,
    });
    expect(req(r, "umbrella")?.eachOccurrenceCents).toBe(10 * M);
  });

  it("puts exactly $1,000,000 in the first tier (up to is inclusive)", () => {
    const r = readInsuranceExhibit(HEADED, { contractSumCents: M });
    expect(req(r, "umbrella")?.eachOccurrenceCents).toBe(2 * M);
  });

  it("with no contract sum keeps the first tier and asks for the sum", () => {
    const r = readInsuranceExhibit(HEADED);
    expect(req(r, "umbrella")?.eachOccurrenceCents).toBe(2 * M);
    expect(r.jobTier).toBeNull();
    expect(r.notes.join(" ")).toMatch(/enter the job's contract sum/);
  });

  it("reads a tier written after the limit, clause by clause", () => {
    const text =
      "Umbrella Liability: $2,000,000 for subcontracts under $1,000,000; $5,000,000 for subcontracts of $1,000,000 or more.";
    const small = readInsuranceExhibit(text, { contractSumCents: (50 * M) / 100 });
    expect(req(small, "umbrella")?.eachOccurrenceCents).toBe(2 * M);
    const big = readInsuranceExhibit(text, { contractSumCents: M });
    expect(req(big, "umbrella")?.eachOccurrenceCents).toBe(5 * M);
    expect(big.tiers).toEqual([
      "subcontracts under $1,000,000",
      "subcontracts of $1,000,000 or more",
    ]);
    expect(big.unplaced).toEqual([]);
  });

  it("lets the job's tier replace a limit read with no tier", () => {
    const text = `Umbrella Liability with limits of not less than $2,000,000 each occurrence.
For subcontracts with a value exceeding $5,000,000, Umbrella Liability of $10,000,000 each occurrence is required.`;
    const big = readInsuranceExhibit(text, { contractSumCents: 8 * M });
    expect(req(big, "umbrella")?.eachOccurrenceCents).toBe(10 * M);
    expect(big.notes.join(" ")).toMatch(/replaces \$2,000,000/);
    const small = readInsuranceExhibit(text, { contractSumCents: 3 * M });
    expect(req(small, "umbrella")?.eachOccurrenceCents).toBe(2 * M);
  });

  it("reads a range written with a dash and amount labels", () => {
    const text = `Subcontract Amount: $0 - $500,000. Automobile Liability: $1,000,000 combined single limit.
Subcontract Amount: $500,001 - $2,000,000. Automobile Liability: $2,000,000 combined single limit.`;
    const r = readInsuranceExhibit(text, { contractSumCents: (75 * M) / 100 });
    expect(r.tiers).toEqual([
      "subcontracts up to $500,000",
      "subcontracts of $500,001 or more and up to $2,000,000",
    ]);
    expect(req(r, "auto")?.eachOccurrenceCents).toBe(2 * M);
  });

  it("says so when no tier holds the contract sum", () => {
    const r = readInsuranceExhibit(
      "Subcontracts up to $1,000,000: Umbrella Liability $2,000,000.",
      { contractSumCents: 3 * M },
    );
    expect(req(r, "umbrella")?.eachOccurrenceCents).toBeNull();
    expect(r.notes.join(" ")).toMatch(/none holds this job's contract sum of \$3,000,000/);
  });

  it("does not read a minimum limit as a contract size", () => {
    const r = readInsuranceExhibit(
      "For the duration of this Subcontract, Commercial General Liability with limits not less than $1,000,000 each occurrence.",
      { contractSumCents: 3 * M },
    );
    expect(r.tiers).toEqual([]);
    expect(req(r, "general_liability")?.eachOccurrenceCents).toBe(M);
  });
});

describe("paragraphs", () => {
  it("joins wrapped prose and keeps table lines apart", () => {
    expect(
      paragraphs([
        "All policies except Workers'",
        "Compensation shall name the Owner.",
        "Each Occurrence $1,000,000",
        "General Aggregate $2,000,000",
      ]),
    ).toEqual([
      "All policies except Workers'",
      "Compensation shall name the Owner.",
      "Each Occurrence $1,000,000",
      "General Aggregate $2,000,000",
    ]);
    expect(
      paragraphs(["Contractor shall carry insurance with limits of", "not less than $1,000,000."]),
    ).toEqual(["Contractor shall carry insurance with limits of not less than $1,000,000."]);
  });
});

describe("linesFromPdfText", () => {
  it("puts runs on one baseline into one line, left to right, with spaces at gaps", () => {
    const lines = linesFromPdfText({
      pages: [
        {
          page: 1,
          width: 612,
          height: 792,
          rules: [],
          runs: [
            { x0: 200, x1: 260, y: 100.3, size: 10, text: "$1,000,000" },
            { x0: 72, x1: 150, y: 100, size: 10, text: "Each Occurrence" },
            { x0: 72, x1: 160, y: 114, size: 10, text: "General Aggregate" },
            { x0: 200, x1: 260, y: 114, size: 10, text: "$2,000,000" },
          ],
        },
      ],
      chars: 60,
      unreadable: 0,
      invisible: 0,
    } as never);
    expect(lines).toEqual(["Each Occurrence $1,000,000", "General Aggregate $2,000,000"]);
  });
});

// ---- a hand-built PDF, the way a GC's word processor prints a table exhibit ----

function pdf(content: string) {
  const objects: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    4: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    5: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  };
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n <= 5; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += "xref\n0 6\n0000000000 65535 f \n";
  for (let n = 1; n <= 5; n++) out += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

describe("exhibitLinesFromPdf", () => {
  it("reads a PDF table exhibit into the same requirements as typed text", async () => {
    const rows = [
      ["Commercial General Liability", ""],
      ["Each Occurrence", "$1,000,000"],
      ["General Aggregate", "$2,000,000"],
      ["Additional Insured", "Required"],
      ["Automobile Liability", ""],
      ["Combined Single Limit", "$1,000,000"],
    ];
    let content = "BT /F1 10 Tf\n";
    rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell) content += `1 0 0 1 ${c ? 300 : 72} ${700 - r * 14} Tm (${cell}) Tj\n`;
      });
    });
    content += "ET";
    const r = await exhibitLinesFromPdf(pdf(content));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[1]).toBe("Each Occurrence $1,000,000");
    const reading = readInsuranceExhibit(r.lines);
    expect(req(reading, "general_liability")).toMatchObject({
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
      additionalInsured: true,
    });
    expect(req(reading, "auto")?.eachOccurrenceCents).toBe(M);
  });

  it("says a scan with no text layer cannot be read without OCR", async () => {
    const r = await exhibitLinesFromPdf(pdf("q 612 0 0 792 0 0 cm Q"));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/no text to read/);
  });

  it("says bytes that are not a PDF cannot be read", async () => {
    const r = await exhibitLinesFromPdf(new TextEncoder().encode("hello"));
    expect(r.ok).toBe(false);
  });
});
