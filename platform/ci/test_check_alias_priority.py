import tempfile
import unittest
from pathlib import Path

import check_alias_priority as c


class AliasPriorityTest(unittest.TestCase):
    def test_flags_the_order_blind_idioms(self):
        for line in [
            "col[k] = head.findIndex((h) => names.includes(h));",
            "return headers.findIndex(h => names.includes(h));",
            "const w = head.findIndex((h) => WHERE.includes(h));",
            "const i = cols.findIndex((x) => ALIASES.time.includes(x));",
        ]:
            self.assertEqual(c.scan_text(line), [1], line)

    def test_passes_the_priority_form_and_other_predicates(self):
        for line in [
            "col[k] = (names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1);",
            "const p = head.findIndex((h, i) => i !== q && PRICE.includes(h));",
            "const i = head.findIndex((h) => /^unit price/.test(h));",
            "const i = head.findIndex((h) => names.includes(h)); // alias-order: any",
            # a rank over a literal list of substrings, not a header lookup
            'rank = (x) => ["desc", "payee"].findIndex((k) => x.includes(k));',
        ]:
            self.assertEqual(c.scan_text(line), [], line)

    def test_tree_skips_tests_and_node_modules(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            bad = "const i = head.findIndex((h) => names.includes(h));\n"
            (root / "v").mkdir()
            (root / "v" / "calc.mjs").write_text(bad)
            (root / "v" / "calc.test.mjs").write_text(bad)
            (root / "v" / "node_modules").mkdir()
            (root / "v" / "node_modules" / "x.js").write_text(bad)
            problems = c.check_tree(root)
            self.assertEqual(len(problems), 1)
            self.assertIn("calc.mjs:1:", problems[0])
            self.assertEqual(c.main(["x", str(root)]), 1)
            (root / "v" / "calc.mjs").write_text("ok\n")
            self.assertEqual(c.main(["x", str(root)]), 0)


if __name__ == "__main__":
    unittest.main()
