// node --test platform/ci/test_check_thousands_input.mjs   (needs playwright)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check_thousands_input.mjs");

// The checker drives Chromium. unwired_checks.py runs this suite on every pull
// request (ventures-tests.yml), whose runner has no playwright: say so as a
// named skip rather than failing on a missing module.
let NO_PLAYWRIGHT = false;
try { createRequire(SCRIPT).resolve("playwright"); }
catch { NO_PLAYWRIGHT = "playwright is not installed here"; }

const page = (parse) => `<!doctype html><html><body>
<label for="a">Amount</label><input id="a" type="text" inputmode="decimal">
<button type="button" id="go">Calculate</button><p id="out"></p>
<script>
const parse = ${parse};
document.getElementById("go").addEventListener("click", () => {
  const v = parse(document.getElementById("a").value);
  document.getElementById("out").textContent = "Tax: " + (Number.isFinite(v) ? (v * 0.2).toFixed(2) : "-");
});
</script></body></html>`;

test("flags parseFloat that reads 1,200 as 1 and passes a parser that strips separators", { skip: NO_PLAYWRIGHT }, () => {
  const dir = mkdtempSync(join(tmpdir(), "thousands-"));
  try {
    mkdirSync(join(dir, "pages"));
    writeFileSync(join(dir, "pages", "bad.html"), page("(s) => parseFloat(s)"));
    writeFileSync(join(dir, "pages", "good.html"), page('(s) => Number(String(s).replace(/,/g, ""))'));
    const out = join(dir, "r.json");
    const r = spawnSync(process.execPath, [SCRIPT, "--dir", "pages", "--out", out, "--pool", "2"], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const rep = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(rep.pages, 2);
    assert.equal(rep.inputs_probed, 2);
    assert.deepEqual(rep.findings.map((x) => x.f), ["pages/bad.html"]);
    assert.equal(rep.findings[0].plain, "Tax: 240.00");
    assert.equal(rep.findings[0].comma, "Tax: 0.20");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
