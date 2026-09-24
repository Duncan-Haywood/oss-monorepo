import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAgentFile,
  checkRequiredFields,
  checkDescriptionVagueness,
  checkTools,
  checkModel,
  checkBody,
  lintAgent,
  summaryText,
  KNOWN_BUILTIN_TOOLS,
  KNOWN_MODEL_ALIASES,
} from "./calc.mjs";

const GOOD_DESCRIPTION =
  "Use this agent PROACTIVELY whenever a pull request is opened, to review the diff for correctness bugs before a human looks at it.";

// ---- parseAgentFile ---------------------------------------------------------

test("parseAgentFile: missing opening delimiter is an error", () => {
  const result = parseAgentFile("name: x\ndescription: y\n---\nbody");
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /opening/);
});

test("parseAgentFile: missing closing delimiter is an error", () => {
  const result = parseAgentFile("---\nname: x\ndescription: y\nbody with no closer");
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /closing/);
});

test("parseAgentFile: well-formed file parses frontmatter and body separately", () => {
  const result = parseAgentFile(`---\nname: code-reviewer\ndescription: ${GOOD_DESCRIPTION}\ntools: Read, Grep\nmodel: sonnet\n---\nYou are a meticulous code reviewer.\nLook for bugs, not style.`);
  assert.equal(result.ok, true);
  assert.equal(result.data.name, "code-reviewer");
  assert.equal(result.data.tools, "Read, Grep");
  assert.equal(result.data.model, "sonnet");
  assert.match(result.body, /meticulous code reviewer/);
});

test("parseAgentFile: tools as a YAML list parses as an array", () => {
  const result = parseAgentFile(`---\nname: x\ndescription: ${GOOD_DESCRIPTION}\ntools:\n  - Read\n  - Grep\n---\nbody text here that is long enough to pass.`);
  assert.deepEqual(result.data.tools, ["Read", "Grep"]);
});

test("parseAgentFile: quoted scalar values are unquoted", () => {
  const result = parseAgentFile('---\nname: "code-reviewer"\ndescription: "quoted description"\n---\nbody');
  assert.equal(result.data.name, "code-reviewer");
  assert.equal(result.data.description, "quoted description");
});

test("parseAgentFile: a blank body after the frontmatter is empty, not an error", () => {
  const result = parseAgentFile("---\nname: x\ndescription: y\n---\n");
  assert.equal(result.ok, true);
  assert.equal(result.body, "");
});

// ---- checkRequiredFields -----------------------------------------------

test("checkRequiredFields: missing name is a high finding", () => {
  const parsed = { data: { description: GOOD_DESCRIPTION } };
  const findings = checkRequiredFields(parsed);
  assert.ok(findings.some((f) => f.source === "name" && f.category === "missing-field" && f.severity === "high"));
});

test("checkRequiredFields: missing description is a high finding", () => {
  const parsed = { data: { name: "code-reviewer" } };
  const findings = checkRequiredFields(parsed);
  assert.ok(findings.some((f) => f.source === "description" && f.category === "missing-field" && f.severity === "high"));
});

test("checkRequiredFields: a well-formed name/description with no expected filename produces no findings", () => {
  const parsed = { data: { name: "code-reviewer", description: GOOD_DESCRIPTION } };
  assert.deepEqual(checkRequiredFields(parsed), []);
});

test("checkRequiredFields: a non-kebab-case name is flagged", () => {
  const parsed = { data: { name: "CodeReviewer", description: GOOD_DESCRIPTION } };
  const findings = checkRequiredFields(parsed);
  assert.ok(findings.some((f) => f.category === "malformed-name" && f.severity === "medium"));
});

test("checkRequiredFields: underscore in the name is flagged as not kebab-case", () => {
  const parsed = { data: { name: "code_reviewer", description: GOOD_DESCRIPTION } };
  const findings = checkRequiredFields(parsed);
  assert.ok(findings.some((f) => f.category === "malformed-name"));
});

test("checkRequiredFields: name matching the expected filename produces no mismatch finding", () => {
  const parsed = { data: { name: "code-reviewer", description: GOOD_DESCRIPTION } };
  const findings = checkRequiredFields(parsed, "code-reviewer.md");
  assert.equal(findings.some((f) => f.category === "name-filename-mismatch"), false);
});

test("checkRequiredFields: name not matching the expected filename is flagged", () => {
  const parsed = { data: { name: "code-reviewer", description: GOOD_DESCRIPTION } };
  const findings = checkRequiredFields(parsed, "reviewer.md");
  assert.ok(findings.some((f) => f.category === "name-filename-mismatch" && f.severity === "medium"));
});

// ---- checkDescriptionVagueness ------------------------------------------

test("checkDescriptionVagueness: a short description is flagged and nothing else runs", () => {
  const findings = checkDescriptionVagueness("Reviews code.");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "description-too-short");
});

test("checkDescriptionVagueness: a long description with no trigger cue is flagged for that", () => {
  const findings = checkDescriptionVagueness("This subagent reviews pull requests and provides useful feedback on various coding tasks and issues found in the changes.");
  assert.ok(findings.some((f) => f.category === "description-no-trigger-cue"));
});

test("checkDescriptionVagueness: filler-heavy description is flagged as too generic", () => {
  const findings = checkDescriptionVagueness("Use this agent when you need help with various tasks and general support for many different things and stuff related to your work.");
  assert.ok(findings.some((f) => f.category === "description-too-generic"));
});

test("checkDescriptionVagueness: a concrete description with a trigger cue and real content is clean", () => {
  assert.deepEqual(checkDescriptionVagueness(GOOD_DESCRIPTION), []);
});

