// The CLI's argument reading (red team 2026-11-24): a flag whose value is
// optional (--risk [N], --lookahead [WEEKS], --ribbon [BY], --float-paths
// [CODE]) put before the schedule took its value for the file name, and a flag
// that needs a value, given without one, crashed or wrote a file named after
// the next flag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXAMPLE_XER } from "./example.mjs";

const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
function withFile(fn) {
  const dir = mkdtempSync(join(tmpdir(), "xer-args-"));
  try { writeFileSync(join(dir, "s.xer"), EXAMPLE_XER); return fn(dir, (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: "utf8", cwd: dir })); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test("an optional value before the schedule is the flag's value, not the file", () => {
  withFile((dir, run) => {
    const before = run("--lookahead", "2", "s.xer", "--json");
    assert.equal(before.status, 0, before.stderr);
    const after = run("s.xer", "--lookahead", "2", "--json");
    assert.deepEqual(JSON.parse(before.stdout), JSON.parse(after.stdout));
    assert.equal(JSON.parse(before.stdout).weeks, 2);
    const risk = run("--risk", "20", "s.xer", "--seed", "1", "--json");
    assert.equal(risk.status, 0, risk.stderr);
    // with no value, the next argument is still the file
    const bare = run("--lookahead", "s.xer", "--json");
    assert.equal(bare.status, 0, bare.stderr);
    assert.equal(JSON.parse(bare.stdout).weeks, 3);
  });
});

test("a flag that needs a value, given without one, stops with a message and writes nothing", () => {
  withFile((dir, run) => {
    for (const a of [["s.xer", "--report"], ["s.xer", "--csv", "--json"], ["s.xer", "--schedule"]]) {
      const r = run(...a);
      assert.equal(r.status, 2, `${a.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, /needs a value/);
      assert.ok(!existsSync(join(dir, "--json")));
    }
  });
});

test("--ribbon and --float-paths before the schedule do not take its name as their value", () => {
  withFile((dir, run) => {
    const rb = run("--ribbon", "s.xer", "--json");
    assert.equal(rb.status, 0, rb.stderr);
    assert.deepEqual(JSON.parse(rb.stdout), JSON.parse(run("s.xer", "--ribbon", "--json").stdout));
    const fp = run("--float-paths", "s.xer", "--json");
    assert.equal(fp.status, 0, fp.stderr);
  });
});

test("every flag read with opt() is declared VALUED or OPTIONAL, so its value is never read as a schedule", async () => {
  // the four optional flags above were missing from both lists; a flag added
  // later without a list entry fails here instead of in a user's terminal
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(cli, "utf8");
  const list = (name) => new Set([...src.slice(src.indexOf(`const ${name} = [`), src.indexOf("];", src.indexOf(`const ${name} = [`))).matchAll(/"(--[a-z0-9-]+)"/g)].map((m) => m[1]));
  const declared = new Set([...list("VALUED"), ...list("OPTIONAL")]);
  const read = new Set([...src.matchAll(/\bopt(?:ional)?\("(--[a-z0-9-]+)"\)/g)].map((m) => m[1]));
  assert.deepEqual([...read].filter((f) => !declared.has(f)), []);
  assert.deepEqual([...list("OPTIONAL")].filter((f) => list("VALUED").has(f)), []);
});
