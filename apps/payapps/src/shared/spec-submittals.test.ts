import { describe, expect, it } from "vitest";
import {
  MAX_SPEC_ITEMS,
  readSpecSubmittals,
  specLinesFromPdf,
  specSectionNumber,
  specSubmittalNote,
  specSubmittalType,
  titleCase,
} from "./spec-submittals";

// Our own wording in the SectionFormat layout most US project manuals use (not copied from any
// master spec): a drywall section with action, informational, close-out and maintenance articles.
const DRYWALL = `SECTION 09 29 00 - GYPSUM BOARD
PART 1 - GENERAL
1.1 RELATED DOCUMENTS
A. Drawings and general provisions of the Contract apply to this Section.
1.2 SUMMARY
A. Section includes interior gypsum board, tile backing panels and joint treatment.
1.3 ACTION SUBMITTALS
A. Product Data: For each type of board, accessory and joint compound
used on the job.
B. Shop Drawings: Show locations of control joints, including plans and
elevations.
C. Samples: For the following products:
1. Trim Accessories: Full-size Sample of each trim profile, 12 inches long.
2. Textured Finishes: 12-by-12-inch panel for each texture.
D. Comply with Section 01 33 00 for submittal procedures.
1.4 INFORMATIONAL SUBMITTALS
A. Product Test Reports: For each board, from a qualified testing agency.
B. Qualification Data: For Installer.
1.5 CLOSEOUT SUBMITTALS
A. Sample Warranty: Manufacturer's standard form.
1.6 MAINTENANCE MATERIAL SUBMITTALS
A. Furnish extra materials that match products installed, packaged with labels.
1. Gypsum Board: Two percent of the amount installed.
1.7 QUALITY ASSURANCE
A. Mockups: Build a 100-sq.-ft. mockup of each finish level.
PART 2 - PRODUCTS
2.1 PANELS, GENERAL
A. Samples: none required here, this is a product article.
END OF SECTION 09 29 00`;

