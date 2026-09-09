import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const OK_PAGE = `<h2>Is this free?</h2><p>Yes, entirely.</p>
  <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
    {"@type":"Question","name":"Is this free?","acceptedAnswer":{"@type":"Answer","text":"Yes, entirely."}}]}</script>`;

const DRIFTED_PAGE = `<h2>Is this free?</h2><p>Yes, for the first 14 days.</p>
  <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
    {"@type":"Question","name":"Is this free?","acceptedAnswer":{"@type":"Answer","text":"Yes, for the first 30 days."}}]}</script>`;

const NO_SCHEMA_PAGE = `<p>Just a plain page, nothing structured here.</p>`;

test("run: --help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test("run: no subcommand exits 1", async () => {
  const { exitCode } = await run([]);
  assert.equal(exitCode, 1);
});

test("run: unknown subcommand exits 2", async () => {
  const { exitCode, output } = await run(["bogus"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});

test("run: check with no files exits 2 with a usage message", async () => {
  const { exitCode, output } = await run(["check"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Usage: node cli\.mjs check/);
});

test("run: check on a page with no drift exits 0", async () => {
  const { exitCode, output } = await run(["check", "page.html"], { readFile: async () => OK_PAGE });
  assert.equal(exitCode, 0);
  assert.match(output, /All 2 structured-data claim\(s\) match/);
});

test("run: check on a page with drift exits 1 and prints the divergence", async () => {
  const { exitCode, output } = await run(["check", "page.html"], { readFile: async () => DRIFTED_PAGE });
  assert.equal(exitCode, 1);
  assert.match(output, /FAIL\s+FAQPage Q1 answer/);
  assert.match(output, /JSON-LD: …/);
  assert.match(output, /on page: …/);
});

test("run: check on a page with no structured data exits 0 (nothing to check is not a failure)", async () => {
  const { exitCode, output } = await run(["check", "page.html"], { readFile: async () => NO_SCHEMA_PAGE });
  assert.equal(exitCode, 0);
  assert.match(output, /No FAQPage, HowTo/);
});

test("run: check --json emits a parseable per-file report", async () => {
  const { exitCode, output } = await run(["check", "page.html", "--json"], { readFile: async () => DRIFTED_PAGE });
  assert.equal(exitCode, 1);
  const [parsed] = JSON.parse(output);
  assert.equal(parsed.file, "page.html");
  assert.ok(parsed.results.some((r) => !r.pass));
});

test("run: check with a missing file reports the read error and exits 1", async () => {
  const { exitCode, output } = await run(["check", "missing.html"], {
    readFile: async () => {
      throw new Error("ENOENT: no such file or directory");
    },
  });
  assert.equal(exitCode, 1);
  assert.match(output, /Error:/);
});

test("run: check across multiple files aggregates a summary line and a non-zero exit if any diverges", async () => {
  const files = { "ok.html": OK_PAGE, "bad.html": DRIFTED_PAGE };
  const { exitCode, output } = await run(["check", "ok.html", "bad.html"], { readFile: (p) => files[p] });
  assert.equal(exitCode, 1);
  assert.match(output, /2 file\(s\) checked, 1 claim\(s\) diverging\./);
});

test("run: check --strict fails on a malformed JSON-LD block even with no drift among parsed claims", async () => {
  const page = `${OK_PAGE}\n<script type="application/ld+json">{not json}</script>`;
  const lenient = await run(["check", "page.html"], { readFile: async () => page });
  assert.equal(lenient.exitCode, 0, "a parse-error warning alone is not fatal by default");
  assert.match(lenient.output, /WARN/);

  const strict = await run(["check", "page.html", "--strict"], { readFile: async () => page });
  assert.equal(strict.exitCode, 1);
});
