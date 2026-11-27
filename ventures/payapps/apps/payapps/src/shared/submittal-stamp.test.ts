// Reading a returned submittal's stamp: which phrases count as stamp entries, which box is ticked,
// which date is the review's, and PDFs whose stamp is an annotation (Bluebeam, Acrobat) or printed
// into the page.
import { describe, expect, it } from "vitest";
import type { PageText, PdfText, TextRun } from "./pdf/text";
import { datesInLine, hitsInLine, linesOf, readStamp, readStampText } from "./submittal-stamp";

const TODAY = "2026-11-26";

/** Lines of text as runs, 14 pt apart, one run per line unless split with "|" (a wide gap). */
function runsOf(lines: string[], top = 100, x = 72): TextRun[] {
  const out: TextRun[] = [];
  lines.forEach((l, i) => {
    let at = x;
    for (const part of l.split("|")) {
      out.push({ x0: at, x1: at + part.length * 5, y: top + i * 14, size: 10, text: part });
      at += part.length * 5 + 40;
    }
  });
  return out;
}

function textOf(pages: Partial<PageText>[]): PdfText {
  return {
    pages: pages.map((p, i) => ({ page: i + 1, runs: [], rules: [], ...p })),
    chars: 100,
    unreadable: 0,
    invisible: 0,
  };
}
const stampPage = (
  lines: string[],
  modified: string | null = null,
  contents: string | null = null,
) =>
  textOf([
    { runs: [], annotations: [{ subtype: "Stamp", runs: runsOf(lines), contents, modified }] },
  ]);

describe("hitsInLine", () => {
  it("reads the common reviewer phrases as their actions", () => {
    const one = (l: string) => hitsInLine(l).map((h) => h.action);
    expect(one("NO EXCEPTIONS TAKEN")).toEqual(["approved"]);
    expect(one("MAKE CORRECTIONS NOTED")).toEqual(["approved_as_noted"]);
    expect(one("Approved as Noted")).toEqual(["approved_as_noted"]);
    expect(one("REVISE & RESUBMIT")).toEqual(["revise_resubmit"]);
    expect(one("Revise / Resubmit")).toEqual(["revise_resubmit"]);
    expect(one("REJECTED - SEE COMMENTS")).toEqual(["rejected"]);
    expect(one("NOT APPROVED")).toEqual(["rejected"]);
    expect(one("SUBMIT SPECIFIED ITEM")).toEqual(["rejected"]);
    expect(one("FURNISH AS CORRECTED")).toEqual(["approved_as_noted"]);
    expect(one("RECEIVED FOR RECORD")).toEqual(["for_record"]);
    expect(one("APPROVED AS NOTED - RESUBMIT")).toEqual(["revise_resubmit"]);
  });

  it("leaves out the same words used in a sentence on the drawings or a data sheet", () => {
    expect(hitsInLine("Contractor may use an approved equal")).toEqual([]);
    expect(hitsInLine("APPROVED EQUAL: USG SHEETROCK")).toEqual([]);
    expect(hitsInLine("UL APPROVED")).toEqual([]);
    expect(hitsInLine("Approved by: ______")).toEqual([]);
    expect(hitsInLine("Resubmittals shall be clouded")).toEqual([]);
    expect(hitsInLine("RESUBMIT ___ COPIES")).toEqual([]);
    // Printed into a page, "Approved:" is a form label; in a stamp annotation it is the stamp.
    expect(hitsInLine("Approved: J. Smith")).toEqual([]);
    expect(hitsInLine("Approved: J. Smith", "stamp").map((h) => h.action)).toEqual(["approved"]);
  });

  it("tells a ticked box from an empty one", () => {
    const marks = (l: string) => hitsInLine(l).map((h) => [h.action, h.mark]);
    expect(marks("☐ NO EXCEPTIONS TAKEN   ☒ MAKE CORRECTIONS NOTED")).toEqual([
      ["approved", "empty"],
      ["approved_as_noted", "marked"],
    ]);
    expect(marks("[X] REVISE AND RESUBMIT [ ] REJECTED")).toEqual([
      ["revise_resubmit", "marked"],
      ["rejected", "empty"],
    ]);
    expect(marks("X APPROVED")).toEqual([["approved", "marked"]]);
    expect(marks("✔ Approved as noted")).toEqual([["approved_as_noted", "marked"]]);
    expect(marks("TAX APPROVED")).toEqual([]);
  });
});