describe("readSpecSubmittals", () => {
  it("reads each submittal article's lettered paragraphs as items, with their section and type", () => {
    const r = readSpecSubmittals(DRYWALL);
    expect(r.sections).toEqual([{ specSection: "09 29 00", title: "Gypsum Board", items: 7 }]);
    expect(r.items.map((i) => [i.title, i.type, i.group])).toEqual([
      ["Gypsum Board: Product Data", "product_data", "action"],
      ["Gypsum Board: Shop Drawings", "shop_drawings", "action"],
      ["Gypsum Board: Samples", "samples", "action"],
      ["Gypsum Board: Product Test Reports", "test_report", "informational"],
      ["Gypsum Board: Qualification Data", "other", "informational"],
      ["Gypsum Board: Sample Warranty", "warranty", "closeout"],
      ["Gypsum Board: Extra materials", "other", "maintenance"],
    ]);
    expect(r.items.every((i) => i.specSection === "09 29 00")).toBe(true);
  });

  it("keeps wrapped lines and sub-paragraphs with their item", () => {
    const r = readSpecSubmittals(DRYWALL);
    expect(r.items[0]?.text).toBe(
      "Product Data: For each type of board, accessory and joint compound used on the job.",
    );
    expect(r.items[2]?.text).toContain("1. Trim Accessories: Full-size Sample");
    expect(r.items[2]?.text).toContain("2. Textured Finishes");
  });

  it("lists a procedure as skipped and reads nothing outside the submittal articles", () => {
    const r = readSpecSubmittals(DRYWALL);
    expect(r.skipped).toEqual([
      {
        specSection: "09 29 00",
        text: "Comply with Section 01 33 00 for submittal procedures.",
        why: "a procedure, not an item to send",
        page: null,
      },
    ]);
    // The mockup is under quality assurance and the samples under Part 2: neither is proposed.
    expect(r.items.some((i) => i.type === "mock_up")).toBe(false);
    expect(r.items.filter((i) => i.type === "samples")).toHaveLength(1);
  });

  it("reads older numbering, title-case headings and a title on the line after", () => {
    const r = readSpecSubmittals(`SECTION 07920
JOINT SEALANTS
PART 1 GENERAL
1.03 Submittals
A. Submit manufacturer's product data for each sealant.
B. Color Samples: Each color available.
1.04 Quality Assurance
A. Installer Certificates: Signed by the manufacturer.
END OF SECTION`);
    expect(r.sections).toEqual([{ specSection: "07920", title: "Joint Sealants", items: 2 }]);
    expect(r.items.map((i) => [i.label, i.type, i.group])).toEqual([
      ["Product data", "product_data", "submittals"],
      ["Color Samples", "samples", "submittals"],
    ]);
  });

  it("reads several sections and leaves Division 01 out, saying so", () => {
    const r = readSpecSubmittals(`SECTION 01 33 00 - SUBMITTAL PROCEDURES
PART 1 - GENERAL
1.3 ACTION SUBMITTALS
A. General: Prepare and submit action submittals required by each Section.
B. Schedule of Values: In the form the Owner requires.
END OF SECTION 01 33 00
SECTION 233113 - METAL DUCTS
PART 1 - GENERAL
1.3 ACTION SUBMITTALS
A. Shop Drawings: Duct layout at 1/4 inch scale.
B. Delegated-Design Submittal: Seismic restraint details signed by an engineer.
1.4 INFORMATIONAL SUBMITTALS
A. Coordination Drawings: Plans showing ducts with other trades.
B. Welding Certificates.
C. Field Quality-Control Reports.
END OF SECTION 23 31 13`);
    expect(r.sections.map((s) => [s.specSection, s.title, s.items])).toEqual([
      ["01 33 00", "Submittal Procedures", 0],
      ["23 31 13", "Metal Ducts", 5],
    ]);
    // A paragraph that is only a name ("Welding Certificates.") is that item.
    expect(r.items.map((i) => [i.label, i.type])).toEqual([
      ["Shop Drawings", "shop_drawings"],
      ["Delegated-Design Submittal", "shop_drawings"],
      ["Coordination Drawings", "shop_drawings"],
      ["Welding Certificates", "certificate"],
      ["Field Quality-Control Reports", "test_report"],
    ]);
    expect(r.skipped).toEqual([]);
    expect(r.notes[0]).toMatch(/Division 01 \(01 33 00\)/);
  });

  it("drops page headers and footers repeated across pages", () => {
    const page = (n: number, body: string[]) => [
      { text: "CLINIC TENANT IMPROVEMENT", page: n },
      ...body.map((text) => ({ text, page: n })),
      { text: `GYPSUM BOARD 09 29 00 - ${n}`, page: n },
    ];
    const lines = [
      ...page(1, [
        "SECTION 09 29 00 - GYPSUM BOARD",
        "1.3 ACTION SUBMITTALS",
        "A. Product Data: For each",
      ]),
      ...page(2, ["type of board.", "B. Shop Drawings: Control joint"]),
      ...page(3, ["locations.", "1.4 QUALITY ASSURANCE", "A. Mockups: One per finish."]),
    ];
    const r = readSpecSubmittals(lines);
    expect(r.items.map((i) => i.text)).toEqual([
      "Product Data: For each type of board.",
      "Shop Drawings: Control joint locations.",
    ]);
  });

  it("drops page numbers and section-page footers in pasted text", () => {
    const r = readSpecSubmittals(`SECTION 08 71 00 - DOOR HARDWARE
1.4 ACTION SUBMITTALS
A. Hardware Schedule: Organized by door,
DOOR HARDWARE 08 71 00 - 2
7
listing each item.`);
    expect(r.items[0]?.text).toBe("Hardware Schedule: Organized by door, listing each item.");
  });

  it("gives items with no section heading no spec section, and says so", () => {
    const r = readSpecSubmittals("1.3 ACTION SUBMITTALS\nA. Product Data: Each fixture.");
    expect(r.items).toMatchObject([{ specSection: null, title: "Product Data" }]);
    expect(r.notes.join(" ")).toMatch(/no spec section/);
  });

  it("lists an item named twice in one section once", () => {
    const r = readSpecSubmittals(`SECTION 09 91 23 - INTERIOR PAINTING
1.3 ACTION SUBMITTALS
A. Product Data: Each paint system.
1.4 INFORMATIONAL SUBMITTALS
A. Product Data: Each paint system again.`);
    expect(r.items).toHaveLength(1);
    expect(r.notes.join(" ")).toMatch(/1 item named twice/);
  });

  it("stops at the item cap and counts the rest", () => {
    const body = Array.from({ length: MAX_SPEC_ITEMS + 5 }, (_, i) => `A. Item ${i + 1}: Each.`);
    const r = readSpecSubmittals(
      `SECTION 26 05 00 - ELECTRICAL\n1.3 SUBMITTALS\n${body.join("\n")}`,
    );
    expect(r.items).toHaveLength(MAX_SPEC_ITEMS);
    expect(r.notes.join(" ")).toMatch(/5 more were found/);
  });

  it("does not take a sentence that names a section for a section heading", () => {
    const r = readSpecSubmittals(`SECTION 09 29 00 - GYPSUM BOARD
1.3 ACTION SUBMITTALS
A. Product Data: As required by
Section 01 33 00 Submittal Procedures.`);
    expect(r.sections).toHaveLength(1);
    expect(r.items[0]?.text).toBe(
      "Product Data: As required by Section 01 33 00 Submittal Procedures.",
    );
  });
});

