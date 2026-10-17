import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSkillFile,
  checkRequiredFields,
  checkDescriptionVagueness,
  checkBodySize,
  checkOverlap,
  lintSkills,
  summaryText,
} from "./calc.mjs";

const GOOD_SKILL = `---
name: pdf-form-filler
description: Use when the user asks to fill out a PDF form, extract form field values, or flatten a completed PDF form into a final document, e.g. "fill in this W-9 PDF with my details".
---

# PDF Form Filler

1. Read the form fields from the uploaded PDF.
2. Map the user's supplied values onto each field by name.
3. Flatten the form and return the completed PDF.
`;

// ---- parseSkillFile ---------------------------------------------------------

test("parses a well-formed frontmatter block and body", () => {
  const parsed = parseSkillFile(GOOD_SKILL);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.name, "pdf-form-filler");
  assert.match(parsed.data.description, /Use when the user asks to fill out a PDF form/);
  assert.match(parsed.body, /# PDF Form Filler/);
});

test("reports a missing opening delimiter", () => {
  const parsed = parseSkillFile(`name: foo\ndescription: bar baz qux quux corge grault garply\n---\nbody`);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /opening "---"/);
});

test("reports a missing closing delimiter", () => {
  const parsed = parseSkillFile(`---\nname: foo\ndescription: bar`);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /closing "---"/);
});

test("reports an unparseable frontmatter line", () => {
  const parsed = parseSkillFile(`---\nname: foo\nthis is not a key value line\n---\nbody`);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /Could not parse frontmatter line/);
});

test("reports unexpected indentation outside a block scalar or list", () => {
  const parsed = parseSkillFile(`---\nname: foo\n  stray indented line\n---\nbody`);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /Unexpected indentation/);
});

test("strips matching quotes from a scalar value", () => {
  const parsed = parseSkillFile(`---\nname: "foo-bar"\ndescription: 'single quoted description text here'\n---\n`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.name, "foo-bar");
  assert.equal(parsed.data.description, "single quoted description text here");
});

test("folds a bare indented multi-line scalar with no block indicator", () => {
  const parsed = parseSkillFile(
    `---\nname: foo\ndescription:\n  Use when the user asks about invoices,\n  e.g. "create an invoice for client X".\n---\nbody`,
  );
  assert.equal(parsed.ok, true);
  assert.equal(
    parsed.data.description,
    'Use when the user asks about invoices, e.g. "create an invoice for client X".',
  );
});

test("folds a '>' block scalar by collapsing newlines to spaces", () => {
  const parsed = parseSkillFile(
    `---\nname: foo\ndescription: >-\n  Use when the user asks to review\n  a pull request diff for security issues.\n---\nbody`,
  );
  assert.equal(parsed.data.description, "Use when the user asks to review a pull request diff for security issues.");
});

test("keeps line breaks in a '|' literal block scalar", () => {
  const parsed = parseSkillFile(`---\nname: foo\nnotes: |\n  line one\n  line two\n---\nbody`);
  assert.equal(parsed.data.notes, "line one\nline two");
});

test("parses a simple '- item' list value", () => {
  const parsed = parseSkillFile(`---\nname: foo\nallowed-tools:\n  - Read\n  - Write\n---\nbody`);
  assert.deepEqual(parsed.data["allowed-tools"], ["Read", "Write"]);
});

test("an empty value with no continuation lines parses as an empty string", () => {
  const parsed = parseSkillFile(`---\nname: foo\ndescription:\n---\nbody`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.description, "");
});

test("comment and blank lines inside frontmatter are ignored", () => {
  const parsed = parseSkillFile(`---\n# a comment\nname: foo\n\ndescription: bar baz qux quux corge grault garply\n---\nbody`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.name, "foo");
});

test("CRLF line endings are handled the same as LF", () => {
  const crlf = GOOD_SKILL.replace(/\n/g, "\r\n");
  const parsed = parseSkillFile(crlf);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.name, "pdf-form-filler");
});

// ---- checkRequiredFields -----------------------------------------------------

test("flags a missing name", () => {
  const parsed = parseSkillFile(`---\ndescription: bar baz qux quux corge grault garply\n---\nbody`);
  const findings = checkRequiredFields(parsed);
  assert.ok(findings.some((f) => f.source === "name" && f.category === "missing-field"));
});

test("flags a missing description", () => {
  const parsed = parseSkillFile(`---\nname: foo\n---\nbody`);
  const findings = checkRequiredFields(parsed);
  assert.ok(findings.some((f) => f.source === "description" && f.category === "missing-field"));
});

