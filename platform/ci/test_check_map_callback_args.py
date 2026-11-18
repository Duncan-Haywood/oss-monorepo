import tempfile
import unittest
from pathlib import Path

import check_map_callback_args as c


class MapCallbackArgsTest(unittest.TestCase):
    def test_flags_a_second_parameter_that_is_not_an_index(self):
        for src in [
            "export function normalise(f, issues) { if (issues) issues.push(1); }\nconst a = xs.map(normalise);\n",
            "function csvCell(value, { text = false } = {}) {}\nrows.map(csvCell);\n",
            "const fmt = (n, digits = 2) => n.toFixed(digits);\nxs.forEach(fmt);\n",
            "export async function load(url, opts) {}\nurls.filter(load);\n",
            "const parse = function (s, strict) {};\nlines.some(parse);\n",
        ]:
            self.assertEqual(len(c.scan_text(src)), 1, src)

    def test_passes_index_parameters_wrapped_calls_and_opt_outs(self):
        for src in [
            "function row(r, i) {}\nxs.map(row);\n",
            "function row(r, index, all) {}\nxs.map(row);\n",
            "function row(r, _i) {}\nxs.map(row);\n",
            "function one(r) {}\nxs.map(one);\n",
            "function lab([r, g, b]) {}\nxs.map(lab);\n",
            "function pick({ a, b }) {}\nxs.map(pick);\n",
            "function f(x, issues) {}\nxs.map((x) => f(x));\n",
            "function f(x, issues) {}\nxs.map(f); // map-args: ok\n",
            "function f(x, issues) {}\n// was xs.map(f) before the fix\n",
            "function f(...xs) {}\nys.map(f);\n",
            # a nested helper with the same name as a two-argument top-level one is not confused with it
            "  const g = (a) => a;\n  xs.map(g);\n",
        ]:
            self.assertEqual(c.scan_text(src), [], src)

    def test_reads_functions_imported_from_a_sibling_module(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "v").mkdir()
            (root / "v" / "calc.mjs").write_text("export function normalise(f, issues) {}\nexport function ok(f, i) {}\n")
            page = '<script type="module">\nimport { normalise as norm, ok } from "./calc.mjs";\nxs.map(norm); xs.map(ok);\n</script>\n'
            (root / "v" / "index.html").write_text(page)
            (root / "v" / "calc.test.mjs").write_text("import { normalise } from './calc.mjs';\nxs.map(normalise);\n")
            (root / "v" / "node_modules").mkdir()
            (root / "v" / "node_modules" / "x.js").write_text("function f(a, b) {}\nxs.map(f);\n")
            problems = c.check_tree(root)
            self.assertEqual(len(problems), 1, problems)
            self.assertIn("index.html:3:", problems[0])
            self.assertIn("`issues`", problems[0])
            self.assertEqual(c.main(["x", str(root)]), 1)
            (root / "v" / "index.html").write_text(page.replace("xs.map(norm)", "xs.map((x) => norm(x))"))
            self.assertEqual(c.main(["x", str(root)]), 0)

    def test_the_repository_is_clean(self):
        ventures = Path(__file__).resolve().parents[2] / "ventures"
        self.assertEqual(c.check_tree(ventures), [])


if __name__ == "__main__":
    unittest.main()
