import tempfile
import unittest
from pathlib import Path

import check_flag_words as c

OLD = """function flag(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0 || value === '' || value == null) {
    return false;
  }
  return Boolean(value);
}
"""

NEW = """function flag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  const word = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(word)) return true;
  if (['false', '0', 'no', ''].includes(word)) return false;
  throw new Error(`Expected yes or no, got "${value}"`);
}
"""

PLAIN = """function truthy(x) {
  return Boolean(x);
}
"""


def tree(tmp: Path, src: str, name: str = "calc.mjs") -> Path:
    d = tmp / "ventures" / "v"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text("export const A = 1;\n" + src)
    return tmp


class FlagWordsTest(unittest.TestCase):
    def test_boolean_fallback_after_word_checks_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = tree(Path(tmp), OLD)
            self.assertEqual(c.offenders(root / "ventures/v/calc.mjs"), [(2, "flag")])
            self.assertEqual(c.main(root), 1)

    def test_word_map_that_throws_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(c.main(tree(Path(tmp), NEW)), 0)

    def test_plain_truthiness_helper_is_left_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(c.main(tree(Path(tmp), PLAIN)), 0)

    def test_test_files_are_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(c.main(tree(Path(tmp), OLD, "calc.test.mjs")), 0)

    def test_repository_is_clean(self):
        self.assertEqual(c.main(), 0)


if __name__ == "__main__":
    unittest.main()
