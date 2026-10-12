import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const file = (name) => ({ isDirectory: () => false, isFile: () => true, name });
const fake = (files) => ({
  readFile: async (p) => { if (!(p in files)) throw new Error("ENOENT"); return files[p]; },
  stat: async (p) => { if (p === "src") return { isDirectory: () => true }; if (p in files) return { isDirectory: () => false }; throw new Error("ENOENT"); },
  readdir: async () => Object.keys(files).filter((p) => p.startsWith("src/")).map((p) => file(p.slice(4))),
});
const BAD = `for d in docs:\n    client.chat.completions.create(model="gpt-4o", messages=d)\n`;
const GOOD = `client.messages.create(model="claude-3-haiku", max_tokens=5, messages=m)\n`;
const RETIRED = `client.completions.create(model="x")\nopenai.chat.completions.create(model="gpt-4-0314", max_tokens=1, messages=m)\n`;

test("help exits 0, no subcommand exits 1", async () => {
  assert.equal((await run(["--help"])).exitCode, 0);
  assert.equal((await run([])).exitCode, 1);
});

test("warnings alone exit 0 by default and 1 with --fail-on warn", async () => {
  const deps = fake({ "src/a.py": BAD });
  assert.equal((await run(["scan", "src"], deps)).exitCode, 0);
  assert.equal((await run(["scan", "src", "--fail-on", "warn"], deps)).exitCode, 1);
});

test("a retired model name exits 1", async () => {
  assert.equal((await run(["scan", "src"], fake({ "src/a.py": RETIRED }))).exitCode, 1);
});

test("clean code exits 0 and prints a cost estimate", async () => {
  const r = await run(["scan", "src", "--calls-per-day", "100"], fake({ "src/a.py": GOOD }));
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Estimated monthly cost/);
});

test("--json is machine-readable and carries assumptions", async () => {
  const r = await run(["scan", "src", "--json", "--in-tokens", "10"], fake({ "src/a.py": BAD }));
  const j = JSON.parse(r.output);
  assert.equal(j.estimate.assumptions.inTokens, 10);
  assert.ok(j.findings.some((f) => f.rule === "call-in-loop"));
});

test("--prices overrides built-in prices", async () => {
  const deps = fake({ "src/a.py": `c.messages.create(model="acme-1", max_tokens=1)\n`, "p.json": JSON.stringify({ "acme-1": { in: 1, out: 1, tier: "small", vendor: "acme" } }) });
  const r = await run(["scan", "src", "--prices", "p.json", "--json"], deps);
  assert.equal(JSON.parse(r.output).estimate.pricedCalls, 1);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["scan"], fake({}))).exitCode, 2);
  assert.equal((await run(["scan", "nope"], fake({}))).exitCode, 2);
  assert.equal((await run(["scan", "src", "--calls-per-day", "abc"], fake({}))).exitCode, 2);
  assert.equal((await run(["scan", "src", "--fail-on", "x"], fake({}))).exitCode, 2);
  assert.equal((await run(["scan", "src", "--bogus"], fake({}))).exitCode, 2);
  assert.equal((await run(["scan", "src", "--prices", "missing.json"], fake({ "src/a.py": GOOD }))).exitCode, 2);
});