test("checkDescriptionVagueness: 'MUST BE USED' counts as a trigger cue", () => {
  const findings = checkDescriptionVagueness("This agent MUST BE USED for any database migration file added under the migrations directory in this repository.");
  assert.equal(findings.some((f) => f.category === "description-no-trigger-cue"), false);
});

// ---- checkTools --------------------------------------------------------

test("checkTools: omitted tools (inherits everything) produces no findings", () => {
  assert.deepEqual(checkTools(undefined), []);
});

test("checkTools: every known built-in tool is accepted without a caution", () => {
  for (const tool of KNOWN_BUILTIN_TOOLS) {
    assert.deepEqual(checkTools(tool), [], tool);
  }
});

test("checkTools: an mcp__server__tool style name is accepted without a caution", () => {
  assert.deepEqual(checkTools("mcp__github__search_code"), []);
});

test("checkTools: an unrecognized plain tool name is a low caution, not an error", () => {
  const findings = checkTools("Bahs");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "unrecognized-tool-name");
  assert.equal(findings[0].severity, "low");
});

test("checkTools: a malformed tool name (bad characters) is flagged", () => {
  const findings = checkTools("Read, Bash-Tool");
  assert.ok(findings.some((f) => f.category === "malformed-tool-name"));
});

test("checkTools: an empty entry from a trailing comma is flagged", () => {
  const findings = checkTools("Read, Grep,");
  assert.ok(findings.some((f) => f.category === "empty-tool-entry"));
});

test("checkTools: a duplicated tool name is flagged", () => {
  const findings = checkTools("Read, Read");
  assert.ok(findings.some((f) => f.category === "duplicate-tool"));
});

test("checkTools: a YAML-list tools value is checked the same way as a comma string", () => {
  const findings = checkTools(["Read", "Read"]);
  assert.ok(findings.some((f) => f.category === "duplicate-tool"));
});

test("checkTools: a non-list, non-string tools value is a high finding", () => {
  const findings = checkTools(42);
  assert.ok(findings.some((f) => f.category === "tools-not-list" && f.severity === "high"));
});

// ---- checkModel ----------------------------------------------------------

test("checkModel: omitted model produces no findings", () => {
  assert.deepEqual(checkModel(undefined), []);
});

test("checkModel: every known alias is accepted without a caution", () => {
  for (const alias of KNOWN_MODEL_ALIASES) {
    assert.deepEqual(checkModel(alias), [], alias);
  }
});

test("checkModel: a full model id shaped like claude-* is accepted", () => {
  assert.deepEqual(checkModel("claude-sonnet-4-20250514"), []);
});

test("checkModel: an unrecognized value is a low caution", () => {
  const findings = checkModel("gpt-4");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "unrecognized-model");
  assert.equal(findings[0].severity, "low");
});

test("checkModel: an empty string is a high finding", () => {
  const findings = checkModel("");
  assert.ok(findings.some((f) => f.category === "model-not-string" && f.severity === "high"));
});

// ---- checkBody -----------------------------------------------------------

test("checkBody: an empty body is a high finding", () => {
  const findings = checkBody("");
  assert.ok(findings.some((f) => f.category === "empty-body" && f.severity === "high"));
});

test("checkBody: a near-empty body is a medium finding", () => {
  const findings = checkBody("Be helpful.");
  assert.ok(findings.some((f) => f.category === "near-empty-body" && f.severity === "medium"));
});

test("checkBody: a real instruction body produces no findings", () => {
  const body = "You are a meticulous senior engineer reviewing a pull request diff. Read every changed file in full before commenting. Flag correctness bugs first, then reuse and simplification opportunities. Never invent a bug you have not traced through the code.";
  assert.deepEqual(checkBody(body), []);
});

// ---- lintAgent / summaryText ----------------------------------------------

test("lintAgent: a clean, well-formed subagent definition produces no findings", () => {
  const text = `---\nname: code-reviewer\ndescription: ${GOOD_DESCRIPTION}\ntools: Read, Grep, Glob\nmodel: sonnet\n---\nYou are a meticulous senior engineer reviewing a pull request diff. Read every changed file in full before commenting. Flag correctness bugs first, then reuse and simplification opportunities.`;
  const result = lintAgent(text, "code-reviewer.md");
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.counts, { high: 0, medium: 0, low: 0 });
});

test("lintAgent: invalid frontmatter short-circuits the rest of the checks", () => {
  const result = lintAgent("no delimiter here at all");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].category, "invalid-frontmatter");
});

test("lintAgent: findings from every section appear together", () => {
  const text = `---\nname: BadName\ndescription: short\ntools: Read,,Bahs\nmodel: gpt-4\n---\nhi`;
  const result = lintAgent(text);
  const categories = result.findings.map((f) => f.category);
  assert.ok(categories.includes("malformed-name"));
  assert.ok(categories.includes("description-too-short"));
  assert.ok(categories.includes("empty-tool-entry"));
  assert.ok(categories.includes("unrecognized-tool-name"));
  assert.ok(categories.includes("unrecognized-model"));
  assert.ok(categories.includes("near-empty-body"));
});

test("summaryText: reports a clean result without claiming delegation behaviour", () => {
  const text = summaryText({ findings: [], counts: { high: 0, medium: 0, low: 0 } });
  assert.match(text, /No structural issues observed/);
  assert.match(text, /not a claim/);
});

test("summaryText: lists every finding with its severity and source", () => {
  const findings = [{ source: "description", category: "missing-field", severity: "high", detail: "No description." }];
  const text = summaryText({ findings, counts: { high: 1, medium: 0, low: 0 } });
  assert.match(text, /\[HIGH\] description -- missing-field: No description\./);
});
