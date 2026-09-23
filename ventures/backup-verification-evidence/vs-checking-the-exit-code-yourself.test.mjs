import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-checking-the-exit-code-yourself.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const robots = fs.readFileSync(new URL("./robots.txt", import.meta.url), "utf8");
const suspiciousExample = fs.readFileSync(new URL("./examples/run-suspicious.json", import.meta.url), "utf8");
const cli = fs.readFileSync(new URL("./src/backup_evidence/cli.py", import.meta.url), "utf8");

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /does not replace a qualified professional or a test restore/i);
});

test("carries the licence and support paragraph", () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("names no vendor or competing product -- this is a generic-method comparison", () => {
  // Unlike vs-healthchecks.html, this page compares against a manual habit
  // (watching an exit code), not a named product, so it carries no
  // trademark disclaimer and no "not affiliated with" clause. It links
  // onward to vs-healthchecks.html by name, which is a cross-link, not a
  // comparison claim about that product made on this page.
  assert.doesNotMatch(html, /not affiliated with/i);
});

test("the canonical tag resolves to this page's own served URL", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-the-exit-code-yourself\.html">/);
});

test("the FAQPage schema is valid JSON and matches the visible FAQ headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
  }
});

test("the comparison page is linked from the tool page, not orphaned", () => {
  assert.match(indexHtml, /href="\.\/vs-checking-the-exit-code-yourself\.html"/);
});

test("the comparison page is listed in the sitemap and allowed by robots", () => {
  assert.match(sitemap, /vs-checking-the-exit-code-yourself\.html/);
  assert.match(robots, /Allow: \//);
});

test("the comparison page links back to the checker and the Healthchecks.io comparison", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/vs-healthchecks\.html"/);
});

// The worked example is not invented -- it is this checker's own shipped
// fixture, reproduced byte for byte. If that fixture ever changes, this page
// would be quoting a run record and a reason string that the CLI no longer
// actually produces.
test("the worked example matches the shipped run-suspicious.json fixture exactly", () => {
  const fixture = JSON.parse(suspiciousExample);
  assert.equal(fixture.tool, "pg_dump");
  assert.equal(fixture.exit_code, 0);
  assert.equal(fixture.artifact.size_bytes, 312);
  assert.equal(fixture.expected.min_size_bytes, 1000000);
  assert.match(html, /"size_bytes": 312/);
  assert.match(html, /"min_size_bytes": 1000000/);
  assert.match(html, /artifact is 312 bytes, below the expected minimum of 1\.0 MB/);
});

// `check` exits 1 for anything other than a `verified` latest run -- assert
// against cli.py rather than restating the number, same as vs-healthchecks.test.mjs
// does for the verify exit codes.
test("the check exit code the page quotes matches what cmd_check actually returns", () => {
  assert.match(cli, /return 0 if latest is None or latest\["status"\] == "verified" else 1/);
  assert.match(html, /\$ echo \$\?\n1/);
});

// The copy-pasteable `record` command in "Using both together" has to be one
// argparse actually accepts: --output is required, and the trailing command
// is a REMAINDER positional that needs its own `--`.
test("the record command shown is syntactically valid against the shipped CLI", () => {
  assert.match(cli, /record\.add_argument\("--output", type=Path, required=True/);
  assert.match(cli, /record\.add_argument\("command", nargs=argparse\.REMAINDER/);
  assert.match(html, /backup_evidence\.cli record \\\n {4}--tool pg_dump --artifact \/backups\/nightly\.sql\.gz \\\n {4}--min-size-bytes 1000000 --max-age-hours 26 \\\n {4}--output \/backups\/last-run\.json -- true/);
});

// This page's whole argument is that exit-code watching and this checker
// compose rather than that one replaces the other -- if it ever drifts into
// telling readers to stop checking exit codes, that is bad advice and it is
// also what vs-healthchecks.html already warns against for cron monitoring.
test("does not tell readers to stop watching exit codes", () => {
  assert.match(html, /Does this replace watching my job's exit code or unit status\?/);
  assert.match(html, /A nonzero exit code is still real signal/);
});