test("flags a blank-string description the same as a missing one", () => {
  const parsed = parseSkillFile(`---\nname: foo\ndescription: "   "\n---\nbody`);
  const findings = checkRequiredFields(parsed);
  assert.ok(findings.some((f) => f.source === "description" && f.category === "missing-field"));
});

test("flags a name that is not kebab-case", () => {
  const parsed = parseSkillFile(`---\nname: My_Skill Name\ndescription: bar baz qux quux corge grault garply\n---\nbody`);
  const findings = checkRequiredFields(parsed);
  assert.ok(findings.some((f) => f.source === "name" && f.category === "malformed-name"));
});

test("accepts a valid kebab-case name with digits", () => {
  const parsed = parseSkillFile(`---\nname: pdf2-form-filler-v2\ndescription: bar baz qux quux corge grault garply\n---\nbody`);
  const findings = checkRequiredFields(parsed);
  assert.equal(findings.some((f) => f.source === "name"), false);
});

test("a fully valid frontmatter produces no required-field findings", () => {
  const parsed = parseSkillFile(GOOD_SKILL);
  assert.deepEqual(checkRequiredFields(parsed), []);
});

// ---- checkDescriptionVagueness ------------------------------------------------

test("flags a description under the word-count floor", () => {
  const findings = checkDescriptionVagueness("Helps with PDFs.");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "description-too-short");
});

test("flags a description with no trigger cue even at a reasonable length", () => {
  // Long enough, and every word is concrete enough to clear the filler
  // floor, but nothing tells an agent *when* to reach for it.
  const description = "Fills out federal tax forms, invoices, contracts, and lease agreements using uploaded PDF templates and client-supplied field values.";
  const findings = checkDescriptionVagueness(description);
  assert.ok(findings.some((f) => f.category === "description-no-trigger-cue"));
});

test("flags a description built mostly from generic filler words", () => {
  const description = "This skill provides general assistance with various tasks and handles many different things related to your work and other stuff.";
  const findings = checkDescriptionVagueness(description);
  assert.ok(findings.some((f) => f.category === "description-too-generic"));
});

test("a concrete description with a trigger cue and real vocabulary is clean", () => {
  const findings = checkDescriptionVagueness(
    'Use when the user asks to review a pull request diff for security issues, e.g. injected secrets, unsafe eval calls, or overly broad file permissions.',
  );
  assert.deepEqual(findings, []);
});

test("a too-short description reports only the short-description finding, not also generic/no-cue", () => {
  const findings = checkDescriptionVagueness("Helps with PDFs.");
  assert.equal(findings.length, 1);
});

test("'whenever' and 'such as' both count as a trigger cue", () => {
  assert.deepEqual(
    checkDescriptionVagueness(
      "Normalizes shipping addresses whenever an order is imported, handling formats such as PO boxes, military addresses, and international postal codes.",
    ).filter((f) => f.category === "description-no-trigger-cue"),
    [],
  );
});

// ---- checkBodySize ------------------------------------------------------------

test("a short body gets no size finding", () => {
  assert.deepEqual(checkBodySize("Read the file. Do the thing. Return the result."), []);
});

test("an empty body gets no size finding", () => {
  assert.deepEqual(checkBodySize(""), []);
  assert.deepEqual(checkBodySize("   "), []);
});

test("flags a body past the caution threshold as low severity", () => {
  const body = "word ".repeat(1700); // ~8500 chars / 4 ~= 2125 estimated tokens
  const findings = checkBodySize(body);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "low");
  assert.equal(findings[0].category, "oversized-body");
});

test("flags a body past the high threshold as medium severity", () => {
  const body = "word ".repeat(5000); // ~25000 chars / 4 ~= 6250 estimated tokens
  const findings = checkBodySize(body);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
});

// ---- checkOverlap ---------------------------------------------------------------

test("flags two skills whose descriptions share distinctive vocabulary", () => {
  const skills = [
    {
      name: "pdf-form-filler",
      description: "Use when the user asks to fill out a PDF form, extract PDF form field values, or flatten a completed PDF form for signing.",
    },
    {
      name: "pdf-form-autopopulate",
      description: "Trigger when the user wants to fill a PDF form automatically, populate PDF form field values, or flatten a completed PDF form for review.",
    },
  ];
  const findings = checkOverlap(skills);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "overlapping-trigger");
  assert.equal(findings[0].skillA, "pdf-form-filler");
  assert.equal(findings[0].skillB, "pdf-form-autopopulate");
  assert.ok(findings[0].sharedWords.includes("pdf"));
  assert.ok(findings[0].sharedWords.includes("form"));
});