describe("UFGS submittal lists", () => {
  // The layout of the Unified Facilities Guide Specifications (a US government work), guide
  // brackets and an editor's note included, as wbdg.org publishes 09 29 00.
  const UFGS = `SECTION 09 29 00
GYPSUM BOARD
PART 1 GENERAL
1.1 REFERENCES
1.2 SUBMITTALS
**************************************************************************
NOTE: Review Submittal Description (SD) definitions
in Section 01 33 00 SUBMITTAL PROCEDURES.
**************************************************************************
Government approval is required for submittals with a "G" or "S"
classification. Submit the following in accordance with Section
01 33 00 SUBMITTAL PROCEDURES:
SD-02 Shop Drawings
Control Joint Shop Drawings; G
SD-03 Product Data
Gypsum Board
[ Cementitious Backer Units
][ Abuse Resistant Gypsum Board
] Trim
SD-04 Samples
[ Predecorated Gypsum Board [; G, [_____] ]
] SD-06 Test Reports
[ ASTM E90 Factory Test Report [; G, [_____] ]
] SD-07 Certificates
Asbestos Free Materials [; G, [_____] ]
SD-08 Manufacturer's Instructions
Safety Data Sheets
SD-10 Operation and Maintenance Data
Manufacturer Maintenance Instructions
1.3 CERTIFICATIONS
1.3.1 Indoor Air Quality Certifications
Submit required indoor air quality certifications in one submittal package.
PART 2 PRODUCTS
SECTION 09 29 00 Page 9
END OF SECTION`;

  it("reads one item a line under each SD heading, typed by the description", () => {
    const r = readSpecSubmittals(UFGS);
    expect(r.sections).toEqual([{ specSection: "09 29 00", title: "Gypsum Board", items: 10 }]);
    expect(r.items.map((i) => [i.title, i.type])).toEqual([
      ["Gypsum Board: Control Joint Shop Drawings", "shop_drawings"],
      ["Gypsum Board: Gypsum Board (Product Data)", "product_data"],
      ["Gypsum Board: Cementitious Backer Units (Product Data)", "product_data"],
      ["Gypsum Board: Abuse Resistant Gypsum Board (Product Data)", "product_data"],
      ["Gypsum Board: Trim (Product Data)", "product_data"],
      ["Gypsum Board: Predecorated Gypsum Board (Samples)", "samples"],
      ["Gypsum Board: ASTM E90 Factory Test Report", "test_report"],
      ["Gypsum Board: Asbestos Free Materials (Certificates)", "certificate"],
      ["Gypsum Board: Safety Data Sheets", "product_data"],
      ["Gypsum Board: Manufacturer Maintenance Instructions", "o_and_m"],
    ]);
  });

  it("keeps the approval code in the paragraph read, not the title", () => {
    const r = readSpecSubmittals(UFGS);
    expect(r.items[0]?.text).toBe("SD-02 Shop Drawings: Control Joint Shop Drawings; G");
    expect(r.items[7]?.text).toBe("SD-07 Certificates: Asbestos Free Materials; G");
    expect(r.items.some((i) => /Government|NOTE|Page 9/.test(i.text))).toBe(false);
  });
});

