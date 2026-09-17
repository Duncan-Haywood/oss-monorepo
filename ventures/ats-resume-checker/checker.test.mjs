import test from "node:test";
import assert from "node:assert/strict";

import { analyze, summarize, SEVERITY } from "./checker.mjs";

const GOOD_RESUME = `Jordan Rivera
jordan.rivera@example.com | (555) 123-4567 | Springfield, IL

Professional Summary
Operations coordinator with 6 years of experience across logistics and retail.

Work Experience
Warehouse Supervisor, Acme Logistics, June 2020 - Present
- Cut pick-time errors 18% by rebuilding the FIFO checklist
- Trained a team of 12 seasonal hires each peak season

Shift Lead, Retail Co, March 2017 - May 2020
- Managed nightly reconciliation for a $40k/day register bank

Education
B.A. Business Administration, State University, 2016

Skills
Inventory systems, scheduling, Excel, conflict resolution
`;

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

test("a clean, well-formed resume produces no findings", () => {
  const result = analyze(GOOD_RESUME);
  assert.deepEqual(result.findings, []);
  assert.equal(summarize(result).level, "clean");
});

test("very little pasted text is flagged high severity", () => {
  const result = analyze("Jordan Rivera\njordan@example.com");
  assert.ok(findingIds(result).includes("too-short"));
  const finding = result.findings.find((f) => f.id === "too-short");
  assert.equal(finding.severity, SEVERITY.HIGH);
});

test("empty and non-string input do not throw", () => {
  assert.doesNotThrow(() => analyze(""));
  assert.doesNotThrow(() => analyze(undefined));
  assert.doesNotThrow(() => analyze(null));
  assert.equal(analyze(undefined).findings.length > 0, true);
});

test("private-use-area icon-font characters are flagged", () => {
  const text = GOOD_RESUME.replace("Cut pick-time", String.fromCharCode(0xe001) + " Cut pick-time");
  const result = analyze(text);
  assert.ok(findingIds(result).includes("private-use-glyphs"));
  const finding = result.findings.find((f) => f.id === "private-use-glyphs");
  assert.equal(finding.severity, SEVERITY.HIGH);
  assert.match(finding.title, /\d+ icon-font character/);
});

test("the unicode replacement character is flagged", () => {
  const result = analyze(GOOD_RESUME.replace("Jordan Rivera", "J�rdan Rivera"));
  assert.ok(findingIds(result).includes("replacement-char"));
});

test("no standard section headings is flagged", () => {
  const text = `Jordan Rivera
jordan.rivera@example.com | (555) 123-4567

My Journey
I have spent the last several years growing as a professional in logistics
and retail operations, taking on more responsibility each year of my career.

What I Bring
People skills, systems thinking, and a habit of showing up early, every day,
year after year, since 2016 when I first started in this field.
`;
  const result = analyze(text);
  assert.ok(findingIds(result).includes("no-standard-headings"));
});

test("a recognized heading word used mid-sentence does not count as a heading", () => {
  const text = `Jordan Rivera
jordan.rivera@example.com | (555) 123-4567

I have five years of experience in operations and a lot of skills to offer,
covering everything from scheduling to inventory education programs I ran
for new hires starting back in 2019.
`;
  const result = analyze(text);
  assert.ok(findingIds(result).includes("no-standard-headings"));
});

test("no email or phone anywhere is flagged high severity", () => {
  const text = GOOD_RESUME.replace(/jordan\.rivera@example\.com \| \(555\) 123-4567 \| /, "");
  const result = analyze(text);
  assert.ok(findingIds(result).includes("no-contact-info"));
  assert.equal(result.findings.find((f) => f.id === "no-contact-info").severity, SEVERITY.HIGH);
});

test("contact info found only deep in the document is flagged medium", () => {
  const body = "Work Experience\n" + "Filler line about a prior role and its responsibilities.\n".repeat(40);
  const text = `Jordan Rivera\n\n${body}\nEducation\nB.A., 2016\n\nContact: jordan.rivera@example.com, (555) 123-4567`;
  const result = analyze(text);
  assert.ok(findingIds(result).includes("contact-info-buried"));
  assert.equal(result.findings.find((f) => f.id === "contact-info-buried").severity, SEVERITY.MEDIUM);
});

test("no recognizable year is flagged", () => {
  const text = GOOD_RESUME.replace(/20\d\d/g, "").replace(/19\d\d/g, "");
  const result = analyze(text);
  assert.ok(findingIds(result).includes("no-dates"));
});

test("a plausible year in range is not flagged", () => {
  const result = analyze(GOOD_RESUME);
  assert.ok(!findingIds(result).includes("no-dates"));
});

test("repeated mid-line gaps suggest a collapsed multi-column layout", () => {
  const lines = [
    "Jordan Rivera",
    "jordan.rivera@example.com | (555) 123-4567",
    "",
    "Work Experience",
    "Warehouse Lead     Acme Logistics     2020",
    "Shift Supervisor     Retail Co     2018",
    "Stock Associate     Retail Co     2016",
    "",
    "Education",
    "B.A., State University, 2016",
  ];
  const result = analyze(lines.join("\n"));
  assert.ok(findingIds(result).includes("mid-line-gaps"));
  assert.equal(result.findings.find((f) => f.id === "mid-line-gaps").severity, SEVERITY.LOW);
});

test("two or fewer gap lines do not trigger the finding", () => {
  const lines = [
    "Jordan Rivera",
    "jordan.rivera@example.com | (555) 123-4567",
    "",
    "Work Experience",
    "Warehouse Lead     Acme Logistics     2020",
    "Shift Supervisor - Retail Co - 2018",
    "Stock Associate - Retail Co - 2016",
    "",
    "Education",
    "B.A., State University, 2016",
  ];
  const result = analyze(lines.join("\n"));
  assert.ok(!findingIds(result).includes("mid-line-gaps"));
});

test("findings are sorted most severe first", () => {
  const text = String.fromCharCode(0xe001) + " xx"; // too-short (high) + private-use-glyphs (high) + others
  const result = analyze(text);
  const ranks = { high: 0, medium: 1, low: 2, info: 3 };
  for (let i = 1; i < result.findings.length; i++) {
    assert.ok(ranks[result.findings[i - 1].severity] <= ranks[result.findings[i].severity]);
  }
});

test("summarize never phrases a result as pass or fail", () => {
  for (const text of ["", GOOD_RESUME, "�".repeat(5)]) {
    const { text: summary } = summarize(analyze(text));
    assert.ok(!/\bpass(es|ed)?\b/i.test(summary));
    assert.ok(!/\bfail(s|ed)?\b/i.test(summary));
  }
});

test("summarize reports highCount driving the headline", () => {
  const result = analyze("short");
  const { level, text } = summarize(result);
  assert.equal(level, "high");
  assert.match(text, /likely to affect ATS parsing/);
});

test("stats report character and line counts", () => {
  const result = analyze(GOOD_RESUME);
  assert.ok(result.stats.characters > 200);
  assert.ok(result.stats.lines > 5);
});
