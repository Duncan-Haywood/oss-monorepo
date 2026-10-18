import sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit import audit, cites, flagged_lines


class T(unittest.TestCase):
    def test_flag_detection(self):
        t = "a\nHan (2016), ICLR (from memory)\nb\nnot re-verified here\nclean line"
        self.assertEqual(len(flagged_lines(t)), 2)

    def test_cites_strip_prose_and_join_authors(self):
        self.assertEqual(cites("Weight sharing: Han, Mao and Dally (2016), ICLR"),
                         [("Han, Mao and Dally", "2016")])
        self.assertEqual(cites("Energy Horowitz (2014), ISSCC"), [("Horowitz", "2014")])
        self.assertEqual(cites("Zhang et al. (2019)"), [("Zhang et al.", "2019")])

    def test_unflagged_citation_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            for name, body in (("a", "Horowitz (2014) from memory"), ("b", "Horowitz (2014) checked"),
                               ("_x", "Horowitz (2014) from memory")):
                (Path(d) / name).mkdir()
                (Path(d) / name / "README.md").write_text(body)
            n, flags, works = audit(d)
            self.assertEqual(n, 2)                       # '_x' is not a project
            self.assertEqual(list(flags), ["a"])
            self.assertEqual(works[("Horowitz", "2014")], {"a"})


if __name__ == "__main__":
    unittest.main()
