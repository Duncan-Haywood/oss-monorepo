// Pins the checklist to the contents page of ISO 9001:2015(E), fifth edition 2015-09-15, as printed
// in the publisher-licensed preview on standards.iteh.ai (read 2026-11-26; docs/SOURCES.md, "ISO 9001").
// Only numbers and headings, the same table-of-contents stance as the library itself; no
// requirement text. If a row is renamed, renumbered or added, this fails until it matches the
// standard again (or the exception below is extended with a reason).
import { describe, expect, it } from "vitest";
import { ISO9001_CLAUSES, ISO9001_SECTIONS, ISO9001_VERIFICATION } from ".";

// Clauses 4 to 10 of the contents page, in printed order (73 entries: the seven sections and
// 66 clauses and subclauses, three levels deep).
const CONTENTS: ReadonlyArray<readonly [number: string, heading: string]> = [
  ["4", "Context of the organization"],
  ["4.1", "Understanding the organization and its context"],
  ["4.2", "Understanding the needs and expectations of interested parties"],
  ["4.3", "Determining the scope of the quality management system"],
  ["4.4", "Quality management system and its processes"],
  ["5", "Leadership"],
  ["5.1", "Leadership and commitment"],
  ["5.1.1", "General"],
  ["5.1.2", "Customer focus"],
  ["5.2", "Policy"],
  ["5.2.1", "Establishing the quality policy"],
  ["5.2.2", "Communicating the quality policy"],
  ["5.3", "Organizational roles, responsibilities and authorities"],
  ["6", "Planning"],
  ["6.1", "Actions to address risks and opportunities"],
  ["6.2", "Quality objectives and planning to achieve them"],
  ["6.3", "Planning of changes"],
  ["7", "Support"],
  ["7.1", "Resources"],
  ["7.1.1", "General"],
  ["7.1.2", "People"],
  ["7.1.3", "Infrastructure"],
  ["7.1.4", "Environment for the operation of processes"],
  ["7.1.5", "Monitoring and measuring resources"],
  ["7.1.6", "Organizational knowledge"],
  ["7.2", "Competence"],
  ["7.3", "Awareness"],
  ["7.4", "Communication"],
  ["7.5", "Documented information"],
  ["7.5.1", "General"],
  ["7.5.2", "Creating and updating"],
  ["7.5.3", "Control of documented information"],
  ["8", "Operation"],
  ["8.1", "Operational planning and control"],
  ["8.2", "Requirements for products and services"],
  ["8.2.1", "Customer communication"],
  ["8.2.2", "Determining the requirements for products and services"],
  ["8.2.3", "Review of the requirements for products and services"],
  ["8.2.4", "Changes to requirements for products and services"],
  ["8.3", "Design and development of products and services"],
  ["8.3.1", "General"],
  ["8.3.2", "Design and development planning"],
  ["8.3.3", "Design and development inputs"],
  ["8.3.4", "Design and development controls"],
  ["8.3.5", "Design and development outputs"],
  ["8.3.6", "Design and development changes"],
  ["8.4", "Control of externally provided processes, products and services"],
  ["8.4.1", "General"],
  ["8.4.2", "Type and extent of control"],
  ["8.4.3", "Information for external providers"],
  ["8.5", "Production and service provision"],
  ["8.5.1", "Control of production and service provision"],
  ["8.5.2", "Identification and traceability"],
  ["8.5.3", "Property belonging to customers or external providers"],
  ["8.5.4", "Preservation"],
  ["8.5.5", "Post-delivery activities"],
  ["8.5.6", "Control of changes"],
  ["8.6", "Release of products and services"],
  ["8.7", "Control of nonconforming outputs"],
  ["9", "Performance evaluation"],
  ["9.1", "Monitoring, measurement, analysis and evaluation"],
  ["9.1.1", "General"],
  ["9.1.2", "Customer satisfaction"],
  ["9.1.3", "Analysis and evaluation"],
  ["9.2", "Internal audit"],
  ["9.3", "Management review"],
  ["9.3.1", "General"],
  ["9.3.2", "Management review inputs"],
  ["9.3.3", "Management review outputs"],
  ["10", "Improvement"],
  ["10.1", "General"],
  ["10.2", "Nonconformity and corrective action"],
  ["10.3", "Continual improvement"],
];

const HEADING = new Map(CONTENTS.map(([n, h]) => [n, h]));
const parentOf = (n: string) => n.split(".").slice(0, -1).join(".");

describe("ISO 9001 checklist against the 2015 contents page", () => {
  it("uses only clause numbers the contents page prints", () => {
    const missing = ISO9001_CLAUSES.filter((c) => !HEADING.has(c.number)).map((c) => c.number);
    expect(missing).toEqual([]);
  });

  it("uses the printed heading, or '<parent heading>: general' for a General subclause", () => {
    for (const c of ISO9001_CLAUSES) {
      const printed = HEADING.get(c.number);
      const expected =
        printed === "General" ? `${HEADING.get(parentOf(c.number))}: general` : printed;
      expect(c.title, c.number).toBe(expected);
    }
  });

  it("keeps the printed order", () => {
    const order = CONTENTS.map(([n]) => n);
    const positions = ISO9001_CLAUSES.map((c) => order.indexOf(c.number));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("covers every contents entry, by its own row, a parent row or its subclause rows", () => {
    const rows = new Set(ISO9001_CLAUSES.map((c) => c.number));
    const covered = (n: string): boolean =>
      rows.has(n) ||
      (n.includes(".") && rows.has(parentOf(n))) ||
      ISO9001_CLAUSES.some((c) => c.number.startsWith(`${n}.`));
    expect(CONTENTS.map(([n]) => n).filter((n) => !covered(n))).toEqual([]);
  });

  it("names the seven sections as printed", () => {
    for (const [n, title] of Object.entries(ISO9001_SECTIONS)) expect(title).toBe(HEADING.get(n));
  });

  it("records what it was checked against", () => {
    expect(ISO9001_VERIFICATION.checkedAgainstCopy).toBe(true);
    expect(ISO9001_VERIFICATION.checkedOn).toBe("2026-11-26");
    expect(ISO9001_VERIFICATION.checkedAgainst).toContain("2015-09-15");
  });
});
