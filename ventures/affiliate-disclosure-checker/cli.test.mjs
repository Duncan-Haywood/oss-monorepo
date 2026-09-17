import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "./cli.mjs";

async function tmpTree(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
  }
  return dir;
}

test("--help exits 0 and prints usage", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test("no subcommand exits 1", async () => {
  const { exitCode } = await run([]);
  assert.equal(exitCode, 1);
});

test("unknown subcommand exits 2", async () => {
  const { exitCode, output } = await run(["bogus"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});

test("check with no target exits 2", async () => {
  const { exitCode } = await run(["check"]);
  assert.equal(exitCode, 2);
});

test("check on an unreadable path exits 2 with a clear message", async () => {
  const { exitCode, output } = await run(["check", "/no/such/path/xyz"]);
  assert.equal(exitCode, 2);
  assert.match(output, /cannot read/);
});

test("a single clean file exits 0", async () => {
  const dir = await tmpTree({
    "post.html": `<p>As an Amazon Associate I earn from qualifying purchases.</p><a href="https://amzn.to/x">buy</a>`,
  });
  const { exitCode, output } = await run(["check", path.join(dir, "post.html")]);
  assert.equal(exitCode, 0);
  assert.match(output, /Scanned 1 file/);
});

test("a directory with one bad file exits 1 and names it", async () => {
  const dir = await tmpTree({
    "good.html": `<p>Affiliate links below.</p><a href="https://amzn.to/x">buy</a>`,
    "bad.html": `<a href="https://shareasale.com/r.cfm?b=1&u=2">buy</a>`,
  });
  const { exitCode, output } = await run(["check", dir]);
  assert.equal(exitCode, 1);
  assert.match(output, /bad\.html/);
});

test("--json emits parseable JSON with one entry per file", async () => {
  const dir = await tmpTree({ "a.html": "<p>hi</p>" });
  const { exitCode, output } = await run(["check", dir, "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].report.status, "no-affiliate-links");
});

test("--strict fails a page with a generic disclosure but no Amazon-required phrase, on an Amazon link", async () => {
  const dir = await tmpTree({
    "post.html": `<p>This post contains affiliate links.</p><a href="https://www.amazon.com/dp/B0?tag=me-20">buy</a>`,
  });
  const lenient = await run(["check", dir]);
  assert.equal(lenient.exitCode, 0);
  const strict = await run(["check", dir, "--strict"]);
  assert.equal(strict.exitCode, 1);
});

test("directory walk skips node_modules and dotdirs", async () => {
  const dir = await tmpTree({
    "node_modules/pkg/index.html": `<a href="https://shareasale.com/r.cfm?b=1&u=2">x</a>`,
    ".git/x.html": `<a href="https://shareasale.com/r.cfm?b=1&u=2">x</a>`,
    "real.html": "<p>nothing here</p>",
  });
  const { exitCode, output } = await run(["check", dir, "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 1);
});
