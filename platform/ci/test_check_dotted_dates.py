import pathlib
import tempfile
import unittest

import check_dotted_dates as c

OLD = """export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\\d{1,2})[/.-](\\d{1,2})[/.-]\\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}
"""

NEW = """export function detectDmy(values) {
  let first = false, second = false, dotted = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\\d{1,2})([/.-])(\\d{1,2})\\2\\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[3] > 12) second = true;
    if (m[2] === ".") dotted = true;
  }
  return (first || dotted) && !second;
}
"""


class DottedDates(unittest.TestCase):
    def run_on(self, files):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            for name, text in files.items():
                p = root / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(text)
            return c.main([str(root)])

    def test_the_old_function_fails(self):
        self.assertEqual(self.run_on({"a/calc.mjs": OLD}), 1)

    def test_the_fixed_function_passes(self):
        self.assertEqual(self.run_on({"a/calc.mjs": NEW}), 0)

    def test_a_module_that_cannot_import_fails(self):
        self.assertEqual(self.run_on({"a/calc.mjs": NEW + "import './missing.mjs';\n"}), 1)

    def test_tests_and_node_modules_are_ignored(self):
        self.assertEqual(self.run_on({"a/calc.test.mjs": OLD, "a/node_modules/x/calc.mjs": OLD}), 0)

    def test_the_tree_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
