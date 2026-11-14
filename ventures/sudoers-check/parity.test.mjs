// Parser parity: for every case in parity-cases.mjs, the rules scan.mjs reads
// must equal what sudo's own parser (cvtsudoers 1.9.15p5, recorded in
// parity-expected.json by parity-gen.mjs) reads. Where cvtsudoers is
// installed, the expectation is also regenerated live.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { policyEntries } from "./scan.mjs";
import { CASES } from "./parity-cases.mjs";
import { fromCvtsudoers, FILE_FIXTURES } from "./parity-gen.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const recorded = JSON.parse(readFileSync(path.join(here, "parity-expected.json"), "utf8"));

// Representation only. sudoers(5) implies SETENV for ALL, and cvtsudoers
// prints that implied tag on whatever commands it groups with ALL (negated
// ones included), so SETENV on ALL or a negated command is left out on both
// sides. cvtsudoers prints a runas group with a '%' when it is written in the
// rule and without one when it comes from a Runas_Alias, so the '%' is
// dropped on both sides.
function comparable(e) {
  const tags = e.tags.filter((t) => !(t === "SETENV" && (e.command === "ALL" || e.negated)));
  const runasGroups = e.runasGroups && e.runasGroups.map((g) => g.replace(/^(!?)%/, "$1"));
  return { ...e, tags, runasGroups };
}

export function ours(text) {
  return policyEntries([{ name: "case", text }]).entries.map(({ file, line, ...e }) => comparable({
    ...e,
    runasUsers: e.runasUsers && e.runasUsers.length ? e.runasUsers : null,
    runasGroups: e.runasGroups && e.runasGroups.length ? e.runasGroups : null,
  }));
}

test("every case has a recorded expectation", () => {
  assert.deepEqual(recorded.results.map((r) => r.name), CASES.map(([n]) => n));
  assert.ok(recorded.results.filter((r) => r.expected).length >= 30);
});

for (const [name, text] of CASES) {
  const r = recorded.results.find((x) => x.name === name);
  test(`parity: ${name}`, { skip: r && !r.expected ? r.rejected || r.skipped : false }, () => {
    assert.deepEqual(ours(text), r.expected.map(comparable));
  });
}

for (const rel of FILE_FIXTURES) {
  test(`parity, whole file: ${rel}`, () => {
    const r = recorded.files.find((f) => f.file === rel);
    const got = ours(readFileSync(path.join(here, rel), "utf8"));
    assert.ok(got.length >= 40);
    assert.deepEqual(got, r.expected.map(comparable));
  });
}

let live = false;
try { execFileSync("cvtsudoers", ["-V"], { stdio: "pipe" }); live = true; } catch { /* not installed */ }

test("live: cvtsudoers on this machine agrees with the recorded expectation", { skip: !live && "cvtsudoers not installed" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sudoers-parity-"));
  for (const r of recorded.results) {
    if (!r.expected) continue;
    const file = path.join(dir, "case");
    writeFileSync(file, CASES.find(([n]) => n === r.name)[1]);
    const json = JSON.parse(execFileSync("cvtsudoers", ["-e", "-f", "json", file], { encoding: "utf8" }));
    assert.deepEqual(fromCvtsudoers(json), r.expected, r.name);
  }
  for (const f of recorded.files) {
    const json = JSON.parse(execFileSync("cvtsudoers", ["-e", "-f", "json", path.join(here, f.file)], { encoding: "utf8" }));
    assert.deepEqual(fromCvtsudoers(json), f.expected, f.file);
  }
});
