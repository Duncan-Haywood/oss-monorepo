import tempfile
import unittest
from pathlib import Path

import missing_llms_txt as m


class MissingLlms(unittest.TestCase):
    def test_flagships_first_and_present_excluded(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d)
            for n in ("a", "b", "c"):
                (v / n).mkdir()
            (v / "c" / "llms.txt").write_text("x")
            first, rest, total = m.missing(v, ["b", "c", "zzz"])
            self.assertEqual((first, rest, total), (["b"], ["a"], 3))

    def test_flagship_names(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "f.yaml"
            f.write_text("flagships:\n  - venture: ai-bookkeeper\n    why: x\n")
            self.assertEqual(m.flagship_names(f), ["ai-bookkeeper"])


if __name__ == "__main__":
    unittest.main()
