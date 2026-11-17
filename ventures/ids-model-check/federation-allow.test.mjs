// Types and relationships that only follow a shared element, and a team's
// allow list of GlobalIds shared between models on purpose (ci.mjs
// crossModelGlobalIds, parseSharedAllow; eval/federation-allow-2026-11-17.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseModel } from "./node.mjs";
import { globalIdIndex } from "./ids.mjs";
import { crossModelGlobalIds, parseSharedAllow, sharedLine, stepSummary, tally } from "./ci.mjs";

const here = new URL(".", import.meta.url).pathname;
const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const tiny = file("samples/tiny-house.ifc");
const W1 = "3vB2YO$MX4xv5uCqZZG05x"; // #20 IFCWALL W-01
const W2 = "1Lz5$gbjv4GQ6_kuh4Wa3J"; // #21 IFCWALL W-02
const PSET = "2XtwYdQJvA_eZmLqT9e9cw"; // #40 Pset_WallCommon of W-01
const PSET_REL = "1kH1k8oQr1ZvL2xk4yVQmB"; // #43 IfcRelDefinesByProperties (W-01) -> #40
const MAT_REL = "0Pp9Oo8Ii7Uu6Yy5Tt4Rr3"; // #75 IfcRelAssociatesMaterial (W-01, W-02)
const FRAME = ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"];
function discipline(keep = []) {
  return tiny.replace(/^(#\d+=)(IFC\w+)\('([0-9A-Za-z_$]{22})'/gm, (all, n, type, g) => {
    if (FRAME.includes(type) || keep.includes(g)) return all;
    return `${n}${type}('${g[0]}${g[1] === "Z" ? "Y" : "Z"}${g.slice(2)}'`;
  });
}
const idx = (model, text) => ({ model, index: globalIdIndex(parseModel(text)) });

test("the index lists the GlobalIds a relationship names", () => {
  const i = globalIdIndex(parseModel(tiny));
  assert.deepEqual(i.get(PSET_REL).refs, [W1, PSET]);
  assert.deepEqual(i.get(MAT_REL).refs, [W1, W2], "the material itself is not an IfcRoot");
  assert.equal(i.get(W1).refs, undefined, "elements carry no refs");
});

test("a relationship and set that only follow a shared element are listed under it", () => {
  const f = crossModelGlobalIds([idx("arch.ifc", tiny), idx("str.ifc", discipline([W1, PSET, PSET_REL]))]);
  assert.deepEqual(f.conflicts.map((c) => c.globalId), [W1]);
  assert.deepEqual(f.conflicts[0].with.map((d) => [d.globalId, d.type]).sort(), [[PSET_REL, "IFCRELDEFINESBYPROPERTIES"], [PSET, "IFCPROPERTYSET"]].sort());
  assert.match(sharedLine(f.conflicts[0]), /; with it: .*IFCPROPERTYSET "Pset_WallCommon" 2XtwYdQJvA_eZmLqT9e9cw/);
  assert.equal(tally([], f).sharedGlobalIds, 1);
});

test("one GlobalId for relationships linking different objects stays a finding, and says so", () => {
  // MAT_REL names W-01 and W-02 in arch; in str W-02 has another GlobalId.
  const f = crossModelGlobalIds([idx("arch.ifc", tiny), idx("str.ifc", discipline([W1, MAT_REL]))]);
  assert.deepEqual(f.conflicts.map((c) => c.globalId).sort(), [MAT_REL, W1].sort());
  const m = f.conflicts.find((c) => c.globalId === MAT_REL);
  assert.equal(m.contentsDiffer, true);
  assert.match(sharedLine(m), /relationships that link different objects in each model/);
  // The same relationship naming the same objects in both is a dependent.
  const g = crossModelGlobalIds([idx("arch.ifc", tiny), idx("str.ifc", discipline([W1, W2, MAT_REL]))]);
  assert.deepEqual(g.conflicts.map((c) => c.globalId).sort(), [W1, W2].sort());
  assert.equal(g.conflicts.flatMap((c) => c.with || []).filter((d) => d.globalId === MAT_REL).length, 2, "listed under both walls");
});

