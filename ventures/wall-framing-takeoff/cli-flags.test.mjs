import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, unknownFlag, BARE_FLAGS, VALUE_FLAGS } from "./cli.mjs";

test("a mistyped flag stops the run with a suggestion", () => {
  const r = main(["plan.json", "--wholehouse"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /Unknown option --wholehouse\. Did you mean --whole-house\?/);
  assert.match(unknownFlag(["--add-bord=2x4:20ft"]), /Did you mean --add-board=\.\.\.\?/);
  assert.match(unknownFlag(["--zzzzzzzzzzzz"]), /^Unknown option --zzzzzzzzzzzz\. --help/);
});

test("a bare flag given a value, or a value flag given none, is refused", () => {
  assert.match(unknownFlag(["--drilling=x"]), /takes no value/);
  assert.match(unknownFlag(["--stack"]), /needs a value/);
  assert.equal(unknownFlag(["--orders", "--orders=2026-01-01", "--csv", "--storey=1"]), "");
  assert.equal(unknownFlag(["plan.json", "-h", "--"]), "");
});

test("a value flag with nothing after the equals sign is refused, except --orders", () => {
  for (const f of ["--storey", "--ifc-json", "--compare", "--door-layer", "--swing", "--units", "--wall-layer", "--window-layer", "--add-board"]) {
    assert.match(unknownFlag([f + "="]), /has no value after the equals sign/, f);
  }
  assert.equal(unknownFlag(["--orders="]), "");
  assert.equal(unknownFlag(["--storey=1st Floor"]), "");
});

test("the known-flag lists match the flags cli.mjs reads", () => {
  const src = readFileSync(new URL("./cli.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.startsWith("export const")).join("\n");
  const used = new Set([...src.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]));
  const known = new Set([...BARE_FLAGS, ...VALUE_FLAGS]);
  const missing = [...used].filter((f) => !known.has(f) && !/^--(wall|door|window)$/.test(f));
  assert.deepEqual(missing, []);
});

test("every documented example flag in the help is known", () => {
  const help = main(["--help"]).out;
  const named = [...help.matchAll(/(?<![\w-])(--[a-z][a-z0-9-]*)/g)].map((m) => m[1]);
  const known = new Set([...BARE_FLAGS, ...VALUE_FLAGS]);
  assert.deepEqual(named.filter((f) => !known.has(f)), []);
});

test("drawing-only options on a plan JSON, and --swing without --sensitivity, are refused", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { samplePlan } = await import("./engine.mjs");
  const f = join(mkdtempSync(join(tmpdir(), "wft-do-")), "p.json");
  writeFileSync(f, JSON.stringify(samplePlan()));
  for (const flag of ["--units=mm", "--storey=1", "--wall-layer=W", "--single-line"]) {
    const r = main([f, flag]);
    assert.equal(r.code, 1, flag);
    assert.match(r.out, /only applies when the input is a \.dxf or \.ifc/, flag);
  }
  assert.match(main([f, "--swing=10"]).out, /only applies with --sensitivity/);
  assert.equal(main([f, "--sensitivity", "--swing=10"]).code, 0);
});

test("panel-only options without a positive --panel-max are refused, not ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "wft-"));
  const file = join(dir, "plan.json");
  writeFileSync(file, main(["--example"]).out);
  for (const f of ["--panel-order", "--pull-lists", "--panel-sheets", "--sheathing-psf=1.5"]) {
    for (const extra of [[], ["--panel-max=0"]]) {
      const r = main([file, f, ...extra]);
      assert.equal(r.code, 1, f + extra);
      assert.match(r.out, /only applies with --panel-max=/);
    }
    assert.equal(main([file, f, "--panel-max=12ft"]).code, 0, f);
  }
});

test("two output formats at once are refused, not resolved by whichever comes first", () => {
  for (const pair of [["--json", "--csv"], ["--csv", "--pdf"], ["--json", "--pdf"]]) {
    const r = main(["plan.json", ...pair]);
    assert.equal(r.code, 1, pair.join(" "));
    assert.match(r.out, /each choose the output format; give only one/);
  }
});

test("--drawings beside --json or --csv is refused, not left to print HTML", () => {
  for (const f of ["--json", "--csv"]) {
    const r = main(["plan.json", "--drawings", f]);
    assert.equal(r.code, 1, f);
    assert.match(r.out, /--drawings prints the HTML shop drawings/);
  }
});

test("--drawings beside --pdf is refused, not left to print the PDF alone", () => {
  const r = main(["plan.json", "--drawings", "--pdf"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /give only one/);
});