describe("datesInLine", () => {
  it("reads US numeric, ISO and spelled-out dates", () => {
    expect(datesInLine("DATE: 11/20/2026")).toEqual(["2026-11-20"]);
    expect(datesInLine("Date 11-20-26")).toEqual(["2026-11-20"]);
    expect(datesInLine("2026-11-20 10:32")).toEqual(["2026-11-20"]);
    expect(datesInLine("By JS, Nov. 20, 2026 10:32 AM")).toEqual(["2026-11-20"]);
    expect(datesInLine("20 November 2026")).toEqual(["2026-11-20"]);
    expect(datesInLine("Sheet 2/31/2026")).toEqual([]);
    expect(datesInLine("SECTION 09 21 16")).toEqual([]);
  });
});

describe("linesOf", () => {
  it("joins runs on one baseline and keeps a wide gap between entries", () => {
    const lines = linesOf(runsOf(["☐ APPROVED|☒ REJECTED", "DATE: 11/20/2026"]));
    expect(lines.map((l) => l.text)).toEqual(["☐ APPROVED   ☒ REJECTED", "DATE: 11/20/2026"]);
  });
});

describe("readStampText", () => {
  it("fills the action and date from a stamp annotation", () => {
    const r = readStampText(
      stampPage(["ARCHITECT'S REVIEW", "MAKE CORRECTIONS NOTED", "BY: JS   DATE: 11/20/2026"]),
      { today: TODAY, submittedOn: "2026-11-02" },
    );
    expect(r.action).toBe("approved_as_noted");
    expect(r.returnedOn).toBe("2026-11-20");
    expect(r.dateSource).toMatchObject({ labelled: true, placed: false, page: 1 });
    expect(r.problem).toBeNull();
    expect(r.hits).toEqual([
      {
        action: "approved_as_noted",
        phrase: "MAKE CORRECTIONS NOTED",
        page: 1,
        from: "stamp",
        mark: "none",
      },
    ]);
  });

  it("takes the ticked choice of a stamp that prints them all", () => {
    const r = readStampText(
      stampPage([
        "☐ NO EXCEPTIONS TAKEN",
        "☐ MAKE CORRECTIONS NOTED",
        "☒ REVISE AND RESUBMIT",
        "☐ REJECTED",
        "DATE 11/18/26",
      ]),
      { today: TODAY },
    );
    expect(r.action).toBe("revise_resubmit");
    expect(r.returnedOn).toBe("2026-11-18");
  });

  it("proposes nothing when the ticks are drawn and every choice is printed", () => {
    const r = readStampText(
      stampPage([
        "NO EXCEPTIONS TAKEN",
        "MAKE CORRECTIONS NOTED",
        "REVISE AND RESUBMIT",
        "REJECTED",
      ]),
      { today: TODAY },
    );
    expect(r.action).toBeNull();
    expect(r.returnedOn).toBeNull();
    expect(r.problem).toMatch(/drawn rather than written/);
    expect(r.hits).toHaveLength(4);
  });

  it("proposes nothing when two stamps disagree", () => {
    const r = readStampText(
      textOf([
        {
          annotations: [
            { subtype: "Stamp", runs: runsOf(["APPROVED"]), contents: null, modified: null },
            {
              subtype: "Stamp",
              runs: runsOf(["REVISE AND RESUBMIT"], 400),
              contents: null,
              modified: null,
            },
          ],
        },
      ]),
      { today: TODAY },
    );
    expect(r.action).toBeNull();
    expect(r.problem).toMatch(/disagree \(approved, revise and resubmit\)/);
  });

  it("agrees when the GC's and the architect's stamps say the same", () => {
    const r = readStampText(
      textOf([
        {
          annotations: [
            {
              subtype: "Stamp",
              runs: runsOf(["APPROVED AS NOTED"]),
              contents: null,
              modified: null,
            },
          ],
        },
        { runs: runsOf(["EXCEPTIONS NOTED", "Date: 11/19/2026"]) },
      ]),
      { today: TODAY },
    );
    expect(r.action).toBe("approved_as_noted");
    expect(r.returnedOn).toBe("2026-11-19");
  });

  it("falls back to when the stamp was placed, and says so", () => {
    const r = readStampText(stampPage(["APPROVED"], "2026-11-21"), { today: TODAY });
    expect(r.action).toBe("approved");
    expect(r.returnedOn).toBe("2026-11-21");
    expect(r.dateSource).toMatchObject({ placed: true, text: expect.stringMatching(/placed/) });
  });

  it("reads a stamp's /Contents when it has no appearance text", () => {
    const r = readStampText(
      textOf([
        { annotations: [{ subtype: "Stamp", runs: [], contents: "Not Approved", modified: null }] },
      ]),
      { today: TODAY },
    );
    expect(r.action).toBe("rejected");
    expect(r.problem).toBe("The stamp shows no date. Set the returned date yourself.");
  });

  it("leaves out a date after today or before the submittal went out", () => {
    const r = readStampText(stampPage(["APPROVED", "DATE: 12/20/2026"]), {
      today: TODAY,
      submittedOn: "2026-11-01",
    });
    expect(r.action).toBe("approved");
    expect(r.returnedOn).toBeNull();
    expect(r.problem).toMatch(/2026-12-20.*left out/);
    const old = readStampText(stampPage(["APPROVED", "DATE: 10/02/2026"]), {
      today: TODAY,
      submittedOn: "2026-11-01",
    });
    expect(old.returnedOn).toBeNull();
  });

  it("prefers the date labelled DATE, and gives up on two labelled dates", () => {
    const one = readStampText(
      stampPage(["APPROVED", "Job 11/02/2026 submittal", "DATE: 11/20/2026"]),
      { today: TODAY },
    );
    expect(one.returnedOn).toBe("2026-11-20");
    const two = readStampText(stampPage(["APPROVED", "DATE: 11/19/2026", "DATE: 11/20/2026"]), {
      today: TODAY,
    });
    expect(two.returnedOn).toBeNull();
    expect(two.problem).toMatch(/more than one date/);
  });

  it("reads a stamp printed into the page and keeps far-off dates out", () => {
    const runs = [
      ...runsOf(["SHOP DRAWING REVIEW", "NO EXCEPTIONS TAKEN", "DATE: 11/20/2026"], 600),
      ...runsOf(["Issued for construction 03/14/2026"], 80),
    ];
    const r = readStampText(textOf([{ runs }]), { today: TODAY });
    expect(r.action).toBe("approved");
    expect(r.returnedOn).toBe("2026-11-20");
  });

  it("says when there is nothing to read", () => {
    const scan = { ...textOf([{ runs: [] }]), chars: 0 };
    expect(readStampText(scan, { today: TODAY }).problem).toMatch(/looks like a scan/);
    const plain = readStampText(
      textOf([{ runs: runsOf(["GYPSUM BOARD", "Use an approved equal"]) }]),
      {
        today: TODAY,
      },
    );
    expect(plain.action).toBeNull();
    expect(plain.problem).toMatch(/No reviewer's stamp wording/);
  });
});

// Hand-built PDFs, as in pdf/text.test.ts.
function pdf(objects: Record<number, string>) {
  let out = "%PDF-1.4\n";
  const offsets: Record<number, number> = {};
  const nums = Object.keys(objects)
    .map(Number)
    .sort((a, b) => a - b);
  for (const n of nums) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const max = Math.max(...nums);
  const xref = out.length;
  out += `xref\n0 ${max + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= max; n++)
    out += `${String(offsets[n] ?? 0).padStart(10, "0")} ${offsets[n] ? "00000 n" : "65535 f"} \n`;
  out += `trailer\n<< /Size ${max + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
const stream = (s: string, dict = "") =>
  `<< /Length ${s.length} ${dict} >>\nstream\n${s}\nendstream`;
const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

function stampedPdf(annots: string, extra: Record<number, string> = {}) {
  return pdf({
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /Annots ${annots} >>`,
    4: stream("BT /F1 10 Tf 72 720 Td (Product data: gypsum board, use an approved equal) Tj ET"),
    5: HELVETICA,
    ...extra,
  });
}

describe("readStamp (PDF files)", () => {
  it("reads a stamp annotation's appearance, placed by its /Rect", async () => {
    // The appearance is drawn in a 200 x 60 box; the stamp sits at (400, 650) on the page.
    const ap = stream(
      "BT /F1 12 Tf 10 40 Td (MAKE CORRECTIONS NOTED) Tj 0 -20 Td (DATE: 11/20/2026) Tj ET",
      "/Type /XObject /Subtype /Form /BBox [0 0 200 60] /Resources << /Font << /F1 5 0 R >> >>",
    );
    const bytes = stampedPdf("[6 0 R]", {
      6: "<< /Type /Annot /Subtype /Stamp /Rect [400 650 600 710] /Contents (Architect review) /M (D:20261120103200-05'00') /AP << /N 7 0 R >> >>",
      7: ap,
    });
    const r = await readStamp(bytes, { today: TODAY, submittedOn: "2026-11-02" });
    expect(r.action).toBe("approved_as_noted");
    expect(r.returnedOn).toBe("2026-11-20");
    expect(r.hits.map((h) => h.from)).toEqual(["stamp"]);
  });

  it("maps the appearance box onto the stamp's place on the page", async () => {
    const { extractText } = await import("./pdf/text");
    const ap = stream(
      "BT /F1 10 Tf 0 0 Td (APPROVED) Tj ET",
      "/Type /XObject /Subtype /Form /BBox [0 0 100 20] /Resources << /Font << /F1 5 0 R >> >>",
    );
    const bytes = stampedPdf("[6 0 R]", {
      6: "<< /Type /Annot /Subtype /Stamp /Rect [300 500 500 540] /AP << /N 7 0 R >> >>",
      7: ap,
    });
    const text = await extractText(bytes, { annotations: true });
    const run = text.pages[0]?.annotations?.[0]?.runs[0];
    // Scaled 2x into the 200 x 40 rect; y from the top: 792 - 500.
    expect(run?.text).toBe("APPROVED");
    expect(run?.x0).toBeCloseTo(300);
    expect(run?.y).toBeCloseTo(292);
    expect(run?.size).toBeCloseTo(20);
    // Not asked for: no annotations, so the schedule-of-values reader sees what it always did.
    expect((await extractText(bytes)).pages[0]?.annotations).toBeUndefined();
  });

  it("reads /Contents in UTF-16, skips hidden stamps and other markups", async () => {
    const utf16 = (s: string) =>
      `<FEFF${Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("")}>`;
    const bytes = stampedPdf("[6 0 R 7 0 R 8 0 R]", {
      6: `<< /Type /Annot /Subtype /Stamp /Rect [0 0 10 10] /Contents ${utf16("Revise and Resubmit")} >>`,
      7: "<< /Type /Annot /Subtype /Stamp /F 2 /Rect [0 0 10 10] /Contents (Approved) >>",
      8: "<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /Contents (Rejected) >>",
    });
    const r = await readStamp(bytes, { today: TODAY });
    expect(r.action).toBe("revise_resubmit");
    expect(r.hits).toHaveLength(1);
  });

  it("does not read the product data under the stamp as one", async () => {
    const r = await readStamp(stampedPdf("[]"), { today: TODAY });
    expect(r.action).toBeNull();
    expect(r.hits).toEqual([]);
  });
});

describe("readStamp (a page printed by Chromium)", () => {
  it("reads the ticked box and the labelled date of a stamp flattened into the page", async () => {
    const { readFileSync } = await import("node:fs");
    const bytes = new Uint8Array(
      readFileSync(new URL("../../test/fixtures/submittal-stamp-chrome.pdf", import.meta.url)),
    );
    const r = await readStamp(bytes, { today: TODAY, submittedOn: "2026-11-02" });
    expect(r.action).toBe("approved_as_noted");
    // "Issued 11/02/2026" sits within reach of the stamp, but the date labelled DATE wins.
    expect(r.returnedOn).toBe("2026-11-20");
    expect(r.hits.map((h) => h.mark)).toEqual(["empty", "marked", "empty", "empty"]);
    // "may use an approved equal" in the notes is not a stamp entry.
    expect(r.hits.map((h) => h.phrase)).not.toContain("approved");
  });
});
