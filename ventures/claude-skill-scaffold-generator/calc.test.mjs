import test from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  checkName,
  buildDescription,
  checkDescription,
  parseBundleLines,
  buildFolderTree,
  renderSkillMd,
  scaffold,
  summaryText,
} from "./calc.mjs";

test("slugify lowercases, hyphenates, and strips punctuation", () => {
  assert.equal(slugify("PDF Form Filler"), "pdf-form-filler");
  assert.equal(slugify("  spaced  out  "), "spaced-out");
  assert.equal(slugify("weird!!chars??"), "weird-chars");
  assert.equal(slugify(""), "");
  assert.equal(slugify("already-a-slug"), "already-a-slug");
});

test("checkName flags an empty name as high severity and does not crash", () => {
  const { slug, findings } = checkName("");
  assert.equal(slug, "");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].category, "empty-name");
});

test("checkName flags a name that wasn't already a slug, but still slugifies it", () => {
  const { slug, findings } = checkName("My New Skill");
  assert.equal(slug, "my-new-skill");
  assert.ok(findings.some((f) => f.category === "name-not-slug"));
});

test("checkName flags an over-length name as a caution, not an error", () => {
  const { findings } = checkName("a".repeat(80));
  const f = findings.find((f2) => f2.category === "name-too-long");
  assert.ok(f);
  assert.equal(f.severity, "medium");
});

test("checkName accepts an already-clean slug with no findings", () => {
  const { slug, findings } = checkName("pdf-form-filler");
  assert.equal(slug, "pdf-form-filler");
  assert.equal(findings.length, 0);
});

test("buildDescription joins what-it-does and when-to-use into one third-person sentence", () => {
  const d = buildDescription("Fills out a PDF form from a CSV of answers", "the user has a PDF form and a spreadsheet of values to put in it");
  assert.equal(d, "Fills out a PDF form from a CSV of answers. Use when the user has a PDF form and a spreadsheet of values to put in it.");
});

test("buildDescription does not double up an already-phrased when-clause", () => {
  const d = buildDescription("Does the thing.", "Use this whenever a user pastes a spreadsheet.");
  assert.equal(d, "Does the thing. Use this whenever a user pastes a spreadsheet.");
});

test("buildDescription handles either half being empty without throwing", () => {
  assert.equal(buildDescription("Only what.", ""), "Only what.");
  assert.equal(buildDescription("", "only when"), "Use when only when.");
  assert.equal(buildDescription("", ""), "");
});

test("checkDescription flags both halves missing as high severity", () => {
  const { findings } = checkDescription("", "");
  assert.equal(findings.filter((f) => f.severity === "high").length, 2);
  assert.ok(findings.some((f) => f.category === "empty-what"));
  assert.ok(findings.some((f) => f.category === "empty-when"));
});

test("checkDescription flags a first-person opening", () => {
  const { findings } = checkDescription("I will fill out PDF forms for you", "the user has a form");
  assert.ok(findings.some((f) => f.category === "first-person-description"));
});

test("checkDescription flags a too-short generated description", () => {
  const { findings, description } = checkDescription("Does X.", "");
  assert.ok(description.length < 20);
  assert.ok(findings.some((f) => f.category === "description-too-short"));
});

test("checkDescription flags an over-length generated description as a caution", () => {
  const { findings } = checkDescription("W".repeat(600), "some trigger condition that is also fairly long ".repeat(10));
  const f = findings.find((f2) => f2.category === "description-too-long");
  assert.ok(f);
  assert.equal(f.severity, "medium");
});

test("checkDescription has no findings for a clean, well-formed pair", () => {
  const { findings } = checkDescription(
    "Validates a pasted CSV against a target schema and reports every row that fails.",
    "the user pastes tabular data and a schema and asks whether it validates",
  );
  assert.equal(findings.length, 0);
});

test("parseBundleLines splits 'path — purpose' and 'path - purpose' lines, and keeps a bare path", () => {
  const parsed = parseBundleLines("validate.py — checks the schema\nfill.py - fills the template\nbare-path-only\n\n");
  assert.deepEqual(parsed, [
    { path: "validate.py", purpose: "checks the schema" },
    { path: "fill.py", purpose: "fills the template" },
    { path: "bare-path-only", purpose: "" },
  ]);
});

test("parseBundleLines returns an empty array for blank input", () => {
  assert.deepEqual(parseBundleLines(""), []);
  assert.deepEqual(parseBundleLines("   \n  \n"), []);
});

