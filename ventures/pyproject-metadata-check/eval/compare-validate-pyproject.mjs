// node eval/compare-validate-pyproject.mjs <python-with-validate-pyproject> <file>...
// Compares "this checker finds a high-severity [project]/[build-system] schema problem" with
// "validate-pyproject rejects the file", and prints every disagreement for reading by hand.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { analyze } from "../engine.mjs";
const [py, ...files] = process.argv.slice(2);
const out = execFileSync(py, ["-I", new URL("./vp_oracle.py", import.meta.url).pathname], { input: files.join("\n") + "\n", maxBuffer: 1 << 28 }).toString().trim().split("\n").map((l) => JSON.parse(l));
// Findings outside validate-pyproject's scope (it does not see the file list, PyPI upload rules, pip install rules or backend wiring).
const OUT_OF_SCOPE = new Set(["readme-missing", "license-files-no-match", "license-file-missing", "backend-not-required", "dependency-direct-url", "version-local", "script-no-callable", "classifier-deprecated", "license-classifier-conflict", "group-include-unknown", "group-cycle", "group-collision", "extra-collision", "no-project", "classifier-private", "license-files-with-table", "dynamic-and-static"]);
const m = { both: 0, neither: 0, onlyUs: [], onlyThem: [] };
files.forEach((f, i) => {
  const r = analyze(readFileSync(f, "utf8"));
  const ours = r.findings.filter((x) => x.severity === "high" && !OUT_OF_SCOPE.has(x.id));
  const theirs = !out[i].ok;
  if (ours.length && theirs) m.both++;
  else if (!ours.length && !theirs) m.neither++;
  else if (ours.length) m.onlyUs.push([f, ours.map((x) => x.id + ": " + x.message.slice(0, 140))]);
  else m.onlyThem.push([f, out[i].error]);
});
console.log(`both reject ${m.both}, both accept ${m.neither}, only this checker ${m.onlyUs.length}, only validate-pyproject ${m.onlyThem.length}`);
for (const [f, x] of m.onlyUs) console.log("ONLY US", f, JSON.stringify(x));
for (const [f, x] of m.onlyThem) console.log("ONLY THEM", f, x);
