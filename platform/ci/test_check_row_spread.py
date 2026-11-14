import tempfile
import unittest
from pathlib import Path

import check_row_spread as c


def tree(files):
    d = Path(tempfile.mkdtemp())
    for rel, text in files.items():
        p = d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    return d


READER = "export function parseCsv(t) { return []; }\n"


class RowSpread(unittest.TestCase):
    def test_flags_a_row_spread_in_a_reader(self):
        d = tree({"ventures/a/calc.mjs": READER + "const hi = Math.max(...orders.map((o) => o.t));\n"})
        self.assertEqual(c.scan(d), {"ventures/a/calc.mjs": [2]})

    def test_flags_min_with_a_leading_argument(self):
        d = tree({"ventures/a/calc.mjs": READER + "const lo = Math.min(1, ...rows.map((r) => r.x));\n"})
        self.assertIn("ventures/a/calc.mjs", c.scan(d))

    def test_loops_comments_small_arrays_and_non_readers_pass(self):
        d = tree({
            "ventures/a/calc.mjs": READER + "// not Math.max(...orders.map())\nconst m = Math.max(...[a, b]);\nconst t = orders.reduce((m, o) => Math.max(m, o.t), -Infinity);\n",
            "ventures/b/calc.mjs": "const hi = Math.max(...items.map((x) => x.price));\n",
            "ventures/a/calc.test.mjs": READER + "Math.max(...rows.map((r) => r));\n",
        })
        self.assertEqual(c.scan(d), {})

    def test_ratchet_fails_on_new_and_stale_entries(self):
        d = tree({"ventures/a/calc.mjs": READER + "Math.max(...events.map((e) => e.t));\n"})
        bl = d / "baseline.txt"
        bl.write_text("")
        self.assertEqual(c.main(["--root", str(d), "--baseline", str(bl)]), 1)
        bl.write_text("ventures/a/calc.mjs\n")
        self.assertEqual(c.main(["--root", str(d), "--baseline", str(bl)]), 0)
        bl.write_text("ventures/a/calc.mjs\nventures/gone/calc.mjs\n")
        self.assertEqual(c.main(["--root", str(d), "--baseline", str(bl)]), 1)

    def test_the_repository_is_green(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