test("parseSharedAllow reads GlobalIds, classes and names, and rejects the rest", () => {
  const { rules, errors } = parseSharedAllow([
    "# survey markers", "", `${W1}   # the wall`, "ifcgrid", 'IFCBUILDINGELEMENTPROXY "origin"', '* "geo-*"',
    "IFCBUILDINGELEMENTPART", // 22 letters, but a GlobalId starts with 0-3
    "*", "wall W-01",
  ].join("\n"));
  assert.deepEqual(rules.map((r) => [r.line, r.globalId || null, r.cls, r.name ? String(r.name) : null]), [
    [3, W1, undefined, null], [4, null, "IFCGRID", null], [5, null, "IFCBUILDINGELEMENTPROXY", "/^origin$/i"], [6, null, null, "/^geo-.*$/i"], [7, null, "IFCBUILDINGELEMENTPART", null],
  ]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^line 8: "\*" needs a name/);
  assert.match(errors[1], /^line 9: not a GlobalId/);
  assert.equal(parseSharedAllow('* "a.b(c)"').rules[0].name.test("a.b(c)"), true, "regex characters are literal");
  assert.equal(parseSharedAllow('* "a.b(c)"').rules[0].name.test("axb(c)"), false);
});

test("allowed conflicts leave with their dependents; unused rules are reported", () => {
  const sets = [idx("arch.ifc", tiny), idx("str.ifc", discipline([W1, W2, PSET, PSET_REL, MAT_REL]))];
  const allow = parseSharedAllow(`IFCWALL "W-01"\nIFCGRID\n`);
  const f = crossModelGlobalIds(sets, { allow });
  assert.deepEqual(f.allowed.map((c) => c.globalId), [W1]);
  assert.deepEqual(f.allowed[0].allowedBy, [1]);
  assert.deepEqual(f.allowed[0].with.map((d) => d.globalId).sort(), [PSET, PSET_REL].sort(), "MAT_REL also follows W-02, still reported");
  assert.deepEqual(f.conflicts.map((c) => c.globalId), [W2]);
  assert.deepEqual(f.conflicts[0].with.map((d) => [d.globalId, d.follows]), [[MAT_REL, [W2]]]);
  assert.deepEqual(f.allowUnused, [{ line: 2, rule: "IFCGRID" }]);
  assert.equal(tally([], f).sharedGlobalIds, 1);
  const s = stepSummary([], { federation: f, failOnShared: true });
  assert.match(s, /\*\*Shared on purpose:\*\* 1 shared GlobalId\(s\) matched the team's allow list \(IFCWALL "W-01"\), with 2 type\(s\) and relationship\(s\)/);
  assert.match(s, /\*\*Allow list:\*\* line 2 \(`IFCGRID`\) matched nothing/);
  assert.match(s, /^## IDS model check: FAIL/, "W-02 is still shared");
  // A rule must match every holder: a class rule naming another class does not.
  assert.equal(crossModelGlobalIds(sets, { allow: parseSharedAllow("IFCSLAB") }).allowed.length, 0);
  // Allowing both walls clears everything.
  const all = crossModelGlobalIds(sets, { allow: parseSharedAllow(`IFCWALL`) });
  assert.equal(all.conflicts.length, 0);
  assert.deepEqual(all.allowed.flatMap((c) => c.with.map((d) => d.globalId)).sort(), [MAT_REL, MAT_REL, PSET, PSET_REL].sort());
});

test("ci-cli takes --shared-globalids-allow, passes with it and stops on a bad line", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-allow-"));
  mkdirSync(join(dir, "m")); mkdirSync(join(dir, "r"));
  writeFileSync(join(dir, "m/arch.ifc"), tiny);
  writeFileSync(join(dir, "m/str.ifc"), discipline([W1]));
  writeFileSync(join(dir, "r/q.ids"), file("samples/quantities-and-naming.ids.xml"));
  writeFileSync(join(dir, "allow.txt"), `${W1} # W-01 is copy-monitored\nIFCGRID\n`);
  writeFileSync(join(dir, "bad.txt"), "W-01\n");
  const go = (...extra) => spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", dir, "--models", "m/*.ifc", "--ids", "r/*.ids", "--fail-on-shared-globalids", ...extra], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });
  assert.equal(go().status, 1);
  const ok = go("--shared-globalids-allow", "allow.txt", "--summary", join(dir, "s.md"));
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /note: 1 shared GlobalId\(s\) allowed by allow\.txt/);
  assert.match(ok.stdout, /note: allow rule on line 2 \(IFCGRID\) matched nothing/);
  assert.match(readFileSync(join(dir, "s.md"), "utf8"), /\*\*Shared on purpose:\*\*/);
  const bad = go("--shared-globalids-allow", "bad.txt");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /line 1: not a GlobalId/);
  assert.equal(go("--shared-globalids-allow", "missing.txt").status, 2);
});
