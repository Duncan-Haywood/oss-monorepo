import test from "node:test";
import assert from "node:assert/strict";
import {
  parseExampleFile,
  scanSource,
  mergeReferenced,
  diffEnv,
  summarize,
  CHECKED_LANGUAGES,
} from "./engine.mjs";

test("parseExampleFile: declares plain KEY=value lines", () => {
  const declared = parseExampleFile("DATABASE_URL=postgres://x\nPORT=3000\n");
  assert.deepEqual([...declared.keys()].sort(), ["DATABASE_URL", "PORT"]);
});

test("parseExampleFile: skips blank lines and comments", () => {
  const declared = parseExampleFile("# comment\n\nAPI_KEY=\n  # indented comment\n");
  assert.deepEqual([...declared.keys()], ["API_KEY"]);
});

test("parseExampleFile: tolerates a leading export", () => {
  const declared = parseExampleFile("export FOO=bar\n");
  assert.ok(declared.has("FOO"));
});

test("parseExampleFile: records the line number", () => {
  const declared = parseExampleFile("\n\nTHIRD_LINE=x\n");
  assert.equal(declared.get("THIRD_LINE").line, 3);
});

test("parseExampleFile: never reads past the first =, value ignored", () => {
  const declared = parseExampleFile("SECRET=super=secret=value\n");
  assert.deepEqual([...declared.keys()], ["SECRET"]);
});

test("scanSource: finds process.env.FOO", () => {
  const referenced = scanSource("const x = process.env.API_KEY;");
  assert.ok(referenced.has("API_KEY"));
});

test("scanSource: finds process.env[\"FOO\"] and process.env['FOO']", () => {
  const referenced = scanSource(`a(process.env["ONE"]); b(process.env['TWO']);`);
  assert.deepEqual([...referenced.keys()].sort(), ["ONE", "TWO"]);
});

test("scanSource: finds Python os.getenv / os.environ / os.environ.get", () => {
  const referenced = scanSource([
    'a = os.getenv("ALPHA")',
    'b = os.environ["BETA"]',
    'c = os.environ.get("GAMMA")',
  ].join("\n"));
  assert.deepEqual([...referenced.keys()].sort(), ["ALPHA", "BETA", "GAMMA"]);
});

test("scanSource: finds Ruby ENV[] and ENV.fetch", () => {
  const referenced = scanSource(`a = ENV["ONE"]\nb = ENV.fetch("TWO")`);
  assert.deepEqual([...referenced.keys()].sort(), ["ONE", "TWO"]);
});

test("scanSource: finds Java System.getenv", () => {
  const referenced = scanSource('String a = System.getenv("JAVA_VAR");');
  assert.ok(referenced.has("JAVA_VAR"));
});

test("scanSource: records file and line for each occurrence", () => {
  const referenced = scanSource("\nconst x = process.env.FOO;\n", "app.js");
  const occ = referenced.get("FOO");
  assert.equal(occ[0].file, "app.js");
  assert.equal(occ[0].line, 2);
});

test("scanSource: repeated reads of the same variable all recorded", () => {
  const referenced = scanSource("process.env.FOO;\nprocess.env.FOO;\n");
  assert.equal(referenced.get("FOO").length, 2);
});

test("scanSource: does not match a variable name that merely contains ENV", () => {
  const referenced = scanSource("const ENVIRONMENT_LABEL = 'prod';");
  assert.equal(referenced.size, 0);
});

test("mergeReferenced: combines occurrences across files, same variable", () => {
  const a = scanSource("process.env.SHARED;", "a.js");
  const b = scanSource("process.env.SHARED;", "b.js");
  const merged = mergeReferenced([a, b]);
  assert.equal(merged.get("SHARED").length, 2);
  assert.deepEqual(merged.get("SHARED").map((o) => o.file), ["a.js", "b.js"]);
});

test("diffEnv: finds variables read but not declared (missing)", () => {
  const declared = parseExampleFile("PORT=3000\n");
  const referenced = scanSource("process.env.PORT;\nprocess.env.API_KEY;");
  const report = diffEnv({ declared, referenced });
  assert.equal(report.missing.length, 1);
  assert.equal(report.missing[0].name, "API_KEY");
});

test("diffEnv: finds variables declared but never read (unused)", () => {
  const declared = parseExampleFile("PORT=3000\nLEGACY_FLAG=\n");
  const referenced = scanSource("process.env.PORT;");
  const report = diffEnv({ declared, referenced });
  assert.deepEqual(report.unused, ["LEGACY_FLAG"]);
});

test("diffEnv: matched lists variables present on both sides", () => {
  const declared = parseExampleFile("PORT=3000\n");
  const referenced = scanSource("process.env.PORT;");
  const report = diffEnv({ declared, referenced });
  assert.deepEqual(report.matched, ["PORT"]);
  assert.equal(report.missing.length, 0);
  assert.equal(report.unused.length, 0);
});

test("diffEnv: missing list is sorted by name", () => {
  const declared = parseExampleFile("");
  const referenced = scanSource("process.env.ZEBRA;\nprocess.env.ALPHA;");
  const report = diffEnv({ declared, referenced });
  assert.deepEqual(report.missing.map((m) => m.name), ["ALPHA", "ZEBRA"]);
});

test("summarize: ok when everything matches and nothing is unused", () => {
  const report = { missing: [], unused: [], matched: ["A", "B"] };
  const { status, text } = summarize(report);
  assert.equal(status, "ok");
  assert.match(text, /2 variable/);
});

test("summarize: ok with no checkable variables at all on either side", () => {
  const report = { missing: [], unused: [], matched: [] };
  const { status } = summarize(report);
  assert.equal(status, "ok");
});

test("summarize: missing status wins over unused when both present", () => {
  const report = { missing: [{ name: "A", occurrences: [] }], unused: ["B"], matched: [] };
  const { status, text } = summarize(report);
  assert.equal(status, "missing");
  assert.match(text, /1 variable.*missing/);
  assert.match(text, /1 declared but never read/);
});

test("summarize: unused-only status when nothing is missing", () => {
  const report = { missing: [], unused: ["A", "B"], matched: ["C"] };
  const { status, text } = summarize(report);
  assert.equal(status, "unused");
  assert.match(text, /2 variable/);
});

test("CHECKED_LANGUAGES: covers exactly the four documented languages", () => {
  const names = CHECKED_LANGUAGES.map((l) => l.language);
  assert.deepEqual(names, ["JavaScript / TypeScript", "Python", "Ruby", "Java"]);
  for (const l of CHECKED_LANGUAGES) assert.ok(l.examples.length > 0);
});
