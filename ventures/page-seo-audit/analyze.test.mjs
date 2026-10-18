import test from "node:test";
import assert from "node:assert/strict";
import { audit, parse } from "./analyze.mjs";
import { main } from "./cli.mjs";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GOOD = `<!doctype html><html lang="en"><head><title>Free Round Robin Schedule Generator for Leagues</title>
<meta name="description" content="Paste your team names and get a fair round robin schedule with home and away balance, courts and dates. Free, private, in your browser.">
<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="canonical" href="https://example.com/"><link rel="icon" href="/f.ico">
<meta property="og:title" content="x"><meta property="og:description" content="y"><meta property="og:image" content="https://example.com/i.png"><meta name="twitter:card" content="summary">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"x"}</script></head>
<body><h1>Round robin schedule generator</h1><h2>How it works</h2><p>${"word ".repeat(200)}</p><img src="a.png" alt="a" width="10" height="10"><a href="/guide">Guide to scheduling</a></body></html>`;

test("a complete page scores 100 with nothing found", () => {
  const r = audit(GOOD);
  assert.equal(r.ok, true);
  assert.deepEqual(r.findings.map((f) => f.id), []);
  assert.equal(r.score, 100);
  assert.equal(r.aiReadiness, 100);
  assert.deepEqual(r.facts.schemaTypes, ["SoftwareApplication"]);
});

test("noindex, invalid JSON-LD and a JS-only shell are critical", () => {
  const r = audit(`<html><head><title>A decent page title that is long enough</title><meta name="robots" content="noindex,follow">
<script type="application/ld+json">{bad</script></head><body><div id=app></div><script src=a></script><script src=b></script><script src=c></script><script src=d></script></body></html>`);
  const ids = r.findings.filter((f) => f.severity === "critical").map((f) => f.id);
  assert.deepEqual(ids.sort(), ["jsonld-invalid", "noindex", "thin"]);
  assert.ok(r.score < 50);
});

test("missing alt, vague links, skipped headings and relative canonical are reported", () => {
  const r = audit(GOOD.replace('alt="a"', "").replace("Guide to scheduling", "click here").replace("<h2>How it works</h2>", "<h4>How</h4>").replace('href="https://example.com/"', 'href="/"'));
  const ids = r.findings.map((f) => f.id);
  for (const id of ["alt", "anchor-text", "heading-skip", "canonical-relative"]) assert.ok(ids.includes(id), id);
});

test("question headings without FAQPage get a nudge", () => {
  const r = audit(GOOD.replace("<h2>How it works</h2>", "<h2>Is it free?</h2><h2>Is it private?</h2>"));
  assert.ok(r.findings.some((f) => f.id === "faq"));
});

test("comments and script text are not read as content or tags", () => {
  const p = parse(`<html><!-- <title>no</title> --><head><title>Real</title></head><body><script>var a="<h1>x</h1>"</script><p>two words</p></body></html>`);
  assert.equal(p.title, "Real");
  assert.equal(p.words, 2);
});

test("empty and non-HTML input is refused, not scored", () => {
  assert.equal(audit("").ok, false);
  assert.equal(audit("just some text").ok, false);
});

test("cli: exit codes follow --min-score and unreadable files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "seo-"));
  const good = join(dir, "g.html"), bad = join(dir, "b.html");
  await writeFile(good, GOOD); await writeFile(bad, "<html><body><p>hi</p></body></html>");
  const io = { log() {}, err() {} };
  assert.equal(await main(["audit", good, "--min-score", "90"], io), 0);
  assert.equal(await main(["audit", bad, "--min-score", "90"], io), 1);
  assert.equal(await main(["audit", join(dir, "nope.html")], io), 2);
  assert.equal(await main([], io), 2);
});

test("duplicate titles and canonicals, relative og:image, unsized images, bare JSON-LD and dead links are reported", () => {
  const r = audit(GOOD.replace("<head>", "<head><title>Second title tag here</title><link rel=\"canonical\" href=\"https://example.com/x\">")
    .replace("https://example.com/i.png", "/i.png")
    .replace(' width="10" height="10"', "")
    .replace('"@context":"https://schema.org",', "")
    .replace('href="/guide"', 'href="#"'));
  const ids = r.findings.map((f) => f.id);
  for (const id of ["title-many", "canonical-many", "og-image-relative", "img-size", "jsonld-context", "empty-href"]) assert.ok(ids.includes(id), id);
  assert.equal(r.findings.find((f) => f.id === "canonical-many").severity, "critical");
});

test("nofollow and a description that repeats the title are notes", () => {
  const r = audit(GOOD.replace("<head>", '<head><meta name="robots" content="nofollow">').replace(/content="Paste[^"]*"/, 'content="Free Round Robin Schedule Generator for Leagues"'));
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes("nofollow") && ids.includes("title-eq-description"));
});
