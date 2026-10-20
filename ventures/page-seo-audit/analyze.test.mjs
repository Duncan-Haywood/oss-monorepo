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

test("hex entities (including 0-containing and a-f digits) decode in titles", () => {
  const p = parse(`<html><head><title>Caf&#xE9; &#x1F600; &#x30;&#x41;</title></head><body></body></html>`);
  assert.equal(p.title, "Café 😀 0A");
});

test("unquoted attribute values are read", () => {
  const p = parse(`<html><head><title>T</title><meta name=description content=plainvalue></head><body></body></html>`);
  assert.equal(p.description, "plainvalue");
});

test("findings are sorted critical, then warning, then info", () => {
  const r = audit(`<html><head><title>x</title><meta name="robots" content="noindex"></head><body><p>hi</p></body></html>`);
  const rank = { critical: 0, warning: 1, info: 2 };
  const ranks = r.findings.map((f) => rank[f.severity]);
  assert.ok(r.findings.some((f) => f.severity === "warning") && r.findings.some((f) => f.severity === "info"));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(r.findings[0].severity, "critical");
});

test("single-quoted attribute values are read", () => {
  const p = parse(`<html><head><title>T</title><meta name='description' content='single quoted'></head><body></body></html>`);
  assert.equal(p.description, "single quoted");
});

test("empty h1, og:url mismatch, hreflang without self and meta refresh are reported", () => {
  const r = audit(GOOD.replace("<h1>Round robin schedule generator</h1>", "<h1><img src=l.png alt=''></h1>")
    .replace('<meta name="twitter:card"', '<meta property="og:url" content="https://example.com/other"><meta http-equiv="refresh" content="0;url=/x"><link rel="alternate" hreflang="fr" href="https://example.com/fr/"><meta name="twitter:card"'));
  const ids = r.findings.map((f) => f.id);
  for (const id of ["h1-empty", "og-url-mismatch", "hreflang-no-self", "meta-refresh"]) assert.ok(ids.includes(id), id);
});

test("matching og:url and a self-referencing hreflang set stay clean", () => {
  const r = audit(GOOD.replace('<meta name="twitter:card"', '<meta property="og:url" content="https://example.com"><link rel="alternate" hreflang="en" href="https://example.com/"><link rel="alternate" hreflang="fr" href="https://example.com/fr/"><meta name="twitter:card"'));
  assert.deepEqual(r.findings.map((f) => f.id), []);
});
