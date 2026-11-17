import shutil
import tempfile
import unittest
from pathlib import Path

import check_cli_bad_input_exit as cb

# A minimal gate CLI in the pricing-calculator shape. GOOD validates --months and
# --prices; BAD is the pre-2026-11-17 template (crashes with exit 1 on both).
BAD = r'''// Exit 0 ok, 1 over --budget, 2 bad input.
import { readFileSync } from "node:fs";
const USAGE = `usage: node cli.mjs compare --gb <n> [--months <n>] [--prices file.json] [--json]`;
const fail = (m) => { console.error(m); process.exit(2); };
const argv = process.argv.slice(2); const cmd = argv.shift(); const opt = {};
for (let i = 0; i < argv.length; i += 2) opt[argv[i].slice(2)] = argv[i + 1];
const num = (k, d) => { if (opt[k] === undefined) return d; const n = Number(opt[k]); if (!Number.isFinite(n) || n < 0) fail(`--${k}`); return n; };
if (cmd !== "compare" || opt.gb === undefined) fail(USAGE);
if (opt.prices) { const over = JSON.parse(readFileSync(opt.prices, "utf8")); for (const [k, v] of Object.entries(over)) void k; }
const months = num("months", 12);
const path = Array.from({ length: Math.ceil(months) }, () => 1);
console.log(path[path.length - 1].toFixed(0));
'''
GOOD = BAD.replace(
    'if (opt.prices) {',
    'const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);\n'
    'if (opt.prices) { const o = JSON.parse(readFileSync(opt.prices, "utf8")); if (!isObj(o) || Object.values(o).some((v) => !isObj(v))) fail("--prices"); }\n'
    'if (false) {',
).replace('const months = num("months", 12);',
          'const months = num("months", 12); if (!Number.isInteger(months) || months < 1) fail("--months");')


class BadInputExit(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)

    def put(self, venture, text):
        d = self.root / "ventures" / venture
        d.mkdir(parents=True)
        (d / "cli.mjs").write_text(text)

    def test_flags_crashes_and_silent_accepts(self):
        self.put("bad", BAD)
        self.assertEqual(cb.main(["--root", str(self.root)]), 1)
        _, skipped, bad = cb.probe("bad", self.root / "ventures/bad/cli.mjs", cb.gate_clis(self.root)[0][2], self.root)
        self.assertIsNone(skipped)
        shown = {" ".join(e) for e, _, _ in bad}
        self.assertIn("--months 0", shown)        # crash, exit 1
        self.assertIn("--months 2.5", shown)      # silently ran 3 months
        self.assertIn("--prices null", shown)     # crash, exit 1
        self.assertNotIn("--months abc", shown)   # num() already exits 2

    def test_passes_a_cli_that_validates(self):
        self.put("good", GOOD)
        self.assertEqual(cb.main(["--root", str(self.root)]), 0)

    def test_skips_clis_without_the_exit_header_or_compare(self):
        self.put("noheader", BAD.replace("// Exit 0 ok, 1 over --budget, 2 bad input.", "// no codes"))
        self.put("nocompare", BAD.replace("node cli.mjs compare", "node cli.mjs diff"))
        found = {v: u for v, _, u in cb.gate_clis(self.root)}
        self.assertEqual(sorted(found), ["nocompare"])
        self.assertIsNone(found["nocompare"])
        self.assertEqual(cb.main(["--root", str(self.root)]), 0)

    def test_required_args_ignore_bracketed_flags(self):
        self.assertEqual(cb.required_args("--stored-gb <n> --egress-gb <n> [--growth <pct>] [--json] --streaming"),
                         ["--stored-gb", "10", "--egress-gb", "10", "--streaming"])


if __name__ == "__main__":
    unittest.main()