test("does not flag two skills with distinct subject matter", () => {
  const skills = [
    {
      name: "pdf-form-filler",
      description: "Use when the user asks to fill out a PDF form, extract PDF form field values, or flatten a completed PDF form for signing.",
    },
    {
      name: "dockerfile-hardening-check",
      description: "Use when the user asks to review a Dockerfile for a missing HEALTHCHECK, root user execution, or an unpinned base image tag.",
    },
  ];
  assert.deepEqual(checkOverlap(skills), []);
});

test("skips a pair where one description is too short to carry a meaningful signal", () => {
  const skills = [
    { name: "a", description: "PDF form filling and flattening." },
    { name: "b", description: "PDF." },
  ];
  assert.deepEqual(checkOverlap(skills), []);
});

test("three skills report only the overlapping pair", () => {
  const skills = [
    {
      name: "pdf-form-filler",
      description: "Use when the user asks to fill out a PDF form, extract PDF form field values, or flatten a completed PDF form for signing.",
    },
    {
      name: "pdf-form-autopopulate",
      description: "Trigger when the user wants to fill a PDF form automatically, populate PDF form field values, or flatten a completed PDF form for review.",
    },
    {
      name: "dockerfile-hardening-check",
      description: "Use when the user asks to review a Dockerfile for a missing HEALTHCHECK, root user execution, or an unpinned base image tag.",
    },
  ];
  const findings = checkOverlap(skills);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].skillA, "pdf-form-filler");
  assert.equal(findings[0].skillB, "pdf-form-autopopulate");
});

// ---- lintSkills / summaryText ----------------------------------------------------

test("lintSkills requires at least one text", () => {
  assert.throws(() => lintSkills([]), /At least one SKILL\.md is required/);
});

test("a fully valid single skill produces no findings", () => {
  const result = lintSkills([GOOD_SKILL]);
  assert.equal(result.skills.length, 1);
  assert.equal(result.skills[0].name, "pdf-form-filler");
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.counts, { high: 0, medium: 0, low: 0 });
});

test("an unparseable skill reports an invalid-frontmatter finding rather than throwing", () => {
  const result = lintSkills(["not a skill file at all"]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].category, "invalid-frontmatter");
  assert.equal(result.counts.high, 1);
});

test("lintSkills with 2+ skills also runs the overlap check", () => {
  const a = `---\nname: pdf-form-filler\ndescription: Use when the user asks to fill out a PDF form, extract PDF form field values, or flatten a completed PDF form for signing.\n---\nbody`;
  const b = `---\nname: pdf-form-autopopulate\ndescription: Trigger when the user wants to fill a PDF form automatically, populate PDF form field values, or flatten a completed PDF form for review.\n---\nbody`;
  const result = lintSkills([a, b]);
  assert.equal(result.overlapFindings.length, 1);
  assert.ok(result.findings.some((f) => f.category === "overlapping-trigger"));
});

test("a single pasted skill runs no overlap check", () => {
  const result = lintSkills([GOOD_SKILL]);
  assert.deepEqual(result.overlapFindings, []);
});

test("summaryText reports a clean skill honestly, without claiming it will trigger", () => {
  const text = summaryText(lintSkills([GOOD_SKILL]));
  assert.match(text, /No structural issues observed/);
  assert.match(text, /not a claim that the skill will trigger correctly/);
});

test("summaryText lists every finding including overlap pairs by skill name", () => {
  const a = `---\nname: pdf-form-filler\ndescription: Use when the user asks to fill out a PDF form, extract PDF form field values, or flatten a completed PDF form for signing.\n---\nbody`;
  const b = `---\nname: pdf-form-autopopulate\ndescription: Trigger when the user wants to fill a PDF form automatically, populate PDF form field values, or flatten a completed PDF form for review.\n---\nbody`;
  const text = summaryText(lintSkills([a, b]));
  assert.match(text, /pdf-form-filler \/ pdf-form-autopopulate -- overlapping-trigger/);
  assert.match(text, /not a guarantee the skill will or will not trigger correctly/);
});

// ---- end to end on a realistic mixed bundle ---------------------------------

test("end to end: a bundle with one clean skill and one skill with several problems", () => {
  const messy = `---\nname: My Helper\ndescription: Helps with stuff.\n---\nDo things.`;
  const result = lintSkills([GOOD_SKILL, messy]);
  const messySkill = result.skills[1];
  assert.equal(messySkill.name, "My Helper");
  const categories = new Set(messySkill.findings.map((f) => f.category));
  assert.ok(categories.has("malformed-name"));
  assert.ok(categories.has("description-too-short"));
  const goodSkill = result.skills[0];
  assert.deepEqual(goodSkill.findings, []);
});