describe("helpers", () => {
  it("writes section numbers one way", () => {
    expect(specSectionNumber("092900")).toBe("09 29 00");
    expect(specSectionNumber("09 29 00")).toBe("09 29 00");
    expect(specSectionNumber("230593.13")).toBe("23 05 93.13");
    expect(specSectionNumber("09250")).toBe("09250");
    expect(specSectionNumber("02 62 13.00 10")).toBe("02 62 13.00 10");
  });

  it("title-cases capitals and keeps short initialisms", () => {
    expect(titleCase("GYPSUM BOARD ASSEMBLIES")).toBe("Gypsum Board Assemblies");
    expect(titleCase("COMMON WORK RESULTS FOR HVAC")).toBe("Common Work Results for HVAC");
    expect(titleCase("HOLLOW METAL DOORS AND FRAMES")).toBe("Hollow Metal Doors and Frames");
    expect(titleCase("Already Mixed")).toBe("Already Mixed");
  });

  it("types by the item's name, warranty before samples and test reports before certificates", () => {
    expect(specSubmittalType("Sample Warranty")).toBe("warranty");
    expect(specSubmittalType("Samples for Verification")).toBe("samples");
    expect(specSubmittalType("Certified Test Reports")).toBe("test_report");
    expect(specSubmittalType("Product Certificates")).toBe("certificate");
    expect(specSubmittalType("Operation and Maintenance Data")).toBe("o_and_m");
    expect(specSubmittalType("Maintenance Data")).toBe("o_and_m");
    expect(specSubmittalType("Mockups")).toBe("mock_up");
    expect(specSubmittalType("Qualification Data")).toBe("other");
  });

  it("notes where a row came from", () => {
    const [item] = readSpecSubmittals(DRYWALL).items;
    if (!item) throw new Error("no item");
    expect(specSubmittalNote(item)).toBe(
      "From the spec (09 29 00, Action submittals): Product Data: For each type of board, accessory and joint compound used on the job.",
    );
  });
});

// ---- a hand-built PDF of several pages, each with the project header and the section footer ----

function pdf(pages: string[][]) {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((lines, i) => {
    let content = "BT /F1 10 Tf\n";
    lines.forEach((l, r) => {
      content += `1 0 0 1 72 ${740 - r * 14} Tm (${l}) Tj\n`;
    });
    content += "ET";
    objects[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objects[5 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  const n = objects.length;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let k = 1; k < n; k++) {
    offsets[k] = out.length;
    out += `${k} 0 obj\n${objects[k]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let k = 1; k < n; k++) out += `${String(offsets[k]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

describe("specLinesFromPdf", () => {
  it("reads a spec PDF past the 40 pages other imports stop at, headers and footers dropped", async () => {
    const pages: string[][] = [];
    for (let p = 1; p <= 45; p++) {
      const body =
        p === 44
          ? [
              "SECTION 09 29 00 - GYPSUM BOARD",
              "1.3 ACTION SUBMITTALS",
              "A. Product Data: For each",
            ]
          : p === 45
            ? ["type of board.", "B. Samples: Each trim profile.", "END OF SECTION 09 29 00"]
            : [`1.${p} SUMMARY`, "A. Section includes work."];
      pages.push(["CLINIC TENANT IMPROVEMENT", ...body, `PROJECT MANUAL - ${p}`]);
    }
    const r = await specLinesFromPdf(pdf(pages));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pagesRead).toBe(45);
    expect(r.pageCount).toBe(45);
    const reading = readSpecSubmittals(r.lines);
    expect(reading.items.map((i) => i.text)).toEqual([
      "Product Data: For each type of board.",
      "Samples: Each trim profile.",
    ]);
  });

  it("says bytes that are not a PDF cannot be read", async () => {
    const r = await specLinesFromPdf(new TextEncoder().encode("hello"));
    expect(r.ok).toBe(false);
  });

  it("says a page with no text cannot be read", async () => {
    const r = await specLinesFromPdf(pdf([[]]));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/no text to read/);
  });
});
