import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./vs-healthchecks.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const robots = fs.readFileSync(new URL("./robots.txt", import.meta.url), "utf8");
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

test("states it is not affiliated with Healthchecks.io", () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Healthchecks\.io/);
});

test("no unverifiable price is claimed for Healthchecks.io", () => {
  // Healthchecks.io's own current pricing page is not reachable from this
  // session, so no dollar figure for it -- or for anything else -- is
  // invented here. Same discipline as vs-avalara.html and vs-smartmoving.html.
  assert.doesNotMatch(html, /\$\d/);
});

test("the canonical tag resolves to this page's own served URL", () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-healthchecks\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-healthchecks\.html"/);
});

test("the comparison page is listed in the sitemap and allowed by robots", () => {
  assert.match(sitemap, /vs-healthchecks\.html/);
  assert.match(robots, /Allow: \//);
});

test("the comparison page links back to the checker and the trend view", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/shrinking\.html"/);
});

// The page's whole argument is that cron monitoring and this checker answer
// different questions. If it ever drifts into claiming this replaces a
// dead-man's switch, that is a false marketing claim about a real product --
// and the honest framing is also the useful one, because the two compose.
test("does not claim to replace cron monitoring, and says what it cannot see", () => {
  assert.match(html, /Does this checker replace cron monitoring\?/);
  assert.match(html, /no way to notice that a job failed to run at all/i);
  assert.doesNotMatch(html, /instead of Healthchecks/i);
});

// Every exit code this page quotes is a promise about the shipped CLI, and
// the composition example (`verify ... && curl "$PING_URL"`) is only correct
// while those constants hold. Assert against cli.py rather than restating
// them, so a change to the CLI fails here instead of silently making the
// published page wrong -- the same "import, do not restate" rule CLAUDE.md
// records the repo paying for twice.
test("the exit codes the page quotes are the ones the CLI actually returns", () => {
  assert.match(cli, /VERIFY_EXIT_INTACT\s*=\s*0/);
  assert.match(cli, /VERIFY_EXIT_CORRUPT\s*=\s*1/);
  assert.match(cli, /VERIFY_EXIT_UNCHECKED\s*=\s*2/);
  assert.match(html, /exits\s*<code>0<\/code>\s*when every artifact read back intact/);
  assert.match(html, /<code>1<\/code>\s*when\s*\n?\s*any is provably corrupt/);
});

// `--verify-integrity` belongs to the `record` subcommand, not `verify`.
// An earlier draft of this page attached it to `verify`, which would have
// published a copy-pasteable command that argparse rejects.
test("does not attach a record-only flag to the verify subcommand", () => {
  assert.doesNotMatch(html, /verify[^<]*--verify-integrity/);
  assert.match(cli, /verify\.add_argument\(\s*\n?\s*"--max-age-hours"/);
  assert.match(html, /--max-age-hours 26/);
});