test("buildFolderTree includes only the bundle kinds actually supplied", () => {
  const tree = buildFolderTree("my-skill", { scripts: [{ path: "run.py", purpose: "does the thing" }], references: [], assets: [] });
  assert.match(tree, /^my-skill\/\n {2}SKILL\.md\n {2}scripts\/\n {4}run\.py {2}# does the thing$/);
  assert.doesNotMatch(tree, /references\//);
  assert.doesNotMatch(tree, /assets\//);
});

test("buildFolderTree with nothing bundled is just SKILL.md", () => {
  const tree = buildFolderTree("bare-skill", { scripts: [], references: [], assets: [] });
  assert.equal(tree, "bare-skill/\n  SKILL.md");
});

test("renderSkillMd produces parseable YAML-shaped frontmatter with the right keys", () => {
  const md = renderSkillMd({ slug: "pdf-form-filler", description: "Fills out a PDF form. Use when asked.", title: "", bundles: { scripts: [], references: [], assets: [] } });
  assert.match(md, /^---\nname: pdf-form-filler\ndescription: Fills out a PDF form\. Use when asked\.\n---\n\n# Pdf form filler\n/);
});

test("renderSkillMd YAML-escapes a description containing a colon or quote", () => {
  const md = renderSkillMd({ slug: "s", description: 'Handles "quoted" text: carefully.', title: "", bundles: { scripts: [], references: [], assets: [] } });
  const frontmatterLine = md.split("\n").find((l) => l.startsWith("description:"));
  assert.equal(frontmatterLine, 'description: "Handles \\"quoted\\" text: carefully."');
});

test("renderSkillMd lists bundled files in the body under their kind", () => {
  const md = renderSkillMd({
    slug: "s",
    description: "d.",
    title: "",
    bundles: { scripts: [{ path: "run.py", purpose: "runs it" }], references: [{ path: "spec.md", purpose: "" }], assets: [] },
  });
  assert.match(md, /## Files this skill bundles/);
  assert.match(md, /- `scripts\/run\.py` — runs it/);
  assert.match(md, /- `references\/spec\.md`\n/);
  assert.doesNotMatch(md, /\*\*Assets/);
});

test("renderSkillMd with no bundles omits the files section entirely", () => {
  const md = renderSkillMd({ slug: "s", description: "d.", title: "", bundles: { scripts: [], references: [], assets: [] } });
  assert.doesNotMatch(md, /Files this skill bundles/);
});

test("scaffold ties name, description, and bundle checks together and always returns generated text", () => {
  const result = scaffold({
    name: "My Skill",
    whatItDoes: "Validates a pasted CSV against a schema.",
    whenToUse: "the user pastes tabular data and a schema",
    title: "",
    scriptsText: "validate.py — checks the schema",
    referencesText: "",
    assetsText: "",
  });
  assert.equal(result.slug, "my-skill");
  assert.ok(result.findings.some((f) => f.category === "name-not-slug"));
  assert.equal(result.counts.high, 0);
  assert.match(result.skillMd, /name: my-skill/);
  assert.match(result.folderTree, /scripts\/\n {4}validate\.py/);
});

test("scaffold still generates a best-effort SKILL.md even with every field empty", () => {
  const result = scaffold({ name: "", whatItDoes: "", whenToUse: "", title: "", scriptsText: "", referencesText: "", assetsText: "" });
  assert.equal(result.counts.high, 3);
  assert.match(result.skillMd, /name: your-skill-name/);
});

test("summaryText reports zero findings plainly and names the slug", () => {
  const result = scaffold({
    name: "clean-skill",
    whatItDoes: "Does one well-scoped thing.",
    whenToUse: "the user explicitly asks for that thing by name",
    title: "",
    scriptsText: "",
    referencesText: "",
    assetsText: "",
  });
  const text = summaryText(result);
  assert.match(text, /^Claude skill scaffold for "clean-skill": 0 finding\(s\)/);
  assert.match(text, /No authoring issues observed/);
});

test("summaryText lists every finding with severity and category", () => {
  const result = scaffold({ name: "", whatItDoes: "", whenToUse: "", title: "", scriptsText: "", referencesText: "", assetsText: "" });
  const text = summaryText(result);
  assert.match(text, /\[HIGH\] name -- empty-name/);
  assert.match(text, /\[HIGH\] whatItDoes -- empty-what/);
  assert.match(text, /\[HIGH\] whenToUse -- empty-when/);
});
