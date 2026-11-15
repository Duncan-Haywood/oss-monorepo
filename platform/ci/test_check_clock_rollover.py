import pathlib
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import check_clock_rollover as c  # noqa: E402

ROLLS = """
export function parseTimestamp(s) {
  const m = String(s).match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})[T\\s]+(\\d{1,2}):(\\d{2})/);
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}
"""
REFUSES = """
export function parseTimestamp(s) {
  const m = String(s).match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})[T\\s]+(\\d{1,2}):(\\d{2})/);
  if (!m || +m[4] > 23 || +m[5] > 59) return NaN;
  return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
}
"""
TIME_OF_DAY_ROLLS = """
export const parseTime = (s) => { const m = /^(\\d{1,2}):(\\d{2})$/.exec(String(s).trim()); return m ? +m[1] * 60 + +m[2] : null; };
"""
# mm:ss chapter stamps: 25:10 is 25 minutes 10 seconds, and 14:75 is refused.
CHAPTERS = """
export function parseTimestamp(s) {
  const m = /^(\\d{1,3}):(\\d{2})$/.exec(String(s).trim());
  return m && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
"""
OBJECT_ROLLS = """
export function parseDateTime(s) {
  const m = String(s).match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2}) (\\d{1,2}):(\\d{2})$/);
  return m ? { ms: Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]), hasTime: true } : null;
}
"""


@unittest.skipUnless(shutil.which("node"), "needs node")
class ClockRollover(unittest.TestCase):
    def run_on(self, files):
        with tempfile.TemporaryDirectory() as d:
            for name, text in files.items():
                (pathlib.Path(d) / name).write_text(text, encoding="utf-8")
            found = c.candidates([d])
            out = c.probe(found)
            return sorted(pathlib.Path(h[0]).name for h in out["hits"]), len(found)

    def test_flags_parsers_that_roll_minutes_over(self):
        hits, n = self.run_on({"a.mjs": ROLLS, "b.mjs": TIME_OF_DAY_ROLLS, "c.mjs": OBJECT_ROLLS})
        self.assertEqual(n, 3)
        self.assertEqual(hits, ["a.mjs", "b.mjs", "c.mjs"])

    def test_passes_parsers_that_refuse_and_mm_ss_readers(self):
        hits, n = self.run_on({"a.mjs": REFUSES, "b.mjs": CHAPTERS})
        self.assertEqual(n, 2)
        self.assertEqual(hits, [])

    def test_skips_tests_and_unimportable_modules(self):
        hits, n = self.run_on({"a.test.mjs": ROLLS, "b.mjs": "window.x = 1;\n" + ROLLS})
        self.assertEqual(n, 1)  # the .test.mjs file is not a candidate
        self.assertEqual(hits, [])  # b.mjs throws on import under node: skipped, not passed off as a hit

    def test_tree_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
