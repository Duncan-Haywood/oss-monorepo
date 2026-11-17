// GlobalIds shared between the models of one CI run (a federated set), in
// ci.mjs crossModelGlobalIds and every CI output
// (eval/federated-globalids-2026-11-17.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseModel } from "./node.mjs";
import { globalIdIndex } from "./ids.mjs";
import { crossModelGlobalIds, annotations, codeQuality, stepSummary, tally } from "./ci.mjs";

const here = new URL(".", import.meta.url).pathname;
const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const tiny = file("samples/tiny-house.ifc");
const W1 = "3vB2YO$MX4xv5uCqZZG05x"; // #20 IFCWALL W-01
const SLAB = "0jvCJ6a3P7fAhZcqKfbbN8"; // #28 IFCSLAB
const FRAME = ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"];
// A second discipline's file: every IfcRoot GlobalId changed except the
// spatial frame and the GlobalIds in keep.
function discipline(keep = []) {
  return tiny.replace(/^(#\d+=)(IFC\w+)\('([0-9A-Za-z_$]{22})'/gm, (all, n, type, g) => {
    if (FRAME.includes(type) || keep.includes(g)) return all;
    return `${n}${type}('${g[0]}${g[1] === "Z" ? "Y" : "Z"}${g.slice(2)}'`;
  });
}
const idx = (model, text) => ({ model, index: globalIdIndex(parseModel(text)) });

test("a frame shared on purpose is counted, not warned about", () => {
  const f = crossModelGlobalIds([idx("arch.ifc", tiny), idx("str.ifc", discipline())]);
  assert.equal(f.conflicts.length, 0);
  assert.equal(f.revisions.length, 0);
  assert.deepEqual(f.frame.map((x) => x.holders[0].type).sort(), FRAME.slice().sort());
  assert.equal(f.pairs.length, 1);
  assert.equal(f.pairs[0].frame, 4);
});

test("an element in two discipline files is a conflict, same class or not", () => {
  const str = discipline([W1]).replace(/^(#\d+=IFCSLAB\(')[^']{22}'/m, `$1${SLAB}'`);
  const mep = discipline().replace(/^(#\d+=IFCWALL\(')[^']{22}'/m, `$1${SLAB}'`); // a wall given the slab's GlobalId
  const f = crossModelGlobalIds([idx("arch.ifc", tiny), idx("str.ifc", str), idx("mep.ifc", mep)]);
  assert.deepEqual(f.conflicts.map((c) => c.globalId), [SLAB, W1].sort(), "sorted by GlobalId");
  const w = f.conflicts.find((c) => c.globalId === W1);
  assert.equal(w.sameClass, true);
  assert.deepEqual(w.holders.map((h) => [h.model, h.id, h.type, h.name]), [["arch.ifc", 20, "IFCWALL", "W-01"], ["str.ifc", 20, "IFCWALL", "W-01"]]);
  const s = f.conflicts.find((c) => c.globalId === SLAB);
  assert.equal(s.holders.length, 3);
  assert.equal(s.sameClass, false);
  assert.equal(tally([], f).sharedGlobalIds, 2);
});

test("two copies of one model are one revision finding, not thousands", () => {
  const f = crossModelGlobalIds([idx("arch.ifc", tiny), idx("arch-v2.ifc", tiny), idx("str.ifc", discipline([W1]))]);
  assert.equal(f.revisions.length, 1);
  assert.deepEqual([f.revisions[0].a, f.revisions[0].b], ["arch.ifc", "arch-v2.ifc"]);
  // W-01 is still a conflict with the structural file, and lists all three.
  assert.deepEqual(f.conflicts.map((c) => c.globalId), [W1]);
  assert.equal(f.conflicts[0].holders.length, 3);
  // A single model, or none, shares nothing.
  assert.deepEqual(crossModelGlobalIds([idx("arch.ifc", tiny)]).conflicts, []);
});

test("annotations, GitLab issues and the summary report them", () => {
  const f = crossModelGlobalIds([idx("arch.ifc", tiny), idx("str.ifc", discipline([W1]))]);
  const a = annotations([], { federation: f, lines: new Map([["str.ifc", new Map([[20, 22]])]]) });
  assert.equal(a.length, 1);
  assert.match(a[0], /^::warning file=str\.ifc,line=22,title=IFC%3A 1 GlobalId\(s\) also in another model::3vB2YO\$MX4xv5uCqZZG05x is in 2 models/);
  assert.match(annotations([], { federation: f, failOnShared: true })[0], /^::error /);
  const cq = codeQuality([], { federation: f });
  assert.equal(cq.length, 1);
  assert.equal(cq[0].check_name, "ifc-shared-globalid");
  // Keyed on the GlobalId and models, not lines: the same with a line map.
  assert.equal(codeQuality([], { federation: f, lines: new Map([["str.ifc", new Map([[20, 99]])]]) })[0].fingerprint, cq[0].fingerprint);
  const s = stepSummary([], { federation: f });
  assert.match(s, /\*\*GlobalIds shared between models:\*\* 1 GlobalId\(s\) held in more than one of the 2 models/);
  assert.match(s, /\*\*Shared frame:\*\* 4 /);
  assert.match(s, /^## IDS model check: PASS/);
  assert.match(stepSummary([], { federation: f, failOnShared: true }), /^## IDS model check: FAIL/);
});

test("ci-cli reports them across models and fails only when asked", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-fed-"));
  mkdirSync(join(dir, "m")); mkdirSync(join(dir, "r"));
  writeFileSync(join(dir, "m/arch.ifc"), tiny);
  writeFileSync(join(dir, "m/str.ifc"), discipline([W1]));
  writeFileSync(join(dir, "r/q.ids"), file("samples/quantities-and-naming.ids.xml")); // the sample passes it
  const go = (...extra) => spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", dir, "--models", "m/*.ifc", "--ids", "r/*.ids", "--fail-on", "warning", "--json", join(dir, "o.json"), ...extra], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });
  const plain = go("--annotations");
  assert.match(plain.stdout, /federation warning: shared GlobalId 3vB2YO\$MX4xv5uCqZZG05x is in 2 models: m\/arch\.ifc #20 IFCWALL "W-01", m\/str\.ifc #20 IFCWALL "W-01"/);
  assert.match(plain.stdout, /note: 4 project\/site\/building\/storey\/space\/grid GlobalId\(s\)/);
  assert.match(plain.stdout, /^::warning file=m\/str\.ifc,line=22,title=IFC%3A 1 GlobalId\(s\) also in another model/m, "line read after the loop");
  const j = JSON.parse(readFileSync(join(dir, "o.json"), "utf8"));
  assert.equal(j.tally.sharedGlobalIds, 1);
  assert.equal(j.federation.conflicts[0].globalId, W1);
  const verdict = (o) => o.stdout.match(/^(PASS|FAIL): /m)[1];
  assert.equal(verdict(plain), "PASS", plain.stdout);
  const strict = go("--fail-on-shared-globalids");
  assert.equal(verdict(strict), "FAIL");
  assert.match(strict.stdout, /1 GlobalId\(s\) shared between models \(--fail-on-shared-globalids\)/);
  assert.equal(strict.status, 1);
});
