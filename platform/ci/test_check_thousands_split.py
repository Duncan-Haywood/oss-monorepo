import tempfile
import unittest
from pathlib import Path

import check_thousands_split as c


class ThousandsSplitTest(unittest.TestCase):
    def _scan(self, src: str, name: str = "calc.mjs") -> list[str]:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "ventures" / "demo" / name
            p.parent.mkdir(parents=True)
            p.write_text(src, encoding="utf-8")
            return c.scan(Path(d))

    def test_flags_the_old_shapes(self):
        self.assertEqual(len(self._scan('return String(t).split(/[\\s,;]+/).filter(Boolean).map(Number);\n')), 1)
        self.assertEqual(len(self._scan('const v = s.split(/[,\\s]+/).map((t) => Number(t.replace(/[$,]/g, "")));\n')), 1)

    def test_passes_the_fixed_shape_and_other_splits(self):
        self.assertEqual(self._scan('for (const raw of String(t).split(/[\\s;]+/)) out.push(Number(raw));\n'), [])
        self.assertEqual(self._scan('const tags = s.split(/[,\\s]+/).filter(Boolean);\n'), [])
        self.assertEqual(self._scan('const n = s.split(/,/).map(Number);\n'), [])

    def test_ignores_tests(self):
        self.assertEqual(self._scan('x.split(/[\\s,]+/).map(Number);\n', "calc.test.mjs"), [])

    def test_tree_is_clean(self):
        self.assertEqual(c.scan(), [])

    def test_allowed_files_exist(self):
        for rel in c.ALLOWED:
            self.assertTrue((c.REPO_ROOT / rel).is_file(), rel)


if __name__ == "__main__":
    unittest.main()
