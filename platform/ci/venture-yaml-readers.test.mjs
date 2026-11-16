// Every hand-rolled YAML reader under ventures/ (any module exporting
// `parseYaml`) has to read the block-YAML shapes real files use.
//
// Why a shared guard (redteam 2026-11-16): two copies of one reader
// (helm-values-schema-check/yaml.mjs, actions-minutes-estimator/
// workflow-yaml.mjs) returned null for a "compact" sequence (`args:` with
// `- x` at the key's own indent) and silently dropped every later key. The
// Helm checker then reported a required field "missing" that was present; the
// minutes estimator dropped whole jobs from the bill. Each venture's own suite
// only tests its own copy, so a third copy would repeat the bug unseen. This
// suite finds every reader itself; unwired_checks.py runs it on venture PRs.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENTURES = join(ROOT, "ventures");

function readers() {
  const out = [];
  for (const v of readdirSync(VENTURES)) {
    const dir = join(VENTURES, v);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".mjs") || f.endsWith(".test.mjs")) continue;
      const text = readFileSync(join(dir, f), "utf8");
      if (/export\s+function\s+parseYaml\s*\(/.test(text)) out.push(`ventures/${v}/${f}`);
    }
  }
  return out.sort();
}

// Shapes every reader must agree on. Scalars that YAML 1.1 and 1.2 resolve
// differently (yes, on, 0755) are left out on purpose: which is right depends
// on what reads the file (Helm vs GitHub Actions), so each venture tests that.
const CASES = [
  ["compact sequence keeps later keys", "args:\n- a\n- b\nnext: 1\n", { args: ["a", "b"], next: 1 }],
  [
    "compact sequence of mappings, nested",
    "outer:\n  list:\n  - name: x\n    port: 80\n  after: y\ntop: z\n",
    { outer: { list: [{ name: "x", port: 80 }], after: "y" }, top: "z" },
  ],
  ["indented sequence", "list:\n  - a\n  - b\nnext: 1\n", { list: ["a", "b"], next: 1 }],
  ["apostrophe in a bare value", "note: it's here # comment\n", { note: "it's here" }],
  ["quoted hash is not a comment", "q: 'a # b' # c\n", { q: "a # b" }],
];

const found = readers();

test("the discovery finds the known readers", () => {
  for (const known of ["ventures/helm-values-schema-check/yaml.mjs", "ventures/actions-minutes-estimator/workflow-yaml.mjs"]) {
    assert.ok(found.includes(known), `${known} not discovered (found: ${found.join(", ")})`);
  }
});

for (const file of found) {
  test(`${file} reads the shared block-YAML shapes`, async () => {
    const { parseYaml } = await import(pathToFileURL(join(ROOT, file)).href);
    for (const [name, input, expected] of CASES) {
      // JSON round trip: a reader may hang line-number metadata off a Symbol key.
      assert.deepEqual(JSON.parse(JSON.stringify(parseYaml(input))), expected, `${file}: ${name}`);
    }
  });
}
